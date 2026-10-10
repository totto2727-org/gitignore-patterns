import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import { expect, test } from 'vite-plus/test'

import { generateIgnorePatterns } from './index.ts'

const exec = promisify(execFile)

const temporary = new URL('../tmp/', import.meta.url)

const gitIgnored = async (root: string, path: string): Promise<boolean> => {
  try {
    await exec(
      'git',
      ['-c', 'core.excludesFile=/dev/null', '-c', 'core.ignorecase=false', 'check-ignore', '--no-index', '-q', path],
      { cwd: root },
    )
    return true
  } catch (error) {
    expect((error as { code: number }).code).toBe(1)
    return false
  }
}

const createRoot = async (): Promise<string> => {
  await mkdir(temporary, { recursive: true })
  const root = await mkdtemp(join(fileURLToPath(temporary), 'gitignore-patterns-'))
  await exec('git', ['init', '--quiet', root])
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

test('generateIgnorePatterns 1: snapshots reachable Git exclusions', async () => {
  await withRoots(async (root) => {
    await write(root, '.gitignore', '*.log\ncache/\n!cache/keep.log\n')
    await write(root, 'application.log')
    await write(root, 'application.ts')
    await write(root, 'cache/keep.log')
    expect(await gitIgnored(root, 'application.log')).toBe(true)
    expect(await gitIgnored(root, 'application.ts')).toBe(false)
    expect(await gitIgnored(root, 'cache/')).toBe(true)
    expect(await gitIgnored(root, 'cache/keep.log')).toBe(true)
    expect(await generateIgnorePatterns(root)).toEqual(['/application.log', '/cache/'])
  })
})

test('generateIgnorePatterns 2: applies scoped nested negations', async () => {
  await withRoots(async (root) => {
    await write(root, '.gitignore', '*.log\ncache/\n!cache/keep.log\n')
    await write(root, 'nested/.gitignore', '!keep.log\n')
    await write(root, 'nested/keep.log')
    await write(root, 'nested/remove.log')
    await write(root, 'cache/keep.log')
    expect(await generateIgnorePatterns(root)).toEqual(['/cache/', '/nested/remove.log'])
  })
})

test('generateIgnorePatterns 3: escapes VitePlus metacharacters', async () => {
  await withRoots(async (root) => {
    await write(root, '.gitignore', '*\n!.gitignore\n')
    for (const name of [
      'back\\slash',
      'braces{a,b}',
      'brackets[1]',
      'hash#name',
      'bang!name',
      'question?name',
      'space name',
      'star*name',
    ]) {
      await write(root, name)
    }
    expect(await generateIgnorePatterns(root)).toEqual([
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

test('generateIgnorePatterns 4: does not follow symbolic links', async () => {
  await withRoots(async (root, external) => {
    await write(root, '.gitignore', 'linked-*\n')
    await write(external, 'ignored.txt')
    await write(external, 'rules', '*\n')
    await mkdir(join(root, 'nested'))
    await symlink(join(external, 'rules'), join(root, 'nested', '.gitignore'))
    await symlink(external, join(root, 'linked-directory'))
    await symlink(join(external, 'ignored.txt'), join(root, 'linked-file'))
    await write(root, 'nested/visible.txt')
    expect(await generateIgnorePatterns(root)).toEqual(['/linked-directory', '/linked-file'])
  })
})

test('generateIgnorePatterns 5: excludes Git metadata from traversal', async () => {
  await withRoots(async (root) => {
    await write(root, '.gitignore', '*\n!.gitignore\n')
    await write(root, '.git/secret.txt')
    expect(await generateIgnorePatterns(root)).toEqual([])
  })
})

test('generateIgnorePatterns 6: loads reachable ignored ignore files', async () => {
  await withRoots(async (root) => {
    await write(root, '.gitignore', '.gitignore\n*.log\n')
    await write(root, 'nested/.gitignore', '!keep.log\n')
    await write(root, 'nested/keep.log')
    await write(root, 'nested/drop.log')
    expect(await gitIgnored(root, 'nested/keep.log')).toBe(false)
    expect(await generateIgnorePatterns(root)).toEqual(['/.gitignore', '/nested/.gitignore', '/nested/drop.log'])
  })
})

test('generateIgnorePatterns 7: ignores ancestor rules outside root', async () => {
  await withRoots(async (root) => {
    await write(root, '.gitignore', '*.log\n')
    await write(root, 'child/visible.log')
    expect(await generateIgnorePatterns(join(root, 'child'))).toEqual([])
  })
})

test('generateIgnorePatterns 8: refreshes filesystem snapshots', async () => {
  await withRoots(async (root) => {
    await write(root, '.gitignore', '*.log\n')
    const before = await generateIgnorePatterns(root)
    await write(root, 'new.log')
    expect(before).toEqual([])
    expect(await generateIgnorePatterns(root)).toEqual(['/new.log'])
  })
})

test('generateIgnorePatterns 9: rejects symbolic-link roots', async () => {
  await withRoots(async (root, target) => {
    await symlink(target, join(root, 'alias'))
    await expect(generateIgnorePatterns(join(root, 'alias'))).rejects.toBeInstanceOf(TypeError)
  })
})

test('generateIgnorePatterns 10: defaults to case-sensitive matching', async () => {
  await withRoots(async (root) => {
    await write(root, '.gitignore', 'FOO\n')
    await write(root, 'foo')
    expect(await generateIgnorePatterns(root)).toEqual([])
    expect(await generateIgnorePatterns(root, { ignoreCase: true })).toEqual(['/foo'])
  })
})

test('generateIgnorePatterns 11: accepts file URLs and preserves invalid-root errors', async () => {
  await withRoots(async (root) => {
    await write(root, '.gitignore', 'ignored\n')
    await write(root, 'ignored')
    await write(root, 'file')
    expect(await generateIgnorePatterns(pathToFileURL(root))).toEqual(['/ignored'])
    await expect(generateIgnorePatterns(join(root, 'missing'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(generateIgnorePatterns(join(root, 'file'))).rejects.toBeInstanceOf(TypeError)
    await expect(generateIgnorePatterns(new URL('https://example.com'))).rejects.toBeInstanceOf(TypeError)
  })
})
