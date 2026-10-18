import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli/index.ts'],
  format: ['esm', 'cjs'],
  dts: {
    // tsup injects baseUrl into declaration builds; TS 6 deprecates that option.
    compilerOptions: { ignoreDeprecations: '6.0' },
  },
  clean: true,
  splitting: false,
  sourcemap: true,
})
