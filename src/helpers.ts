import { homedir } from 'node:os'
import * as path from 'node:path'

export function getPomituDirectory() {
    const homeDirectory = homedir()
    return path.join(homeDirectory, '.pomitu')
}

export function getPomituLogsDirectory() {
    return path.join(getPomituDirectory(), 'logs')
}

export function getPomituPidsDirectory() {
    return path.join(getPomituDirectory(), 'pids')
}

export function getFileNameFriendlyName(name: string) {
    return name.replaceAll(' ', '-').toLowerCase()
}

export function getProcessLogOutFilePath(name: string) {
    return path.join(getPomituLogsDirectory(), `${name}-out.log`)
}

export function getProcessLogErrorFilePath(name: string) {
    return path.join(getPomituLogsDirectory(), `${name}-error.log`)
}

// From: https://stackoverflow.com/a/21296291/4932305
export function pidIsRunning(pid: number) {
    try {
        process.kill(pid, 0)
        return true
    } catch {
        return false
    }
}
