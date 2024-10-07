import { Command } from 'commander'
import { spawn } from 'node:child_process'
import { parse } from 'shell-quote'
import {
    readConfig,
    getProcessLogOutFilePath,
    getProcessLogErrorFilePath,
    getProcessPidFilePath,
    pidIsRunning,
} from '../helpers'
import * as fs from 'node:fs'
import { getFileNameFriendlyName } from '../helpers.js'

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

            const existingPidFilePath = getProcessPidFilePath(fileNameFriendAppName)

            if (fs.existsSync(existingPidFilePath)) {
                const existingPid = parseInt(fs.readFileSync(existingPidFilePath, 'utf-8'))

                if (pidIsRunning(existingPid)) {
                    console.warn(`Process ${app.name} is already running with pid ${existingPid}`)
                    console.log(`Stopping ${app.name} at pid ${existingPid}`)

                    try {
                        process.kill(existingPid)
                    } catch (e: unknown) {
                        const error = e as Error
                        console.error(`Error stopping ${app.name}: ${error.message}`)
                    }
                }

                fs.unlinkSync(existingPidFilePath)
            }

            const stdout = fs.openSync(getProcessLogOutFilePath(fileNameFriendAppName), 'a')
            const stderr = fs.openSync(getProcessLogErrorFilePath(fileNameFriendAppName), 'a')

            const startedProcess = spawn(run[0], run.slice(1), {
                cwd: app.cwd,
                stdio: ['ignore', stdout, stderr],
                detached: true,
            })

            startedProcess.on('error', (error) => {
                console.error(`Error starting ${app.name}: ${error.message}`)
                process.exit(1)
            })

            startedProcess.on('spawn', () => {
                console.log(`Started: ${app.name} with pid ${startedProcess.pid}`)
            })

            startedProcess.unref()

            fs.writeFileSync(getProcessPidFilePath(fileNameFriendAppName), startedProcess.pid!.toString())
        }
    })
