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
    backgrounds: {
      default: 'light',
      values: [
        {
          name: 'light',
          value: 'var(--system-color-background-default)',
        },
        {
          name: 'dark',
          value: 'var(--primitive-color-neutral-900)',
        },
      ],
    },
    docs: {
      toc: true,
    },
    layout: 'padded',
  },
  globalTypes: {
    theme: {
      description: 'CoreLive Design System Theme',
      defaultValue: 'light',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: [
          { value: 'light', icon: 'circlehollow', title: 'Light' },
          { value: 'dark', icon: 'circle', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme

      return (
        <div
          className={theme === 'dark' ? 'dark' : ''}
          style={{
            background:
              theme === 'dark'
                ? 'var(--primitive-color-neutral-900)'
                : 'var(--system-color-background-default)',
            color:
              theme === 'dark'
                ? 'var(--primitive-color-neutral-100)'
                : 'var(--primitive-color-neutral-900)',
            minHeight: '100vh',
            padding: '1rem',
          }}
        >
          <Story />
        </div>
      )
    },
  ],
}

export default preview
