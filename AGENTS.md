# gitignore-patterns

Contributor and release-maintainer guidance for this npm library.

## Repository structure

- `src/index.ts`: Public snapshot generator.
- `src/index.test.ts`: Public API and filesystem behavior tests.
- `tests/cli.test.ts`: Real Git and VitePlus CLI integration scenarios.
- `package.json`: npm identity, dependencies, and ESM/type exports.
- `pnpm-lock.yaml`: Sole dependency lockfile.
- `pnpm-workspace.yaml`: 24-hour dependency release-age policy and Vite+ toolchain overrides.
- `vite.config.ts`: Vite+ checks, Vitest, declaration packaging, and tasks.
- `tsconfig.json`: Strictest and node-ts source type checks.
- `.github/workflows/`: Linux CI and main-branch npm publication.
- `flake.nix`: Development-only Node, pnpm, Git, and VitePlus shell.

## Development commands

Run commands from the repository root inside `nix develop`.
Use VitePlus for dependency management and project tasks, with pnpm selected by `packageManager`.

- `vp install --frozen-lockfile`: Install the exact dependency graph from `pnpm-lock.yaml`.
- `vp install`: Update dependencies and the sole lockfile when declarations change.
- `vp run check`: Check formatting, lint, and source types.
- `vp run fix`: Apply Vite+ formatting and supported lint fixes.
- `vp run test`: Run public API tests and real Git/VitePlus integration tests.
- `vp run build`: Build `dist/index.mjs` and `dist/index.d.mts` with `vp pack`.
- `vp run ci`: Run checks, tests, and build through the template task graph.
- `vp run --no-cache ci`: Run the same task graph without cached results.

## Architecture

- `generateIgnorePatterns` and `GenerateIgnorePatternsOptions` are the public exports. Delegate Gitignore grammar to the `ignore` dependency.
- The generator takes a snapshot of filesystem entries and exports escaped root-relative positive literals for VitePlus. Do not flatten Gitignore source rules into consumer configuration.
- Do not traverse `.git`, symbolic-link roots, or symbolic links. Emit and prune ignored directories. Negations below an ignored directory are unreachable, as in Git.
- The runtime library has no Git or VitePlus dependency. These executables are test-only integration dependencies.
- Keep `exports` and `files` aligned with `dist/index.mjs` and `dist/index.d.mts`. This package is ESM-only. Type declarations are resolved through `exports`.
- Test the public entry point. CLI tests must execute actual Git and the installed VitePlus binary, not mock their pattern handling.

## Development tools

- The configuration is based on `template-vite-plus-lib`. Vite+ owns formatting, lint, source type checks, tests, and packaging. Tests import `vite-plus/test`.
- `vp pack` builds the library and declarations through `pack.dts: true`. Do not replace it with `vp build`, which invokes Vite production builds.
- pnpm is the only dependency manager. Do not add npm, Bun, or Deno lockfiles.
- `pnpm-workspace.yaml` sets `minimumReleaseAge: 1440`, measured in minutes, and `minimumReleaseAgeStrict: true` to preserve the 24-hour waiting period without falling back to younger releases. Do not reduce the window or add exclusions.
- Keep external dependency ranges as carets. Vite+'s official toolchain overrides in `pnpm-workspace.yaml` are exceptions: match the `vite@*` alias to installed `vite-plus` and the `vitest@*` override to `vp toolchain vitest`. See the [Vite+ migration guide](https://viteplus.dev/guide/migrate).
- Preserve no semicolons, single quotes, 120-column formatting, and Markdown without soft wrapping through Vite+.
- CI runs `setup-nix@main`, then `setup-typescript@main`. The latter installs the locked graph through `vp install --frozen-lockfile`. The run step loads the shell with `eval "$(nix print-dev-env "$GITHUB_WORKSPACE#default")"` and invokes `vp run ci`.
- Keep shared `totto2727-org/monorepo` actions on `@main`. Do not add Nix package, app, or overlay outputs to this library.
- Keep temporary consumers and archives under ignored `tmp/`. Remove task-created temporary TypeScript consumers before whole-project checks because default TypeScript discovery does not honor `.gitignore`.
- For export changes, install a real archive into an isolated consumer, compile imports by package name with strict NodeNext resolution, check invalid calls, and execute the built exports.

## npm publication

The enabled `.github/workflows/publish.yml` runs on pushes to `main`, preserving the existing publication trigger.
It installs locked dependencies, builds with `vp pack`, and delegates staged npm publication with provenance to the template's shared `totto2727-org/monorepo/.github/actions/publish-npm@main` action.
It does not repeat pre-merge checks or tests.
Do not replace shared publication behavior with a custom native npm command or add long-lived npm tokens.
Before enabling registry publication, the owner must configure package metadata, npm scope ownership, and registry GitHub trust for owner `totto2727-org`, repository `gitignore-patterns`, and workflow `publish.yml`.
Registry linking is an owner-controlled prerequisite, not something the workflow creates.
See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).
Do not publish from a local validation run.

## Package-specific rules

- Preserve public errors for invalid, missing, and symbolic-link roots.
- Preserve the snapshot boundaries documented in README.md.
- Use Node filesystem APIs for symbolic-link fixtures and clean up test-owned temporary trees.
- Keep only built library artifacts in the npm archive, plus automatically included metadata, README, and license. Do not publish tests or development tooling.
- Source provenance is the local `nikhilsnayak/effective-rsc` checkout, commit `bf3a9a119fd909276a4d78114aa3b29dcdef63ba`, path `packages/gitignore-patterns`. Do not claim a remote source commit URL.
