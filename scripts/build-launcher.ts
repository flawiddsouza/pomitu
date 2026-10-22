// Builds the Windows launcher (launcher/main.go) into dist/launcher.exe
import { spawnSync } from 'node:child_process'

const result = spawnSync('go', ['build', '-C', 'launcher', '-trimpath', '-ldflags=-s -w', '-o', '../dist/launcher.exe', '.'], {
    stdio: 'inherit',
    env: { ...process.env, GOOS: 'windows', GOARCH: 'amd64', CGO_ENABLED: '0' },
})

if (result.error) {
    console.error(`Could not run go, which building pomitu needs: ${result.error.message}`)
    process.exit(1)
}
process.exit(result.status ?? 1)
