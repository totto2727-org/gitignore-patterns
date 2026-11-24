import { lstat, readdir, readFile, realpath, stat } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import ignore from 'ignore'

import { discoverGitExcludes } from './git-excludes.ts'

/** Options for {@link generateIgnorePatterns}. */
export interface GenerateIgnorePatternsOptions {
  /**
   * Use case-insensitive Gitignore matching.
   *
   * Defaults to `false`, matching Git on a case-sensitive filesystem and not Git's `core.ignorecase` setting.
   */
  readonly ignoreCase?: boolean
}

interface Matcher {
  readonly directory: string
  readonly rules: ReturnType<typeof ignore>
}

const escapePattern = (path: string): string => path.replace(/[\\*?[\]{} #!]/g, '\\$&')

const toRootPath = (root: string | URL): string => resolve(typeof root === 'string' ? root : fileURLToPath(root))

const relativePath = (from: string, to: string): string => relative(from, to).split(sep).join('/')

const readRules = async (file: string, allowSymlink: boolean): Promise<string | undefined> => {
  try {
    const metadata = await (allowSymlink ? stat(file) : lstat(file))
    return metadata.isFile() ? await readFile(file, 'utf8') : undefined
  } catch (error) {
    if (isMissingPath(error)) return undefined
    throw error
  }
}

const isMissingPath = (error: unknown): error is NodeJS.ErrnoException =>
  typeof error === 'object' && error !== null && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'

const isIgnored = (matchers: readonly Matcher[], path: string, directory: boolean): boolean => {
  let ignored = false

  for (const matcher of matchers) {
    const result = matcher.rules.test(`${relativePath(matcher.directory, path)}${directory ? '/' : ''}`)
    if (result.ignored) {
      ignored = true
    } else if (result.unignored) {
      ignored = false
    }
  }

  return ignored
}

/**
 * Snapshot paths currently ignored by Git exclude sources and reachable `.gitignore` files as escaped, root-relative VitePlus patterns.
 *
 * `root` must be a non-symbolic-link directory path or `file:` URL. Relative paths resolve from the process working
 * directory. The returned sorted positive literals are for an ignore configuration rooted at this same directory.
 * In a Git worktree, global excludes and the repository info/exclude file apply relative to the worktree root.
 * Ancestor `.gitignore` files, tracked-file status, and `.git` entries are not consulted.
 * Ignored directories are emitted and pruned, so rules inside them are unreachable as they are in Git.
 *
 * Filesystem errors are preserved, including `ENOENT` for a missing root. Non-directory or symbolic-link roots reject
 * with `TypeError`. The scan is non-atomic. Repository-wide exclude files may be symlinks.
 */
export const generateIgnorePatterns = async (
  root: string | URL,
  options: GenerateIgnorePatternsOptions = {},
): Promise<string[]> => {
  const suppliedRoot = toRootPath(root)
  const rootMetadata = await lstat(suppliedRoot)
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    throw new TypeError('root must be a non-symbolic-link directory')
  }

  const rootPath = await realpath(suppliedRoot)
  const { ignoreCase = false } = options
  const newRules = () => ignore({ ignorecase: ignoreCase })
  const sources = await discoverGitExcludes(rootPath)
  const base: Matcher[] = []
  if (sources) {
    const rules = newRules()
    for (const file of sources.files) {
      const contents = await readRules(file, true)
      if (contents !== undefined) rules.add(contents)
    }
    base.push({ directory: sources.worktree, rules })
  }
  const rootExcluded = sources !== undefined && sources.worktree !== rootPath && isIgnored(base, rootPath, true)
  const patterns: string[] = []
  const visit = async (directory: string, inherited: readonly Matcher[]): Promise<void> => {
    const contents = rootExcluded ? undefined : await readRules(resolve(directory, '.gitignore'), false)
    const matchers = contents === undefined ? inherited : [...inherited, { directory, rules: newRules().add(contents) }]
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))

    for (const entry of entries) {
      // Repository metadata is intentionally outside this snapshot's scope.
      if (entry.name === '.git') {
        continue
      }

      const entryPath = resolve(directory, entry.name)
      const metadata = await lstat(entryPath)
      const directoryEntry = metadata.isDirectory()
      const ignored = rootExcluded || isIgnored(matchers, entryPath, directoryEntry)
      if (ignored) {
        patterns.push(`/${escapePattern(relativePath(rootPath, entryPath))}${directoryEntry ? '/' : ''}`)
      }

      if (directoryEntry && !ignored) {
        // A higher-priority negation can reopen this directory. Do not let an individual parser's
        // cached parent exclusion hide children that the combined rules made reachable.
        const reachable = matchers.map((matcher) => {
          const path = relativePath(matcher.directory, entryPath)
          if (!matcher.rules.test(`${path}/`).ignored) return matcher
          const depth = path.split('/').length
          return {
            directory: matcher.directory,
            rules: newRules()
              .add(matcher.rules)
              .add(`!/${'*/'.repeat(depth)}`),
          }
        })
        await visit(entryPath, reachable)
      }
    }
  }

  await visit(rootPath, base)
  return patterns.sort()
}
