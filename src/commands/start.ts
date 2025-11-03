import { Command } from 'commander'
import { ProcessManager, ConfigManager } from '../services/index.js'
import React from 'react'
import { render } from 'ink'
import { ProcessTUI } from '../components/ProcessTUI.js'

export const start = new Command('start')
    .description('start and daemonize an app')
    .argument('<name>', '[name|namespace|file|ecosystem|id...]')
    .option('--no-daemon', 'do not daemonize the app and show interactive TUI')
    .option('--clear-logs', 'clear log files before starting the app')
    .action(async (name, options) => {
        try {
            const configManager = new ConfigManager()
            const processManager = new ProcessManager()

            const config = configManager.readConfig(name)
            configManager.validateConfig(config)

            const runInteractive = options.daemon === false

            for (const app of config.apps) {
                processManager.startApp(app, {
                    daemon: options.daemon,
                    clearLogs: options.clearLogs
                })
            }

            if (runInteractive) {
                render(React.createElement(ProcessTUI, {
                    configPath: name,
                    clearLogs: options.clearLogs
                }))
            }
        } catch (error: unknown) {
            const err = error as Error
            console.error(`Error: ${err.message}`)
            process.exit(1)
        }
    })
