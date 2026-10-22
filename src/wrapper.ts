// Windows only. Runs an app with a hidden console that every console program it
// starts shares, so none of them opens a window. The app can't be started detached
// directly: a detached process gets no console at all, and then each console
// program it runs opens a new visible one. This wrapper is the detached part.
import { spawn } from 'cross-spawn'

const { cwd, command } = JSON.parse(process.argv[2]) as { cwd: string, command: string[] }

const child = spawn(command[0], command.slice(1), {
    cwd,
    stdio: 'inherit',
    windowsHide: true,
})

child.on('error', (error) => {
    console.error(`Error starting ${command[0]}: ${error.message}`)
    process.exit(1)
})

child.on('exit', (code) => process.exit(code ?? 1))
