import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)

export interface GitExcludes {
  readonly worktree: string
  readonly files: readonly string[]
}

/** Return source paths in increasing priority. Git resolves config includes and linked-worktree metadata. */
export const discoverGitExcludes = async (root: string): Promise<GitExcludes | undefined> => {
  const env: NodeJS.ProcessEnv = { ...process.env, LC_ALL: 'C' }
  for (const key of [
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_COMMON_DIR',
    'GIT_IMPLICIT_WORK_TREE',
    'GIT_PREFIX',
    'GIT_CONFIG',
  ] as const) {
    delete env[key]
  }
  const git = async (cwd: string, args: string[]): Promise<string> => (await exec('git', args, { cwd, env })).stdout

  let worktree: string
  try {
    worktree = (await git(root, ['rev-parse', '--show-toplevel'])).replace(/\n$/, '')
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error.code === 'ENOENT' ||
        (error.code === 128 &&
          'stderr' in error &&
          typeof error.stderr === 'string' &&
          /^fatal: (?:not a git repository \(or any |this operation must be run in a work tree)/.test(error.stderr)))
    ) {
      return undefined
    }
    throw error
  }

  const info = (await git(worktree, ['rev-parse', '--path-format=absolute', '--git-path', 'info/exclude'])).replace(
    /\n$/,
    '',
  )
  let global: string | undefined
  try {
    const value = (await git(worktree, ['config', '--null', '--path', '--get', 'core.excludesFile'])).slice(0, -1)
    if (value) global = resolve(worktree, value)
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 1)) throw error
    const home = env['HOME']
    const configHome = env['XDG_CONFIG_HOME'] || (home && resolve(home, '.config'))
    if (configHome) global = resolve(worktree, configHome, 'git/ignore')
  }
  return { worktree, files: global ? [global, info] : [info] }
}
