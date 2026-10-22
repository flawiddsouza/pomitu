import { Command } from 'commander'
import { ProcessManager, ConfigManager } from '../services/index.js'

export const restart = new Command('restart')
    .description('restart an app with its current entry in the config, or start it if stopped')
    .argument('<name>', 'name of the app to restart')
    .action(async (name) => {
        try {
            const configManager = new ConfigManager()
            const processManager = new ProcessManager()

            const config = configManager.loadConfig(configManager.requireRememberedConfigPath())
            const app = configManager.findApp(config, name)
            const wasRunning = processManager.getRunningPid(app.name) !== null
            const pid = await processManager.restartApp(app)
            console.log(`${wasRunning ? 'Restarted' : 'Started'} ${app.name} with pid ${pid}`)
        } catch (error: unknown) {
            const err = error as Error
            console.error(`Error: ${err.message}`)
            process.exit(1)
        }
    })
