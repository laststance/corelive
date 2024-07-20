module.exports = {
  root: true,
  env: {},
  globals: {},
  extends: [
    'ts-prefixer',
    'next/core-web-vitals',
    'plugin:storybook/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['tsconfig.json'],
  },
  plugins: [],
  rules: {
    'react-hooks/exhaustive-deps': 'off',
  },
  settings: {},
  overrides: [],
}
