import { Command } from 'commander'
import { ProcessManager, ConfigManager } from '../services/index.js'
import { isTuiActive, writeSignal, waitForPidState } from '../services/IpcSignal.js'
import { PidManager } from '../services/PidManager.js'
import { getFileNameFriendlyName, pidIsRunning } from '../helpers.js'
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
            let anyTuiActive = false
            const pidManager = new PidManager()

            for (const app of config.apps) {
                if (isTuiActive(app.name)) {
                    anyTuiActive = true
                    const existingPid = pidManager.getPid(getFileNameFriendlyName(app.name))
                    const wasRunning = existingPid !== null && pidIsRunning(existingPid)
                    writeSignal(app.name, 'start')
                    if (!runInteractive) {
                        if (wasRunning) {
                            await waitForPidState(app.name, 'absent', 3000)
                        }
                        const confirmed = await waitForPidState(app.name, 'present', 3000)
                        if (confirmed) {
                            const pid = pidManager.getPid(getFileNameFriendlyName(app.name))
                            console.log(`Started ${app.name} with pid ${pid}`)
                        } else {
                            console.warn(`Start signal sent but could not confirm ${app.name} started within timeout`)
                        }
                    }
                } else {
                    processManager.startApp(app, {
                        daemon: options.daemon,
                        clearLogs: options.clearLogs
                    })
                }
            }

            if (runInteractive && !anyTuiActive) {
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
