import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'

import type { SignOutResult } from '@corelive/desktop-contract/offline-account'
import type {
  OfflineFlushRequest,
  OfflineSettingsResult,
  SettingsSnapshot,
} from '@corelive/desktop-contract/offline-editor-api'
import type { OfflineEditorSnapshot } from '@corelive/desktop-contract/offline-workspace-v2'
import {
  clipboard,
  dialog,
  type BrowserWindow,
  type IpcMainInvokeEvent,
} from 'electron'

import { typedHandle } from '../ipc/typedHandle'
import { typedSend } from '../ipc/typedSend'
import { isTrustedAppNavigation } from '../utils/isTrustedAppNavigation'
import { openWebAppInBrowser } from '../utils/openWebAppInBrowser'
import type { WindowManager } from '../WindowManager'

import {
  isLocalEditorDocument,
  isLocalSettingsDocument,
  LOCAL_EDITOR_ORIGIN,
} from './localEditorOrigin'
import type { OfflineEditorController } from './OfflineEditorController'

type PendingFlush = {
  request: OfflineFlushRequest
  sender: Electron.WebContents
  promise: Promise<boolean>
  resolve: (saved: boolean) => void
  timer: ReturnType<typeof setTimeout>
}

/** Verifies the exact current window and main frame before any account-bearing IPC access.
 * @example isCurrentWindowFrame(event, editor, isLocalEditorDocument)
 */
function isCurrentWindowFrame(
  event: IpcMainInvokeEvent,
  window: BrowserWindow | null,
  document: (url: string) => boolean,
): boolean {
  return Boolean(
    window &&
    !window.isDestroyed() &&
    event.sender === window.webContents &&
    event.senderFrame &&
    event.senderFrame === window.webContents.mainFrame &&
    document(event.senderFrame.url),
  )
}

/** Verifies that an authentication notification comes from the login window's main frame.
 * Only the login window hosts Clerk (D5); the bundled Settings window is no longer an auth surface.
 * Main uses this predicate for the existing login and expiry IPC handlers.
 * @example if (!isTrustedAuthSender(event, windows)) throw new Error('Unauthorized sender')
 */
export function isTrustedAuthSender(
  event: IpcMainInvokeEvent,
  windows: WindowManager,
): boolean {
  const origin = windows.getWebAppOrigin()
  return (
    isCurrentWindowFrame(event, windows.getLoginWindow(), (url) =>
      isTrustedAppNavigation(url, origin),
    ) &&
    event.senderFrame !== null &&
    isTrustedAppNavigation(event.senderFrame.origin, origin)
  )
}

/**
 * Binds the bundled editor and bundled Settings window to their narrow main-process capabilities.
 * Main constructs this once, before loading either renderer. Reads recheck generation
 * after worker/dialog awaits so an account switch cannot disclose an earlier result.
 * @example const ipc = new OfflineEditorIPC(windowManager, controller)
 */
export class OfflineEditorIPC {
  private pending: PendingFlush | null = null
  private snapshotReaders = 0

  constructor(
    private readonly windows: WindowManager,
    private readonly controller: OfflineEditorController,
    private readonly deps: {
      /** Runs one sign-out implementation (C23) so `account.signOut` and `auth-logout` share steps 1-4. */
      signOutDevice: (
        run: () => Promise<SignOutResult>,
      ) => Promise<SignOutResult>
    },
  ) {}

  /** Registers every capability; runtime argument validation is supplied by {@link typedHandle}.
   * @example ipc.register()
   */
  register(): void {
    typedHandle(
      'offline-editor-draft',
      async (event, generation, categoryId) => {
        this.assertEditor(event, generation)
        const draft = await this.controller.draft(generation, categoryId)
        this.assertEditor(event, generation)
        return draft
      },
    )
    typedHandle('offline-editor-snapshot', async (event) =>
      this.readSnapshot(event),
    )
    typedHandle(
      'offline-editor-command',
      async (event, generation, command) => {
        this.assertEditor(event)
        return this.controller.command(generation, command)
      },
    )
    typedHandle('offline-editor-retry', (event) => {
      this.assertEditor(event)
      this.controller.retrySync()
    })
    typedHandle(
      'offline-editor-details',
      async (event, generation, offset, limit) => {
        this.assertEditor(event, generation)
        const page = await this.controller.details(generation, offset, limit)
        this.assertEditor(event, generation)
        return page
      },
    )
    typedHandle(
      'offline-editor-undo-history',
      async (event, generation, offset, limit) => {
        this.assertEditor(event, generation)
        const page = await this.controller.undoHistory(
          generation,
          offset,
          limit,
        )
        this.assertEditor(event, generation)
        return page
      },
    )
    typedHandle(
      'offline-editor-recovery-copies',
      async (event, generation, offset, limit) => {
        this.assertEditor(event, generation)
        const page = await this.controller.recoveryCopies(
          generation,
          offset,
          limit,
        )
        this.assertEditor(event, generation)
        return page
      },
    )
    typedHandle('offline-editor-sign-in', (event) => {
      this.assertEditor(event)
      this.windows.showLoginWindow()
    })
    typedHandle('offline-editor-sync-details', async (event, generation) => {
      this.assertEditor(event, generation)
      const details = await this.controller.syncDetails(generation)
      this.assertEditor(event, generation)
      return details
    })
    typedHandle('offline-editor-copy', (event, generation, text) => {
      this.assertEditor(event, generation)
      clipboard.writeText(text)
      return true
    })
    typedHandle('offline-editor-export', async (event, generation) => {
      this.assertEditor(event, generation)
      const content = await this.controller.export(generation)
      this.assertEditor(event, generation)
      const result = await dialog.showSaveDialog({
        title: 'Export writing from this Mac',
        defaultPath: 'corelive-writing.json',
        filters: [{ name: 'JSON backup', extensions: ['json'] }],
      })
      if (result.canceled || !result.filePath) return false
      this.assertEditor(event, generation)
      try {
        await writeFile(result.filePath, content, {
          encoding: 'utf8',
          mode: 0o600,
        })
        return true
      } catch {
        return false
      }
    })
    typedHandle(
      'offline-editor-preview-recovery',
      async (event, generation) => {
        this.assertEditor(event, generation)
        const preview = await this.controller.previewRecovery(generation)
        this.assertEditor(event, generation)
        return preview
      },
    )
    typedHandle('offline-editor-recover', async (event, generation) => {
      this.assertEditor(event, generation)
      return this.controller.recover(generation)
    })
    typedHandle('offline-editor-flush-result', (event, request, saved) => {
      this.assertEditor(event)
      if (
        !this.pending ||
        this.pending.sender !== event.sender ||
        this.pending.request.requestId !== request.requestId ||
        this.pending.request.generation !== request.generation
      )
        return false
      this.finishFlush(saved)
      return true
    })
    this.registerSettings()
  }

  /**
   * Keeps replacement-renderer startup behind pending main-process commands.
   * The snapshot handler calls this after reconnect; broadcasts cannot bypass the
   * same barrier, and sender/account authority is rechecked after the wait.
   * @example const snapshot = await this.readSnapshot(event)
   */
  private async readSnapshot(
    event: IpcMainInvokeEvent,
  ): Promise<OfflineEditorSnapshot> {
    this.assertEditor(event)
    this.snapshotReaders++
    let snapshot: OfflineEditorSnapshot
    try {
      snapshot = await this.controller.readSnapshot()
      this.assertEditor(event, snapshot.generation)
    } finally {
      this.snapshotReaders--
    }
    this.publish(snapshot)
    return snapshot
  }

  /** Notifies only the dedicated local document; the settled initial read covers held load-time events.
   * @example ipc.publish(snapshot)
   */
  publish(snapshot: OfflineEditorSnapshot): void {
    // Settings re-reads its own projection; the editor's startup barrier does not apply to it.
    this.settingsChanged()
    if (this.snapshotReaders > 0) return
    const editor = this.windows.getLiveEditorWindow()
    if (
      editor &&
      !editor.isDestroyed() &&
      isLocalEditorDocument(editor.webContents.getURL())
    ) {
      typedSend(editor.webContents, 'offline-editor-changed', snapshot)
    }
  }

  /** Releases the renderer's exit barrier when a native reveal supersedes a pending hide.
   * @example ipc.shown()
   */
  shown(): void {
    const editor = this.windows.getLiveEditorWindow()
    if (
      editor &&
      !editor.isDestroyed() &&
      !editor.webContents.isDestroyed() &&
      !editor.webContents.isLoadingMainFrame() &&
      !editor.webContents.isCrashed() &&
      isLocalEditorDocument(editor.webContents.getURL())
    )
      typedSend(editor.webContents, 'offline-editor-shown')
  }

  /** Sends no data in the notification; Settings re-reads through its verified capability.
   * @example ipc.settingsChanged()
   */
  settingsChanged(): void {
    const settings = this.windows.getSettingsWindow()
    if (
      settings &&
      !settings.isDestroyed() &&
      isLocalSettingsDocument(settings.webContents.getURL())
    )
      typedSend(settings.webContents, 'settings-window-changed')
  }

  /** Challenges the renderer's current live buffer before hide, account transition or quit.
   * A missing response cancels that exit; main never treats a timeout as a saved draft.
   * @example const saved = await ipc.flush(generation)
   */
  async flush(generation: number): Promise<boolean> {
    // An opening replacement cannot acknowledge writing still owned by main.
    if (this.snapshotReaders > 0) return false
    const editor = this.windows.getLiveEditorWindow()
    if (
      !editor ||
      editor.isDestroyed() ||
      editor.webContents.isDestroyed() ||
      editor.webContents.isLoadingMainFrame() ||
      editor.webContents.isCrashed()
    ) {
      // A dead renderer cannot reply, but main may still hold recoverable writing.
      this.finishFlush(false)
      return this.controller.canLeaveWithoutRenderer(generation)
    }
    if (
      this.pending?.request.generation === generation &&
      this.pending.sender === editor.webContents
    )
      return this.pending.promise
    this.finishFlush(false)
    let resolve: PendingFlush['resolve'] = () => undefined
    const promise = new Promise<boolean>((done) => {
      resolve = done
    })
    const request = { requestId: randomUUID(), generation }
    const timer = setTimeout(() => this.finishFlush(false), 15000)
    timer.unref?.()
    this.pending = {
      request,
      sender: editor.webContents,
      promise,
      resolve,
      timer,
    }
    typedSend(editor.webContents, 'offline-editor-flush', request)
    return promise
  }

  /** Registers the bundled Settings capabilities; each handler verifies the exact window and document first.
   * @example this.registerSettings()
   */
  private registerSettings(): void {
    typedHandle('settings-window-snapshot', (event) => {
      this.assertSettings(event)
      return this.settingsSnapshot()
    })
    typedHandle(
      'settings-window-preferences-patch',
      async (event, generation, command): Promise<OfflineSettingsResult> => {
        this.assertSettings(event, generation)
        const result = await this.controller.command(generation, command)
        this.assertSettings(event, generation)
        if (!result.ok) return result
        const current = this.controller.getSnapshot()
        if (current.phase !== 'ready' || current.generation !== generation)
          return { ok: false, reason: 'account-changed' }
        return {
          ok: true,
          generation,
          preferences: current.workspace.preferences,
        }
      },
    )
    typedHandle(
      'settings-window-category-command',
      async (event, generation, command) => {
        this.assertSettings(event, generation)
        return this.controller.command(generation, command)
      },
    )
    typedHandle('settings-window-sync-details', async (event, generation) => {
      this.assertSettings(event, generation)
      const details = await this.controller.syncDetails(generation)
      this.assertSettings(event, generation)
      return details
    })
    typedHandle('settings-window-account-status', (event) => {
      this.assertSettings(event)
      return this.controller.accountStatus()
    })
    typedHandle('settings-window-account-connect', async (event) => {
      this.assertSettings(event)
      return this.controller.connect()
    })
    typedHandle('settings-window-account-not-now', async (event) => {
      this.assertSettings(event)
      return this.deps.signOutDevice(async () => this.controller.notNow())
    })
    typedHandle('settings-window-account-sign-in', (event) => {
      this.assertSettings(event)
      this.windows.showLoginWindow()
    })
    typedHandle('settings-window-account-sign-out', async (event) => {
      this.assertSettings(event)
      return this.deps.signOutDevice(async () => this.controller.signOut())
    })
    typedHandle('settings-window-account-open-dashboard', (event) => {
      this.assertSettings(event)
      // The address comes from the configured server URL only, never from the renderer (EA16).
      openWebAppInBrowser(this.windows.getWebAppOrigin(), '/home')
      return true
    })
  }

  /** Projects the controller state to what Settings renders, without the draft text.
   * @example const snapshot = this.settingsSnapshot()
   */
  private settingsSnapshot(): SettingsSnapshot {
    const snapshot = this.controller.getSnapshot()
    const account = this.controller.accountStatus()
    if (snapshot.phase !== 'ready')
      return { phase: snapshot.phase, generation: snapshot.generation, account }
    return {
      phase: 'ready',
      generation: snapshot.generation,
      preferences: snapshot.workspace.preferences,
      categories: snapshot.workspace.categories,
      account,
    }
  }

  /** Rejects a former document, child frame, or generation before native data access.
   * @example this.assertEditor(event, generation)
   */
  private assertEditor(event: IpcMainInvokeEvent, generation?: number): void {
    if (
      !isCurrentWindowFrame(
        event,
        this.windows.getLiveEditorWindow(),
        isLocalEditorDocument,
      ) ||
      event.senderFrame?.origin !== LOCAL_EDITOR_ORIGIN
    )
      throw new Error('Unauthorized editor')
    if (
      generation !== undefined &&
      generation !== this.controller.getSnapshot().generation
    )
      throw new Error('Account changed')
  }

  /** Accepts only the Settings window's own main frame at its exact bundled document (D5, EA16).
   * @example this.assertSettings(event, generation)
   */
  private assertSettings(event: IpcMainInvokeEvent, generation?: number): void {
    if (
      !isCurrentWindowFrame(
        event,
        this.windows.getSettingsWindow(),
        isLocalSettingsDocument,
      ) ||
      event.senderFrame?.origin !== LOCAL_EDITOR_ORIGIN
    )
      throw new Error('Unauthorized settings')
    if (
      generation !== undefined &&
      generation !== this.controller.getSnapshot().generation
    )
      throw new Error('Account changed')
  }

  /** Completes one coalesced flush challenge and cancels its deadline.
   * @example this.finishFlush(true)
   */
  private finishFlush(saved: boolean): void {
    const pending = this.pending
    this.pending = null
    if (!pending) return
    clearTimeout(pending.timer)
    pending.resolve(saved)
  }
}
