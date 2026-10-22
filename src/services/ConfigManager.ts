import * as fs from 'node:fs'
import * as path from 'node:path'
import * as YAML from 'yaml'
import { configSchema } from '../schema.js'
import { getRememberedConfigPathFile, getFileNameFriendlyName } from '../helpers.js'

export interface AppConfig {
    name: string
    cwd: string
    run: string
    env?: Record<string, string | number | boolean>
}

export interface Config {
    apps: AppConfig[]
}

export class ConfigManager {
    getRememberedConfigPath(): string | null {
        const file = getRememberedConfigPathFile()
        return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
    }

    // For commands that act on the config `pomitu start` was given
    requireRememberedConfigPath(): string {
        const configPath = this.getRememberedConfigPath()
        if (!configPath) {
            throw new Error('No config yet. Run pomitu start <config> first')
        }
        return configPath
    }

    rememberConfigPath(configPath: string): void {
        fs.writeFileSync(getRememberedConfigPathFile(), path.resolve(configPath))
    }

    isRememberedConfigPath(configPath: string): boolean {
        const rememberedConfigPath = this.getRememberedConfigPath()
        if (!rememberedConfigPath) {
            return false
        }
        const normalize = (p: string) => process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p)
        return normalize(rememberedConfigPath) === normalize(configPath)
    }

    loadConfig(configPath: string): Config {
        const config = this.readConfig(configPath)
        this.validateConfig(config)
        return config
    }

    findApp(config: Config, name: string): AppConfig {
        const app = config.apps.find(a => getFileNameFriendlyName(a.name) === getFileNameFriendlyName(name))
        if (!app) {
            throw new Error(`No app named ${name} in the config`)
        }
        return app
    }

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
