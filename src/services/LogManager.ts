import * as fs from 'node:fs'
import * as path from 'node:path'
import {
    getPomituLogsDirectory,
    getProcessLogOutFilePath,
    getProcessLogErrorFilePath,
    getFileNameFriendlyName
} from '../helpers.js'

// Local time as 2006-01-02 15:04:05.000
function formatLogTime(date: Date): string {
    const pad = (value: number, length = 2) => String(value).padStart(length, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
        + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

function endsWithNewline(filePath: string): boolean {
    const size = fs.statSync(filePath).size
    if (size === 0) return true
    const fd = fs.openSync(filePath, 'r')
    try {
        const lastByte = Buffer.alloc(1)
        fs.readSync(fd, lastByte, 0, 1, size - 1)
        return lastByte[0] === 0x0a
    } finally {
        fs.closeSync(fd)
    }
}

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

    // Writes a line of pomitu's own to both logs, with the time in front the same
    // way the launcher's logger puts it on the app's lines
    writeEvent(appName: string, message: string): void {
        const line = `${formatLogTime(new Date())} pomitu: ${message}\n`
        for (const logPath of [getProcessLogOutFilePath(appName), getProcessLogErrorFilePath(appName)]) {
            // The app's last line may not end with a newline
            const needsNewline = fs.existsSync(logPath) && !endsWithNewline(logPath)
            fs.appendFileSync(logPath, needsNewline ? `\n${line}` : line)
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
