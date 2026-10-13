import { execFileSync } from 'child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * `bin/shopify-filter-registry.js` writes `src/shopify/filters/registry.generated.ts` relative to its own location, so the script runs from a copy inside a scratch tree, with a scratch git repository as the theme-liquid-docs checkout. Nothing here touches the real generated file.
 */
const script = join(__dirname, '../../../bin/shopify-filter-registry.js')
const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.com' }
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: 'pipe' }).trim()

const filters = (names: string[]) => JSON.stringify(names.map(name => ({ name, category: 'test', syntax: `string | ${name}`, description: name === 'handleize' ? 'Has an alias of `handle`. This filter has an alias of `handle`.' : '' })))

let root: string
let docs: string
let generated: string
let first: string
let second: string

function run (...args: string[]): { status: number, out: string } {
  try {
    return { status: 0, out: execFileSync(process.execPath, [join(root, 'bin', 'shopify-filter-registry.js'), ...args], { cwd: root, env, encoding: 'utf8', stdio: 'pipe' }) }
  } catch (err) {
    const failed = err as { status: number, stderr: string }
    return { status: failed.status, out: failed.stderr }
  }
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'shopify-registry-'))
  docs = join(root, 'docs')
  generated = join(root, 'src', 'shopify', 'filters', 'registry.generated.ts')
  mkdirSync(join(root, 'bin'))
  mkdirSync(join(root, 'src', 'shopify', 'filters'), { recursive: true })
  mkdirSync(join(docs, 'data'), { recursive: true })
  copyFileSync(script, join(root, 'bin', 'shopify-filter-registry.js'))
  git(docs, 'init', '-q')
  writeFileSync(join(docs, 'data', 'filters.json'), filters(['upcase', 'handleize']))
  git(docs, 'add', '.')
  git(docs, 'commit', '-q', '-m', 'first')
  first = git(docs, 'rev-parse', 'HEAD')
  writeFileSync(join(docs, 'data', 'filters.json'), filters(['upcase', 'handleize', 'zeta']))
  git(docs, 'commit', '-q', '-a', '-m', 'second')
  second = git(docs, 'rev-parse', 'HEAD')
})

beforeEach(() => {
  git(docs, 'checkout', '-q', '-f', first)
  git(docs, 'clean', '-q', '-fd')
  writeFileSync(generated, `export const THEME_LIQUID_DOCS_REVISION = '${first}'\n`)
})

afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('bin/shopify-filter-registry.js', () => {
  it('writes the registry from a clean checkout at the pinned revision', () => {
    const { status, out } = run(docs)
    expect(status).toBe(0)
    expect(out).toContain(`wrote 2 filters from theme-liquid-docs ${first}`)
    const file = readFileSync(generated, 'utf8')
    expect(file).toContain(`export const THEME_LIQUID_DOCS_REVISION = '${first}'`)
    expect(file).toContain("{ name: 'handleize', aliases: ['handle'], category: 'test', deprecated: false, syntax: 'string | handleize' }")
    expect(file).not.toContain('zeta')
  })
  it('ignores a leading -- before the path, which is how pnpm 12 hands it over when one is typed', () => {
    expect(run('--', docs).status).toBe(0)
  })
  it('refuses a checkout with an uncommitted change and leaves the generated file alone', () => {
    writeFileSync(join(docs, 'data', 'filters.json'), filters(['edited']))
    const before = readFileSync(generated, 'utf8')
    const { status, out } = run(docs)
    expect(status).toBe(1)
    expect(out).toContain('is not clean')
    expect(out).toContain('M data/filters.json')
    expect(readFileSync(generated, 'utf8')).toBe(before)
  })
  it('refuses a checkout with an untracked file', () => {
    writeFileSync(join(docs, 'stray.txt'), 'x')
    const { status, out } = run(docs)
    expect(status).toBe(1)
    expect(out).toContain('?? stray.txt')
  })
  it('refuses a checkout at another revision than the pinned one, naming both, unless told to move the pin', () => {
    git(docs, 'checkout', '-q', second)
    const before = readFileSync(generated, 'utf8')
    const refused = run(docs)
    expect(refused.status).toBe(1)
    expect(refused.out).toContain(`is at ${second}`)
    expect(refused.out).toContain(`pins ${first}`)
    expect(refused.out).toContain(`git -C ${docs} checkout ${first}`)
    expect(readFileSync(generated, 'utf8')).toBe(before)
    const moved = run(docs, '--update-revision')
    expect(moved.status).toBe(0)
    const file = readFileSync(generated, 'utf8')
    expect(file).toContain(`export const THEME_LIQUID_DOCS_REVISION = '${second}'`)
    expect(file).toContain("name: 'zeta'")
  })
  it('refuses to run without a pinned revision unless told to write one', () => {
    writeFileSync(generated, '')
    expect(run(docs).out).toContain('pins no revision')
    expect(run(docs, '--update-revision').status).toBe(0)
  })
  it('says what is wrong for a path that is no theme-liquid-docs checkout', () => {
    expect(run(join(root, 'nowhere')).out).toContain('must be a checkout of Shopify/theme-liquid-docs')
    expect(run().out).toContain('usage: pnpm run build:shopify-registry <path to a theme-liquid-docs checkout>')
  })
})
