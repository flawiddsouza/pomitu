import * as fs from 'node:fs'
import * as YAML from 'yaml'
import { configSchema } from './schema'
import { homedir } from 'node:os'
import * as path from 'node:path'

export function readConfig(configFilePath: string) {
    const configParsed = YAML.parse(fs.readFileSync(configFilePath, 'utf8'))

    const { success, data: config } = configSchema.safeParse(configParsed)

    if (!success) {
        console.error('Invalid config file')
        process.exit(1)
    }

    return config
}

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

export function getProcessPidFilePath(name: string) {
    return path.join(getPomituPidsDirectory(), `${name}.pid`)
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
