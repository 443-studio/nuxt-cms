import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const bump = process.argv[2]

const readJson = (url) => JSON.parse(readFileSync(url, 'utf8'))
const writeJson = (url, data) => writeFileSync(url, JSON.stringify(data, null, 3) + '\n')
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: 'inherit' })
const read = (command, args) => execFileSync(command, args, { cwd: root, encoding: 'utf8' }).trim()

const { version } = readJson(new URL('package.json', root))
const [major, minor, patch] = version.split('-')[0].split('.').map(Number)

const nextVersions = {
   major: `${major + 1}.0.0`,
   minor: `${major}.${minor + 1}.0`,
   patch: `${major}.${minor}.${patch + 1}`,
}

const next = nextVersions[bump] ?? (/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(bump ?? '') ? bump : undefined)

if (!next) {
   console.error('Usage: pnpm release <major | minor | patch | x.y.z>')
   process.exit(1)
}

const branch = read('git', ['branch', '--show-current'])

if (!['main', 'master'].includes(branch)) {
   console.error(`Release from main or master, not ${branch}`)
   process.exit(1)
}

if (read('git', ['status', '--porcelain'])) {
   console.error('Commit or discard your changes before a release')
   process.exit(1)
}

run('git', ['pull', '--ff-only', 'origin', branch])
run('changelogen', ['--release', '--no-commit', '--no-tag', '--no-github', '-r', next])

const packagesDir = new URL('packages/', root)
const workspacePackages = existsSync(packagesDir)
   ? readdirSync(packagesDir)
        .map((name) => new URL(`packages/${name}/package.json`, root))
        .filter((url) => existsSync(url))
   : []

for (const url of workspacePackages) {
   writeJson(url, { ...readJson(url), version: next })
}

const files = ['package.json', 'CHANGELOG.md', ...workspacePackages.map((url) => url.pathname.slice(root.pathname.length))]

run('git', ['add', ...files])
run('git', ['commit', '-m', `chore(release): v${next}`])
run('git', ['tag', '-a', `v${next}`, '-m', `v${next}`])
run('git', ['push', 'origin', branch, '--follow-tags'])
