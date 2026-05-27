import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BrainDumpSettings } from './BrainDumpSettings'

const getSyncModeMock = vi.fn()
const setSyncModeMock = vi.fn()
const getOpacityMock = vi.fn()
const setOpacityMock = vi.fn()
const getShortcutMock = vi.fn()
const setShortcutMock = vi.fn()
const toggleMock = vi.fn()

type BrainDumpBridge = {
  getSyncMode: () => Promise<boolean>
  setSyncMode: (enabled: boolean) => Promise<boolean>
  getOpacity: () => Promise<number>
  setOpacity: (value: number) => Promise<number>
  getShortcut: () => Promise<string>
  setShortcut: (accelerator: string) => Promise<boolean>
  toggle: () => Promise<void>
}

/**
 * Defines the preload bridge shape the Settings card expects during renderer tests.
 *
 * @param api - Fake Electron preload API, or undefined for a web renderer.
 * @returns Nothing; mutates the happy-dom window object for this test.
 * @example
 * installElectronAPI({ brainDump: fakeBridge })
 */
function installElectronAPI(
  api: { brainDump?: BrainDumpBridge } | undefined,
): void {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    writable: true,
    value: api,
  })
}

/**
 * Installs a successful BrainDump preload bridge so loading can advance to ready state.
 *
 * @param saved - Persisted settings returned by the main process mocks.
 * @returns Nothing; prepares all BrainDump mocks for a component render.
 * @example
 * installBrainDumpBridge({ syncMode: false, opacity: 0.7, shortcut: 'CommandOrControl+Shift+B' })
 */
function installBrainDumpBridge(saved: {
  syncMode: boolean
  opacity: number
  shortcut: string
}): void {
  getSyncModeMock.mockResolvedValue(saved.syncMode)
  setSyncModeMock.mockResolvedValue(true)
  getOpacityMock.mockResolvedValue(saved.opacity)
  setOpacityMock.mockResolvedValue(saved.opacity)
  getShortcutMock.mockResolvedValue(saved.shortcut)
  setShortcutMock.mockResolvedValue(true)
  toggleMock.mockResolvedValue(undefined)

  installElectronAPI({
    brainDump: {
      getSyncMode: getSyncModeMock,
      setSyncMode: setSyncModeMock,
      getOpacity: getOpacityMock,
      setOpacity: setOpacityMock,
      getShortcut: getShortcutMock,
      setShortcut: setShortcutMock,
      toggle: toggleMock,
    },
  })
}

describe('BrainDumpSettings', () => {
  beforeEach(() => {
    getSyncModeMock.mockReset()
    setSyncModeMock.mockReset()
    getOpacityMock.mockReset()
    setOpacityMock.mockReset()
    getShortcutMock.mockReset()
    setShortcutMock.mockReset()
    toggleMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows saved BrainDump settings after loading without changing hook order', async () => {
    // Arrange: the preload bridge resolves and flips the card from loading to ready.
    installBrainDumpBridge({
      syncMode: false,
      opacity: 0.7,
      shortcut: 'CommandOrControl+Shift+B',
    })
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    // Act
    render(<BrainDumpSettings />)

    // Assert: the ready UI renders; the old conditional useMemo crash would abort here.
    expect(await screen.findByText('Window opacity')).toBeInTheDocument()
    expect(screen.getByText('70%')).toBeInTheDocument()
    expect(
      screen.getByDisplayValue('CommandOrControl+Shift+B'),
    ).toBeInTheDocument()
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining(
        'React has detected a change in the order of Hooks',
      ),
    )
  })
})
