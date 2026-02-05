import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import readline from 'node:readline'
import { existsSync } from 'node:fs'
import open from 'open'
import { Box, Text, useApp, useStdin } from 'ink'
import SelectInput from 'ink-select-input'
import { ProcessManager, ConfigManager } from '../services/index.js'
import { getFileNameFriendlyName, getProcessLogOutFilePath, getProcessLogErrorFilePath } from '../helpers.js'
import type { AppConfig } from '../services/ConfigManager.js'

interface ProcessTUIProps {
    configPath: string
    clearLogs?: boolean
}

interface ProcessStatus {
    name: string
    pid: number | null
    isRunning: boolean
}

export function ProcessTUI({ configPath, clearLogs }: ProcessTUIProps) {
    const { exit } = useApp()
    const { stdin, setRawMode } = useStdin()
    const [processes, setProcesses] = useState<ProcessStatus[]>([])
    const [apps, setApps] = useState<AppConfig[]>([])
    const [message, setMessage] = useState<string>('')
    const [messageColor, setMessageColor] = useState<'green' | 'red' | 'yellow'>('green')
    const [isProcessing, setIsProcessing] = useState(false)
    const [isReloading, setIsReloading] = useState(false)
    const previousRawModeRef = useRef(false)
    const rawModeCapturedRef = useRef(false)

    // Create managers only once
    const processManager = useMemo(() => new ProcessManager(), [])
    const configManager = useMemo(() => new ConfigManager(), [])

    // Function to open file in native app
    const openFileInNativeApp = useCallback(async (filePath: string) => {
        if (!existsSync(filePath)) {
            setMessage(`Log file not found: ${filePath}`)
            setMessageColor('red')
            setTimeout(() => setMessage(''), 3000)
            return
        }

        try {
            await open(filePath)
            setMessage(`Opening log file...`)
            setMessageColor('green')
        } catch (error) {
            setMessage(`Failed to open log: ${error instanceof Error ? error.message : String(error)}`)
            setMessageColor('red')
        }
        setTimeout(() => setMessage(''), 3000)
    }, [])

    const cleanExit = useCallback(() => {
        if (setRawMode) {
            setRawMode(previousRawModeRef.current)
        }

        exit()
        process.exit(0)
    }, [exit, setRawMode])

        const computeStatuses = useCallback((): ProcessStatus[] => {
            if (apps.length === 0) {
                return []
            }

            const runningProcesses = processManager.listRunningProcesses()

            return apps.map(app => {
                const fileNameFriendlyName = getFileNameFriendlyName(app.name)
                const running = runningProcesses.find(p => p.name === fileNameFriendlyName)

                return {
                    name: app.name,
                    pid: running?.pid ?? null,
                    isRunning: running?.isRunning ?? false
                }
            })
        }, [apps, processManager])

    // Reload config function
    const reloadConfig = useCallback(async () => {
        if (isReloading || isProcessing) return

        setIsReloading(true)
        setMessage('Reloading configuration...')
        setMessageColor('yellow')

        try {
            const config = configManager.readConfig(configPath)
            configManager.validateConfig(config)

            // Check for removed apps and stop them if running
            const oldAppNames = new Set(apps.map(app => app.name))
            const newAppNames = new Set(config.apps.map(app => app.name))

            const removedApps = Array.from(oldAppNames).filter(name => !newAppNames.has(name))

            const stoppedApps: string[] = []
            if (removedApps.length > 0) {
                // Check which removed apps are actually running
                const currentProcesses = processes.filter(p =>
                    removedApps.includes(p.name) && p.isRunning
                )

                if (currentProcesses.length > 0) {
                    setMessage(`Stopping removed apps: ${currentProcesses.map(p => p.name).join(', ')}...`)

                    for (const proc of currentProcesses) {
                        try {
                            const success = await processManager.stopApp(proc.name, { quiet: true })
                            if (success) {
                                stoppedApps.push(proc.name)
                            }
                        } catch (error: unknown) {
                            // Continue even if stop fails
                            console.error(`Failed to stop ${proc.name}:`, error)
                        }
                    }
                }
            }

            setApps(config.apps)

            if (stoppedApps.length > 0) {
                setMessage(`Configuration reloaded. Stopped ${stoppedApps.length} running app(s): ${stoppedApps.join(', ')}`)
            } else if (removedApps.length > 0) {
                setMessage(`Configuration reloaded. ${removedApps.length} app(s) removed (none were running)`)
            } else {
                setMessage('Configuration reloaded successfully')
            }
            setMessageColor('green')
        } catch (error: unknown) {
            const err = error as Error
            setMessage(`Error reloading config: ${err.message}`)
            setMessageColor('red')
        } finally {
            setIsReloading(false)
            // Clear message after 3 seconds
            setTimeout(() => setMessage(''), 3000)
        }
    }, [configPath, configManager, isReloading, isProcessing, apps, processes, processManager])

    // Load config on mount
    useEffect(() => {
        try {
            const config = configManager.readConfig(configPath)
            configManager.validateConfig(config)
            setApps(config.apps)
        } catch (error: unknown) {
            const err = error as Error
            setMessage(`Error loading config: ${err.message}`)
            setMessageColor('red')
        }
    }, [configPath, configManager])

    // Update process status
    useEffect(() => {
        setProcesses(computeStatuses())
    }, [computeStatuses])

    // Handle keyboard input - use keypress events to intercept BEFORE SelectInput
    useEffect(() => {
        if (!stdin) return

        // Enable keypress events and raw mode for immediate key detection
        readline.emitKeypressEvents(stdin)

        const stream = stdin as NodeJS.ReadStream
        if (!rawModeCapturedRef.current) {
            const previousRawMode = typeof stream.isRaw === 'boolean' ? stream.isRaw : false
            previousRawModeRef.current = previousRawMode
            rawModeCapturedRef.current = true
        }

        if (setRawMode) {
            setRawMode(true)
        }

        const handleKeypress = (str: string | undefined, key: readline.Key | undefined) => {
            if (str === 'q') {
                cleanExit()
            }

            if (str === 'r') {
                reloadConfig()
            }

            if (key?.ctrl && key.name === 'c') {
                cleanExit()
            }

        }

        // Use prependListener to capture keys before other handlers
        stdin.prependListener('keypress', handleKeypress)

        return () => {
            stdin.removeListener('keypress', handleKeypress)

            if (setRawMode) {
                setRawMode(previousRawModeRef.current)
            }
        }
    }, [stdin, setRawMode, cleanExit, reloadConfig])

    // Handle Ctrl+C signal directly - use prependListener to be first
    useEffect(() => {
        const handleSigInt = () => {
            cleanExit()
        }

        // Use prependListener to ensure we handle SIGINT before Ink does
        process.prependListener('SIGINT', handleSigInt)

        return () => {
            process.removeListener('SIGINT', handleSigInt)
        }
    }, [cleanExit])

    const handleSelect = useCallback(async (item: { label: string; value: string }) => {
        if (isProcessing || isReloading) return // Prevent multiple simultaneous operations

        const [action, appName] = item.value.split(':')
        const app = apps.find(a => a.name === appName)

        if (!app) {
            setMessage(`App ${appName} not found`)
            setMessageColor('red')
            return
        }

        setIsProcessing(true)

        try {
            if (action === 'start') {
                await processManager.startApp(app, {
                    daemon: false,
                    clearLogs: clearLogs ?? false
                })
                setMessage(`Started ${appName}`)
                setMessageColor('green')
            } else if (action === 'stop') {
                const success = await processManager.stopApp(appName, { quiet: true })
                if (success) {
                    setMessage(`Stopped ${appName}`)
                    setMessageColor('green')
                } else {
                    setMessage(`Failed to stop ${appName}`)
                    setMessageColor('red')
                }
            } else if (action === 'restart') {
                const success = await processManager.stopApp(appName, { quiet: true })
                if (success) {
                    // Wait a bit before restarting
                    await new Promise(resolve => setTimeout(resolve, 500))
                    await processManager.startApp(app, {
                        daemon: false,
                        clearLogs: clearLogs ?? false
                    })
                    setMessage(`Restarted ${appName}`)
                    setMessageColor('green')
                } else {
                    setMessage(`Failed to stop ${appName} for restart`)
                    setMessageColor('red')
                }
            } else if (action === 'viewout') {
                const fileNameFriendly = getFileNameFriendlyName(appName)
                const logPath = getProcessLogOutFilePath(fileNameFriendly)
                openFileInNativeApp(logPath)
                setIsProcessing(false)
                return
            } else if (action === 'viewerr') {
                const fileNameFriendly = getFileNameFriendlyName(appName)
                const logPath = getProcessLogErrorFilePath(fileNameFriendly)
                openFileInNativeApp(logPath)
                setIsProcessing(false)
                return
            }

            setProcesses(computeStatuses())
        } catch (error: unknown) {
            const err = error as Error
            setMessage(`Error: ${err.message}`)
            setMessageColor('red')
        } finally {
            setIsProcessing(false)
        }

        // Clear message after 3 seconds
        setTimeout(() => setMessage(''), 3000)
    }, [apps, clearLogs, computeStatuses, processManager, isProcessing, isReloading])

    const getMenuItems = useCallback(() => {
        const items: Array<{ label: string; value: string }> = []

        processes.forEach(proc => {
            const statusLabel = proc.isRunning
                ? `🟢 Running (PID: ${proc.pid})`
                : '🔴 Stopped'

            items.push({
                label: `${proc.name.padEnd(40)} ${statusLabel}`,
                value: `info:${proc.name}`
            })

            if (proc.isRunning) {
                items.push({
                    label: `  ├─ Stop ${proc.name}`,
                    value: `stop:${proc.name}`
                })
                items.push({
                    label: `  ├─ Restart ${proc.name}`,
                    value: `restart:${proc.name}`
                })
                items.push({
                    label: `  ├─ View Output Log`,
                    value: `viewout:${proc.name}`
                })
                items.push({
                    label: `  └─ View Error Log`,
                    value: `viewerr:${proc.name}`
                })
            } else {
                items.push({
                    label: `  ├─ Start ${proc.name}`,
                    value: `start:${proc.name}`
                })
                items.push({
                    label: `  ├─ View Output Log`,
                    value: `viewout:${proc.name}`
                })
                items.push({
                    label: `  └─ View Error Log`,
                    value: `viewerr:${proc.name}`
                })
            }
        })

        return items
    }, [processes])

    const items = useMemo(() => getMenuItems(), [getMenuItems])

    const handleMenuSelect = useCallback((item: { label: string; value: string }) => {
        if (item.value === 'separator' || item.value.startsWith('info:')) {
            // Informational rows are read-only
        } else {
            handleSelect(item)
        }
    }, [handleSelect])

    const notificationText = isProcessing ? 'Processing...' : (isReloading ? 'Reloading...' : message)
    const notificationColor = (isProcessing || isReloading) ? 'yellow' : message ? messageColor : undefined

    return (
        <Box flexDirection="column">
            <Box borderStyle="round" borderColor="cyan" padding={1} marginBottom={1}>
                <Text bold color="cyan">Pomitu Process Manager - Interactive Mode</Text>
            </Box>

            {processes.length > 0 ? (
                <>
                    <Box marginBottom={1}>
                        <Text dimColor>Use arrow keys to navigate, Enter to select, 'r' to reload config, 'q' or Ctrl+C to quit</Text>
                    </Box>
                    <SelectInput items={items} onSelect={handleMenuSelect} isFocused={!isProcessing && !isReloading} />
                </>
            ) : (
                <Text>Loading processes...</Text>
            )}

            <Box marginTop={1}>
                <Text color={notificationColor ?? 'gray'}>{notificationText ?? ' '}</Text>
            </Box>
        </Box>
    )
}
