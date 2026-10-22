import { Command } from 'commander'
import { ProcessManager, ConfigManager } from '../services/index.js'

export const reload = new Command('reload')
    .description('reread the config and stop running apps no longer in it, same as pressing r in the TUI')
    .action(async () => {
        try {
            const configManager = new ConfigManager()
            const config = configManager.loadConfig(configManager.requireRememberedConfigPath())
            const stoppedApps = await new ProcessManager().stopAppsNotIn(config)
            console.log(stoppedApps.length > 0
                ? `Config reloaded. Stopped ${stoppedApps.length} app(s) no longer in it: ${stoppedApps.join(', ')}`
                : 'Config reloaded')
        } catch (error: unknown) {
            const err = error as Error
            console.error(`Error: ${err.message}`)
            process.exit(1)
        }
    })
