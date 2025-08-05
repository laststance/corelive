// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format

import { defineConfig } from 'eslint/config'
import tsPrefixer from 'eslint-config-ts-prefixer'
// import storybook from 'eslint-plugin-storybook'

export default defineConfig([
  ...tsPrefixer,
  {
    ignores: ['.next', 'html', 'storybook-static'],
  },
])
