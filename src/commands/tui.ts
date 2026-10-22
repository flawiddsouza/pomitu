import { Command } from 'commander'
import React from 'react'
import { render } from 'ink'
import { ConfigManager } from '../services/index.js'
import { ProcessTUI } from '../components/ProcessTUI.js'

export const tui = new Command('tui')
    .description('view and control the apps of the config pomitu start was given. Quitting leaves them running')
    .action(() => {
        try {
            const configPath = new ConfigManager().requireRememberedConfigPath()
            render(React.createElement(ProcessTUI, { configPath }))
        } catch (error: unknown) {
            const err = error as Error
            console.error(`Error: ${err.message}`)
            process.exit(1)
        }
    })
