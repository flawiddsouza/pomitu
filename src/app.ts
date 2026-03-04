#! /usr/bin/env node
import { Command } from 'commander'
import { start } from './commands/start.js'
import { flush } from './commands/flush.js'
import { stop } from './commands/stop.js'
import { restart } from './commands/restart.js'
import { mkdirSync } from 'node:fs'
import { ls } from './commands/ls.js'
import { getPomituDirectory, getPomituLogsDirectory, getPomituPidsDirectory, getPomituSignalsDirectory } from './helpers.js'

function init() {
    mkdirSync(getPomituDirectory(), { recursive: true })
    mkdirSync(getPomituLogsDirectory(), { recursive: true })
    mkdirSync(getPomituPidsDirectory(), { recursive: true })
    mkdirSync(getPomituSignalsDirectory(), { recursive: true })
}

init()

const program = new Command()

program
    .name('pomitu')
    .description('Pomitu is a process manager inspired by PM2')
    .addCommand(start)
    .addCommand(flush)
    .addCommand(stop)
    .addCommand(restart)
    .addCommand(ls)
    .parse()
