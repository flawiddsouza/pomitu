
import { Command } from 'commander'
import { start } from './commands/start'
import { flush } from './commands/flush'
import { mkdirSync } from 'node:fs'
import { getPomituDirectory, getPomituLogsDirectory } from './helpers'

function init() {
    mkdirSync(getPomituDirectory(), { recursive: true })
    mkdirSync(getPomituLogsDirectory(), { recursive: true })
}

init()

const program = new Command()

program
    .name('pomitu')
    .description('Pomitu is a process manager inspired by PM2')
    .addCommand(start)
    .addCommand(flush)
    .parse()
