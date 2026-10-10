# gitignore-patterns

Contributor and release-maintainer guidance for this npm library.

## Repository structure

```text
src/index.ts             Public snapshot generator
src/index.test.ts        Public API and filesystem behavior tests
tests/cli.test.ts        Real Git and VitePlus CLI integration scenarios
package.json             npm identity, dependencies, and ESM/type exports
package-lock.json        Sole dependency lockfile
.npmrc                   24-hour dependency release-age policy
vite.config.ts           Vite+ checks, Vitest, declaration packaging, and tasks
tsconfig.json            Strictest and node-ts source type checks
.github/workflows/       Linux CI and tag-triggered npm publication
flake.nix                Development-only Node, Git, and VitePlus shell
```

## Development commands

Run commands from the repository root inside `nix develop`.
The pinned shell supplies Node.js and npm 11.17.0.
Use npm for dependency management and Vite+ for project tasks.

- `npm ci`: Install the exact dependency graph from `package-lock.json`.
- `npm install`: Update dependencies and the sole lockfile when declarations change.
- `vp run check`: Check formatting, lint, and source types.
- `vp run fix`: Apply Vite+ formatting and supported lint fixes.
- `vp run test`: Run public API tests and real Git/VitePlus integration tests.
- `vp run build`: Build `dist/index.mjs` and `dist/index.d.mts` with `vp pack`.
- `vp run package`: Build the library, then inspect npm contents with `npm pack --dry-run`.
- `vp run ci`: Run checks, tests, and package validation through the template task graph.
- `vp run --no-cache ci`: Run the same task graph without cached results.
- `npm pack --pack-destination tmp`: Create a real archive after building and creating `tmp/`.

## Architecture

- `generateIgnorePatterns` and `GenerateIgnorePatternsOptions` are the public exports. Delegate Gitignore grammar to the `ignore` dependency.
- The generator takes a snapshot of filesystem entries and exports escaped root-relative positive literals for VitePlus. Do not flatten Gitignore source rules into consumer configuration.
- Do not traverse `.git`, symbolic-link roots, or symbolic links. Emit and prune ignored directories. Negations below an ignored directory are unreachable, as in Git.
- The runtime library has no Git or VitePlus dependency. These executables are test-only integration dependencies.
- Keep `exports`, `types`, and `files` aligned with `dist/index.mjs` and `dist/index.d.mts`. This package is ESM-only.
- Test the public entry point. CLI tests must execute actual Git and the installed VitePlus npm binary, not mock their pattern handling.

## Development tools

- The configuration is based on `template-vite-plus-lib`. Vite+ owns formatting, lint, source type checks, tests, and packaging. Tests import `vite-plus/test`.
- `vp pack` builds the library and declarations through `pack.dts: true`. Do not replace it with `vp build`, which invokes Vite production builds.
- npm is the only package manager. Do not add a Bun, pnpm, or Deno lockfile.
- `.npmrc` sets `min-release-age=1`, measured in days, to preserve the template's 24-hour waiting period. npm 11.17.0 supports this setting. Do not reduce the window or add exclusions.
- Keep external dependency ranges as carets. Vite+'s official toolchain overrides are exceptions: match the `vite` alias to installed `vite-plus` and the `vitest` override to `vp toolchain vitest`. See the [Vite+ migration guide](https://viteplus.dev/guide/migrate).
- Preserve no semicolons, single quotes, 120-column formatting, and Markdown wrapping through Vite+.
- CI runs `setup-nix@main`, then `setup-typescript@main`. The latter selects npm from `packageManager` and installs the locked graph through `vp install --frozen-lockfile`. The run step loads the shell with `eval "$(nix print-dev-env "$GITHUB_WORKSPACE#default")"` and invokes `vp run ci`.
- Keep shared `totto2727-org/monorepo` actions on `@main`. Do not add Nix package, app, or overlay outputs to this library.
- Keep temporary consumers and archives under ignored `tmp/`. Remove temporary TypeScript consumers before whole-project checks because default TypeScript discovery does not honor `.gitignore`.
- For export changes, install a real npm archive into an isolated consumer, compile imports by package name with strict NodeNext resolution, check invalid calls, and execute the built exports.

## npm publication

The enabled `.github/workflows/publish.yml` publishes to npm when a `v<version>` tag is pushed.
The tag must match `package.json`.
The workflow installs locked dependencies, builds with `vp pack`, and runs native `npm publish --provenance` with job-scoped `id-token: write` on a GitHub-hosted runner.
It does not repeat pre-merge checks or tests.
Unlike the template's shared staged-publication action, this workflow uses direct npm publication with the requested npm package manager.
Do not add long-lived npm tokens to the workflow.

Before the first automated release:

1. Ensure the npm scope `@totto2727` is owned by the package owner.
2. If the package does not exist, the owner must complete the initial authenticated publication from a validated build to create its registry settings.
3. Configure the npm package's Trusted Publisher for owner `totto2727-org`, repository `gitignore-patterns`, and workflow `publish.yml`. Permit direct publication. If the publisher requires an environment, add the same protected environment to the workflow job.
4. Protect release tags and push `v<version>` only from a commit that passed CI on `main`. Use a new version for changed package contents.

Registry linking is a separate owner-controlled prerequisite, not something the workflow creates.
See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).
Do not publish from a local validation run.

## Package-specific rules

- Preserve public errors for invalid, missing, and symbolic-link roots.
- Preserve the snapshot boundaries documented in README.md.
- Use Node filesystem APIs for symbolic-link fixtures and clean up test-owned temporary trees.
- Keep only built library artifacts in the npm archive, plus automatically included metadata, README, and license. Do not publish tests or development tooling.
- Source provenance is the local `nikhilsnayak/effective-rsc` checkout, commit `bf3a9a119fd909276a4d78114aa3b29dcdef63ba`, path `packages/gitignore-patterns`. Do not claim a remote source commit URL.

_This AGENTS.md was generated from the [share-artifact skill](https://raw.githubusercontent.com/totto2727-org/agent/refs/heads/main/plugins/totto2727-coding/skills/share-artifact/SKILL.md) and [AGENTS template](https://raw.githubusercontent.com/totto2727-org/agent/refs/heads/main/plugins/totto2727-coding/skills/share-artifact/agents/template.md)._
