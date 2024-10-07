import { Command } from 'commander'
import * as fs from 'node:fs'
import {
    getPomituPidsDirectory,
    getFileNameFriendlyName,
    pidIsRunning,
} from '../helpers'

export const stop = new Command('stop')
    .description('stop a running app or all apps')
    .argument('<name>', 'name of the app to stop or "all" to stop all apps')
    .action((name) => {
        const pidsDirectory = getPomituPidsDirectory()
        const pidFiles = fs.readdirSync(pidsDirectory)

        if (name === 'all') {
            if (pidFiles.length === 0) {
                console.warn('No running processes found')
                return
            }

            for (const pidFile of pidFiles) {
                stopProcess(pidFile, name)
            }
        } else {
            const fileNameFriendlyName = getFileNameFriendlyName(name)
            const pidFile = `${fileNameFriendlyName}.pid`

            if (pidFiles.includes(pidFile)) {
                stopProcess(pidFile, name)
            } else {
                console.warn(`No running process found for ${name}`)
            }
        }
    })

function stopProcess(pidFile: string, appName: string) {
    const pidFilePath = `${getPomituPidsDirectory()}/${pidFile}`
    const pid = parseInt(fs.readFileSync(pidFilePath, 'utf-8'))

    if (pidIsRunning(pid)) {
        console.log(`Stopping ${appName} with pid ${pid}`)
        try {
            process.kill(pid)
            fs.unlinkSync(pidFilePath)
            console.log(`${appName} with pid ${pid} stopped`)
        } catch (e: unknown) {
            const error = e as Error
            console.error(`Error stopping ${appName} with pid ${pid}: ${error.message}`)
        }
    } else {
        console.warn(`${appName} with pid ${pid} is not running`)
        fs.unlinkSync(pidFilePath)
    }
}
