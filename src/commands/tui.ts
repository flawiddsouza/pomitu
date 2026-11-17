import { Command } from 'commander'
import { ConfigManager } from '../services/index.js'

export const tui = new Command('tui')
    .description('view and control the apps of the config pomitu start was given. Quitting leaves them running')
    .action(async () => {
        try {
            const configPath = new ConfigManager().requireRememberedConfigPath()
            // Loading Ink takes over a second, so only this command loads it
            const [{ default: React }, { render }, { ProcessTUI }] = await Promise.all([
                import('react'),
                import('ink'),
                import('../components/ProcessTUI.js'),
            ])
            render(React.createElement(ProcessTUI, { configPath }))
        } catch (error: unknown) {
            const err = error as Error
            console.error(`Error: ${err.message}`)
            process.exit(1)
        }
    })
