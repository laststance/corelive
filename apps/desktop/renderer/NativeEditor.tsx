import type { LiveEditorAPI } from '@corelive/desktop-contract/electron-api'
import type {
  OfflineCompletion,
  OfflineEditorSnapshot,
} from '@corelive/desktop-contract/offline-workspace'
import { SharedCategoryPicker } from '@corelive/live-editor/category-picker'
import { TodayEmber } from '@corelive/live-editor/ember'
import { useEditorInput } from '@corelive/live-editor/input'
import type {
  DurableEditorStore,
  DurableEditorSnapshot,
} from '@corelive/live-editor/store'
import { SharedEditorSurface } from '@corelive/live-editor/surface'
import { DEFAULT_THEME_ID, isThemeId } from '@corelive/live-editor/themes'
import { useEditorWindowSettings } from '@corelive/live-editor/window-settings'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

import { NativeDetails } from './NativeDetails'
import { NativeFooter, type ActionFeedback } from './NativeFooter'
import { NativeStateScene } from './NativeStateScene'

type ReadySnapshot = Extract<OfflineEditorSnapshot, { phase: 'ready' }>

/** Applies cached theme identity locally; system theme follows OS changes without a network request.
 * @example useEditorTheme(preferences.theme)
 */
function useEditorTheme(theme: string): void {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      document.documentElement.dataset.theme =
        theme === 'system'
          ? media.matches
            ? 'dark'
            : 'light'
          : isThemeId(theme)
            ? theme
            : DEFAULT_THEME_ID
    }
    apply()
    media.addEventListener('change', apply)
    return (): void => media.removeEventListener('change', apply)
  }, [theme])
}

/** Mounts one durable store for the local document, with account transitions replacing the visible session.
 * @example <NativeEditor api={window.liveEditorAPI} store={store} />
 */
export function NativeEditor({
  api,
  store,
}: {
  api: LiveEditorAPI
  store: DurableEditorStore
}) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  useEffect(() => {
    void store.connect()
    return (): void => store.disconnect()
  }, [store])
  useEditorTheme(
    snapshot.main.phase === 'ready'
      ? snapshot.main.workspace.preferences.theme
      : DEFAULT_THEME_ID,
  )
  if (snapshot.main.phase !== 'ready')
    return (
      <NativeStateScene
        key={`${snapshot.main.generation}-${snapshot.main.phase}`}
        snapshot={snapshot.main}
        host={store.host}
        close={async () => api.window.close()}
      />
    )
  return (
    <PreparedEditor
      key={snapshot.main.generation}
      api={api}
      store={store}
      state={snapshot}
      main={snapshot.main}
    />
  )
}

/** Adapts the shared editor surface to durable IPC and same-window repair navigation.
 * Keeping the textarea mounted under Details preserves scroll, selection, IME and live draft identity.
 * @example <PreparedEditor api={api} store={store} state={state} main={main} />
 */
function PreparedEditor({
  api,
  store,
  state,
  main,
}: {
  api: LiveEditorAPI
  store: DurableEditorStore
  state: DurableEditorSnapshot
  main: ReadySnapshot
}) {
  const textarea = useRef<HTMLTextAreaElement>(null)
  const detailsButton = useRef<HTMLButtonElement>(null)
  const [details, setDetails] = useState(false)
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null)
  const [windowVersion, setWindowVersion] = useState(0)
  const getHost = useMemo(() => () => api, [api])
  const reportWindowError = useCallback(
    (message: string): void => setFeedback({ text: message }),
    [],
  )
  const refreshWindow = useCallback(
    (): void => setWindowVersion((version) => version + 1),
    [],
  )
  const windowSettings = useEditorWindowSettings(
    true,
    getHost,
    windowVersion,
    refreshWindow,
    reportWindowError,
  )
  // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-data-to-parent -- subscribe to a native window event, not a parent data callback
  useEffect(() => store.host.onShown(refreshWindow), [store, refreshWindow])
  const { workspace } = main
  const { settings } = workspace.preferences
  const online = main.sync === 'idle' || main.sync === 'syncing'
  const input = useEditorInput({
    ref: textarea,
    value: state.text,
    onChange: (text, range) => store.edit(text, range),
    onKeep: (field) => {
      if (!state.exitPending) void store.completeAt(field.selectionStart)
    },
    onSelection: (selection) => store.setSelection(selection),
    onComposition: (composing) => store.setComposing(composing),
  })
  // Native commands may mark, clear, restore or switch rows; restore only the store's rebased selection.
  useLayoutEffect(() => {
    const field = textarea.current
    if (!field) return
    const selection = store.getSelection()
    field.setSelectionRange(selection.start, selection.end, selection.direction)
  }, [store, state.selectionRevision])
  useEffect(() => {
    if (!state.notice) return
    const timer = setTimeout(
      () => store.dismissNotice(),
      Math.max(0, state.notice.undoUntil - Date.now() + 1),
    )
    return (): void => clearTimeout(timer)
  }, [state.notice, store])

  const select = useCallback(
    async (categoryId: number): Promise<void> => {
      if (
        await store.command({
          type: 'select',
          commandId: crypto.randomUUID(),
          categoryId,
        })
      ) {
        setDetails(false)
        requestAnimationFrame(() => textarea.current?.focus())
      }
    },
    [store],
  )

  useEffect(
    () =>
      // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-data-to-parent -- subscribe to main's verified category event
      store.host.onCategoryCreated((selection) => {
        if (selection.generation === main.generation)
          void select(selection.categoryId)
      }),
    [store, main.generation, select],
  )
  const undo = async (completion: OfflineCompletion): Promise<void> => {
    if (
      await store.command({
        type: 'undo',
        commandId: crypto.randomUUID(),
        completionId: completion.id,
      })
    ) {
      const category = workspace.categories.find(
        (entry) => entry.id === completion.categoryId,
      )
      setFeedback({
        text: `Restored to ${category?.name ?? 'its category'}.`,
        ...(completion.categoryId !== workspace.selectedCategoryId
          ? { categoryId: completion.categoryId }
          : {}),
      })
    }
  }
  const closeDetails = (): void => {
    setDetails(false)
    // Returning to the entry control preserves keyboard order; the hidden textarea never lost its caret.
    requestAnimationFrame(() =>
      (detailsButton.current ?? textarea.current)?.focus(),
    )
  }
  const run = async (
    operation: () => Promise<unknown>,
    success?: string,
  ): Promise<void> => {
    try {
      const result = await operation()
      if (success)
        setFeedback({
          text:
            result === false
              ? 'Could not complete that action. Please try again.'
              : success,
        })
    } catch {
      setFeedback({ text: 'Could not complete that action. Please try again.' })
    }
  }
  const today = workspace.today
  const emberContext =
    today.scope === 'device'
      ? 'On this Mac'
      : today.stale || !online
        ? 'Account total · last confirmed'
        : undefined

  return (
    <SharedEditorSurface
      windowSettings={windowSettings}
      textareaProps={input.textareaProps}
      settings={settings}
      categoryCount={workspace.categories.length}
      categoryPicker={
        <SharedCategoryPicker
          categories={workspace.categories}
          activeCategoryId={workspace.selectedCategoryId}
          isSignedIn
          isElectronPanel
          onCategoryValueChange={(value) => void select(Number(value))}
          actionsDisabled={!online}
          onManage={() => void run(async () => store.host.manageCategories())}
          onCreate={(initialName) =>
            void run(async () =>
              store.host.manageCategories({ action: 'create', initialName }),
            )
          }
        />
      }
      ember={
        !details && settings.showTodayEmber ? (
          <TodayEmber
            count={today.total}
            compact
            contextLabel={emberContext}
            celebrationKey={state.notice?.id ?? null}
          />
        ) : undefined
      }
      storageAvailability="ok"
      nativeFooter={
        <NativeFooter
          state={state}
          main={main}
          store={store}
          details={details}
          detailsButton={detailsButton}
          onDetails={() => (details ? closeDetails() : setDetails(true))}
          feedback={feedback}
          onDismiss={() => setFeedback(null)}
          onSelect={select}
          onUndo={undo}
          run={run}
        />
      }
      details={
        details ? (
          <NativeDetails
            key={main.generation}
            store={store}
            main={main}
            busy={state.busy}
            onClose={closeDetails}
            onUndo={undo}
            onSelect={select}
            onFeedback={(text) => setFeedback({ text })}
          />
        ) : undefined
      }
      isCategoryListPending={false}
      isCategoryListError={false}
      isElectronPanel
      isMounted
      isSignedIn
      isAuthLoaded
      isSignedOutWeb={false}
      isLiveEditorConfigReady
      activeCategoryId={workspace.selectedCategoryId}
      isNoteFieldDisabled={state.exitPending}
      handleKeepLineClick={input.handleKeepLineClick}
      closeWindow={() => void run(async () => api.window.close())}
    />
  )
}
