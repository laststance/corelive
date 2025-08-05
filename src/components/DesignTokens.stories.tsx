import type { Meta, StoryObj } from '@storybook/react'

const meta: Meta = {
  title: 'CoreLive Design System/Design Tokens',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Complete showcase of all CoreLive Design System tokens including colors, spacing, typography, and more.',
      },
    },
  },
}

export default meta
type Story = StoryObj

// Color palette component
const ColorPalette = ({
  title,
  colors,
}: {
  title: string
  colors: Array<{ name: string; value: string; description?: string }>
}) => (
  <div className="mb-8">
    <h3 className="text-heading-2 mb-4 font-semibold">{title}</h3>
    <div className="grid grid-cols-5 gap-4">
      {colors.map((color) => (
        <div key={color.name} className="text-center">
          <div
            className="border-border-default mb-2 h-16 w-full rounded-lg border"
            style={{ backgroundColor: `var(${color.value})` }}
          />
          <div className="text-sm font-medium">{color.name}</div>
          <div className="text-muted-foreground font-mono text-xs">
            {color.value}
          </div>
          {color.description && (
            <div className="text-muted-foreground mt-1 text-xs">
              {color.description}
            </div>
          )}
        </div>
      ))}
    </div>
  </div>
)

// Spacing showcase component
const SpacingShowcase = () => (
  <div className="mb-8">
    <h3 className="text-heading-2 mb-4 font-semibold">Spacing Scale</h3>
    <div className="space-y-4">
      {[
        { name: 'xs', value: '--system-space-component-xs', size: '4px' },
        { name: 'sm', value: '--system-space-component-sm', size: '8px' },
        { name: 'md', value: '--system-space-component-md', size: '16px' },
        { name: 'lg', value: '--system-space-component-lg', size: '32px' },
        { name: 'xl', value: '--system-space-component-xl', size: '48px' },
      ].map((spacing) => (
        <div key={spacing.name} className="flex items-center space-x-4">
          <div className="w-16 text-sm font-medium">{spacing.name}</div>
          <div
            className="bg-primary h-4 rounded"
            style={{ width: `var(${spacing.value})` }}
          />
          <div className="text-muted-foreground font-mono text-sm">
            {spacing.value}
          </div>
          <div className="text-muted-foreground text-sm">({spacing.size})</div>
        </div>
      ))}
    </div>
  </div>
)

// Typography showcase component
const TypographyShowcase = () => (
  <div className="mb-8">
    <h3 className="text-heading-2 mb-4 font-semibold">Typography Scale</h3>
    <div className="space-y-4">
      <div>
        <div className="text-display-1 mb-2">Display 1</div>
        <div className="text-muted-foreground font-mono text-sm">
          --system-typography-display-1
        </div>
      </div>
      <div>
        <div className="text-display-2 mb-2">Display 2</div>
        <div className="text-muted-foreground font-mono text-sm">
          --system-typography-display-2
        </div>
      </div>
      <div>
        <div className="text-heading-1 mb-2">Heading 1</div>
        <div className="text-muted-foreground font-mono text-sm">
          --system-typography-heading-1
        </div>
      </div>
      <div>
        <div className="text-heading-2 mb-2">Heading 2</div>
        <div className="text-muted-foreground font-mono text-sm">
          --system-typography-heading-2
        </div>
      </div>
      <div>
        <div className="text-heading-3 mb-2">Heading 3</div>
        <div className="text-muted-foreground font-mono text-sm">
          --system-typography-heading-3
        </div>
      </div>
      <div>
        <div className="text-body-1 mb-2">
          Body 1 - The quick brown fox jumps over the lazy dog
        </div>
        <div className="text-muted-foreground font-mono text-sm">
          --system-typography-body-1
        </div>
      </div>
      <div>
        <div className="text-body-2 mb-2">
          Body 2 - The quick brown fox jumps over the lazy dog
        </div>
        <div className="text-muted-foreground font-mono text-sm">
          --system-typography-body-2
        </div>
      </div>
      <div>
        <div className="text-caption mb-2">
          Caption - The quick brown fox jumps over the lazy dog
        </div>
        <div className="text-muted-foreground font-mono text-sm">
          --system-typography-caption
        </div>
      </div>
    </div>
  </div>
)

// Shadow showcase component
const ShadowShowcase = () => (
  <div className="mb-8">
    <h3 className="text-heading-2 mb-4 font-semibold">Shadow Scale</h3>
    <div className="grid grid-cols-3 gap-6">
      {[
        {
          name: 'Flat',
          value: '--system-elevation-flat',
          description: 'No elevation',
        },
        {
          name: 'Raised',
          value: '--system-elevation-raised',
          description: 'Subtle elevation',
        },
        {
          name: 'Floating',
          value: '--system-elevation-floating',
          description: 'Cards, buttons',
        },
        {
          name: 'Overlay',
          value: '--system-elevation-overlay',
          description: 'Dropdowns, tooltips',
        },
        {
          name: 'Modal',
          value: '--system-elevation-modal',
          description: 'Modals, dialogs',
        },
        {
          name: 'Popover',
          value: '--system-elevation-popover',
          description: 'Popovers, menus',
        },
      ].map((shadow) => (
        <div key={shadow.name} className="text-center">
          <div
            className="bg-surface-default mb-3 flex h-24 w-full items-center justify-center rounded-lg"
            style={{ boxShadow: `var(${shadow.value})` }}
          >
            <span className="text-sm font-medium">{shadow.name}</span>
          </div>
          <div className="text-sm font-medium">{shadow.name}</div>
          <div className="text-muted-foreground font-mono text-xs">
            {shadow.value}
          </div>
          <div className="text-muted-foreground text-xs">
            {shadow.description}
          </div>
        </div>
      ))}
    </div>
  </div>
)

export const AllTokens: Story = {
  args: {},
  render: () => (
    <div className="space-y-12 p-8">
      <div>
        <h1 className="text-display-2 mb-2 font-bold">
          CoreLive Design Tokens
        </h1>
        <p className="text-body-1 text-muted-foreground mb-8">
          Complete showcase of all design tokens available in the CoreLive
          Design System.
        </p>
      </div>

      {/* Brand Colors */}
      <ColorPalette
        title="Brand Colors"
        colors={[
          {
            name: 'Primary',
            value: '--system-color-primary',
            description: 'Main brand color',
          },
          {
            name: 'Primary Container',
            value: '--system-color-primary-container',
            description: 'Light backgrounds',
          },
          {
            name: 'On Primary',
            value: '--system-color-primary-on',
            description: 'Text on primary',
          },
          {
            name: 'Secondary',
            value: '--system-color-secondary',
            description: 'Secondary brand',
          },
          {
            name: 'Accent',
            value: '--system-color-accent',
            description: 'Accent highlights',
          },
        ]}
      />

      {/* Semantic Colors */}
      <ColorPalette
        title="Semantic Colors"
        colors={[
          {
            name: 'Success',
            value: '--system-color-success',
            description: 'Success states',
          },
          {
            name: 'Warning',
            value: '--system-color-warning',
            description: 'Warning states',
          },
          {
            name: 'Danger',
            value: '--system-color-danger',
            description: 'Error states',
          },
          {
            name: 'Info',
            value: '--system-color-info',
            description: 'Information',
          },
          {
            name: 'Discovery',
            value: '--system-color-discovery',
            description: 'New features',
          },
        ]}
      />

      {/* Primitive Color Scale Example */}
      <ColorPalette
        title="Brand Color Scale (Example)"
        colors={[
          { name: '50', value: '--primitive-color-brand-50' },
          { name: '100', value: '--primitive-color-brand-100' },
          { name: '200', value: '--primitive-color-brand-200' },
          { name: '300', value: '--primitive-color-brand-300' },
          { name: '400', value: '--primitive-color-brand-400' },
          { name: '500', value: '--primitive-color-brand-500' },
          { name: '600', value: '--primitive-color-brand-600' },
          { name: '700', value: '--primitive-color-brand-700' },
          { name: '800', value: '--primitive-color-brand-800' },
          { name: '900', value: '--primitive-color-brand-900' },
        ]}
      />

      <SpacingShowcase />
      <TypographyShowcase />
      <ShadowShowcase />

      {/* Border Radius */}
      <div className="mb-8">
        <h3 className="text-heading-2 mb-4 font-semibold">Border Radius</h3>
        <div className="grid grid-cols-4 gap-4">
          {[
            { name: 'XS', value: '--primitive-radius-xs' },
            { name: 'SM', value: '--primitive-radius-sm' },
            { name: 'MD', value: '--primitive-radius-md' },
            { name: 'LG', value: '--primitive-radius-lg' },
            { name: 'XL', value: '--primitive-radius-xl' },
            { name: '2XL', value: '--primitive-radius-2xl' },
            { name: '3XL', value: '--primitive-radius-3xl' },
            { name: 'Full', value: '--primitive-radius-full' },
          ].map((radius) => (
            <div key={radius.name} className="text-center">
              <div
                className="bg-primary mb-2 h-16 w-full"
                style={{ borderRadius: `var(${radius.value})` }}
              />
              <div className="text-sm font-medium">{radius.name}</div>
              <div className="text-muted-foreground font-mono text-xs">
                {radius.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Component Tokens Example */}
      <div className="mb-8">
        <h3 className="text-heading-2 mb-4 font-semibold">
          Component Token Examples
        </h3>
        <div className="space-y-6">
          {/* Button Examples */}
          <div>
            <h4 className="text-heading-3 mb-3 font-medium">Button Tokens</h4>
            <div className="flex space-x-4">
              <button className="btn-primary">Primary Button</button>
              <button
                className="rounded-md border px-4 py-2 transition-all duration-150"
                style={{
                  backgroundColor:
                    'var(--component-button-secondary-background)',
                  color: 'var(--component-button-secondary-text)',
                  borderColor: 'var(--component-button-secondary-border)',
                }}
              >
                Secondary Button
              </button>
            </div>
          </div>

          {/* Card Example */}
          <div>
            <h4 className="text-heading-3 mb-3 font-medium">Card Tokens</h4>
            <div className="card max-w-sm">
              <h5 className="text-heading-3 mb-2">Card Title</h5>
              <p className="text-body-2 text-muted-foreground">
                This card uses component tokens for consistent styling across
                the design system.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  ),
}

export const ColorSystem: Story = {
  args: {},
  render: () => (
    <div className="p-8">
      <h1 className="text-display-2 mb-8 font-bold">Color System</h1>

      <ColorPalette
        title="Brand Colors"
        colors={[
          { name: 'Primary', value: '--system-color-primary' },
          {
            name: 'Primary Container',
            value: '--system-color-primary-container',
          },
          { name: 'On Primary', value: '--system-color-primary-on' },
          { name: 'Primary Outline', value: '--system-color-primary-outline' },
          { name: 'Secondary', value: '--system-color-secondary' },
          { name: 'Accent', value: '--system-color-accent' },
        ]}
      />

      <ColorPalette
        title="Semantic Colors"
        colors={[
          { name: 'Success', value: '--system-color-success' },
          { name: 'Warning', value: '--system-color-warning' },
          { name: 'Danger', value: '--system-color-danger' },
          { name: 'Info', value: '--system-color-info' },
          { name: 'Discovery', value: '--system-color-discovery' },
        ]}
      />
    </div>
  ),
}

export const Spacing: Story = {
  args: {},
  render: () => (
    <div className="p-8">
      <h1 className="text-display-2 mb-8 font-bold">Spacing System</h1>
      <SpacingShowcase />
    </div>
  ),
}

export const Typography: Story = {
  args: {},
  render: () => (
    <div className="p-8">
      <h1 className="text-display-2 mb-8 font-bold">Typography System</h1>
      <TypographyShowcase />
    </div>
  ),
}

export const Elevation: Story = {
  args: {},
  render: () => (
    <div className="p-8">
      <h1 className="text-display-2 mb-8 font-bold">Elevation System</h1>
      <ShadowShowcase />
    </div>
  ),
}
