import { assertEquals, assertRejects } from '@std/assert'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { generateIgnorePatterns } from './index.ts'

const temporary = new URL('../tmp/', import.meta.url)

const gitIgnored = async (root: string, path: string): Promise<boolean> => {
  const result = await new Deno.Command('git', {
    args: [
      '-c',
      'core.excludesFile=/dev/null',
      '-c',
      'core.ignorecase=false',
      'check-ignore',
      '--no-index',
      '-q',
      path,
    ],
    cwd: root,
  }).output()
  assertEquals([0, 1].includes(result.code), true)
  return result.code === 0
}

const symlink = async (target: string, path: string): Promise<void> => {
  const result = await new Deno.Command('ln', { args: ['-s', target, path] }).output()
  assertEquals(result.code, 0)
}

const createRoot = async (): Promise<string> => {
  await mkdir(temporary, { recursive: true })
  const root = await mkdtemp(join(fileURLToPath(temporary), 'gitignore-patterns-'))
  const result = await new Deno.Command('git', { args: ['init', '--quiet', root] }).output()
  assertEquals(result.code, 0)
  return root
}

const write = async (root: string, path: string, contents = ''): Promise<void> => {
  const destination = join(root, path)
  await mkdir(join(destination, '..'), { recursive: true })
  await writeFile(destination, contents)
}

const withRoots = async (test: (root: string, external: string) => Promise<void>): Promise<void> => {
  const root = await createRoot()
  const external = await createRoot()
  try {
    await test(root, external)
  } finally {
    await Promise.all([rm(root, { force: true, recursive: true }), rm(external, { force: true, recursive: true })])
  }
}

Deno.test('generateIgnorePatterns 1: snapshots reachable Git exclusions', async () => {
  await withRoots(async (root) => {
    await write(root, '.gitignore', '*.log\ncache/\n!cache/keep.log\n')
    await write(root, 'application.log')
    await write(root, 'application.ts')
    await write(root, 'cache/keep.log')
    assertEquals(await gitIgnored(root, 'application.log'), true)
    assertEquals(await gitIgnored(root, 'application.ts'), false)
    assertEquals(await gitIgnored(root, 'cache/'), true)
    assertEquals(await gitIgnored(root, 'cache/keep.log'), true)
    assertEquals(await generateIgnorePatterns(root), ['/application.log', '/cache/'])
  })
})

Deno.test('generateIgnorePatterns 2: applies scoped nested negations', async () => {
  await withRoots(async (root) => {
    await write(root, '.gitignore', '*.log\ncache/\n!cache/keep.log\n')
    await write(root, 'nested/.gitignore', '!keep.log\n')
    await write(root, 'nested/keep.log')
    await write(root, 'nested/remove.log')
    await write(root, 'cache/keep.log')
    assertEquals(await generateIgnorePatterns(root), ['/cache/', '/nested/remove.log'])
  })
})

Deno.test('generateIgnorePatterns 3: escapes VitePlus metacharacters', async () => {
  await withRoots(async (root) => {
    await write(root, '.gitignore', '*\n!.gitignore\n')
    for (
      const name of [
        'back\\slash',
        'braces{a,b}',
        'brackets[1]',
        'hash#name',
        'bang!name',
        'question?name',
        'space name',
        'star*name',
      ]
    ) {
      await write(root, name)
    }
    assertEquals(await generateIgnorePatterns(root), [
      '/back\\\\slash',
      '/bang\\!name',
      '/braces\\{a,b\\}',
      '/brackets\\[1\\]',
      '/hash\\#name',
      '/question\\?name',
      '/space\\ name',
      '/star\\*name',
    ])
  })
})

Deno.test('generateIgnorePatterns 4: does not follow symbolic links', async () => {
  await withRoots(async (root, external) => {
    await write(root, '.gitignore', 'linked-*\n')
    await write(external, 'ignored.txt')
    await write(external, 'rules', '*\n')
    await mkdir(join(root, 'nested'))
    await symlink(join(external, 'rules'), join(root, 'nested', '.gitignore'))
    await symlink(external, join(root, 'linked-directory'))
    await symlink(join(external, 'ignored.txt'), join(root, 'linked-file'))
    await write(root, 'nested/visible.txt')
    assertEquals(await generateIgnorePatterns(root), ['/linked-directory', '/linked-file'])
  })
})

Deno.test('generateIgnorePatterns 5: excludes Git metadata from traversal', async () => {
  await withRoots(async (root) => {
    await write(root, '.gitignore', '*\n!.gitignore\n')
    await write(root, '.git/secret.txt')
    assertEquals(await generateIgnorePatterns(root), [])
  })
})

Deno.test('generateIgnorePatterns 6: loads reachable ignored ignore files', async () => {
  await withRoots(async (root) => {
    await write(root, '.gitignore', '.gitignore\n*.log\n')
    await write(root, 'nested/.gitignore', '!keep.log\n')
    await write(root, 'nested/keep.log')
    await write(root, 'nested/drop.log')
    assertEquals(await gitIgnored(root, 'nested/keep.log'), false)
    assertEquals(await generateIgnorePatterns(root), ['/.gitignore', '/nested/.gitignore', '/nested/drop.log'])
  })
})

Deno.test('generateIgnorePatterns 7: ignores ancestor rules outside root', async () => {
  await withRoots(async (root) => {
    await write(root, '.gitignore', '*.log\n')
    await write(root, 'child/visible.log')
    assertEquals(await generateIgnorePatterns(join(root, 'child')), [])
  })
})

Deno.test('generateIgnorePatterns 8: refreshes filesystem snapshots', async () => {
  await withRoots(async (root) => {
    await write(root, '.gitignore', '*.log\n')
    const before = await generateIgnorePatterns(root)
    await write(root, 'new.log')
    assertEquals(before, [])
    assertEquals(await generateIgnorePatterns(root), ['/new.log'])
  })
})

Deno.test('generateIgnorePatterns 9: rejects symbolic-link roots', async () => {
  await withRoots(async (root, target) => {
    await symlink(target, join(root, 'alias'))
    await assertRejects(() => generateIgnorePatterns(join(root, 'alias')), TypeError)
  })
})

Deno.test('generateIgnorePatterns 10: defaults to case-sensitive matching', async () => {
  await withRoots(async (root) => {
    await write(root, '.gitignore', 'FOO\n')
    await write(root, 'foo')
    assertEquals(await generateIgnorePatterns(root), [])
    assertEquals(await generateIgnorePatterns(root, { ignoreCase: true }), ['/foo'])
  })
})

Deno.test('generateIgnorePatterns 11: accepts file URLs and preserves invalid-root errors', async () => {
  await withRoots(async (root) => {
    await write(root, '.gitignore', 'ignored\n')
    await write(root, 'ignored')
    await write(root, 'file')
    assertEquals(await generateIgnorePatterns(pathToFileURL(root)), ['/ignored'])
    const missing = await assertRejects(() => generateIgnorePatterns(join(root, 'missing')), Error)
    assertEquals((missing as NodeJS.ErrnoException).code, 'ENOENT')
    await assertRejects(() => generateIgnorePatterns(join(root, 'file')), TypeError)
    await assertRejects(() => generateIgnorePatterns(new URL('https://example.com')), TypeError)
  })
})
