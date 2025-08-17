import { composeStories } from '@storybook/react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'

import * as stories from './accordion.stories'

const { Basic } = composeStories(stories)

// Basic interaction: toggles open/close
// Ensures Radix accordion renders and content visibility toggles via trigger

test('Accordion: renders items and toggles content visibility', async () => {
  await Basic.run()

  // Three triggers present
  const triggers = await screen.findAllByRole('button', {
    name: /shadcn\/ui|Is it accessible\?|Can I customize it\?/i,
  })
  expect(triggers.length).toBe(3)

  // Initially collapsed, content not visible
  expect(
    screen.queryByText(/A set of unstyled, accessible components/i),
  ).toBeNull()

  // Click first trigger to expand
  await userEvent.click(
    screen.getByRole('button', { name: /What is shadcn\/ui\?/i }),
  )
  await new Promise((r) => setTimeout(r, 1))
  expect(
    screen.getByText(/A set of unstyled, accessible components/i),
  ).toBeInTheDocument()

  // Click again to collapse
  await userEvent.click(
    screen.getByRole('button', { name: /What is shadcn\/ui\?/i }),
  )
  await new Promise((r) => setTimeout(r, 1))
  expect(
    screen.queryByText(/A set of unstyled, accessible components/i),
  ).toBeNull()
})
