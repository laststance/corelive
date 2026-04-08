import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import '../styles.css'

const tokens = [
  { name: '--st-bg-deep', label: 'Background Deep' },
  { name: '--st-bg-mid', label: 'Background Mid' },
  { name: '--st-surface', label: 'Surface' },
  { name: '--st-gold', label: 'Gold' },
  { name: '--st-cream', label: 'Cream' },
  { name: '--st-arcane', label: 'Arcane' },
  { name: '--st-muted', label: 'Muted' },
  { name: '--st-border-rune', label: 'Border Rune' },
] as const

function Palette() {
  return (
    <div
      data-skill-tree="true"
      className="st-canvas-bg grid grid-cols-2 gap-4 p-8"
    >
      {tokens.map((t) => (
        <div
          key={t.name}
          className="flex items-center gap-3 rounded-lg border p-3"
          style={{ borderColor: 'var(--st-border-rune)' }}
        >
          <div
            className="h-14 w-14 rounded border"
            style={{
              background: `var(${t.name})`,
              borderColor: 'var(--st-border-rune)',
            }}
          />
          <div className="flex-1">
            <div
              className="text-sm font-medium"
              style={{ color: 'var(--st-cream)' }}
            >
              {t.label}
            </div>
            <div
              className="font-mono text-xs"
              style={{ color: 'var(--st-muted)' }}
            >
              {t.name}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

const meta: Meta<typeof Palette> = {
  title: 'Skill Tree/Dark Fantasy Palette',
  component: Palette,
}

export default meta
type Story = StoryObj<typeof Palette>

export const DarkTheme: Story = {
  decorators: [
    (Story) => (
      <div data-theme="dark">
        <Story />
      </div>
    ),
  ],
}

export const LightTheme: Story = {
  decorators: [
    (Story) => (
      <div data-theme="light">
        <Story />
      </div>
    ),
  ],
}
