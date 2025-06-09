import { Command } from 'commander'
import { LogManager } from '../services/index.js'

export const flush = new Command('flush')
    .description('flush logs')
    .argument('[name]', 'name of the app whose logs you want to flush')
    .action((name) => {
        try {
            const logManager = new LogManager()
            const flushedFiles = logManager.flushLogs(name)

            if (flushedFiles.length === 0) {
                console.log('No log files found to flush')
            } else {
                console.log('Logs flushed')
            }
        } catch (error: unknown) {
            const err = error as Error
            console.error(`Error: ${err.message}`)
            process.exit(1)
        }
    })
