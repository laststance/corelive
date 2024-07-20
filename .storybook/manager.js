import { addons } from '@storybook/manager-api'
import { themes } from '@storybook/theming'
addons.setConfig({
  theme: themes.dark,
  toolbar: {
    'storybook/background': { hidden: true },
  },
})
