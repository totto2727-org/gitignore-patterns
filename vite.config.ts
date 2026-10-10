import { defineConfig } from 'vite-plus'

export default defineConfig({
  fmt: {
    arrowParens: 'always',
    experimentalSortImports: {
      ignoreCase: true,
      newlinesBetween: true,
      order: 'asc',
    },
    experimentalSortPackageJson: true,
    jsxSingleQuote: true,
    printWidth: 120,
    proseWrap: 'preserve',
    semi: false,
    singleQuote: true,
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  test: { include: ['src/**/*.test.ts', 'tests/**/*.test.ts'] },
  pack: { entry: ['src/index.ts'], format: ['esm'], platform: 'node', dts: true, clean: true },
  run: {
    tasks: {
      build: {
        command: 'vp pack',
        cache: {
          input: [{ auto: true }, '!dist/**'],
          output: ['dist/**'],
        },
      },
      check: {
        command: 'vp check',
      },
      ci: {
        command: '',
        dependsOn: ['check', 'test', 'package'],
      },
      fix: {
        command: 'vp check --fix',
      },
      package: {
        command: 'npm pack --dry-run',
        dependsOn: ['build'],
      },
      test: {
        command: 'vp test run',
      },
    },
  },
})
