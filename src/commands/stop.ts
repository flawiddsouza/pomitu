import { Command } from 'commander'
import { ProcessManager } from '../services/index.js'

export const stop = new Command('stop')
    .description('stop a running app or all apps')
    .argument('<name>', 'name of the app to stop or "all" to stop all apps')
    .action(async (name) => {
        try {
            const processManager = new ProcessManager()

            if (name === 'all') {
                const stoppedCount = await processManager.stopAllApps()

                if (stoppedCount === 0) {
                    console.warn('No running processes found')
                } else {
                    console.log(`Stopped ${stoppedCount} process(es)`)
                }
            } else {
                const success = await processManager.stopApp(name)

                if (!success) {
                    console.warn(`No running process found for ${name}`)
                }
            }
        } catch (error: unknown) {
            const err = error as Error
            console.error(`Error: ${err.message}`)
            process.exit(1)
        }
    })
