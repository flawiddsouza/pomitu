import { Command } from 'commander'
import { isAnyTuiActive, writeReloadSignal, waitForReloadResult, clearReloadSignal } from '../services/IpcSignal.js'

// Stopping apps removed from the config can take a while.
const RELOAD_TIMEOUT_MS = 15000

export const reload = new Command('reload')
    .description('reload the config in the active TUI, same as pressing r there')
    .action(async () => {
        if (!isAnyTuiActive()) {
            console.error('No active TUI session found. Reload applies to a TUI started with --no-daemon')
            process.exit(1)
        }
        const timestamp = writeReloadSignal()
        const result = await waitForReloadResult(timestamp, RELOAD_TIMEOUT_MS)
        if (!result) {
            // The failure is reported now, so the reload must not happen later.
            clearReloadSignal()
            console.warn('Reload signal sent but the TUI did not report a result within timeout. A TUI started before pomitu had this command ignores it, so restart that TUI')
            process.exit(1)
        }
        if (result.ok) {
            console.log(result.message)
        } else {
            console.error(result.message)
            process.exit(1)
        }
    })
