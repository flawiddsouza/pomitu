import * as fs from 'node:fs'
import { getPomituPidsDirectory } from '../helpers.js'
import * as path from 'node:path'

export class PidManager {
    private pidsDirectory: string

    constructor() {
        this.pidsDirectory = getPomituPidsDirectory()
    }

    savePid(appName: string, pid: number): void {
        const pidFilePath = this.getPidFilePath(appName)
        fs.writeFileSync(pidFilePath, pid.toString())
    }

    getPid(appName: string): number | null {
        const pidFilePath = this.getPidFilePath(appName)

        if (!fs.existsSync(pidFilePath)) {
            return null
        }

        try {
            const pidContent = fs.readFileSync(pidFilePath, 'utf-8')
            return parseInt(pidContent)
        } catch {
            return null
        }
    }

    removePid(appName: string): void {
        const pidFilePath = this.getPidFilePath(appName)

        if (fs.existsSync(pidFilePath)) {
            fs.unlinkSync(pidFilePath)
        }
    }

    getAllPidFiles(): string[] {
        if (!fs.existsSync(this.pidsDirectory)) {
            return []
        }

        return fs.readdirSync(this.pidsDirectory).filter(file => file.endsWith('.pid') && !file.endsWith('-tui.pid'))
    }

    private getPidFilePath(appName: string): string {
        return path.join(this.pidsDirectory, `${appName}.pid`)
    }
}
