import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'

import type {
  OfflineFlushRequest,
  OfflineSettingsResult,
  OfflineCategoryRequest,
} from '@corelive/desktop-contract/offline-editor-api'
import type { OfflineEditorSnapshot } from '@corelive/desktop-contract/offline-workspace'
import {
  clipboard,
  dialog,
  type BrowserWindow,
  type IpcMainInvokeEvent,
} from 'electron'

import { typedHandle } from '../ipc/typedHandle'
import { typedSend } from '../ipc/typedSend'
import { isTrustedAppNavigation } from '../utils/isTrustedAppNavigation'
import type { WindowManager } from '../WindowManager'

import { isLocalEditorDocument, LOCAL_EDITOR_ORIGIN } from './localEditorOrigin'
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

/** Verifies current remote Settings/login main-frame notifications before changing native authentication state.
 * Main uses this predicate for the existing login and expiry IPC handlers.
 * @example if (!isTrustedAuthSender(event, windows)) throw new Error('Unauthorized sender')
 */
export function isTrustedAuthSender(
  event: IpcMainInvokeEvent,
  windows: WindowManager,
): boolean {
  const origin = windows.getWebAppOrigin()
  return [windows.getSettingsWindow(), windows.getLoginWindow()].some(
    (window) =>
      isCurrentWindowFrame(event, window, (url) =>
        isTrustedAppNavigation(url, origin),
      ) &&
      event.senderFrame !== null &&
      isTrustedAppNavigation(event.senderFrame.origin, origin),
  )
}

/**
 * Binds the local editor and remote Settings to their narrow main-process capabilities.
 * Main constructs this once, before loading either renderer. Reads recheck generation
 * after worker/dialog awaits so an account switch cannot disclose an earlier result.
 * @example const ipc = new OfflineEditorIPC(windowManager, () => controller)
 */
export class OfflineEditorIPC {
  private pending: PendingFlush | null = null
  private categoryRequest: OfflineCategoryRequest | null = null
  private createdCategory: {
    generation: number
    categoryId: number
    ownerId: string
  } | null = null

  constructor(
    private readonly windows: WindowManager,
    private readonly controller: OfflineEditorController,
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
    typedHandle('offline-editor-snapshot', (event) => {
      this.assertEditor(event)
      return this.controller.getSnapshot()
    })
    typedHandle(
      'offline-editor-command',
      async (event, generation, command) => {
        this.assertEditor(event)
        return this.controller.command(generation, command)
      },
    )
    typedHandle('offline-editor-retry', (event) => {
      this.assertEditor(event)
      this.controller.retryPreparation()
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
    typedHandle('offline-editor-manage-categories', (event, request) => {
      this.assertEditor(event)
      const snapshot = this.controller.getSnapshot()
      if (
        snapshot.phase !== 'ready' ||
        snapshot.sync === 'offline' ||
        snapshot.sync === 'sign-in-required'
      )
        return
      this.categoryRequest = { ...request, generation: snapshot.generation }
      this.windows.openSettings()
      const settings = this.windows.getSettingsWindow()
      if (!settings) return
      const open = (): void => {
        if (!settings.isDestroyed())
          typedSend(settings.webContents, 'offline-settings-manage-categories')
      }
      if (settings.webContents.isLoadingMainFrame())
        settings.webContents.once('did-finish-load', open)
      else open()
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

  /** Notifies only the dedicated local document; the initial read covers missed load-time events.
   * @example ipc.publish(snapshot)
   */
  publish(snapshot: OfflineEditorSnapshot): void {
    const editor = this.windows.getLiveEditorWindow()
    if (
      editor &&
      !editor.isDestroyed() &&
      isLocalEditorDocument(editor.webContents.getURL())
    ) {
      typedSend(editor.webContents, 'offline-editor-changed', snapshot)
      const selection = this.createdCategory
      if (selection && selection.generation !== snapshot.generation)
        this.createdCategory = null
      if (
        selection &&
        snapshot.phase === 'ready' &&
        selection.generation === snapshot.generation &&
        selection.ownerId === snapshot.workspace.ownerId &&
        snapshot.workspace.categories.some(
          (category) =>
            category.id === selection.categoryId && !category.removed,
        )
      ) {
        this.createdCategory = null
        typedSend(editor.webContents, 'offline-editor-category-created', {
          generation: selection.generation,
          categoryId: selection.categoryId,
        })
      }
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
      isLocalEditorDocument(editor.webContents.getURL())
    )
      typedSend(editor.webContents, 'offline-editor-shown')
  }

  /** Sends no account data in the notification; Settings re-reads through its verified capability.
   * @example ipc.settingsChanged()
   */
  settingsChanged(): void {
    const settings = this.windows.getSettingsWindow()
    if (settings && !settings.isDestroyed())
      typedSend(settings.webContents, 'offline-settings-changed')
  }

  /** Challenges the renderer's current live buffer before hide, account transition or quit.
   * A missing response cancels that exit; main never treats a timeout as a saved draft.
   * @example const saved = await ipc.flush(generation)
   */
  async flush(generation: number): Promise<boolean> {
    const editor = this.windows.getLiveEditorWindow()
    if (
      !editor ||
      editor.isDestroyed() ||
      editor.webContents.isLoadingMainFrame()
    )
      return Promise.resolve(true)
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

  /** Transfers only the verified account's preferences and acknowledges explicit field patches.
   * @example this.registerSettings()
   */
  private registerSettings(): void {
    typedHandle('offline-settings-category-request', (event) => {
      this.assertSettings(event)
      const requested = this.categoryRequest
      this.categoryRequest = null
      return requested?.generation === this.controller.getSnapshot().generation
        ? requested
        : null
    })
    typedHandle(
      'offline-settings-category-created',
      (event, ownerId, generation, categoryId) => {
        this.assertSettings(event)
        const context = this.controller.settingsContext(ownerId)
        const snapshot = this.controller.getSnapshot()
        if (
          context?.generation !== generation ||
          snapshot.phase !== 'ready' ||
          snapshot.workspace.ownerId !== ownerId
        )
          return false
        this.createdCategory = { ownerId, generation, categoryId }
        // The remote dialog's ID is advisory until a verified category refresh proves ownership.
        this.controller.retryPreparation()
        return true
      },
    )
    typedHandle('offline-settings-refresh-categories', (event) => {
      this.assertSettings(event)
      if (this.controller.getSnapshot().phase === 'ready')
        this.controller.retryPreparation()
    })
    typedHandle('offline-settings-read', (event, owner) => {
      this.assertSettings(event)
      return this.controller.settingsContext(owner)
    })
    typedHandle(
      'offline-settings-prepare',
      (event, owner, generation, preferences) => {
        this.assertSettings(event)
        return this.controller.provideSettings(owner, generation, preferences)
      },
    )
    typedHandle(
      'offline-settings-patch',
      async (
        event,
        owner,
        generation,
        command,
      ): Promise<OfflineSettingsResult> => {
        this.assertSettings(event)
        const result = await this.controller.patchSettings(
          owner,
          generation,
          command,
        )
        this.settingsChanged()
        // A remote Settings document receives preferences only, never the workspace/draft projection.
        if (!result.ok) return result
        this.assertSettings(event)
        const current = this.controller.settingsContext(owner)
        if (current?.generation !== generation || !current.preferences)
          return { ok: false, reason: 'account-changed' }
        return { ok: true, generation, preferences: current.preferences }
      },
    )
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

  /** Keeps preference transfer off login/handshake documents even within the same origin.
   * @example this.assertSettings(event)
   */
  private assertSettings(event: IpcMainInvokeEvent): void {
    const origin = this.windows.getWebAppOrigin()
    if (
      !isCurrentWindowFrame(
        event,
        this.windows.getSettingsWindow(),
        (url) =>
          isTrustedAppNavigation(url, origin) &&
          new URL(url).pathname === '/settings',
      ) ||
      !event.senderFrame ||
      !isTrustedAppNavigation(event.senderFrame.origin, origin)
    )
      throw new Error('Unauthorized settings')
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
