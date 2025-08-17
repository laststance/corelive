import type { Preview } from '@storybook/nextjs-vite'
import '../src/globals.css'

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    docs: { toc: true },
  },
}

export default preview
