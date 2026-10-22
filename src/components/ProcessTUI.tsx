import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import readline from 'node:readline'
import { existsSync } from 'node:fs'
import open from 'open'
import { Box, Text, useApp, useStdin, useInput } from 'ink'
import { PersistentSelectInput } from './PersistentSelectInput.js'
import { ProcessManager, ConfigManager } from '../services/index.js'
import { getFileNameFriendlyName, getProcessLogOutFilePath, getProcessLogErrorFilePath } from '../helpers.js'
import type { AppConfig } from '../services/ConfigManager.js'

interface ProcessTUIProps {
    configPath: string
}

interface ProcessStatus {
    name: string
    pid: number | null
    isRunning: boolean
}

export function ProcessTUI({ configPath }: ProcessTUIProps) {
    const { exit } = useApp()
    const { stdin, setRawMode } = useStdin()
    const [processes, setProcesses] = useState<ProcessStatus[]>([])
    const [apps, setApps] = useState<AppConfig[]>([])
    const [message, setMessage] = useState<string>('')
    const [messageColor, setMessageColor] = useState<'green' | 'red' | 'yellow'>('green')
    const [isProcessing, setIsProcessing] = useState(false)
    const [searchActive, setSearchActive] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    // ESC via Ink's own pipeline — no readline disambiguation delay
    useInput(useCallback((_input: string, key: { escape: boolean }) => {
        if (key.escape) {
            setSearchActive(false)
            setSearchQuery('')
        }
    }, []), { isActive: searchActive })

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
            setMessage('Opening log file...')
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

    // Same as `pomitu reload`
    const reloadConfig = useCallback(async () => {
        if (isProcessing) return
        setIsProcessing(true)
        try {
            const config = configManager.loadConfig(configPath)
            setApps(config.apps)
            const stoppedApps = await processManager.stopAppsNotIn(config)
            setMessage(stoppedApps.length > 0
                ? `Config reloaded. Stopped ${stoppedApps.length} app(s) no longer in it: ${stoppedApps.join(', ')}`
                : 'Config reloaded')
            setMessageColor('green')
        } catch (error: unknown) {
            const err = error as Error
            setMessage(`Error reloading config: ${err.message}`)
            setMessageColor('red')
        } finally {
            setIsProcessing(false)
        }
        setTimeout(() => setMessage(''), 3000)
    }, [configPath, configManager, processManager, isProcessing])

    // Load config on mount
    useEffect(() => {
        try {
            setApps(configManager.loadConfig(configPath).apps)
        } catch (error: unknown) {
            const err = error as Error
            setMessage(`Error loading config: ${err.message}`)
            setMessageColor('red')
        }
    }, [configPath, configManager])

    // Poll process status, since apps can also be started and stopped from the command line
    useEffect(() => {
        const update = () => {
            const next = computeStatuses()
            setProcesses(prev => JSON.stringify(prev) === JSON.stringify(next) ? prev : next)
        }
        update()
        const interval = setInterval(update, 1000)
        return () => clearInterval(interval)
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
            if (key?.ctrl && key.name === 'c') {
                cleanExit()
                return
            }

            if (searchActive) {
                if (key?.name === 'backspace') {
                    setSearchQuery(prev => prev.slice(0, -1))
                    return
                }
                if (key?.name !== 'return' && str && str.length === 1 && !key?.ctrl && !key?.meta) {
                    setSearchQuery(prev => prev + str)
                }
                // ESC is handled by useInput (Ink pipeline); arrow keys, Enter, and other
                // navigation are handled by PersistentSelectInput via Ink's input pipeline
                return
            }

            if (str === 'q') {
                cleanExit()
            }

            if (str === 'r') {
                reloadConfig()
            }

            if (str === 'e') {
                open(configPath).catch(error => {
                    setMessage(`Failed to open config: ${error instanceof Error ? error.message : String(error)}`)
                    setMessageColor('red')
                    setTimeout(() => setMessage(''), 3000)
                })
            }

            if (str === '/') {
                setSearchActive(true)
                setSearchQuery('')
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
    }, [stdin, setRawMode, cleanExit, reloadConfig, searchActive])

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
        if (isProcessing) return // Prevent multiple simultaneous operations

        const colonIndex = item.value.indexOf(':')
        const action = item.value.slice(0, colonIndex)
        const appName = item.value.slice(colonIndex + 1)
        const app = apps.find(a => a.name === appName)

        if (!app) {
            setMessage(`App ${appName} not found`)
            setMessageColor('red')
            return
        }

        setIsProcessing(true)

        try {
            if (action === 'start') {
                await processManager.startApp(app)
                setMessage(`Started ${appName}`)
                setMessageColor('green')
            } else if (action === 'stop') {
                const success = await processManager.stopApp(appName)
                if (success) {
                    setMessage(`Stopped ${appName}`)
                    setMessageColor('green')
                } else {
                    setMessage(`${appName} is not running`)
                    setMessageColor('yellow')
                }
            } else if (action === 'restart') {
                await processManager.restartApp(app)
                setMessage(`Restarted ${appName}`)
                setMessageColor('green')
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
            } else if (action === 'opencwd') {
                try {
                    await open(app.cwd)
                    setMessage('Opening working directory...')
                    setMessageColor('green')
                } catch (error) {
                    setMessage(`Failed to open directory: ${error instanceof Error ? error.message : String(error)}`)
                    setMessageColor('red')
                }
                setTimeout(() => setMessage(''), 3000)
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
    }, [apps, computeStatuses, processManager, isProcessing])

    const buildMenuItems = useCallback((statuses: ProcessStatus[]) => {
        const items: Array<{ label: string; value: string }> = []

        statuses.forEach(proc => {
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
                    label: '  ├─ View Output Log',
                    value: `viewout:${proc.name}`
                })
                items.push({
                    label: '  ├─ View Error Log',
                    value: `viewerr:${proc.name}`
                })
                items.push({
                    label: '  └─ Open Working Directory',
                    value: `opencwd:${proc.name}`
                })
            } else {
                items.push({
                    label: `  ├─ Start ${proc.name}`,
                    value: `start:${proc.name}`
                })
                items.push({
                    label: '  ├─ View Output Log',
                    value: `viewout:${proc.name}`
                })
                items.push({
                    label: '  ├─ View Error Log',
                    value: `viewerr:${proc.name}`
                })
                items.push({
                    label: '  └─ Open Working Directory',
                    value: `opencwd:${proc.name}`
                })
            }
        })

        return items
    }, [])

    const allItems = useMemo(() => buildMenuItems(processes), [buildMenuItems, processes])

    const items = useMemo(() => {
        if (!searchQuery) return allItems

        const query = searchQuery.toLowerCase()
        return allItems.filter(item =>
            item.label.toLowerCase().includes(query) ||
            item.value.toLowerCase().includes(query)
        )
    }, [allItems, searchQuery])

    const handleMenuSelect = useCallback((item: { label: string; value: string }) => {
        if (item.value === 'separator' || item.value.startsWith('info:')) {
            // Informational rows are read-only
        } else {
            handleSelect(item)
        }
    }, [handleSelect])

    const notificationText = isProcessing ? 'Processing...' : message
    const notificationColor = isProcessing ? 'yellow' : message ? messageColor : undefined

    return (
        <Box flexDirection="column">
            <Box borderStyle="round" borderColor="cyan" padding={1} marginBottom={1}>
                <Text bold color="cyan">Pomitu Process Manager</Text>
            </Box>

            {processes.length > 0 ? (
                <>
                    <Box marginBottom={1}>
                        <Text dimColor>Use arrow keys to navigate, Enter to select, '/' to search, 'r' to reload, 'e' to edit config, 'q' or Ctrl+C to quit. Apps keep running after you quit</Text>
                    </Box>
                    {searchActive && (
                        <Box marginBottom={1}>
                            <Text color="yellow">Search: {searchQuery}</Text>
                            <Text dimColor> (ESC to clear)</Text>
                        </Box>
                    )}
                    {searchActive && searchQuery && items.length < allItems.length && (
                        <Box marginBottom={1}>
                            <Text dimColor>Showing {items.length} of {allItems.length} items</Text>
                        </Box>
                    )}
                    {!searchActive && items.length > 15 && (
                        <Box marginBottom={1}>
                            <Text dimColor>Showing 15 of {items.length} items - scroll with ↑↓ arrows</Text>
                        </Box>
                    )}
                    <PersistentSelectInput items={items} onSelect={handleMenuSelect} isFocused={!isProcessing} limit={15} headingPredicate={item => item.value.startsWith('info:')} />
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
