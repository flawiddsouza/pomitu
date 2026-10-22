import { execFile } from 'node:child_process'
import type { AppConfig } from './ConfigManager.js'

// Per-machine and per-login values Windows gives every process before it
// applies the stored variables. They are the same in any shell.
const WINDOWS_BASE_VARIABLES = [
    'ALLUSERSPROFILE', 'APPDATA', 'CommonProgramFiles', 'CommonProgramFiles(x86)', 'CommonProgramW6432',
    'COMPUTERNAME', 'HOMEDRIVE', 'HOMEPATH', 'LOCALAPPDATA', 'LOGONSERVER', 'NUMBER_OF_PROCESSORS',
    'PROCESSOR_ARCHITECTURE', 'PROCESSOR_IDENTIFIER', 'PROCESSOR_LEVEL', 'PROCESSOR_REVISION',
    'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432', 'PUBLIC', 'SystemDrive',
    'SystemRoot', 'USERDOMAIN', 'USERDOMAIN_ROAMINGPROFILE', 'USERNAME', 'USERPROFILE',
]

// Reads the stored variables: system, then per-login, then user, so that a user
// variable wins over a system one. reg.exe can't be used because it mangles
// non-ASCII text.
const READ_STORED_VARIABLES_SCRIPT = `
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$sources = @(
    @([Microsoft.Win32.Registry]::LocalMachine, 'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment', 'system'),
    @([Microsoft.Win32.Registry]::CurrentUser, 'Volatile Environment', 'login'),
    @([Microsoft.Win32.Registry]::CurrentUser, 'Environment', 'user'))
$out = foreach ($source in $sources) {
    $key = $source[0].OpenSubKey($source[1])
    if (-not $key) { continue }
    $keys = @($key) + @($key.GetSubKeyNames() | ForEach-Object { $key.OpenSubKey($_) })
    foreach ($k in $keys) {
        foreach ($name in $k.GetValueNames()) {
            [pscustomobject]@{
                source = $source[2]
                name = $name
                value = [string]$k.GetValue($name, $null, 'DoNotExpandEnvironmentNames')
                expand = $k.GetValueKind($name) -eq 'ExpandString'
            }
        }
    }
}
ConvertTo-Json -Compress -InputObject @($out)
`

interface StoredVariable {
    source: 'system' | 'login' | 'user'
    name: string
    value: string
    expand: boolean
}

// `pomitu start` starts every app at once, so one read serves them all, while a
// restart from a long-open TUI still picks up variables changed since.
const STORED_VARIABLES_CACHE_MS = 10000
let storedVariablesCache: { readAt: number, variables: Promise<StoredVariable[]> } | null = null

function readStoredVariables(): Promise<StoredVariable[]> {
    if (storedVariablesCache && Date.now() - storedVariablesCache.readAt < STORED_VARIABLES_CACHE_MS) {
        return storedVariablesCache.variables
    }
    const variables = new Promise<StoredVariable[]>((resolve, reject) => {
        const encodedScript = Buffer.from(READ_STORED_VARIABLES_SCRIPT, 'utf16le').toString('base64')
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodedScript], { windowsHide: true }, (error, stdout) => {
            if (error) {
                reject(new Error(`Could not read the Windows environment variables: ${error.message}`))
                return
            }
            try {
                resolve(JSON.parse(stdout.replace(/^\uFEFF/, '')))
            } catch (parseError: unknown) {
                reject(new Error(`Could not read the Windows environment variables: ${(parseError as Error).message}`))
            }
        })
    })
    storedVariablesCache = { readAt: Date.now(), variables }
    variables.catch(() => {
        storedVariablesCache = null
    })
    return variables
}

// Windows variable names are case-insensitive
class WindowsEnvironment {
    private variables = new Map<string, { name: string, value: string }>()

    get(name: string): string | undefined {
        return this.variables.get(name.toUpperCase())?.value
    }

    set(name: string, value: string): void {
        const existingName = this.variables.get(name.toUpperCase())?.name
        this.variables.set(name.toUpperCase(), { name: existingName ?? name, value })
    }

    expand(value: string): string {
        return value.replace(/%([^%]+)%/g, (reference, name) => this.get(name) ?? reference)
    }

    toObject(): NodeJS.ProcessEnv {
        return Object.fromEntries(Array.from(this.variables.values(), v => [v.name, v.value]))
    }
}

// The environment a program opened fresh from Explorer gets, so an app sees the
// same variables whichever shell ran pomitu
async function getWindowsEnvironment(): Promise<WindowsEnvironment> {
    const environment = new WindowsEnvironment()
    for (const name of WINDOWS_BASE_VARIABLES) {
        const value = process.env[name]
        if (value !== undefined) {
            environment.set(name, value)
        }
    }
    for (const variable of await readStoredVariables()) {
        const value = variable.expand ? environment.expand(variable.value) : variable.value
        const systemPath = environment.get('Path')
        // Windows appends the user Path to the system one instead of replacing it
        if (variable.source === 'user' && variable.name.toUpperCase() === 'PATH' && systemPath) {
            environment.set(variable.name, `${systemPath};${value}`)
        } else {
            environment.set(variable.name, value)
        }
    }
    return environment
}

// The app's `env` from the config goes on top
export async function getAppEnvironment(app: AppConfig): Promise<NodeJS.ProcessEnv> {
    const appVariables = Object.entries(app.env ?? {}).map(([name, value]) => [name, String(value)] as const)
    if (process.platform !== 'win32') {
        return { ...process.env, ...Object.fromEntries(appVariables) }
    }
    const environment = await getWindowsEnvironment()
    for (const [name, value] of appVariables) {
        environment.set(name, value)
    }
    return environment.toObject()
}
