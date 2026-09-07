import { getLiveEditorHost } from './liveEditorHost'

/**
 * Claim handler a mounted editor installs: takes the text when it is the one
 * showing that category, declines otherwise so the caller writes to the store.
 */
type LiveDraftAppender = (categoryId: number, text: string) => boolean

/**
 * The single on-screen editor's claim handler, or null when none is mounted
 * (`/home`, SSR). Module-level because the only question it answers — "is a
 * live editor showing this category right now?" — has exactly one answer per
 * renderer, and threading it as a prop would cross three components that have
 * no other reason to know about drafts.
 */
let liveDraftAppender: LiveDraftAppender | null = null

/**
 * Lets the mounted {@link LiveEditor} claim appends to the category it displays.
 * Called once per editor mount; the returned cleanup runs on unmount.
 * @param appender - Returns true once it has absorbed the text, false to decline.
 * @returns Unregister function; a no-op if another editor already took over.
 * @example
 * useInitialEffect(() => registerLiveDraftAppender((id, text) => false))
 */
export function registerLiveDraftAppender(
  appender: LiveDraftAppender,
): () => void {
  liveDraftAppender = appender
  return () => {
    if (liveDraftAppender === appender) liveDraftAppender = null
  }
}

/**
 * Adds text to the end of a category's draft, preferring the on-screen editor.
 * Exists because {@link LiveEditor} holds the whole note in React state: a write
 * straight to the store behind a live editor is invisible, and the next
 * keystroke's debounced save overwrites it with the stale in-memory copy.
 * Called when a deleted category hands its unsaved draft to the default one.
 * @param categoryId - Category whose draft grows.
 * @param text - Already-trimmed text to append on its own line.
 * @returns Nothing; resolves once the editor absorbed it or the store accepted it.
 * @example
 * await appendCategoryDraft(1, 'half a thought') // '- [ ] milk\nhalf a thought'
 */
export async function appendCategoryDraft(
  categoryId: number,
  text: string,
): Promise<void> {
  if (liveDraftAppender?.(categoryId, text)) return

  const host = getLiveEditorHost()
  const keptDraft = await host.note.get(categoryId)
  await host.note.set(
    categoryId,
    keptDraft ? `${keptDraft.trimEnd()}\n${text}` : text,
  )
}
