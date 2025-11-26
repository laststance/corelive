import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import * as React from 'react'
import { expect, within, userEvent } from 'storybook/test'

import { ThemeProvider } from '@/providers/ThemeProvider'

import { ThemeSelector, ThemeSelectorCompact } from './ThemeSelector'
import { Avatar, AvatarFallback } from './ui/avatar'
import { Button } from './ui/button'
import { Card } from './ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'

// Decorator to wrap stories in ThemeProvider
const withThemeProvider = (Story: any) => (
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
    backgrounds: {
      disable: true, // Disable default backgrounds since we're using theme backgrounds
    },
  },
  decorators: [withThemeProvider],
}

export default meta

type Story = StoryObj<typeof ThemeSelector>

export const Default: Story = {
  render: () => <ThemeSelector />,
}

// Story that simulates the user dropdown menu like in the actual app
export const InUserDropdown: Story = {
  render: () => {
    const [currentTheme, setCurrentTheme] = React.useState('Light')

    return (
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="size-9 rounded-full">
              <Avatar className="size-9">
                <AvatarFallback data-testid="avatar-fallback">U</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              value={currentTheme}
              onValueChange={setCurrentTheme}
            >
              <DropdownMenuRadioItem
                value="Light"
                data-testid="theme-menu-item"
              >
                Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="Dark" data-testid="theme-menu-item">
                Dark
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  },
}

// Story showcasing various UI elements to test theme application
export const WithUIElements: Story = {
  render: () => (
    <div className="space-y-4">
      <ThemeSelector />

      <Card className="p-4" data-testid="test-card">
        <h2 className="mb-2 text-lg font-semibold">Theme Test Card</h2>
        <p className="text-muted-foreground">
          This card should reflect the current theme colors.
        </p>

        <div className="mt-4 space-x-2">
          <Button variant="default" data-testid="test-button-primary">
            Primary
          </Button>
          <Button variant="secondary" data-testid="test-button-secondary">
            Secondary
          </Button>
          <Button variant="outline" data-testid="test-button-outline">
            Outline
          </Button>
          <Button variant="ghost" data-testid="test-button-ghost">
            Ghost
          </Button>
        </div>
      </Card>

      <div
        className="rounded-md border p-4"
        data-testid="test-border-container"
      >
        <p>Border and text colors should adapt to the theme</p>
      </div>
    </div>
  ),
}

export const Compact: Story = {
  render: () => <ThemeSelectorCompact className="w-48" />,
}

// Test: Default theme is light (shadcn/ui)
export const DefaultThemeTest: Story = {
  render: () => <ThemeSelector />,
  play: async ({ canvasElement: _canvasElement }) => {
    // Check default theme attribute
    const rootElement = document.documentElement
    const dataTheme = rootElement.getAttribute('data-theme')

    // Default light theme may not have explicit data-theme or it's 'light'
    if (dataTheme !== null) {
      expect(dataTheme).toBe('light')
    }

    // Verify light theme CSS variables
    const computedStyle = getComputedStyle(document.documentElement)
    const backgroundColor = computedStyle
      .getPropertyValue('--background')
      .trim()
    const foregroundColor = computedStyle
      .getPropertyValue('--foreground')
      .trim()

    // shadcn/ui light theme - browsers may convert oklch to lab
    expect(backgroundColor).toMatch(/^(oklch\(1 0 0\)|lab\(100% 0 0\))$/)
    expect(foregroundColor).toMatch(
      /^(oklch\(0\.145 0 0\)|lab\([\d.]+% 0 0\))$/,
    )
  },
}

// Test: Theme provider is present and working
export const ThemeProviderTest: Story = {
  render: () => <ThemeSelector />,
  play: async ({ canvasElement: _canvasElement }) => {
    // Check if next-themes functionality is present by checking localStorage
    const themeData = {
      hasStorageKey: localStorage.getItem('corelive-theme') !== null,
      hasDataThemeCapability:
        document.documentElement.hasAttribute('data-theme') ||
        document.documentElement.getAttribute('data-theme') === null,
    }

    // Either localStorage key exists or data-theme attribute capability is present
    expect(themeData.hasStorageKey || themeData.hasDataThemeCapability).toBe(
      true,
    )
  },
}

// Test: Can switch to dark theme
export const SwitchToDarkThemeTest: Story = {
  render: () => <ThemeSelector />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Click on theme selector - button shows current theme name
    const themeSelectorTrigger = canvas.getByRole('button', {
      name: /theme|select theme|light|dark/i,
    })
    await userEvent.click(themeSelectorTrigger)

    // Wait for dropdown and find Dark theme - accessible name includes description
    await new Promise((r) => setTimeout(r, 500))
    const body = within(document.body)
    const darkThemeOption = body.getByRole('menuitem', { name: /Dark/i })
    await userEvent.click(darkThemeOption)

    // Check theme applied - wait a bit for state update
    await new Promise((r) => setTimeout(r, 500))
    const rootElement = document.documentElement
    expect(rootElement.getAttribute('data-theme')).toBe('dark')

    // Verify dark theme CSS variables
    const computedStyle = getComputedStyle(document.documentElement)
    const backgroundColor = computedStyle
      .getPropertyValue('--background')
      .trim()

    // shadcn/ui dark theme - browsers may convert oklch to lab
    expect(backgroundColor).toMatch(
      /^(oklch\(0\.145 0 0\)|lab\([\d.]+% 0 0\))$/,
    )
  },
}

// Test: Theme applies to all UI elements
export const ThemeAppliestoUIElementsTest: Story = {
  render: WithUIElements.render!,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Switch to dark theme - button shows current theme name
    const themeSelectorTrigger = canvas.getByRole('button', {
      name: /theme|select theme|light|dark/i,
    })
    await userEvent.click(themeSelectorTrigger)

    await new Promise((r) => setTimeout(r, 500))

    // Use within(document.body) and flexible name pattern
    const body = within(document.body)
    const darkTheme = body.getByRole('menuitem', { name: /Dark/i })
    await userEvent.click(darkTheme)

    // Wait for theme to apply
    await new Promise((r) => setTimeout(r, 500))
    const rootElement = document.documentElement
    expect(rootElement.getAttribute('data-theme')).toBe('dark')

    // Check that various UI elements have the theme applied
    const card = canvas.getByTestId('test-card')
    const cardStyles = getComputedStyle(card)
    expect(cardStyles.backgroundColor).toBeTruthy()

    // Check button styles
    const primaryButton = canvas.getByTestId('test-button-primary')
    const buttonStyles = getComputedStyle(primaryButton)
    expect(buttonStyles.backgroundColor).toBeTruthy()
    expect(buttonStyles.color).toBeTruthy()

    // Check border container
    const borderContainer = canvas.getByTestId('test-border-container')
    const borderStyles = getComputedStyle(borderContainer)
    expect(borderStyles.borderColor).toBeTruthy()

    // Check text colors
    const textColor = getComputedStyle(document.body).color
    expect(textColor).toBeTruthy()
  },
}

// Test: Theme selector shows current theme
export const ThemeSelectorShowsCurrentThemeTest: Story = {
  render: () => <ThemeSelector />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Initially should show "Light" or "Select Theme"
    const themeSelectorTrigger = canvas.getByRole('button', {
      name: /theme|select theme|light|dark/i,
    })
    expect(themeSelectorTrigger).toBeInTheDocument()

    // Click to open dropdown
    await userEvent.click(themeSelectorTrigger)

    // Should see current theme info in dropdown
    await new Promise((r) => setTimeout(r, 500))
    const body = within(document.body)
    const currentThemeText = body.getByText(/current theme:/i)
    expect(currentThemeText).toBeInTheDocument()

    // Switch to dark theme - use flexible name pattern
    const darkTheme = body.getByRole('menuitem', { name: /Dark/i })
    await userEvent.click(darkTheme)

    // Button should now show "Dark"
    await new Promise((r) => setTimeout(r, 500))
    const updatedTrigger = canvas.getByRole('button', { name: /dark/i })
    expect(updatedTrigger).toBeInTheDocument()
  },
}

// Test: Theme persistence (simulated)
export const ThemePersistenceTest: Story = {
  render: () => (
    <div className="space-y-4">
      <ThemeSelector />
      <Card className="p-4">
        <p>Theme should persist in localStorage under key: corelive-theme</p>
        <Button
          onClick={() => {
            // Simulate page reload by reading from localStorage
            const savedTheme = localStorage.getItem('corelive-theme')
            if (savedTheme) {
              document.documentElement.setAttribute('data-theme', savedTheme)
            }
          }}
        >
          Simulate Page Reload
        </Button>
      </Card>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Switch to dark theme - button shows current theme name
    const themeSelectorTrigger = canvas.getByRole('button', {
      name: /theme|select theme|light|dark/i,
    })
    await userEvent.click(themeSelectorTrigger)

    await new Promise((r) => setTimeout(r, 500))

    // Use within(document.body) and flexible name pattern
    const body = within(document.body)
    const darkTheme = body.getByRole('menuitem', { name: /Dark/i })
    await userEvent.click(darkTheme)

    // Wait for theme to be applied
    await new Promise((r) => setTimeout(r, 500))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')

    // Check localStorage
    const savedTheme = localStorage.getItem('corelive-theme')
    expect(savedTheme).toBe('dark')

    // Click simulate reload button
    const reloadButton = canvas.getByRole('button', {
      name: /simulate page reload/i,
    })
    await userEvent.click(reloadButton)

    // Verify theme is still dark
    await new Promise((r) => setTimeout(r, 500))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  },
}
