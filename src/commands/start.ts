import { Command } from 'commander'
import { ProcessManager, ConfigManager } from '../services/index.js'

export const start = new Command('start')
    .description('start every app in a config in the background, skipping apps already running. Other commands then use this config')
    .argument('<config>', 'path to the config file')
    .option('--clear-logs', 'clear log files of the apps it starts')
    .action(async (configPath, options) => {
        try {
            const configManager = new ConfigManager()
            const processManager = new ProcessManager()

            const config = configManager.loadConfig(configPath)

            // Pomitu works with one config at a time
            const rememberedConfigPath = configManager.getRememberedConfigPath()
            if (rememberedConfigPath && !configManager.isRememberedConfigPath(configPath)
                && processManager.listRunningProcesses().some(p => p.isRunning)) {
                throw new Error(`Apps from ${rememberedConfigPath} are still running. Run pomitu stop all first`)
            }
            configManager.rememberConfigPath(configPath)

            let failed = false
            for (const app of config.apps) {
                const runningPid = processManager.getRunningPid(app.name)
                if (runningPid !== null) {
                    console.log(`${app.name} is already running with pid ${runningPid}`)
                    continue
                }
                try {
                    const pid = await processManager.startApp(app, { clearLogs: options.clearLogs })
                    console.log(`Started ${app.name} with pid ${pid}`)
                } catch (error: unknown) {
                    console.error(`Error starting ${app.name}: ${(error as Error).message}`)
                    failed = true
                }
            }
            if (failed) {
                process.exit(1)
            }
        } catch (error: unknown) {
            const err = error as Error
            console.error(`Error: ${err.message}`)
            process.exit(1)
        }
    })
