import { Command } from 'commander'
import { ProcessManager } from '../services/index.js'
import { isTuiActive, writeSignal, waitForPidState } from '../services/IpcSignal.js'

export const stop = new Command('stop')
    .description('stop a running app or all apps')
    .argument('<name>', 'name of the app to stop or "all" to stop all apps')
    .action(async (name) => {
        try {
            const processManager = new ProcessManager()

            if (name === 'all') {
                const runningProcesses = processManager.listRunningProcesses()
                let stoppedCount = 0

                for (const proc of runningProcesses) {
                    if (isTuiActive(proc.name)) {
                        writeSignal(proc.name, 'stop')
                        const confirmed = await waitForPidState(proc.name, 'absent')
                        if (confirmed) stoppedCount++
                    } else {
                        const success = await processManager.stopApp(proc.name)
                        if (success) stoppedCount++
                    }
                }

                if (stoppedCount === 0) {
                    console.warn('No running processes found')
                } else {
                    console.log(`Stopped ${stoppedCount} process(es)`)
                }
            } else {
                if (isTuiActive(name)) {
                    writeSignal(name, 'stop')
                    const confirmed = await waitForPidState(name, 'absent')
                    if (confirmed) {
                        console.log(`Stopped ${name}`)
                    } else {
                        console.warn(`Stop signal sent but could not confirm ${name} stopped within timeout`)
                    }
                } else {
                    const success = await processManager.stopApp(name)
                    if (!success) {
                        console.warn(`No running process found for ${name}`)
                    }
                }
            }
        } catch (error: unknown) {
            const err = error as Error
            console.error(`Error: ${err.message}`)
            process.exit(1)
        }
    })
