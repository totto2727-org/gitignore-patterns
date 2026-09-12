# gitignore-patterns

## Repository structure

```text
src/index.ts             Public snapshot generator
src/index_test.ts        Eleven public API and filesystem behavior tests
tests/cli.test.ts        Real Git and VitePlus CLI integration scenarios
deno.json                Package identity, exports, tasks, and Deno permissions
.github/workflows/       Linux CI and disabled JSR publication workflow
flake.nix                Development-only Deno, Node, and VitePlus shell
```

## Development commands

Run commands from the repository root.
Use `nix develop` for the pinned Deno, Node, and VitePlus development environment when it is available.

- `deno task check`: Check formatting, lint, and the exported TypeScript API.
- `deno task fix`: Apply Deno formatting and supported lint fixes.
- `deno task test`: Run Deno unit and real CLI integration tests with minimal read, write, run, and environment permissions.
- `deno task ci`: Run all source checks, tests, and the clean-tree JSR publish dry run.

## Architecture

- `generateIgnorePatterns` and `GenerateIgnorePatternsOptions` are the public exports. Keep Gitignore grammar delegated to pinned `npm:ignore@7.0.9`.
- The generator creates a snapshot of filesystem entries, then exports escaped root-relative positive literals for VitePlus. Do not flatten Gitignore source rules into consumer configuration.
- Do not traverse `.git`, symbolic-link roots, or symbolic links. An ignored directory is emitted and pruned, so negations below it are unreachable as in Git.
- The runtime library has no Git or VitePlus dependency. Those executables are test-only integration dependencies.

## Development tools

- Deno owns formatting, linting, typechecking, tests, package metadata, and the JSR dry run.
- The Linux CI job uses `totto2727-org/monorepo/.github/actions/setup-nix@main`, then `eval "$(nix print-dev-env \"$GITHUB_WORKSPACE#default\")"` and `deno task ci`.
- The disabled shared `publish-jsr` workflow remains disabled until an owner creates the JSR scope/package and links exactly `totto2727-org/gitignore-patterns` for repository OIDC publication. Never add a registry token or enable it before that setup.

## Package-specific rules

- Preserve no semicolons, single quotes, and 120-column formatting through Deno.
- Preserve the public error behavior for invalid, missing, and symbolic-link roots.
- Keep tests public-API based. CLI tests must execute actual `git` and `vp` behavior rather than mock their pattern handling.
- Keep runtime permissions constrained. Test grants are limited in `deno.json`; do not replace them with `-A` or add a runtime command that needs Git or VitePlus.
- Symlink fixture tests use `ln` because Deno requires unscoped read and write permission for native symlink creation. `ln` is supplied by the Nix development environment and allowed as one named test executable instead of broad filesystem grants.
- Keep `src/` as a directory publication include. Do not add Nix package, app, or overlay outputs because this repository is a library.
- Source provenance is the local `nikhilsnayak/effective-rsc` checkout, commit `bf3a9a119fd909276a4d78114aa3b29dcdef63ba`, path `packages/gitignore-patterns`. Do not claim a remote source commit URL.

_This AGENTS.md was generated from the [share-artifact skill](https://raw.githubusercontent.com/totto2727-org/agent/refs/heads/main/plugins/totto2727-coding/skills/share-artifact/SKILL.md) and [AGENTS template](https://raw.githubusercontent.com/totto2727-org/agent/refs/heads/main/plugins/totto2727-coding/skills/share-artifact/agents/template.md)._
