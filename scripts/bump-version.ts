import { existsSync, readFileSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'

type VersionAction = 'major' | 'minor' | 'patch' | 'undo'

interface PackageJson {
  version: string
  packages?: {
    ''?: {
      version: string
    }
  }
  [key: string]: unknown
}

const PACKAGE_JSON = 'package.json'
const PACKAGE_LOCK_JSON = 'package-lock.json'
const README_MD = 'README.md'

function showUsage(): void {
  console.log('Usage: tsx scripts/bump-version.ts [major|minor|patch|undo] [skip-commit]')
  console.log('   Or: npm run bump-version [major|minor|patch|undo] [skip-commit]')
  console.log('')
  console.log('Actions:')
  console.log('  major: Bump major version (X.0.0)')
  console.log('  minor: Bump minor version (x.X.0)')
  console.log('  patch: Bump patch version (x.x.X)')
  console.log('  undo:  Revert to the previous version (from last commit)')
  console.log('')
  console.log('Options:')
  console.log('  skip-commit: Skip git commit after version bump')
}

function isGitRepo(): boolean {
  try {
    execSync('git rev-parse --git-dir', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function writeJsonFile(filePath: string, data: unknown): void {
  writeFileSync(filePath, JSON.stringify(data, null, 4) + '\n')
}

function parseVersion(version: string): [number, number, number] {
  const parts = version.split('.').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid version format: ${version}`)
  }
  return parts as [number, number, number]
}

function calculateNewVersion(current: string, action: Exclude<VersionAction, 'undo'>): string {
  const [major, minor, patch] = parseVersion(current)

  switch (action) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
  }
}

function hasUncommittedChanges(files: string[]): boolean {
  const existingFiles = files.filter(existsSync).join(' ')
  if (!existingFiles) return false

  try {
    execSync(`git diff --exit-code ${existingFiles}`, { stdio: 'ignore' })
    return false
  } catch {
    return true
  }
}

function hasOtherUncommittedChanges(excludedFiles: string[]): boolean {
  return execSync('git status --porcelain')
    .toString()
    .split('\n')
    .some(line => {
      const trimmed = line.trim()
      return trimmed && !excludedFiles.some(file => line.includes(file))
    })
}

function undoVersionBump(): void {
  const lastCommitMsg = execSync('git log -1 --pretty=%B').toString().trim()
  if (!lastCommitMsg.startsWith('chore: bump version to')) {
    console.error('Error: Last commit was not a version bump. Cannot undo.')
    console.error(`Last commit message: ${lastCommitMsg}`)
    process.exit(1)
  }

  const currentVersion = readJsonFile<PackageJson>(PACKAGE_JSON).version
  console.log(`Current version: ${currentVersion}`)

  if (hasOtherUncommittedChanges([PACKAGE_JSON, PACKAGE_LOCK_JSON])) {
    console.warn('Warning: You have uncommitted changes not related to version files.')
    console.warn('These changes will be preserved during the undo operation.')
  }

  console.log('Resetting to the commit before the version bump...')
  execSync('git reset --soft HEAD~1')

  console.log(`Restoring ${PACKAGE_JSON} and ${PACKAGE_LOCK_JSON} from the previous commit...`)
  execSync(`git checkout HEAD -- ${PACKAGE_JSON}`)
  if (existsSync(PACKAGE_LOCK_JSON)) {
    execSync(`git checkout HEAD -- ${PACKAGE_LOCK_JSON}`)
  }

  const revertedVersion = readJsonFile<PackageJson>(PACKAGE_JSON).version
  console.log(`Version reverted to: ${revertedVersion}`)
  console.log('Version undo completed successfully!')
}

function updatePackageVersion(newVersion: string): void {
  const packageJson = readJsonFile<PackageJson>(PACKAGE_JSON)
  packageJson.version = newVersion
  writeJsonFile(PACKAGE_JSON, packageJson)
}

function updatePackageLockVersion(newVersion: string): void {
  if (!existsSync(PACKAGE_LOCK_JSON)) return

  const packageLockJson = readJsonFile<PackageJson>(PACKAGE_LOCK_JSON)
  packageLockJson.version = newVersion

  if (packageLockJson.packages?.['']) {
    packageLockJson.packages[''].version = newVersion
  }

  writeJsonFile(PACKAGE_LOCK_JSON, packageLockJson)
}

function updateReadmeVersion(newVersion: string): void {
  if (!existsSync(README_MD)) return

  let readmeContent = readFileSync(README_MD, 'utf8')
  const versionPattern = /pomitu-\d+\.\d+\.\d+\.tgz/g
  const newVersionString = `pomitu-${newVersion}.tgz`

  if (versionPattern.test(readmeContent)) {
    readmeContent = readmeContent.replace(versionPattern, newVersionString)
    writeFileSync(README_MD, readmeContent)
    console.log(`Updated version in ${README_MD}`)
  }
}

function commitVersionBump(newVersion: string): void {
  const versionFiles = [PACKAGE_JSON, PACKAGE_LOCK_JSON, README_MD]

  if (!hasUncommittedChanges(versionFiles)) {
    console.log('No changes detected in version files.')
    return
  }

  const filesToAdd = versionFiles.filter(existsSync).join(' ')
  execSync(`git add ${filesToAdd}`)
  execSync(`git commit -m "chore: bump version to ${newVersion}"`)
  console.log(`Changes committed with message: 'chore: bump version to ${newVersion}'`)
  console.log('\nConsider tagging this release:')
  console.log(`  git tag v${newVersion}`)
  console.log(`  git push origin v${newVersion}`)
}

function bumpVersion(action: Exclude<VersionAction, 'undo'>, noCommit: boolean): void {
  const currentVersion = readJsonFile<PackageJson>(PACKAGE_JSON).version
  console.log(`Current version: ${currentVersion}`)

  const newVersion = calculateNewVersion(currentVersion, action)
  console.log(`New version: ${newVersion}`)

  updatePackageVersion(newVersion)
  updatePackageLockVersion(newVersion)
  updateReadmeVersion(newVersion)

  if (noCommit) {
    console.log('Skipping git commit (skip-commit flag provided)')
    console.log('Version files updated successfully!')
    console.log('\nTo commit and tag this release manually:')
    console.log(`  git add ${[PACKAGE_JSON, PACKAGE_LOCK_JSON, README_MD].filter(existsSync).join(' ')}`)
    console.log(`  git commit -m "chore: bump version to ${newVersion}"`)
    console.log(`  git tag v${newVersion}`)
    console.log(`  git push origin v${newVersion}`)
  } else {
    try {
      commitVersionBump(newVersion)
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      console.error('Error during git operations:', errMsg)
      process.exit(1)
    }
  }

  console.log('Version bump completed!')
}

// Main execution
function main(): void {
  // Debug: log received arguments
  console.log('Received arguments:', process.argv.slice(2))

  if (process.argv.length < 3) {
    console.error('Error: No version action specified.')
    showUsage()
    process.exit(1)
  }

  if (!isGitRepo()) {
    console.error('Error: Not a git repository. This script requires a git repository to run.')
    process.exit(1)
  }

  const versionAction = process.argv[2] as VersionAction
  const noCommit = process.argv.includes('skip-commit')
  console.log('noCommit flag:', noCommit)

  if (!existsSync(PACKAGE_JSON)) {
    console.error('Error: package.json not found.')
    process.exit(1)
  }

  if (versionAction === 'undo') {
    undoVersionBump()
    process.exit(0)
  }

  if (!['major', 'minor', 'patch'].includes(versionAction)) {
    console.error('Error: Invalid version action specified.')
    showUsage()
    process.exit(1)
  }

  bumpVersion(versionAction as Exclude<VersionAction, 'undo'>, noCommit)
}

main()
