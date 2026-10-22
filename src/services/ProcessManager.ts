import crossSpawn from 'cross-spawn'
import { spawn as nodeSpawn } from 'node:child_process'
import { parse } from 'shell-quote'
import * as fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
    getProcessLogOutFilePath,
    getProcessLogErrorFilePath,
    pidIsRunning,
    getFileNameFriendlyName,
} from '../helpers.js'
import { PidManager } from './PidManager.js'
import { LogManager } from './LogManager.js'
import { getAppEnvironment } from './Environment.js'
import type { AppConfig, Config } from './ConfigManager.js'

export interface ProcessInfo {
    name: string
    pid: number
    isRunning: boolean
}

export interface StartOptions {
    clearLogs?: boolean
}

// src/services and dist/services are both two levels below the package root
const launcherPath = fileURLToPath(new URL('../../dist/launcher.exe', import.meta.url))

// cross-spawn's parsing step, which its types leave out. On Windows it resolves the
// command on the given PATH, and wraps .cmd and .bat files in cmd.exe with escaping.
interface ParsedCommand {
    command: string
    args: string[]
    file?: string
    options: { windowsVerbatimArguments?: boolean }
}
const parseCommand = (crossSpawn as unknown as {
    _parse(command: string, args: string[], options: object): ParsedCommand
})._parse

function killProcess(pid: number): Promise<void> {
    return new Promise((resolve, reject) => {
        if (process.platform === 'win32') {
            const killer = nodeSpawn('taskkill', ['/F', '/T', '/PID', String(pid)])
            killer.on('close', (code) => code === 0 ? resolve() : reject(new Error(`taskkill exited with ${code}`)))
            killer.on('error', reject)
        } else {
            try {
                process.kill(pid)
                resolve()
            } catch (err) {
                reject(err)
            }
        }
    })
}

export class ProcessManager {
    private pidManager = new PidManager()
    private logManager = new LogManager()

    // Starts the app in the background, where it keeps running after pomitu exits.
    // Returns its pid.
    async startApp(app: AppConfig, options: StartOptions = {}): Promise<number> {
        if (this.getRunningPid(app.name) !== null) {
            throw new Error(`${app.name} is already running`)
        }

        if (!fs.existsSync(app.cwd)) {
            throw new Error(`Directory ${app.cwd} does not exist`)
        }

        const run = parse(app.run) as string[]
        if (!run.length) {
            throw new Error(`Invalid run command for ${app.name}: ${app.run}`)
        }

        const fileNameFriendAppName = getFileNameFriendlyName(app.name)

        if (options.clearLogs) {
            this.logManager.clearAppLogs(fileNameFriendAppName)
        }

        const pid = await this.spawnProcess(app, run)
        this.pidManager.savePid(fileNameFriendAppName, pid)
        return pid
    }

    // Stops the app if running, then starts it. Returns its new pid.
    async restartApp(app: AppConfig): Promise<number> {
        if (await this.stopApp(app.name)) {
            // Give the stopped app a moment to release ports and files
            await new Promise(resolve => setTimeout(resolve, 500))
        }
        return this.startApp(app)
    }

    // Returns whether a running app was stopped
    async stopApp(name: string): Promise<boolean> {
        const fileNameFriendlyName = getFileNameFriendlyName(name)
        const pid = this.getRunningPid(name)

        if (pid === null) {
            this.pidManager.removePid(fileNameFriendlyName)
            return false
        }

        await killProcess(pid)
        this.pidManager.removePid(fileNameFriendlyName)
        return true
    }

    // Stops running apps that are not in the config. Returns their names.
    // One app failing to stop doesn't keep the others running.
    async stopAppsNotIn(config: Config): Promise<string[]> {
        const configNames = new Set(config.apps.map(app => getFileNameFriendlyName(app.name)))
        const stoppedApps: string[] = []
        const failures: string[] = []
        for (const proc of this.listRunningProcesses()) {
            if (!proc.isRunning || configNames.has(proc.name)) continue
            try {
                if (await this.stopApp(proc.name)) {
                    stoppedApps.push(proc.name)
                }
            } catch (error: unknown) {
                failures.push(`${proc.name} (${(error as Error).message})`)
            }
        }
        if (failures.length > 0) {
            const stopped = stoppedApps.length > 0 ? `. Stopped: ${stoppedApps.join(', ')}` : ''
            throw new Error(`Could not stop apps no longer in the config: ${failures.join(', ')}${stopped}`)
        }
        return stoppedApps
    }

    getRunningPid(name: string): number | null {
        const pid = this.pidManager.getPid(getFileNameFriendlyName(name))
        return pid !== null && pidIsRunning(pid) ? pid : null
    }

    listRunningProcesses(): ProcessInfo[] {
        const pidFiles = this.pidManager.getAllPidFiles()
        const processes: ProcessInfo[] = []

        for (const pidFile of pidFiles) {
            const appName = pidFile.replace('.pid', '')
            const pid = this.pidManager.getPid(appName)

            if (pid) {
                processes.push({
                    name: appName,
                    pid,
                    isRunning: pidIsRunning(pid)
                })
            }
        }

        return processes
    }

    private async spawnProcess(app: AppConfig, command: string[]): Promise<number> {
        const fileNameFriendAppName = getFileNameFriendlyName(app.name)
        const env = await getAppEnvironment(app)
        const stdoutPath = getProcessLogOutFilePath(fileNameFriendAppName)
        const stderrPath = getProcessLogErrorFilePath(fileNameFriendAppName)

        if (process.platform === 'win32') {
            return this.launchOnWindows(app, command, env, stdoutPath, stderrPath)
        }

        const stdout = fs.openSync(stdoutPath, 'a')
        const stderr = fs.openSync(stderrPath, 'a')
        return new Promise((resolve, reject) => {
            const startedProcess = crossSpawn(command[0], command.slice(1), {
                cwd: app.cwd,
                env,
                stdio: ['ignore', stdout, stderr],
                detached: true,
            })

            startedProcess.on('error', (error) => {
                fs.closeSync(stdout)
                fs.closeSync(stderr)
                reject(new Error(`Error starting ${app.name}: ${error.message}`))
            })

            startedProcess.on('spawn', () => {
                startedProcess.unref()
                fs.closeSync(stdout)
                fs.closeSync(stderr)
                resolve(startedProcess.pid!)
            })
        })
    }

    // Node can't start a process that both outlives it and has a hidden console, so
    // launcher.exe starts the app and reports its pid
    private launchOnWindows(app: AppConfig, command: string[], env: NodeJS.ProcessEnv, stdoutPath: string, stderrPath: string): Promise<number> {
        const parsed = parseCommand(command[0], command.slice(1), { cwd: app.cwd, env })
        const verbatim = parsed.options.windowsVerbatimArguments === true
        const request = {
            // cmd.exe when the command needs it, otherwise the resolved program
            file: verbatim ? parsed.command : (parsed.file ?? parsed.command),
            args: [parsed.command, ...parsed.args],
            verbatim,
            cwd: app.cwd,
            env: Object.entries(env).map(([name, value]) => `${name}=${value}`),
            stdout: stdoutPath,
            stderr: stderrPath,
        }

        return new Promise((resolve, reject) => {
            const launcher = nodeSpawn(launcherPath, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
            let output = ''
            let errorOutput = ''
            launcher.stdout.on('data', (data) => output += data)
            launcher.stderr.on('data', (data) => errorOutput += data)
            launcher.on('error', (error) => reject(new Error(`Error starting ${app.name}: could not run ${launcherPath}: ${error.message}`)))
            launcher.on('close', (code) => {
                const pid = Number(output)
                if (code === 0 && Number.isInteger(pid) && pid > 0) {
                    resolve(pid)
                } else {
                    reject(new Error(`Error starting ${app.name}: ${errorOutput.trim() || `launcher exited with ${code}`}`))
                }
            })
            // If the launcher dies before reading the request, 'close' reports it
            launcher.stdin.on('error', () => {})
            launcher.stdin.end(JSON.stringify(request))
        })
    }
}
