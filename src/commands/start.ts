import { Command } from 'commander'
import { spawn } from 'node:child_process'
import { parse } from 'shell-quote'
import { getPomituLogsDirectory, readConfig } from '../helpers'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { getFileNameFriendlyName } from '../helpers.js'

const pomituLogsDirectory = getPomituLogsDirectory()

export const start = new Command('start')
    .description('start and daemonize an app')
    .argument('<name>', '[name|namespace|file|ecosystem|id...]')
    .action((name) => {
        const config = readConfig(name)

        for (const app of config.apps) {
            console.log(`Starting: ${app.name} (${app.cwd})`)

            if (!fs.existsSync(app.cwd)) {
                console.error(`Directory ${app.cwd} does not exist`)
                process.exit(1)
            }

            const run = parse(app.run) as string[]

            if (!run.length) {
                console.error(`Invalid run command for ${app.name}: ${app.run}`)
                process.exit(1)
            }

            const fileNameFriendAppName = getFileNameFriendlyName(app.name)

            const stdout = fs.openSync(path.join(pomituLogsDirectory, `${fileNameFriendAppName}-out.log`), 'a')
            const stderr = fs.openSync(path.join(pomituLogsDirectory, `${fileNameFriendAppName}-error.log`), 'a')

            const startedProcess = spawn(run[0], run.slice(1), {
                cwd: app.cwd,
                stdio: ['ignore', stdout, stderr],
            })

            startedProcess.on('error', (error) => {
                console.error(`Error starting ${app.name}: ${error.message}`)
                process.exit(1)
            })

            startedProcess.on('spawn', () => {
                console.log(`Started: ${app.name}`)
            })

            startedProcess.on('close', (code) => {
                console.log(`Process ${app.name} exited with code ${code}`)
            })
        }
    })
