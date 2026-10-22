// These tools still require the JavaScript compiler API removed in TypeScript 7.
const compilerApiConsumers = new Set([
  '@interlace/eslint-devkit',
  '@typescript-eslint/eslint-plugin',
  '@typescript-eslint/parser',
  '@typescript-eslint/project-service',
  '@typescript-eslint/tsconfig-utils',
  '@typescript-eslint/type-utils',
  '@typescript-eslint/typescript-estree',
  '@typescript-eslint/utils',
  'eslint-config-ts-prefixer',
  'typescript-eslint',
  'ts-api-utils',
  'ts-node',
  'tsup',
])

module.exports = {
  hooks: {
    // pnpm calls this during resolution; application tsc remains TypeScript 7.
    readPackage(pkg) {
      if (compilerApiConsumers.has(pkg.name)) {
        pkg.dependencies = { ...pkg.dependencies, typescript: '6.0.3' }
        // A root TypeScript 7 peer would replace this tool's private API dependency.
        if (pkg.peerDependencies) delete pkg.peerDependencies.typescript
      }
      return pkg
    },
  },
}
