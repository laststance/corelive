import type { Tray } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'

// SystemTrayManager imports { app, Menu, nativeImage, Notification, Tray } from
// 'electron' at module load, so stub the module to let it import under Vitest.
// setMenuBarVisible is verified by spying on its collaborators (createTray,
// destroy, isSystemTraySupported), so these electron stubs are never exercised.
vi.mock('electron', () => ({
  app: { on: vi.fn() },
  Menu: { buildFromTemplate: vi.fn(() => ({})) },
  nativeImage: {
    createFromPath: vi.fn(),
    createEmpty: vi.fn(),
    createFromBuffer: vi.fn(),
  },
  Notification: vi.fn(),
  Tray: vi.fn(),
}))

vi.mock('../logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// Imported after the mocks so its `import { ... } from 'electron'` is stubbed.
import { SystemTrayManager } from '../SystemTrayManager'
import type { WindowManager } from '../WindowManager'

// A minimal stand-in Tray. hasTray() reads `this.tray !== null && !isDestroyed()`,
// so the stub needs a never-destroyed isDestroyed(); nothing touches the icon.
const fakeTray = { isDestroyed: () => false } as unknown as Tray

/**
 * Build a SystemTrayManager over a stub WindowManager exposing a spyable
 * setTrayFallbackMode, so a test can assert that toggling the menu bar keeps the
 * window-close routing flag in sync (the tray-vs-minimize decision).
 *
 * @returns The manager (tray starts null) plus the setTrayFallbackMode spy.
 * @example
 * const { manager, setTrayFallbackMode } = createManager()
 */
function createManager(): {
  manager: SystemTrayManager
  setTrayFallbackMode: ReturnType<typeof vi.fn>
} {
  const setTrayFallbackMode = vi.fn()
  const stubWindowManager = {
    setTrayFallbackMode,
  } as unknown as WindowManager
  return {
    manager: new SystemTrayManager(stubWindowManager),
    setTrayFallbackMode,
  }
}

/**
 * Mirror createTray's real side effect — assigning the private `tray` — so the
 * `if (this.tray)` idempotency guard sees a live tray on a later call, without
 * standing up the full nativeImage/Tray/Menu stack. The cast reaches the exact
 * private precondition under test and changes no production code.
 *
 * @param manager - The manager to mark as already showing a tray.
 */
function primeExistingTray(manager: SystemTrayManager): void {
  ;(manager as unknown as { tray: Tray | null }).tray = fakeTray
}

describe('SystemTrayManager.setMenuBarVisible (Show in Menu Bar toggle)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('hides the menu bar by tearing down the existing tray', async () => {
    // Arrange: a tray is already on screen, so this exercises the real
    // tear-down path rather than a no-op hide over an absent tray.
    const { manager, setTrayFallbackMode } = createManager()
    primeExistingTray(manager)
    const destroySpy = vi.spyOn(manager, 'destroy').mockImplementation(() => {})
    const createSpy = vi.spyOn(manager, 'createTray')

    // Act
    const didApply = await manager.setMenuBarVisible(false)

    // Assert: the tray is torn down, no new tray is created, fallback mode is
    // armed so window-close minimizes (never .hide() into a gone tray), and the
    // caller hears success so the UI can persist the "hidden" choice.
    expect(destroySpy).toHaveBeenCalledTimes(1)
    expect(createSpy).not.toHaveBeenCalled()
    expect(setTrayFallbackMode).toHaveBeenCalledWith(true)
    expect(didApply).toBe(true)
  })

  it('shows the menu bar by creating a tray when none exists', async () => {
    // Arrange
    const { manager, setTrayFallbackMode } = createManager()
    vi.spyOn(manager, 'isSystemTraySupported').mockReturnValue(true)
    const createSpy = vi
      .spyOn(manager, 'createTray')
      .mockResolvedValue(fakeTray)

    // Act
    const didApply = await manager.setMenuBarVisible(true)

    // Assert: a tray is created and fallback mode is cleared so window-close
    // hides to the tray again instead of minimizing.
    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(setTrayFallbackMode).toHaveBeenCalledWith(false)
    expect(didApply).toBe(true)
  })

  it('never leaks a second tray icon when shown while already visible', async () => {
    // Arrange: a tray is already on screen (createTray previously set it).
    const { manager } = createManager()
    vi.spyOn(manager, 'isSystemTraySupported').mockReturnValue(true)
    const createSpy = vi
      .spyOn(manager, 'createTray')
      .mockResolvedValue(fakeTray)
    primeExistingTray(manager)

    // Act
    const didApply = await manager.setMenuBarVisible(true)

    // Assert: the existing tray is kept; the non-idempotent createTray is skipped.
    expect(createSpy).not.toHaveBeenCalled()
    expect(didApply).toBe(true)
  })

  it('treats showing on a platform without tray support as a successful no-op', async () => {
    // Arrange
    const { manager } = createManager()
    vi.spyOn(manager, 'isSystemTraySupported').mockReturnValue(false)
    const createSpy = vi.spyOn(manager, 'createTray')

    // Act
    const didApply = await manager.setMenuBarVisible(true)

    // Assert: mirrors setHideAppIcon — a non-darwin platform reports success
    // without acting, so the toggle never appears broken there.
    expect(createSpy).not.toHaveBeenCalled()
    expect(didApply).toBe(true)
  })

  it('reports failure when the tray cannot be created', async () => {
    // Arrange: createTray fails (e.g. icon load failure) and returns null.
    const { manager } = createManager()
    vi.spyOn(manager, 'isSystemTraySupported').mockReturnValue(true)
    vi.spyOn(manager, 'createTray').mockResolvedValue(null)

    // Act
    const didApply = await manager.setMenuBarVisible(true)

    // Assert: the UI must NOT persist "shown" when no tray actually appeared.
    expect(didApply).toBe(false)
  })

  it('createTray() keeps the existing tray instead of leaking a second one', async () => {
    // Arrange: a tray is already on screen. createTray() is reached from BOTH
    // boot (SystemIntegrationErrorHandler) and the live toggle / startup sync,
    // and those paths can interleave — a second build would overwrite this.tray
    // and orphan the first native Tray (a leaked menu-bar icon).
    const { manager } = createManager()
    primeExistingTray(manager)
    const supportedSpy = vi.spyOn(manager, 'isSystemTraySupported')

    // Act
    const result = await manager.createTray()

    // Assert: the live tray is returned and the whole build path is skipped
    // (the idempotency guard short-circuits before the platform check).
    expect(result).toBe(fakeTray)
    expect(supportedSpy).not.toHaveBeenCalled()
  })
})
