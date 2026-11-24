# @totto2727/gitignore-patterns

Generate sorted, root-anchored, escaped VitePlus ignore patterns from the entries currently excluded by Git ignore rules, using the established [`ignore`](https://github.com/kaelzhang/node-ignore) parser for Gitignore syntax.

## Usage

Keep VitePlus formatter and linter exclusions synchronized with Gitignore rules without maintaining another list:

```ts
import { generateIgnorePatterns } from '@totto2727/gitignore-patterns'
import { defineConfig } from 'vite-plus'

const ignorePatterns = await generateIgnorePatterns(new URL('.', import.meta.url))

export default defineConfig({
  fmt: { ignorePatterns },
  lint: { ignorePatterns },
})
```

For an existing `dist/` directory ignored by the root `.gitignore`, the result includes `/dist/`.
A nested reachable `.gitignore` can unignore `nested/keep.log` while a root `*.log` rule excludes `nested/drop.log`.
An ignored parent directory cannot be reopened by a rule inside that directory.

## Key features

- In a worktree, applies the effective global ignore file, the repository’s `info/exclude`, and reachable `.gitignore` files in increasing order of priority.
- Preserves the directory scope of nested `.gitignore` files and their ability to override lower-priority rules.
- Delegates comments, escapes, negation, and pattern parsing to `ignore`.
- Produces escaped positive literals for consumer glob configuration, including escaped braces, and prunes ignored directories.
- Ships ESM JavaScript and TypeScript declarations through npm. VitePlus is not required at runtime.

## Prerequisites

- Node.js 24 or later, with read access to the chosen tree.
- For repository-wide excludes, Git 2.31 or later on `PATH`. Without Git, the scan still applies reachable `.gitignore` files.
- A consumer `ignorePatterns` configuration rooted at the same directory as `root`, such as VitePlus fmt and lint. The output is not a general-purpose minimatch or arbitrary glob configuration.

## Setup

Install the package with VitePlus:

```bash
vp add @totto2727/gitignore-patterns
```

## API

The package exports `generateIgnorePatterns` and the `GenerateIgnorePatternsOptions` type from its root entry point.
TypeScript declarations include their public TSDoc.

```ts
import { generateIgnorePatterns, type GenerateIgnorePatternsOptions } from '@totto2727/gitignore-patterns'

const options: GenerateIgnorePatternsOptions = { ignoreCase: false }
const patterns: string[] = await generateIgnorePatterns(new URL('.', import.meta.url), options)
```

`generateIgnorePatterns(root, options?)` accepts a directory path or a `file:` URL and returns `Promise<string[]>`.
Relative paths resolve from the process working directory.
`options.ignoreCase` defaults to `false`.
Set it to `true` for case-insensitive Gitignore matching, independent of Git's `core.ignorecase` setting.

### Snapshot and consumer boundaries

Call the function again after files or Gitignore rules change.
A previously emitted ignored-directory pattern covers new descendants, but newly created individually ignored files require regeneration.
VitePlus independently reads Gitignore files, so its native exclusions are additive and may differ from Git for valid patterns such as literal braces or symlink traversal.
This package escapes its snapshot literals correctly but cannot undo exclusions independently imposed by a consumer.
Only `.gitignore` files at or below the supplied root participate. The scan skips `.git` entries and does not query tracked-file status. It loads a reachable `.gitignore` even if its name matches an ignore rule. It does not traverse symlink entries or follow symbolic `.gitignore` files.

### Repository-wide excludes

Inside a worktree, Git identifies the effective `core.excludesFile` and the repository’s `info/exclude` path, including shared metadata for linked worktrees. If `core.excludesFile` is unset, the global file defaults to `$XDG_CONFIG_HOME/git/ignore`, or `$HOME/.config/git/ignore` if `XDG_CONFIG_HOME` is empty or unset. A configured file replaces the default. An empty setting disables the global file. These two repository-wide rule sources may be symlinks to regular files, as in a Nix-managed configuration. Missing files contribute no rules. See [Git’s ignore precedence](https://git-scm.com/docs/gitignore#_description).

Repository-wide patterns match paths relative to the actual worktree root, even when the snapshot starts in a subdirectory. Output remains relative to the supplied directory. If repository-wide rules already exclude that directory or an ancestor, its immediate entries are emitted and directories are pruned. The scan deliberately does not import `.gitignore` files above the supplied root. It does not switch rule sources when it encounters a nested repository.

Outside a worktree or when the Git executable is missing, only reachable `.gitignore` files participate. Other Git errors, such as invalid configuration, and filesystem errors other than missing rule files reject the call.
A missing root still rejects with `ENOENT`. A non-directory or symbolic-link root rejects with `TypeError`. The scan is not an atomic security boundary.

## Development

For repository structure and development commands, see [AGENTS.md](https://github.com/totto2727-org/gitignore-patterns/blob/main/AGENTS.md).

## License

[MIT](./LICENSE)

_This README was generated from the [share-artifact skill](https://raw.githubusercontent.com/totto2727-org/agent/refs/heads/main/plugins/totto2727-coding/skills/share-artifact/SKILL.md) and [README template](https://raw.githubusercontent.com/totto2727-org/agent/refs/heads/main/plugins/totto2727-coding/skills/share-artifact/readme/template.md)._
