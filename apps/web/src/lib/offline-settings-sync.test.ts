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
function createFixture() {
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
