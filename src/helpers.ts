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

export function getFileNameFriendlyName(name: string) {
    return name.replaceAll(' ', '-').toLowerCase()
}
