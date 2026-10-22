import { spawn as crossSpawn } from 'cross-spawn'
import { ChildProcess, spawn as nodeSpawn } from 'node:child_process'
import { parse } from 'shell-quote'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    getProcessLogOutFilePath,
    getProcessLogErrorFilePath,
    pidIsRunning,
    getFileNameFriendlyName,
} from '../helpers.js'
import { PidManager } from './PidManager.js'
import { LogManager } from './LogManager.js'
import type { AppConfig, Config } from './ConfigManager.js'

export interface ProcessInfo {
    name: string
    pid: number
    isRunning: boolean
}

export interface StartOptions {
    clearLogs?: boolean
}

// wrapper.ts under tsx, wrapper.js once built
const wrapperPath = fileURLToPath(new URL(`../wrapper${path.extname(fileURLToPath(import.meta.url))}`, import.meta.url))

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

        const startedProcess = await this.spawnProcess(app, run)
        this.pidManager.savePid(fileNameFriendAppName, startedProcess.pid!)
        return startedProcess.pid!
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

    private async spawnProcess(app: AppConfig, command: string[]): Promise<ChildProcess> {
        const fileNameFriendAppName = getFileNameFriendlyName(app.name)
        const stdout = fs.openSync(getProcessLogOutFilePath(fileNameFriendAppName), 'a')
        const stderr = fs.openSync(getProcessLogErrorFilePath(fileNameFriendAppName), 'a')
        const options = {
            cwd: app.cwd,
            stdio: ['ignore', stdout, stderr] as ['ignore', number, number],
            detached: true,
        }

        return new Promise((resolve, reject) => {
            const startedProcess = process.platform === 'win32'
                ? nodeSpawn(process.execPath, [...process.execArgv, wrapperPath, JSON.stringify({ cwd: app.cwd, command })], options)
                : crossSpawn(command[0], command.slice(1), options)

            startedProcess.on('error', (error) => {
                fs.closeSync(stdout)
                fs.closeSync(stderr)
                reject(new Error(`Error starting ${app.name}: ${error.message}`))
            })

            startedProcess.on('spawn', () => {
                startedProcess.unref()
                fs.closeSync(stdout)
                fs.closeSync(stderr)
                resolve(startedProcess)
            })
        })
    }
}
