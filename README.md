# @totto2727/gitignore-patterns

Generate sorted, root-anchored, escaped VitePlus ignore patterns from the entries currently excluded by reachable `.gitignore` files, using the established [`ignore`](https://github.com/kaelzhang/node-ignore) parser for Gitignore syntax.

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

- Discovers reachable nested Gitignore files and preserves their directory scope and precedence.
- Delegates comments, escapes, negation, and pattern parsing to `ignore`.
- Produces escaped positive literals for consumer glob configuration, including escaped braces, and prunes ignored directories.
- Ships ESM TypeScript through JSR with no runtime Git or VitePlus dependency.

## Prerequisites

- Node.js 22 or later or Deno, with read access to the chosen tree. Deno callers must grant scoped read permission for that tree.
- A consumer `ignorePatterns` configuration rooted at the same directory as `root`, such as VitePlus fmt and lint. The output is not a general-purpose minimatch or arbitrary glob configuration.

## Setup

The JSR package name is `@totto2727/gitignore-patterns`.
Automated publication is enabled for `v*` tags and requires the JSR package to be linked to `totto2727-org/gitignore-patterns`.

After it is published, add it to a Deno project with:

```bash
deno add jsr:@totto2727/gitignore-patterns
```

For a Node or Vite consumer, add the JSR package with:

```bash
npx jsr add @totto2727/gitignore-patterns
```

Until publication, consume the checked-out source in a repository-local workflow rather than relying on an unpublished registry specifier.

## API

The planned [JSR API documentation](https://jsr.io/@totto2727/gitignore-patterns/doc) will become available after publication.
It documents `generateIgnorePatterns` and `GenerateIgnorePatternsOptions` from their public TSDoc.

### Snapshot and consumer boundaries

Call the function again after files or Gitignore rules change.
A previously emitted ignored-directory pattern covers new descendants, but newly created individually ignored files require regeneration.
VitePlus independently reads Gitignore files, so its native exclusions are additive and may differ from Git for valid patterns such as literal braces or symlink traversal.
This package escapes its snapshot literals correctly but cannot undo exclusions independently imposed by a consumer.
Only `.gitignore` files at or below the supplied root participate, and `.git`, ancestor rules, global excludes, `.git/info/exclude`, and tracked-file status are excluded from the snapshot.
A reachable ignored `.gitignore` is loaded, but symbolic links and symbolic `.gitignore` files are never followed.
The scan preserves filesystem errors such as `ENOENT`, rejects invalid roots with `TypeError`, and is not an atomic security boundary.

## Development

For repository structure and development commands, see [AGENTS.md](https://github.com/totto2727-org/gitignore-patterns/blob/main/AGENTS.md).

## License

[MIT](./LICENSE)

_Source provenance: extracted from `packages/gitignore-patterns` in the local `nikhilsnayak/effective-rsc` checkout at commit `bf3a9a119fd909276a4d78114aa3b29dcdef63ba`, preserving the original MIT copyright notice for Nikhil S._

_This README was generated from the [share-artifact skill](https://raw.githubusercontent.com/totto2727-org/agent/refs/heads/main/plugins/totto2727-coding/skills/share-artifact/SKILL.md) and [README template](https://raw.githubusercontent.com/totto2727-org/agent/refs/heads/main/plugins/totto2727-coding/skills/share-artifact/readme/template.md)._
