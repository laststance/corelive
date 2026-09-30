import { getLiveEditorHost } from './liveEditorHost'

/**
 * Claim handler a mounted editor installs: takes the text when it is the one
 * showing that category, declines otherwise so the caller writes to the store.
 */
type LiveDraftAppender = (categoryId: number, text: string) => Promise<boolean>

/** Persists an on-screen draft before category management reads its device copy. */
type LiveDraftFlusher = (categoryId: number) => Promise<boolean>

/** Reads a rescued destination draft into a mounted editor without replacing new typing. */
type LiveDraftRefresher = (
  categoryId: number,
  rescue?: CategoryDraftRescue,
) => Promise<boolean | 'pending'>

/** Immutable rescue evidence survives a peer's queued write replacing the host copy. */
export type CategoryDraftRescue = Readonly<{
  receipt: string
  baseText: string
  text: string
}>

/**
 * The single on-screen editor's claim handler, or null when none is mounted
 * (`/home`, SSR). Module-level because the only question it answers — "is a
 * live editor showing this category right now?" — has exactly one answer per
 * renderer, and threading it as a prop would cross three components that have
 * no other reason to know about drafts.
 */
let liveDraftAppender: LiveDraftAppender | null = null
let liveDraftFlusher: LiveDraftFlusher | null = null
let liveDraftRefresher: LiveDraftRefresher | null = null
const refreshedRescues = new Map<string, Promise<boolean | 'pending'>>()
const pendingRescues = new Map<
  string,
  { categoryId: number; rescue: CategoryDraftRescue }
>()

/**
 * Lets the mounted {@link LiveEditor} claim appends to the category it displays.
 * Called once per editor mount; the returned cleanup runs on unmount.
 * @param appender - Resolves true only after the visible merged draft is persisted.
 * @param flusher - Saves the latest visible source draft before deletion reads it.
 * @param refresher - Reconciles a rescue written by another window into the visible draft.
 * @returns Unregister function; a no-op if another editor already took over.
 * @example
 * useInitialEffect(() => registerLiveDraftAppender(async () => false))
 */
export function registerLiveDraftAppender(
  appender: LiveDraftAppender,
  flusher?: LiveDraftFlusher,
  refresher?: LiveDraftRefresher,
  onRefreshError?: (
    categoryId: number,
    rescue: CategoryDraftRescue,
    error: unknown,
  ) => void,
): () => void {
  liveDraftAppender = appender
  liveDraftFlusher = flusher ?? null
  liveDraftRefresher = refresher ?? null
  // Note-ready registration drains immutable notifications received during its initial load.
  for (const [receiptKey, pending] of pendingRescues) {
    void refreshCategoryDraft(pending.categoryId, pending.rescue).catch(
      (error: unknown) => {
        // Preserve evidence and expose failures that occur after the original notification settled.
        pendingRescues.set(receiptKey, pending)
        onRefreshError?.(pending.categoryId, pending.rescue, error)
      },
    )
  }
  return () => {
    // An older renderer cleanup must not remove a newer editor's registration.
    if (liveDraftAppender === appender) {
      liveDraftAppender = null
      liveDraftFlusher = null
      liveDraftRefresher = null
    }
  }
}

/**
 * Flushes a visible category's latest writing before the manager rescues its stored draft.
 *
 * Inactive categories already live in the host store. Called by category deletion
 * for both the source and destination so a retry sees a previous rescued append.
 *
 * @param categoryId - Category whose visible draft must reach the host first.
 * @returns Resolves after the mounted editor's save, or immediately for an inactive category.
 * @throws When the active editor cannot persist its draft; the caller must stop deletion.
 * @example
 * await flushCategoryDraft(12)
 */
export async function flushCategoryDraft(categoryId: number): Promise<void> {
  await liveDraftFlusher?.(categoryId)
}

/**
 * Refreshes a rescued draft when {@link useCategorySync} receives another window's notification.
 *
 * The mounted editor owns reconciliation because only it knows the latest typing.
 * An inactive category is read from the host normally when it is selected later.
 * @param categoryId - Destination whose stored writing gained the rescued text.
 * @param rescue - Immutable destination baseline and source text from the deleting window.
 * @returns Resolves after the visible destination has reconciled its writing.
 * @throws When the host cannot read or persist the reconciled draft.
 * @example
 * await refreshCategoryDraft(1)
 */
export async function refreshCategoryDraft(
  categoryId: number,
  rescue?: CategoryDraftRescue,
): Promise<void> {
  if (!liveDraftRefresher) return
  const receiptKey = rescue
    ? JSON.stringify([categoryId, rescue.receipt])
    : null
  // Repeated notifications share the in-flight save and never append a rescue twice.
  if (receiptKey && refreshedRescues.has(receiptKey)) {
    await refreshedRescues.get(receiptKey)
    return
  }
  const refresh = liveDraftRefresher(categoryId, rescue)
  if (receiptKey) refreshedRescues.set(receiptKey, refresh)
  try {
    const claimed = await refresh
    if (receiptKey && claimed !== true) refreshedRescues.delete(receiptKey)
    if (receiptKey && rescue && claimed === 'pending') {
      pendingRescues.set(receiptKey, { categoryId, rescue })
    }
    if (receiptKey && claimed === true) pendingRescues.delete(receiptKey)
  } catch (error) {
    if (receiptKey) refreshedRescues.delete(receiptKey)
    throw error
  }
}

/**
 * Preserves new local typing while incorporating writing rescued by another window.
 *
 * Called by the mounted draft refresher after reading the destination host store.
 * The last saved text is the common baseline; the incoming suffix is the rescue.
 * @param current - Latest visible text, including typing during the host read.
 * @param baseline - Last saved text for this same category.
 * @param incoming - Destination text read after the rescue notification.
 * @param preserveMatchingLocalText - True when the matching visible text was independently edited, rather than loaded with the rescue.
 * @returns Writing containing local changes and the incoming rescue without repeating a known suffix.
 * @example
 * mergeRescuedCategoryDraft('old\nnew', 'old', 'old\nrescued') // 'old\nnew\nrescued'
 */
export function mergeRescuedCategoryDraft(
  current: string,
  baseline: string,
  incoming: string,
  preserveMatchingLocalText = false,
): string {
  // A clean editor can accept the stored destination exactly.
  if (
    current === baseline ||
    (current === incoming && !preserveMatchingLocalText)
  )
    return incoming
  if (incoming === baseline) return current
  const addition = incoming.startsWith(baseline)
    ? incoming.slice(baseline.length).trimStart()
    : incoming
  if (!addition) return current
  return current ? `${current.trimEnd()}\n${addition}` : addition
}

/**
 * Adds text to the end of a category's draft, preferring the on-screen editor.
 * Exists because {@link LiveEditor} holds the whole note in React state: a write
 * straight to the store behind a live editor is invisible, and the next
 * keystroke's debounced save overwrites it with the stale in-memory copy.
 * Called when a deleted category hands its unsaved draft to the default one.
 * @param categoryId - Category whose draft grows.
 * @param text - Already-trimmed text to append on its own line.
 * @returns Resolves only after the merged draft has been accepted by the host store.
 * @throws When the source or destination host read/write fails; deletion must stop.
 * @example
 * await appendCategoryDraft(1, 'half a thought') // '- [ ] milk\nhalf a thought'
 */
export async function appendCategoryDraft(
  categoryId: number,
  text: string,
): Promise<void> {
  // A claimed append is not safe until the editor's host write has completed.
  if (await liveDraftAppender?.(categoryId, text)) return

  const host = getLiveEditorHost()
  const keptDraft = await host.note.get(categoryId)
  await host.note.set(
    categoryId,
    keptDraft ? `${keptDraft.trimEnd()}\n${text}` : text,
  )
}
