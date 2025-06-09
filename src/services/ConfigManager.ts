import * as fs from 'node:fs'
import * as YAML from 'yaml'
import { configSchema } from '../schema.js'

export interface AppConfig {
    name: string
    cwd: string
    run: string
}

export interface Config {
    apps: AppConfig[]
}

export class ConfigManager {
    readConfig(configFilePath: string): Config {
        if (!fs.existsSync(configFilePath)) {
            throw new Error(`Config file not found: ${configFilePath}`)
        }

        try {
            const configContent = fs.readFileSync(configFilePath, 'utf8')
            const configParsed = YAML.parse(configContent)

            const { success, data: config, error } = configSchema.safeParse(configParsed)

            if (!success) {
                throw new Error(`Invalid config file: ${error.message}`)
            }

            return config
        } catch (error: unknown) {
            const err = error as Error
            throw new Error(`Error reading config file: ${err.message}`)
        }
    }

    validateAppConfig(app: AppConfig): void {
        if (!app.name?.trim()) {
            throw new Error('App name is required')
        }

        if (!app.cwd?.trim()) {
            throw new Error(`App '${app.name}' must have a valid working directory`)
        }

        if (!app.run?.trim()) {
            throw new Error(`App '${app.name}' must have a valid run command`)
        }
    }

    validateConfig(config: Config): void {
        if (!config.apps || !Array.isArray(config.apps)) {
            throw new Error('Config must contain an apps array')
        }

        if (config.apps.length === 0) {
            throw new Error('Config must contain at least one app')
        }

        const appNames = new Set<string>()

        for (const app of config.apps) {
            this.validateAppConfig(app)

            if (appNames.has(app.name)) {
                throw new Error(`Duplicate app name found: ${app.name}`)
            }

            appNames.add(app.name)
        }
    }
}
