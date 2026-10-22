import type {
  OfflineSettingsAPI,
  OfflineSettingsContext,
  OfflineSettingsResult,
} from '@corelive/desktop-contract/offline-editor-api'
import { UserSettingsStateSchema } from '@corelive/desktop-contract/settings'
import { afterEach, expect, test, vi } from 'vitest'

import { OfflinePreferenceSync } from './offline-settings-sync'

const running: OfflinePreferenceSync[] = []

/** Uses the real preference coordinator with synthetic IPC and a hydrated store shape.
 * @example const fixture = createFixture()
 */
function createFixture(supportedKeys?: OfflineSettingsAPI['supportedKeys']) {
  let settings = UserSettingsStateSchema.parse({
    liveEditorFontFamily: 'sans',
    liveEditorFontSize: 18,
  })
  const preferences = {
    revision: 4,
    theme: 'dark',
    settings: UserSettingsStateSchema.parse({
      liveEditorFontFamily: 'serif',
      liveEditorFontSize: 22,
    }),
  }
  const read = vi.fn<OfflineSettingsAPI['read']>(async () => ({
    generation: 2,
    preferences,
  }))
  const prepare = vi.fn<OfflineSettingsAPI['prepare']>(async () => true)
  const patch = vi.fn<OfflineSettingsAPI['patch']>(async () => ({
    ok: true,
    generation: 2,
    preferences,
  }))
  const bridge: OfflineSettingsAPI = {
    version: 1,
    ...(supportedKeys ? { supportedKeys } : {}),
    read,
    prepare,
    patch,
    onChanged: () => () => undefined,
    onManageCategories: () => () => undefined,
    consumeCategoryRequest: async () => null,
    categoryCreated: async () => true,
    refreshCategories: async () => undefined,
  }
  const onError = vi.fn()
  const applyTheme = vi.fn()
  const sync = new OfflinePreferenceSync({
    accountId: 'account-a',
    bridge,
    settings: () => settings,
    applySettings: (next) => {
      settings = next
      sync.settingsChanged()
    },
    applyTheme,
    onError,
  })
  running.push(sync)
  return {
    sync,
    read,
    prepare,
    patch,
    onError,
    applyTheme,
    settings: () => settings,
    editStatus: (visible: boolean): void => {
      settings = { ...settings, liveEditorShowStatusBar: visible }
      sync.settingsChanged()
    },
    editSize: (size: number): void => {
      settings = { ...settings, liveEditorFontSize: size }
      sync.settingsChanged()
    },
  }
}

afterEach(() => {
  running.splice(0).forEach((sync) => sync.stop())
  vi.useRealTimers()
})

test('native preferences hydrate the remote Settings page without pushing its stale saved defaults back', async () => {
  // Arrange
  const fixture = createFixture()

  // Act
  fixture.sync.themeChanged('light')
  await vi.waitFor(() => expect(fixture.settings().liveEditorFontSize).toBe(22))
  fixture.sync.themeChanged('dark')

  // Assert
  expect(fixture.applyTheme).toHaveBeenCalledWith('dark')
  expect(fixture.patch).not.toHaveBeenCalled()
  expect(fixture.prepare).not.toHaveBeenCalled()
})

test('a user edit during the initial native read wins for that field while other native preferences remain', async () => {
  // Arrange
  const fixture = createFixture()
  let release!: (context: OfflineSettingsContext) => void
  fixture.read.mockImplementationOnce(
    async () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )

  // Act
  fixture.sync.themeChanged('light')
  fixture.editSize(26)
  release({
    generation: 2,
    preferences: {
      revision: 4,
      theme: 'dark',
      settings: UserSettingsStateSchema.parse({
        liveEditorFontFamily: 'serif',
        liveEditorFontSize: 22,
      }),
    },
  })
  await vi.waitFor(() => expect(fixture.patch).toHaveBeenCalledOnce())

  // Assert
  expect(fixture.settings()).toMatchObject({
    liveEditorFontFamily: 'serif',
    liveEditorFontSize: 26,
  })
  expect(fixture.patch).toHaveBeenCalledWith(
    'account-a',
    2,
    expect.objectContaining({
      expectedRevision: 4,
      patch: { liveEditorFontSize: 26 },
    }),
  )
})

test('first preparation transfers the fully hydrated saved settings after the theme is available', async () => {
  // Arrange
  const fixture = createFixture()
  fixture.read.mockResolvedValue({ generation: 2, preferences: null })

  // Act
  fixture.sync.themeChanged(undefined)
  fixture.sync.refresh()
  expect(fixture.read).not.toHaveBeenCalled()
  fixture.sync.themeChanged('dark')
  await vi.waitFor(() => expect(fixture.prepare).toHaveBeenCalledOnce())

  // Assert
  expect(fixture.prepare).toHaveBeenCalledWith(
    'account-a',
    2,
    expect.objectContaining({
      theme: 'dark',
      settings: expect.objectContaining({
        liveEditorFontFamily: 'sans',
        liveEditorFontSize: 18,
      }),
    }),
  )
})

test('an uncertain preference write reuses its identity and preserves an edit made while the reply was pending', async () => {
  // Arrange
  const fixture = createFixture()
  fixture.sync.themeChanged('light')
  await vi.waitFor(() => expect(fixture.settings().liveEditorFontSize).toBe(22))
  let reject!: (error: Error) => void
  fixture.patch.mockImplementationOnce(
    async () =>
      new Promise<OfflineSettingsResult>((_resolve, fail) => {
        reject = fail
      }),
  )

  // Act
  fixture.editSize(24)
  await vi.waitFor(() => expect(fixture.patch).toHaveBeenCalledOnce())
  fixture.editSize(28)
  reject(new Error('Lost reply'))
  await vi.waitFor(() => expect(fixture.onError).toHaveBeenCalledOnce())
  fixture.sync.refresh()
  await vi.waitFor(() => expect(fixture.patch).toHaveBeenCalledTimes(3))

  // Assert
  expect(fixture.patch.mock.calls[1]?.[2]).toEqual(
    fixture.patch.mock.calls[0]?.[2],
  )
  expect(fixture.patch.mock.calls[2]?.[2].patch).toEqual({
    liveEditorFontSize: 28,
  })
})

// Generated by /ship Step 7 coverage audit.
// Value: protects=leaving an account discards pending native preference reads before hydration or writes;
// fails_when=an old account response changes the next Settings page after its coordinator stops;
// why_new=existing preference tests keep the same coordinator active through every response;
// seam=none; no_claim=real Electron IPC or Clerk acceptance (synthetic bridge and hydrated store).
test('a native preference read resolving after account departure cannot hydrate or save the next Settings page', async () => {
  // Arrange
  const fixture = createFixture()
  let release!: (context: OfflineSettingsContext) => void
  fixture.read.mockImplementationOnce(
    async () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  fixture.sync.themeChanged('light')

  // Act
  fixture.sync.stop()
  release({
    generation: 2,
    preferences: {
      revision: 4,
      theme: 'dark',
      settings: UserSettingsStateSchema.parse({ liveEditorFontSize: 24 }),
    },
  })
  // A task boundary drains promise adoption and the coordinator's pending read continuation.
  await new Promise((resolve) => setTimeout(resolve, 0))
  fixture.sync.refresh()

  // Assert
  expect(fixture.settings().liveEditorFontSize).toBe(18)
  expect(fixture.applyTheme).not.toHaveBeenCalled()
  expect(fixture.patch).not.toHaveBeenCalled()
  expect(fixture.prepare).not.toHaveBeenCalled()
  expect(fixture.onError).not.toHaveBeenCalled()
  expect(fixture.read).toHaveBeenCalledOnce()
})

test('legacy native bridges omit unsupported status visibility from preparation and later edits', async () => {
  // Arrange
  const fixture = createFixture()
  fixture.read.mockResolvedValue({ generation: 2, preferences: null })

  // Act
  fixture.sync.themeChanged('light')
  await vi.waitFor(() => expect(fixture.prepare).toHaveBeenCalledOnce())
  fixture.editStatus(false)

  // Assert
  expect(fixture.prepare.mock.calls[0]?.[2].settings).not.toHaveProperty(
    'liveEditorShowStatusBar',
  )
  expect(fixture.patch).not.toHaveBeenCalled()
})

test('a supported status toggle uses the existing revisioned preference command', async () => {
  // Arrange
  const fixture = createFixture([
    'liveEditorShowStatusBar',
    'liveEditorFontSize',
  ])
  fixture.sync.themeChanged('light')
  await vi.waitFor(() => expect(fixture.settings().liveEditorFontSize).toBe(22))

  // Act
  fixture.editStatus(false)
  await vi.waitFor(() => expect(fixture.patch).toHaveBeenCalledOnce())

  // Assert
  expect(fixture.patch.mock.calls[0]?.[2]).toMatchObject({
    expectedRevision: 4,
    patch: { liveEditorShowStatusBar: false },
  })
  expect(fixture.sync.getSnapshot()).toMatchObject({
    status: 'saved',
    certainty: 'confirmed',
  })
})

test('preparation acceptance remains pending until a committed preference snapshot is observed', async () => {
  // Arrange
  vi.useFakeTimers()
  const fixture = createFixture()
  fixture.read.mockResolvedValue({ generation: 2, preferences: null })

  // Act
  fixture.sync.themeChanged('light')
  await vi.advanceTimersByTimeAsync(0)

  // Assert
  expect(fixture.prepare).toHaveBeenCalledOnce()
  expect(fixture.sync.getSnapshot()).toMatchObject({
    status: 'unknown',
    certainty: 'unconfirmed',
    reason: 'preparing',
  })
  await vi.advanceTimersByTimeAsync(6000)
  expect(fixture.sync.getSnapshot()).toMatchObject({
    terminal: true,
    attempt: 3,
  })
  expect(fixture.prepare).toHaveBeenCalledOnce()
  expect(fixture.patch).not.toHaveBeenCalled()
})

test('an unresolved native read reaches a finite terminal state without concurrent duplicate requests', async () => {
  // Arrange
  vi.useFakeTimers()
  const fixture = createFixture()
  fixture.read.mockImplementation(async () => new Promise(() => undefined))

  // Act
  fixture.sync.themeChanged('light')
  await vi.advanceTimersByTimeAsync(30_000)
  fixture.sync.retry()
  fixture.sync.retry()
  await vi.advanceTimersByTimeAsync(0)

  // Assert
  expect(fixture.read).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(30_000)
  expect(fixture.sync.getSnapshot()).toMatchObject({
    terminal: true,
    status: 'unknown',
  })
  expect(fixture.patch).not.toHaveBeenCalled()
})

test('leaving Settings pauses IPC and its deadline while retaining the latest unsent edit', async () => {
  // Arrange
  vi.useFakeTimers()
  const fixture = createFixture()
  fixture.sync.themeChanged('light')
  await vi.advanceTimersByTimeAsync(0)
  fixture.sync.setActive(false)

  // Act
  fixture.editSize(24)
  await vi.advanceTimersByTimeAsync(60_000)

  // Assert
  expect(fixture.patch).not.toHaveBeenCalled()
  expect(fixture.read).toHaveBeenCalledOnce()
  fixture.sync.setActive(true)
  await vi.advanceTimersByTimeAsync(0)
  expect(fixture.patch.mock.calls[0]?.[2].patch).toEqual({
    liveEditorFontSize: 24,
  })
  expect(fixture.sync.getSnapshot().status).toBe('saved')
})

test('a late write acknowledgement confirms the original command while preserving a newer edit', async () => {
  // Arrange
  vi.useFakeTimers()
  const fixture = createFixture()
  fixture.sync.themeChanged('light')
  await vi.advanceTimersByTimeAsync(0)
  let acknowledge!: (value: OfflineSettingsResult) => void
  fixture.patch.mockImplementationOnce(
    async () =>
      new Promise((resolve) => {
        acknowledge = resolve
      }),
  )
  fixture.editSize(24)
  await vi.advanceTimersByTimeAsync(0)
  const command = fixture.patch.mock.calls[0]?.[2]

  // Act
  await vi.advanceTimersByTimeAsync(10_000)
  fixture.editSize(20)
  acknowledge({
    ok: true,
    generation: 2,
    preferences: {
      revision: 5,
      theme: 'dark',
      settings: UserSettingsStateSchema.parse({ liveEditorFontSize: 24 }),
    },
  })
  await vi.advanceTimersByTimeAsync(0)

  // Assert
  expect(fixture.patch).toHaveBeenCalledTimes(2)
  expect(fixture.patch.mock.calls[0]?.[2]).toBe(command)
  expect(fixture.patch.mock.calls[1]?.[2].patch).toEqual({
    liveEditorFontSize: 20,
  })
  expect(fixture.settings().liveEditorFontSize).toBe(20)
})

test('native notifications cannot restart exhausted preparation or create a retry storm', async () => {
  // Arrange
  vi.useFakeTimers()
  const fixture = createFixture()
  fixture.read.mockResolvedValue(null)
  fixture.sync.themeChanged('light')
  await vi.advanceTimersByTimeAsync(6000)

  // Act
  for (let index = 0; index < 20; index += 1) fixture.sync.refresh()
  await vi.advanceTimersByTimeAsync(30_000)

  // Assert
  expect(fixture.read).toHaveBeenCalledTimes(3)
  expect(fixture.sync.getSnapshot()).toMatchObject({
    terminal: true,
    reason: 'unavailable',
  })
})

test('editing while restoring saved settings preserves and submits the newer value', async () => {
  // Arrange
  vi.useFakeTimers()
  const fixture = createFixture()
  fixture.sync.themeChanged('dark')
  await vi.advanceTimersByTimeAsync(0)
  fixture.patch.mockResolvedValue({ ok: false, reason: 'invalid-command' })
  fixture.editSize(24)
  await vi.advanceTimersByTimeAsync(6000)
  expect(fixture.sync.getSnapshot().canRestore).toBe(true)
  let release!: (context: OfflineSettingsContext) => void
  fixture.read.mockImplementationOnce(
    async () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )

  // Act
  const restoring = fixture.sync.restoreConfirmed()
  fixture.editSize(26)
  fixture.patch.mockResolvedValue({
    ok: true,
    generation: 2,
    preferences: {
      revision: 5,
      theme: 'dark',
      settings: UserSettingsStateSchema.parse({ liveEditorFontSize: 26 }),
    },
  })
  release({
    generation: 2,
    preferences: {
      revision: 4,
      theme: 'dark',
      settings: UserSettingsStateSchema.parse({ liveEditorFontSize: 22 }),
    },
  })
  await restoring
  await vi.advanceTimersByTimeAsync(0)

  // Assert
  expect(fixture.settings().liveEditorFontSize).toBe(26)
  expect(fixture.patch).toHaveBeenLastCalledWith(
    'account-a',
    2,
    expect.objectContaining({ patch: { liveEditorFontSize: 26 } }),
  )
  expect(fixture.sync.getSnapshot().status).toBe('saved')
})

test.each(['worker-unavailable', 'storage-failed'])(
  'losing confirmation after %s retains an unconfirmed command for exact replay',
  async (reason) => {
    // Arrange
    const fixture = createFixture()
    fixture.sync.themeChanged('dark')
    await vi.waitFor(() =>
      expect(fixture.sync.getSnapshot().status).toBe('saved'),
    )
    fixture.patch.mockResolvedValueOnce({ ok: false, reason })

    // Act
    fixture.editSize(26)
    await vi.waitFor(() =>
      expect(fixture.sync.getSnapshot().status).toBe('unknown'),
    )
    const firstCommand = fixture.patch.mock.calls[0]?.[2]

    // Assert
    expect(fixture.sync.getSnapshot()).toMatchObject({
      certainty: 'unconfirmed',
      expectedRevision: 4,
      canRestore: false,
    })
    fixture.sync.retry()
    await vi.waitFor(() => expect(fixture.patch).toHaveBeenCalledTimes(2))
    expect(fixture.patch.mock.calls[1]?.[2]).toEqual(firstCommand)
  },
)

test.each(['prepare', 'patch'] as const)(
  'an unresolved %s stops within its budget and Retry never duplicates its transport',
  async (method) => {
    // Arrange
    vi.useFakeTimers()
    const fixture = createFixture()
    if (method === 'prepare') {
      fixture.read.mockResolvedValue({ generation: 2, preferences: null })
      fixture.prepare.mockImplementation(
        async () => new Promise(() => undefined),
      )
    } else
      fixture.patch.mockImplementation(async () => new Promise(() => undefined))
    fixture.sync.themeChanged('dark')
    await vi.advanceTimersByTimeAsync(0)
    if (method === 'patch') fixture.editSize(26)

    // Act
    await vi.advanceTimersByTimeAsync(30_000)

    // Assert
    expect(fixture.sync.getSnapshot()).toMatchObject({
      status: 'unknown',
      terminal: true,
      certainty: 'unconfirmed',
    })
    fixture.sync.retry()
    fixture.sync.retry()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fixture[method]).toHaveBeenCalledOnce()
    expect(fixture.sync.getSnapshot().terminal).toBe(true)
  },
)

test('rejected preparation reports the changed workspace and delayed readiness commits newer edits', async () => {
  // Arrange
  vi.useFakeTimers()
  const fixture = createFixture()
  fixture.read.mockResolvedValue({ generation: 2, preferences: null })
  fixture.prepare.mockResolvedValueOnce(false)
  fixture.sync.themeChanged('dark')
  await vi.advanceTimersByTimeAsync(0)
  expect(fixture.sync.getSnapshot()).toMatchObject({
    reason: 'account-changed',
    status: 'failed',
  })

  // Act
  fixture.sync.retry()
  await vi.advanceTimersByTimeAsync(0)
  fixture.editSize(26)
  fixture.read.mockResolvedValue({
    generation: 2,
    preferences: {
      revision: 4,
      theme: 'dark',
      settings: UserSettingsStateSchema.parse({ liveEditorFontSize: 22 }),
    },
  })
  fixture.sync.refresh()
  await vi.advanceTimersByTimeAsync(3000)

  // Assert
  expect(fixture.settings().liveEditorFontSize).toBe(26)
  expect(fixture.patch).toHaveBeenCalledWith(
    'account-a',
    2,
    expect.objectContaining({ patch: { liveEditorFontSize: 26 } }),
  )
  expect(fixture.sync.getSnapshot().status).toBe('saved')
})

test('leaving Settings during a sent write retains its identity and newer edits until return', async () => {
  // Arrange
  vi.useFakeTimers()
  const fixture = createFixture()
  fixture.sync.themeChanged('dark')
  await vi.advanceTimersByTimeAsync(0)
  let acknowledge!: (value: OfflineSettingsResult) => void
  fixture.patch.mockImplementationOnce(
    async () =>
      new Promise((resolve) => {
        acknowledge = resolve
      }),
  )
  fixture.editSize(24)
  await vi.advanceTimersByTimeAsync(0)
  const original = fixture.patch.mock.calls[0]?.[2]

  // Act
  fixture.sync.setActive(false)
  fixture.editSize(26)
  acknowledge({
    ok: true,
    generation: 2,
    preferences: {
      revision: 5,
      theme: 'dark',
      settings: UserSettingsStateSchema.parse({ liveEditorFontSize: 24 }),
    },
  })
  await vi.advanceTimersByTimeAsync(60_000)

  // Assert
  expect(fixture.patch).toHaveBeenCalledOnce()
  expect(fixture.sync.getSnapshot().expectedRevision).toBe(4)
  fixture.sync.setActive(true)
  await vi.advanceTimersByTimeAsync(0)
  expect(fixture.patch).toHaveBeenCalledTimes(2)
  expect(fixture.patch.mock.calls[0]?.[2]).toBe(original)
  expect(fixture.patch.mock.calls[1]?.[2].patch).toEqual({
    liveEditorFontSize: 26,
  })
  expect(fixture.sync.getSnapshot().status).toBe('saved')
})
