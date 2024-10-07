import { Command } from 'commander'
import { getPomituLogsDirectory } from '../helpers.js'
import * as fs from 'node:fs'
import * as path from 'node:path'

const pomituLogsDirectory = getPomituLogsDirectory()

export const flush = new Command('flush')
    .description('flush logs')
    .argument('[name]', 'name of the app whose logs you want to flush')
    .action((name) => {
        let logs = fs.readdirSync(pomituLogsDirectory)


        if (name) {
            logs = logs.filter((log) => log.startsWith(name))
        }

        const fullLogPaths = logs.map((log) => path.join(pomituLogsDirectory, log))

        for (const logFilePath of fullLogPaths) {
            console.log(`Flushing ${logFilePath}`)
            fs.unlinkSync(logFilePath)
        }

        console.log('Logs flushed')
    })
