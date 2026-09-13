import { assert, assertEquals } from '@std/assert'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { generateIgnorePatterns } from '../src/index.ts'

const temporaryParent = resolve(dirname(fileURLToPath(import.meta.url)), '../tmp')
await mkdir(temporaryParent, { recursive: true })
const temporary = await mkdtemp(resolve(temporaryParent, 'gitignore-acceptance-'))

const command = async (command: string, args: string[], cwd: string, stdin?: string) => {
  const child = new Deno.Command(command, {
    args,
    cwd,
    env: {
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: resolve(temporary, 'empty-git-config'),
      NO_COLOR: '1',
    },
    stdin: stdin === undefined ? 'null' : 'piped',
    stdout: 'piped',
    stderr: 'piped',
  }).spawn()
  const timeout = setTimeout(() => child.kill('SIGTERM'), 30_000)
  if (stdin !== undefined) {
    const writer = child.stdin.getWriter()
    await writer.write(new TextEncoder().encode(stdin))
    await writer.close()
  }
  const result = await child.output()
  clearTimeout(timeout)
  return {
    code: result.code,
    stderr: new TextDecoder().decode(result.stderr),
    stdout: new TextDecoder().decode(result.stdout),
  }
}

const write = async (directory: string, name: string, contents: string): Promise<void> => {
  const target = resolve(directory, name)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, contents)
}

const writeConfig = (directory: string, patterns: string[]) =>
  write(
    directory,
    'vite.config.ts',
    `export default ${JSON.stringify({ fmt: { ignorePatterns: patterns }, lint: { ignorePatterns: patterns } })}\n`,
  )

const createFixture = async (name: string, files: string[], ignores: Record<string, string>): Promise<string> => {
  const directory = resolve(temporary, name)
  await mkdir(directory)
  assertEquals((await command('git', ['init', '--quiet'], directory)).code, 0)
  assertEquals((await command('git', ['config', 'core.ignoreCase', 'false'], directory)).code, 0)
  await write(directory, 'pnpm-workspace.yaml', 'packages: []\n')
  await write(directory, 'package.json', '{"private":true,"type":"module"}\n')
  for (const file of files) await write(directory, file, 'debugger;const value={a:1,b:2};console.log(value)\n')
  for (const [file, contents] of Object.entries(ignores)) await write(directory, file, contents)
  return directory
}

const moveIgnores = async (directory: string, ignores: Record<string, string>, disable: boolean): Promise<void> => {
  for (const file of Object.keys(ignores)) {
    const original = resolve(directory, file)
    const disabled = `${original}.disabled-for-acceptance`
    await rename(disable ? original : disabled, disable ? disabled : original)
  }
}

const display = (file: string): string => file.replaceAll('\\', '/')

const gitSelected = async (directory: string, files: string[]): Promise<string[]> => {
  const result = await command(
    'git',
    ['check-ignore', '--no-index', '--stdin', '-z'],
    directory,
    `${files.join('\0')}\0`,
  )
  assertEquals([0, 1].includes(result.code), true)
  const ignored = new Set(result.stdout.split('\0'))
  return files.filter((file) => !ignored.has(file))
}

const assertCliSelection = async (
  directory: string,
  files: string[],
  expected: string[],
  label: string,
): Promise<void> => {
  const candidates = new Set(files.map(display))
  assertEquals(candidates.size, files.length, 'Fixture display paths must be unambiguous')
  const fmt = await command('vp', ['fmt', '.', '--list-different'], directory)
  assertEquals(fmt.code, 1, `${label}: vp fmt\n${fmt.stderr}`)
  const listed = fmt.stdout.split(/\r?\n/).filter((file) => candidates.has(file)).sort()
  assertEquals(listed, expected.map(display).sort(), `${label}: vp fmt`)
  const lint = await command('vp', ['lint', '.', '--debug=files'], directory)
  assertEquals(lint.code, 0, `${label}: vp lint\n${lint.stderr}`)
  const selected = lint.stdout.split(/\r?\n/).filter((file) => candidates.has(file)).sort()
  assertEquals(selected, expected.map(display).sort(), `${label}: vp lint`)
  const diagnostics = await command('vp', ['lint', '.', '-D', 'no-debugger', '--format=json'], directory)
  assertEquals(diagnostics.code, 1, `${label}: vp lint diagnostics\n${diagnostics.stderr}`)
  const filenames = (JSON.parse(diagnostics.stdout) as { diagnostics: { code: string; filename: string }[] })
    .diagnostics
    .filter((diagnostic) => diagnostic.code === 'eslint(no-debugger)')
    .map((diagnostic) => diagnostic.filename)
    .sort()
  assertEquals(filenames, expected.map(display).sort(), `${label}: vp lint diagnostics`)
}

interface Scenario {
  readonly name: string
  readonly ignores: Record<string, string>
  readonly ignored: string[]
  readonly allowed: string[]
}

const scenarios: readonly Scenario[] = [
  {
    name: 'scoped-patterns',
    ignores: {
      '.gitignore': '/root-only.js\nslashless.js\ncache.js/\n',
      'pkg/.gitignore': '/anchored.js\nnested.js\nsrc/middle.js\n',
    },
    ignored: [
      'root-only.js',
      'slashless.js',
      'pkg/deep/slashless.js',
      'cache.js/inside.js',
      'pkg/cache.js/inside.js',
      'pkg/anchored.js',
      'pkg/nested.js',
      'pkg/deep/nested.js',
      'pkg/src/middle.js',
    ],
    allowed: [
      'keep.js',
      'other/root-only.js',
      'other/cache.js',
      'other/anchored.js',
      'pkg/deep/anchored.js',
      'other/nested.js',
      'pkg/deep/src/middle.js',
    ],
  },
  {
    name: 'negation-and-parent-pruning',
    ignores: {
      '.gitignore':
        'blocked/\n!blocked/keep.js\n*.log.js\n!keep.log.js\nopen/*\n!open/keep.js\nreopen/\n!reopen/\nreopen/*\n!reopen/keep.js\n',
      'blocked/.gitignore': '!keep.js\n',
      'pkg/.gitignore': '!override.log.js\n',
    },
    ignored: [
      'blocked/keep.js',
      'blocked/deep/drop.js',
      'drop.log.js',
      'override.log.js',
      'pkg/drop.log.js',
      'open/drop.js',
      'open/deep/drop.js',
      'reopen/drop.js',
    ],
    allowed: ['keep.js', 'keep.log.js', 'pkg/keep.log.js', 'pkg/override.log.js', 'open/keep.js', 'reopen/keep.js'],
  },
  {
    name: 'literal-escaping',
    ignores: {
      '.gitignore': [
        '#comment.js',
        String.raw`\#hash.js`,
        String.raw`\!bang.js`,
        String.raw`a\[1\].js`,
        'a{b,c}.js',
        'space\\ ',
        ' leading/',
        'middle space.js',
      ].join('\n') + '\n',
      'pkg[1]/.gitignore': '/drop.js\n',
    },
    ignored: [
      '#hash.js',
      '!bang.js',
      'a[1].js',
      'a{b,c}.js',
      'space /inside.js',
      ' leading/inside.js',
      'middle space.js',
      'pkg[1]/drop.js',
    ],
    allowed: [
      'keep.js',
      '#comment.js',
      'hash.js',
      'bang.js',
      'a1.js',
      'ab.js',
      'ac.js',
      'space/inside.js',
      'leading/inside.js',
      'pkg1/drop.js',
      'pkg[1]/deep/drop.js',
    ],
  },
  {
    name: 'posix-literal-metacharacters',
    ignores: {
      '.gitignore': String.raw`literal\*.js
literal\?.js
back\\slash/
`,
    },
    ignored: ['literal*.js', 'literal?.js', 'back\\slash/inside-backslash.js'],
    allowed: ['keep.js', 'literal1.js', 'backslash/inside-plain.js', 'back/slash/inside-separated.js'],
  },
]

for (const scenario of scenarios) {
  Deno.test(`consumer ${scenario.name}: generated exclusions control real Git and VitePlus`, async () => {
    const files = [...scenario.ignored, ...scenario.allowed]
    const directory = await createFixture(scenario.name, files, scenario.ignores)
    try {
      assertEquals((await gitSelected(directory, files)).sort(), [...scenario.allowed].sort())
      const patterns = await generateIgnorePatterns(pathToFileURL(`${directory}/`), { ignoreCase: false })
      assert(patterns.every((pattern) => pattern.startsWith('/')))
      if (scenario.name === 'negation-and-parent-pruning') {
        assert(patterns.includes('/blocked/'))
        assert(!patterns.some((pattern) => pattern.startsWith('/blocked/keep')))
      }
      await moveIgnores(directory, scenario.ignores, true)
      await writeConfig(directory, [])
      await assertCliSelection(directory, files, files, `${scenario.name} baseline`)
      await writeConfig(directory, patterns)
      await assertCliSelection(directory, files, scenario.allowed, scenario.name)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
}

Deno.test('consumer snapshot refresh: new ignored files require a refreshed snapshot', async () => {
  const ignores = { '.gitignore': 'future-*.js\n/generated/\n' }
  const initial = ['keep.js', 'future-now.js', 'generated/old.js']
  const directory = await createFixture('snapshot-refresh', initial, ignores)
  try {
    const first = await generateIgnorePatterns(directory)
    await write(directory, 'future-later.js', 'debugger;const value={a:1,b:2};console.log(value)\n')
    await write(directory, 'generated/new.js', 'debugger;const value={a:1,b:2};console.log(value)\n')
    const files = [...initial, 'future-later.js', 'generated/new.js']
    await moveIgnores(directory, ignores, true)
    await writeConfig(directory, first)
    await assertCliSelection(directory, files, ['keep.js', 'future-later.js'], 'snapshot before refresh')
    await moveIgnores(directory, ignores, false)
    const refreshed = await generateIgnorePatterns(directory)
    await moveIgnores(directory, ignores, true)
    await writeConfig(directory, refreshed)
    await assertCliSelection(directory, files, ['keep.js'], 'snapshot after refresh')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
