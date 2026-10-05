import * as fs from 'node:fs'
import * as path from 'node:path'
import { getProcessSignalPath, getTuiPidPath, getFileNameFriendlyName, pidIsRunning, getPomituPidsDirectory, getTuiReloadSignalPath, getTuiReloadResultPath } from '../helpers.js'
import { PidManager } from './PidManager.js'

export type IpcAction = 'restart' | 'stop' | 'start'

interface SignalPayload {
    action: IpcAction
    timestamp: number
}

const SIGNAL_MAX_AGE_MS = 5000
const WAIT_POLL_INTERVAL_MS = 100

export function writeTuiPresence(appName: string): void {
    const tuiPidPath = getTuiPidPath(getFileNameFriendlyName(appName))
    fs.writeFileSync(tuiPidPath, process.pid.toString())
}

export function clearTuiPresence(appName: string): void {
    const tuiPidPath = getTuiPidPath(getFileNameFriendlyName(appName))
    if (fs.existsSync(tuiPidPath)) {
        fs.unlinkSync(tuiPidPath)
    }
}

const TUI_HEARTBEAT_MAX_AGE_MS = 30000

export function isTuiActive(appName: string): boolean {
    const tuiPidPath = getTuiPidPath(getFileNameFriendlyName(appName))
    if (!fs.existsSync(tuiPidPath)) {
        return false
    }
    try {
        const stat = fs.statSync(tuiPidPath)
        if (Date.now() - stat.mtimeMs > TUI_HEARTBEAT_MAX_AGE_MS) {
            fs.unlinkSync(tuiPidPath)
            return false
        }
        return true
    } catch {
        return false
    }
}

export function isAnyTuiActive(): boolean {
    const pidsDir = getPomituPidsDirectory()
    return fs.readdirSync(pidsDir).some(file => {
        if (!file.endsWith('-tui.pid')) return false
        try {
            return Date.now() - fs.statSync(path.join(pidsDir, file)).mtimeMs <= TUI_HEARTBEAT_MAX_AGE_MS
        } catch {
            return false
        }
    })
}

export interface ReloadResult {
    timestamp: number
    ok: boolean
    message: string
}

export function writeReloadSignal(): number {
    const timestamp = Date.now()
    fs.rmSync(getTuiReloadResultPath(), { force: true })
    fs.writeFileSync(getTuiReloadSignalPath(), JSON.stringify({ timestamp }))
    return timestamp
}

export function clearReloadSignal(): void {
    fs.rmSync(getTuiReloadSignalPath(), { force: true })
}

// Returns the signal's timestamp, which the result echoes back.
export function readAndClearReloadSignal(): number | null {
    const signalPath = getTuiReloadSignalPath()
    if (!fs.existsSync(signalPath)) {
        return null
    }
    try {
        const raw = fs.readFileSync(signalPath, 'utf-8')
        fs.unlinkSync(signalPath)
        const { timestamp } = JSON.parse(raw) as { timestamp: number }
        return Date.now() - timestamp > SIGNAL_MAX_AGE_MS ? null : timestamp
    } catch {
        return null
    }
}

export function writeReloadResult(result: ReloadResult): void {
    fs.writeFileSync(getTuiReloadResultPath(), JSON.stringify(result))
}

export async function waitForReloadResult(timestamp: number, timeoutMs: number): Promise<ReloadResult | null> {
    const resultPath = getTuiReloadResultPath()
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        try {
            const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8')) as ReloadResult
            if (result.timestamp === timestamp) {
                fs.rmSync(resultPath, { force: true })
                return result
            }
        } catch {
            // not written yet
        }
        await new Promise(resolve => setTimeout(resolve, WAIT_POLL_INTERVAL_MS))
    }
    return null
}

export function writeSignal(appName: string, action: IpcAction): void {
    const signalPath = getProcessSignalPath(getFileNameFriendlyName(appName))
    const payload: SignalPayload = { action, timestamp: Date.now() }
    fs.writeFileSync(signalPath, JSON.stringify(payload))
}

export function readAndClearSignal(appName: string): IpcAction | null {
    const signalPath = getProcessSignalPath(getFileNameFriendlyName(appName))
    if (!fs.existsSync(signalPath)) {
        return null
    }
    try {
        const raw = fs.readFileSync(signalPath, 'utf-8')
        fs.unlinkSync(signalPath)
        const payload = JSON.parse(raw) as SignalPayload
        if (Date.now() - payload.timestamp > SIGNAL_MAX_AGE_MS) {
            return null
        }
        return payload.action
    } catch {
        return null
    }
}

export async function waitForPidState(
    appName: string,
    state: 'present' | 'absent',
    timeoutMs = 3000
): Promise<boolean> {
    const pidManager = new PidManager()
    const fileNameFriendlyName = getFileNameFriendlyName(appName)
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
        const pid = pidManager.getPid(fileNameFriendlyName)
        const isRunning = pid !== null && pidIsRunning(pid)

        if (state === 'present' && isRunning) return true
        if (state === 'absent' && !isRunning) return true

        await new Promise(resolve => setTimeout(resolve, WAIT_POLL_INTERVAL_MS))
    }

    return false
}
