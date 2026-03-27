import * as fs from 'node:fs'
import { getProcessSignalPath, getTuiPidPath, getFileNameFriendlyName, pidIsRunning } from '../helpers.js'
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
