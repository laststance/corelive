import type { Meta, StoryObj, Decorator } from '@storybook/nextjs-vite'
import { expect, within, userEvent, waitFor } from 'storybook/test'

import { ThemeProvider } from '@/providers/ThemeProvider'

import { ThemeSelector } from './ThemeSelector'

// Wrap every story in the real ThemeProvider so next-themes writes the actual
// `data-theme` attribute (no mock) — the picker's correctness IS that mapping.
const withThemeProvider: Decorator = (Story) => (
  <ThemeProvider>
    <div className="min-h-screen bg-background p-8 text-foreground">
      <Story />
    </div>
  </ThemeProvider>
)

const meta: Meta<typeof ThemeSelector> = {
  title: 'UI/ThemeSelector',
  component: ThemeSelector,
  parameters: {
    layout: 'padded',
    // Disable Storybook backgrounds — the theme owns the background.
    backgrounds: { disable: true },
  },
  decorators: [withThemeProvider],
}

export default meta

type Story = StoryObj<typeof ThemeSelector>

export const Default: Story = {
  render: () => <ThemeSelector />,
}

// Behavior: choosing a family then a mode applies the matching `${family}-${mode}`
// theme id, and switching mode keeps the family — the two-axis contract.
export const PicksFamilyThenModeMapsToThemeId: Story = {
  name: 'picking a family then a mode applies that family-and-mode theme, keeping the family',
  render: () => <ThemeSelector />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Arrange — wait for the picker to hydrate (placeholder → controls)
    const harborCard = await canvas.findByTestId('theme-family-card-harbor')

    // Act — choose the Harbor family (mode defaults to light)
    await userEvent.click(harborCard)

    // Assert — (harbor, light) → 'harbor-light'
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe(
        'harbor-light',
      )
    })

    // Act — switch the mode to Dark
    await userEvent.click(canvas.getByTestId('theme-mode-dark'))

    // Assert — (harbor, dark) → 'harbor-dark' (family preserved across the toggle)
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe(
        'harbor-dark',
      )
    })
  },
}

// Behavior: each family card renders a composite preview built from the theme's
// OKLCH tokens (surface/accent/heatmap), never a single hardcoded hex dot.
export const FamilyCardPreviewsUseDerivedTokens: Story = {
  name: 'family cards preview each theme from its OKLCH tokens, not a hex dot',
  render: () => <ThemeSelector />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Arrange
    const irisCard = await canvas.findByTestId('theme-family-card-iris')

    // Act — find a swatch element styled with an oklch() token
    const tokenSwatch = irisCard.querySelector('[style*="oklch"]')

    // Assert — the preview is token-derived (the old hex-dot swatch is gone)
    expect(tokenSwatch).not.toBeNull()
  },
}

// Behavior: System mode is OS-managed and maps to the default Warm Cathedral pair
// (design Fork A) — it is offered for Warm Cathedral but never for a colored family.
export const SystemModeOnlyForDefaultFamily: Story = {
  name: 'System mode is offered for Warm Cathedral but hidden for colored families',
  render: () => <ThemeSelector />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Arrange — select the default family
    const cathedralCard = await canvas.findByTestId(
      'theme-family-card-cathedral',
    )
    await userEvent.click(cathedralCard)

    // Assert — Warm Cathedral exposes System
    await waitFor(() => {
      expect(canvas.queryByTestId('theme-mode-system')).not.toBeNull()
    })

    // Act — switch to a colored family
    await userEvent.click(canvas.getByTestId('theme-family-card-grove'))

    // Assert — colored families offer Light/Dark only (System dropped)
    await waitFor(() => {
      expect(canvas.queryByTestId('theme-mode-system')).toBeNull()
    })
  },
}
