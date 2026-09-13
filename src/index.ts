import { lstat, readdir, readFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ignore from 'ignore'

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
  readonly test: (path: string) => { ignored: boolean; unignored: boolean }
}

const escapePattern = (path: string): string => path.replace(/[\\*?[\]{} #!]/g, '\\$&')

const toRootPath = (root: string | URL): string => resolve(typeof root === 'string' ? root : fileURLToPath(root))

const relativePath = (from: string, to: string): string => relative(from, to).split(sep).join('/')

const loadMatcher = async (
  directory: string,
  ignoreCase: boolean,
): Promise<Matcher | undefined> => {
  const ignoreFile = resolve(directory, '.gitignore')
  const metadata = await lstat(ignoreFile).catch((error: unknown) => {
    if (isMissingPath(error)) {
      return undefined
    }

    throw error
  })

  if (metadata === undefined || !metadata.isFile() || metadata.isSymbolicLink()) {
    return undefined
  }

  const matcher = ignore({ ignorecase: ignoreCase })
  matcher.add(await readFile(ignoreFile, 'utf8'))
  return { directory, test: matcher.test.bind(matcher) }
}

const isMissingPath = (error: unknown): error is NodeJS.ErrnoException =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as NodeJS.ErrnoException).code === 'ENOENT'

const isIgnored = (matchers: readonly Matcher[], path: string, directory: boolean): boolean => {
  let ignored = false

  for (const matcher of matchers) {
    const result = matcher.test(`${relativePath(matcher.directory, path)}${directory ? '/' : ''}`)
    if (result.ignored) {
      ignored = true
    } else if (result.unignored) {
      ignored = false
    }
  }

  return ignored
}

/**
 * Snapshot paths currently ignored by reachable `.gitignore` files as escaped, root-relative VitePlus patterns.
 *
 * `root` must be a non-symbolic-link directory path or `file:` URL. Relative paths resolve from the process working
 * directory. The returned sorted positive literals are for an ignore configuration rooted at this same directory.
 * Ancestor rules, global excludes, `.git/info/exclude`, tracked-file status, and `.git` entries are not consulted.
 * Ignored directories are emitted and pruned, so rules inside them are unreachable as they are in Git.
 *
 * Filesystem errors are preserved, including `ENOENT` for a missing root. Non-directory or symbolic-link roots reject
 * with `TypeError`. The scan is a non-atomic snapshot and does not follow symbolic links.
 */
export const generateIgnorePatterns = async (
  root: string | URL,
  options: GenerateIgnorePatternsOptions = {},
): Promise<string[]> => {
  const rootPath = toRootPath(root)
  const rootMetadata = await lstat(rootPath)
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    throw new TypeError('root must be a non-symbolic-link directory')
  }

  const patterns: string[] = []
  const visit = async (directory: string, inheritedMatchers: readonly Matcher[]): Promise<void> => {
    const matcher = await loadMatcher(directory, options.ignoreCase ?? false)
    const matchers = matcher ? [...inheritedMatchers, matcher] : inheritedMatchers
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
      const ignored = isIgnored(matchers, entryPath, directoryEntry)
      if (ignored) {
        patterns.push(
          `/${escapePattern(relativePath(rootPath, entryPath))}${directoryEntry ? '/' : ''}`,
        )
      }

      if (directoryEntry && !ignored) {
        await visit(entryPath, matchers)
      }
    }
  }

  await visit(rootPath, [])
  return patterns.sort()
}
