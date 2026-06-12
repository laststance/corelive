import { describe, expect, it } from 'vitest'

import type { UpdaterDownloadProgress } from '../types/ipc'
import {
  buildUpdateProgressWindowHtml,
  buildUpdateProgressWindowUpdateScript,
} from '../update-progress-window-html'

const halfwayProgress: UpdaterDownloadProgress = {
  percent: 42,
  bytesPerSecond: 1024,
  transferred: 42,
  total: 100,
}

describe('update progress window markup', () => {
  it('renders accessible progressbar markup with the initial percent', () => {
    // Arrange + Act
    const html = buildUpdateProgressWindowHtml(halfwayProgress)

    // Assert
    expect(html).toContain('role="progressbar"')
    expect(html).toContain('aria-label="Update download progress"')
    expect(html).toContain('aria-valuenow="42"')
    expect(html).toContain('42%')
  })

  it('renders a complete standalone document without external assets', () => {
    // Arrange + Act
    const html = buildUpdateProgressWindowHtml(halfwayProgress)

    // Assert
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('</html>')
    expect(html).not.toMatch(/rel=["']stylesheet/)
    expect(html).not.toContain('fonts.googleapis.com')
  })

  it('stays click-through so the native progress window never blocks work', () => {
    // Arrange + Act
    const html = buildUpdateProgressWindowHtml(halfwayProgress)

    // Assert
    expect(html).toContain('pointer-events: none')
    expect(html).toContain('user-select: none')
  })

  it('honors reduced motion for progress updates', () => {
    // Arrange + Act
    const html = buildUpdateProgressWindowHtml(halfwayProgress)

    // Assert
    expect(html).toContain('@media (prefers-reduced-motion: reduce)')
    expect(html).toContain('transition: none')
  })

  it('builds a tiny update script for an already-loaded window', () => {
    // Arrange + Act
    const script = buildUpdateProgressWindowUpdateScript(halfwayProgress)

    // Assert
    expect(script).toBe('window.__coreliveSetUpdateProgress?.(42)')
  })
})
