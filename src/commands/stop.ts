import { Command } from 'commander'
import { ProcessManager } from '../services/index.js'

export const stop = new Command('stop')
    .description('stop a running app or all apps')
    .argument('<name>', 'name of the app to stop or "all" to stop all apps')
    .action(async (name) => {
        try {
            const processManager = new ProcessManager()

            const names = name === 'all'
                ? processManager.listRunningProcesses().filter(p => p.isRunning).map(p => p.name)
                : [name]

            let stoppedCount = 0
            let failed = false
            for (const appName of names) {
                try {
                    if (await processManager.stopApp(appName)) {
                        console.log(`Stopped ${appName}`)
                        stoppedCount++
                    } else if (name !== 'all') {
                        console.warn(`${appName} is not running`)
                    }
                } catch (error: unknown) {
                    console.error(`Error stopping ${appName}: ${(error as Error).message}`)
                    failed = true
                }
            }

            if (name === 'all') {
                console.log(stoppedCount === 0 ? 'No running apps found' : `Stopped ${stoppedCount} app(s)`)
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
