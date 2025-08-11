import * as a11yAddonAnnotations from '@storybook/addon-a11y/preview'
import { setProjectAnnotations } from '@storybook/nextjs-vite'
import { beforeAll } from 'vitest'

import * as projectAnnotations from './preview'

// This is an important step to apply the right configuration when testing your stories.
// More info at: https://storybook.js.org/docs/api/portable-stories/portable-stories-vitest#setprojectannotations
setProjectAnnotations([a11yAddonAnnotations, projectAnnotations])

// MSW setup for browser mode
beforeAll(async () => {
  // Only setup MSW if we're in browser mode and if handlers exist
  if (typeof window !== 'undefined') {
    try {
      const { setupWorker } = await import('msw/browser')
      const { handlers } = await import('../mocks/handlers')

      const worker = setupWorker(...handlers)
      await worker.start({
        onUnhandledRequest: 'bypass',
      })
    } catch (error) {
      console.warn('MSW browser setup skipped:', error)
    }
  }
})
