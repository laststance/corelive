import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import { ChartContainer, type ChartConfig } from './chart'

describe('ChartStyle dark color scoping', () => {
  it('scopes chart dark colors to the data-theme attribute, not a dead .dark class', () => {
    // Arrange — a config supplying distinct light/dark colors via the theme form
    const config: ChartConfig = {
      visits: { label: 'Visits', theme: { light: '#111111', dark: '#eeeeee' } },
    }

    // Act — ChartStyle emits a <style> with the scoped CSS vars
    const { container } = render(
      <ChartContainer config={config}>
        <div />
      </ChartContainer>,
    )
    const css = container.querySelector('style')?.innerHTML ?? ''

    // Assert — dark vars scope to the live data-theme selector, never the dead `.dark`
    expect(css).toContain("[data-theme$='dark'] [data-chart=")
    expect(css).toContain('#eeeeee')
    expect(css).not.toContain('.dark [data-chart')
  })

  it('emits the light chart colors unscoped so :root themes pick them up', () => {
    // Arrange
    const config: ChartConfig = {
      visits: { label: 'Visits', theme: { light: '#111111', dark: '#eeeeee' } },
    }

    // Act
    const { container } = render(
      <ChartContainer config={config}>
        <div />
      </ChartContainer>,
    )
    const css = container.querySelector('style')?.innerHTML ?? ''

    // Assert — the light row carries no data-theme prefix
    expect(css).toContain('#111111')
    expect(css).toMatch(/(?:^|\n)\s*\[data-chart=/)
  })

  it('emits a color-form item identically in light and dark so a single color follows neither axis', () => {
    // Arrange — the color-only shape (no light/dark split), which is what the
    // live Storybook consumer uses; the emitter still walks both theme modes
    const config: ChartConfig = {
      visits: { label: 'Visits', color: '#abcdef' },
    }

    // Act
    const { container } = render(
      <ChartContainer config={config}>
        <div />
      </ChartContainer>,
    )
    const css = container.querySelector('style')?.innerHTML ?? ''

    // Assert — the one color lands in BOTH rows: the unscoped light row and the
    // dark-scoped row (the theme?.[mode] || color fallback feeds both modes)
    const occurrences = css.split('--color-visits: #abcdef').length - 1
    expect(occurrences).toBe(2)
    expect(css).toContain("[data-theme$='dark'] [data-chart=")
  })

  it('emits no style element when no series defines a color or theme', () => {
    // Arrange — a label-only config has nothing to colorize
    const config: ChartConfig = {
      visits: { label: 'Visits' },
    }

    // Act
    const { container } = render(
      <ChartContainer config={config}>
        <div />
      </ChartContainer>,
    )

    // Assert — ChartStyle short-circuits on the empty color set, injecting no <style>
    expect(container.querySelector('style')).toBeNull()
  })
})
