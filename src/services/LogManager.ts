import * as fs from 'node:fs'
import * as path from 'node:path'
import {
    getPomituLogsDirectory,
    getProcessLogOutFilePath,
    getProcessLogErrorFilePath,
    getFileNameFriendlyName
} from '../helpers.js'

export class LogManager {
    private logsDirectory: string

    constructor() {
        this.logsDirectory = getPomituLogsDirectory()
    }

    clearAppLogs(appName: string): void {
        const stdoutPath = getProcessLogOutFilePath(appName)
        const stderrPath = getProcessLogErrorFilePath(appName)

        if (fs.existsSync(stdoutPath)) {
            fs.unlinkSync(stdoutPath)
        }
        if (fs.existsSync(stderrPath)) {
            fs.unlinkSync(stderrPath)
        }
    }

    flushLogs(appName?: string): string[] {
        if (!fs.existsSync(this.logsDirectory)) {
            return []
        }

        let logs = fs.readdirSync(this.logsDirectory)

        if (appName) {
            const fileNameFriendlyName = getFileNameFriendlyName(appName)
            logs = logs.filter((log) => log.startsWith(fileNameFriendlyName))
        }

        const fullLogPaths = logs.map((log) => path.join(this.logsDirectory, log))
        const flushedFiles: string[] = []

        for (const logFilePath of fullLogPaths) {
            if (fs.existsSync(logFilePath)) {
                console.log(`Flushing ${logFilePath}`)
                fs.unlinkSync(logFilePath)
                flushedFiles.push(logFilePath)
            }
        }

        return flushedFiles
    }

    getLogFiles(appName?: string): string[] {
        if (!fs.existsSync(this.logsDirectory)) {
            return []
        }

        let logs = fs.readdirSync(this.logsDirectory)

        if (appName) {
            const fileNameFriendlyName = getFileNameFriendlyName(appName)
            logs = logs.filter((log) => log.startsWith(fileNameFriendlyName))
        }

        return logs.map((log) => path.join(this.logsDirectory, log))
    }
}
