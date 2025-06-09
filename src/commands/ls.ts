import { Command } from 'commander'
import { ProcessManager } from '../services/index.js'

export const ls = new Command('ls')
    .description('list all running apps')
    .action(() => {
        try {
            const processManager = new ProcessManager()
            const processes = processManager.listRunningProcesses()

            if (processes.length === 0) {
                console.log('No running processes found')
                return
            }

            console.log('Running processes:')
            for (const process of processes) {
                if (process.isRunning) {
                    console.log(`- ${process.name} (pid: ${process.pid})`)
                } else {
                    console.warn(`- ${process.name} (pid: ${process.pid}) is not running`)
                }
            }
        } catch (error: unknown) {
            const err = error as Error
            console.error(`Error: ${err.message}`)
            process.exit(1)
        }
    })
