// Builds the launcher (launcher/*.go) for every platform pomitu supports, into
// dist/launcher/<platform>-<arch>/, named the way Node reports them
import { spawnSync } from 'node:child_process'

const targets = [
    { platform: 'win32', arch: 'x64', goos: 'windows', goarch: 'amd64' },
    { platform: 'win32', arch: 'arm64', goos: 'windows', goarch: 'arm64' },
    { platform: 'linux', arch: 'x64', goos: 'linux', goarch: 'amd64' },
    { platform: 'linux', arch: 'arm64', goos: 'linux', goarch: 'arm64' },
    { platform: 'linux', arch: 'arm', goos: 'linux', goarch: 'arm' },
    { platform: 'darwin', arch: 'x64', goos: 'darwin', goarch: 'amd64' },
    { platform: 'darwin', arch: 'arm64', goos: 'darwin', goarch: 'arm64' },
]

for (const target of targets) {
    // Named so that it reads as part of pomitu in a process list, where it stays
    // running beside each app as its logger
    const output = `../dist/launcher/${target.platform}-${target.arch}/pomitu-runner${target.goos === 'windows' ? '.exe' : ''}`
    const result = spawnSync('go', ['build', '-C', 'launcher', '-trimpath', '-ldflags=-s -w', '-o', output, '.'], {
        stdio: 'inherit',
        env: { ...process.env, GOOS: target.goos, GOARCH: target.goarch, CGO_ENABLED: '0' },
    })
    if (result.error) {
        console.error(`Could not run go, which building pomitu needs: ${result.error.message}`)
        process.exit(1)
    }
    if (result.status !== 0) {
        process.exit(result.status ?? 1)
    }
}
