/**
 * @fileoverview Today Ember pins. If these fail, the stranger's first keep does
 * not visibly light the cell, an undo animates backwards or leaves the cell lit,
 * a lost connection is shown as "0 kept" (a lie), or the ember stops being
 * announced to screen readers.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TodayEmber } from './TodayEmber'

/**
 * Reads the decorative cell and its layers.
 * @returns The cell plus whether it is lit, the settled layer, and the sweep layer's key.
 * @example
 * readCell() // => { lit: 'true', settled: true, sweepKey: '1' }
 */
function readCell() {
  const cell = screen.getByRole('status').querySelector('[data-lit]')
  return {
    lit: cell?.getAttribute('data-lit'),
    settled: Boolean(cell?.querySelector('[data-ember-lit]')),
    sweepKey:
      cell
        ?.querySelector('[data-ember-sweep]')
        ?.getAttribute('data-ember-sweep') ?? null,
  }
}

describe('TodayEmber copy — one honest line per state', () => {
  it('shows only the resolving word before the source can answer, never a made-up 0', () => {
    // Arrange / Act
    render(<TodayEmber count={undefined} />)

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent('Today')
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText('Nothing kept yet today')).not.toBeInTheDocument()
    expect(readCell().lit).toBe('false')
  })

  it("says the keeps cannot be reached instead of showing 0 when the account's fetch failed", () => {
    // Arrange / Act
    render(<TodayEmber count={null} />)

    // Assert
    expect(
      screen.getByText("Can't reach your keeps right now"),
    ).toBeInTheDocument()
    expect(screen.queryByText('Your day starts here.')).not.toBeInTheDocument()
    expect(readCell().lit).toBe('false')
  })

  it('stays unlit at zero with the gentle starting line', () => {
    // Arrange / Act
    render(<TodayEmber count={0} />)

    // Assert
    expect(screen.getByText('Nothing kept yet today')).toBeInTheDocument()
    expect(screen.getByText('Your day starts here.')).toBeInTheDocument()
    expect(readCell().lit).toBe('false')
  })

  it('lights for one keep and counts in the singular', () => {
    // Arrange / Act
    render(<TodayEmber count={1} />)

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent('1 thing kept today')
    expect(
      screen.getByText("Finished lines gather here. They don't disappear."),
    ).toBeInTheDocument()
    expect(readCell().lit).toBe('true')
  })

  it('counts in the plural and keeps the numeral in tabular figures', () => {
    // Arrange / Act
    render(<TodayEmber count={12} />)

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent('12 things kept today')
    expect(screen.getByText('12')).toHaveClass('tabular-nums')
  })

  it('compact (Electron panel) keeps the headline only', () => {
    // Arrange / Act
    render(<TodayEmber count={2} compact />)

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent('2 things kept today')
    expect(
      screen.queryByText("Finished lines gather here. They don't disappear."),
    ).not.toBeInTheDocument()
  })
})

describe('TodayEmber motion — sweep on a keep, snap on an undo', () => {
  it('lights with a fresh sweep on the first keep and re-sweeps on the next one over a settled lit layer', () => {
    // Arrange — a visitor with nothing kept yet.
    const { rerender } = render(<TodayEmber count={0} />)
    expect(readCell()).toEqual({ lit: 'false', settled: false, sweepKey: null })

    // Act — first keep
    rerender(<TodayEmber count={1} />)

    // Assert — the sweep reveals the lit cell over the unlit base.
    expect(readCell()).toEqual({ lit: 'true', settled: false, sweepKey: '1' })

    // Act — second keep
    rerender(<TodayEmber count={2} />)

    // Assert — a new sweep runs, but the cell stays lit underneath (no flash).
    expect(readCell()).toEqual({ lit: 'true', settled: true, sweepKey: '2' })
  })

  it('snaps back to unlit on undo with no reverse animation', () => {
    // Arrange — one keep, already swept.
    const { rerender } = render(<TodayEmber count={0} />)
    rerender(<TodayEmber count={1} />)

    // Act — undo
    rerender(<TodayEmber count={0} />)

    // Assert
    expect(readCell()).toEqual({ lit: 'false', settled: false, sweepKey: null })
    expect(screen.getByText('Nothing kept yet today')).toBeInTheDocument()
  })

  it('does not sweep when it mounts already lit (a returning visitor)', () => {
    // Arrange / Act
    render(<TodayEmber count={3} />)

    // Assert — lit and still, nothing to celebrate that already happened.
    expect(readCell()).toEqual({ lit: 'true', settled: true, sweepKey: null })
  })

  it('does not sweep when the count merely resolves (undefined → 3)', () => {
    // Arrange
    const { rerender } = render(<TodayEmber count={undefined} />)

    // Act
    rerender(<TodayEmber count={3} />)

    // Assert
    expect(readCell()).toEqual({ lit: 'true', settled: true, sweepKey: null })
  })
})

describe('TodayEmber accessibility', () => {
  it('is a polite live region whose cell is decorative', () => {
    // Arrange / Act
    render(<TodayEmber count={1} />)

    // Assert
    const region = screen.getByRole('status')
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region.querySelector('[data-lit]')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  })
})
