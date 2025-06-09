import { spawn, ChildProcess } from 'node:child_process'
import { parse } from 'shell-quote'
import * as fs from 'node:fs'
import {
    getProcessLogOutFilePath,
    getProcessLogErrorFilePath,
    pidIsRunning,
    getFileNameFriendlyName,
} from '../helpers.js'
import { PidManager } from './PidManager.js'
import { LogManager } from './LogManager.js'
import type { AppConfig } from './ConfigManager.js'

export interface ProcessInfo {
    name: string
    pid: number
    isRunning: boolean
}

export interface StartOptions {
    daemon?: boolean
    clearLogs?: boolean
}

export class ProcessManager {
    private pidManager = new PidManager()
    private logManager = new LogManager()

    async startApp(app: AppConfig, options: StartOptions = {}): Promise<void> {
        console.log(`Starting: ${app.name} (${app.cwd})`)

        if (!fs.existsSync(app.cwd)) {
            throw new Error(`Directory ${app.cwd} does not exist`)
        }

        const run = parse(app.run) as string[]
        if (!run.length) {
            throw new Error(`Invalid run command for ${app.name}: ${app.run}`)
        }

        const fileNameFriendAppName = getFileNameFriendlyName(app.name)

        // Check if process is already running and stop it
        await this.stopIfRunning(app.name)

        // Clear logs if requested
        if (options.clearLogs) {
            this.logManager.clearAppLogs(fileNameFriendAppName)
        }

        // Start the process
        const process = await this.spawnProcess(app, run, options.daemon ?? true)

        // Save PID
        this.pidManager.savePid(fileNameFriendAppName, process.pid!)

        console.log(`Started: ${app.name} with pid ${process.pid}`)
    }

    async stopApp(name: string): Promise<boolean> {
        const fileNameFriendlyName = getFileNameFriendlyName(name)
        const pid = this.pidManager.getPid(fileNameFriendlyName)

        if (!pid) {
            return false
        }

        if (!pidIsRunning(pid)) {
            console.warn(`${name} with pid ${pid} is not running`)
            this.pidManager.removePid(fileNameFriendlyName)
            return false
        }

        console.log(`Stopping ${name} with pid ${pid}`)

        try {
            process.kill(pid)
            this.pidManager.removePid(fileNameFriendlyName)
            console.log(`${name} with pid ${pid} stopped`)
            return true
        } catch (error: unknown) {
            const err = error as Error
            console.error(`Error stopping ${name} with pid ${pid}: ${err.message}`)
            return false
        }
    }

    async stopAllApps(): Promise<number> {
        const runningProcesses = this.listRunningProcesses()
        let stoppedCount = 0

        for (const processInfo of runningProcesses) {
            const success = await this.stopApp(processInfo.name)
            if (success) {
                stoppedCount++
            }
        }

        return stoppedCount
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

    private async stopIfRunning(appName: string): Promise<void> {
        const fileNameFriendAppName = getFileNameFriendlyName(appName)
        const existingPid = this.pidManager.getPid(fileNameFriendAppName)

        if (existingPid && pidIsRunning(existingPid)) {
            console.warn(`Process ${appName} is already running with pid ${existingPid}`)
            console.log(`Stopping ${appName} at pid ${existingPid}`)

            try {
                process.kill(existingPid)
            } catch (error: unknown) {
                const err = error as Error
                console.error(`Error stopping ${appName}: ${err.message}`)
            }
        }

        this.pidManager.removePid(fileNameFriendAppName)
    }

    private async spawnProcess(app: AppConfig, command: string[], daemon: boolean): Promise<ChildProcess> {
        const fileNameFriendAppName = getFileNameFriendlyName(app.name)
        const stdoutPath = getProcessLogOutFilePath(fileNameFriendAppName)
        const stderrPath = getProcessLogErrorFilePath(fileNameFriendAppName)

        const stdout = fs.openSync(stdoutPath, 'a')
        const stderr = fs.openSync(stderrPath, 'a')

        return new Promise((resolve, reject) => {
            const startedProcess = spawn(command[0], command.slice(1), {
                cwd: app.cwd,
                stdio: ['ignore', stdout, stderr],
                detached: daemon,
            })

            startedProcess.on('error', (error) => {
                reject(new Error(`Error starting ${app.name}: ${error.message}`))
            })

            startedProcess.on('spawn', () => {
                if (daemon) {
                    startedProcess.unref()
                }
                resolve(startedProcess)
            })
        })
    }
}
