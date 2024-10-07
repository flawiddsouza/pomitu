import { Command } from 'commander'
import * as fs from 'node:fs'
import { getPomituPidsDirectory, pidIsRunning } from '../helpers'

export const ls = new Command('ls')
    .description('list all running apps')
    .action(() => {
        const pidsDirectory = getPomituPidsDirectory()
        const pidFiles = fs.readdirSync(pidsDirectory)

        if (pidFiles.length === 0) {
            console.log('No running processes found')
            return
        }

        console.log('Running processes:')
        for (const pidFile of pidFiles) {
            const pidFilePath = `${pidsDirectory}/${pidFile}`
            const pid = parseInt(fs.readFileSync(pidFilePath, 'utf-8'))
            const appName = pidFile.replace('.pid', '')

            if (pidIsRunning(pid)) {
                console.log(`- ${appName} (pid: ${pid})`)
            } else {
                console.warn(`- ${appName} (pid: ${pid}) is not running`)
            }
        }
    })
