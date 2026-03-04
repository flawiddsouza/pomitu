import { Command } from 'commander'
import { PidManager } from '../services/PidManager.js'
import { isTuiActive, writeSignal, waitForPidState } from '../services/IpcSignal.js'
import { getFileNameFriendlyName } from '../helpers.js'

export const restart = new Command('restart')
    .description('restart a running app (works whether managed by TUI or daemon)')
    .argument('<name>', 'name of the app to restart')
    .action(async (name) => {
        try {
            if (isTuiActive(name)) {
                writeSignal(name, 'restart')
                await waitForPidState(name, 'absent', 3000)
                const confirmed = await waitForPidState(name, 'present', 3000)
                if (confirmed) {
                    const pidManager = new PidManager()
                    const pid = pidManager.getPid(getFileNameFriendlyName(name))
                    console.log(`Restarted ${name} (PID: ${pid})`)
                } else {
                    console.warn(`Restart signal sent but could not confirm ${name} restarted within timeout`)
                }
            } else {
                console.error(`No active TUI session found for ${name}. For daemon-mode processes, use: pomitu stop ${name} && pomitu start <config>`)
                process.exit(1)
            }
        } catch (error: unknown) {
            const err = error as Error
            console.error(`Error: ${err.message}`)
            process.exit(1)
        }
    })
