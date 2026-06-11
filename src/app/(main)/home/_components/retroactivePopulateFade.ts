import type { Todo } from './TodoItem'

/**
 * D8 retroactive-populate fade — duration of the 居残りモード OFF→ON enter fade.
 * Short tier per DESIGN.md Motion (150–250ms), matching the page-transition
 * fade. MUST stay in sync with the `duration-200` baked into
 * {@link RETROACTIVE_POPULATE_FADE_CLASS} (Tailwind needs a literal class, so the
 * value is duplicated); the cleanup timeout that strips the class reuses this.
 */
export const RETROACTIVE_POPULATE_FADE_MS = 200

/**
 * tw-animate-css class that fades a row IN (opacity 0→1) over
 * {@link RETROACTIVE_POPULATE_FADE_MS} with DESIGN.md enter easing (`ease-out`),
 * gated behind `motion-safe:` so `prefers-reduced-motion` users get the rows
 * instantly. Applied ONLY to rows that retroactively appear on a 居残りモード
 * OFF→ON toggle (D8) — never on an in-place check (D7, which stays quiet).
 */
export const RETROACTIVE_POPULATE_FADE_CLASS =
  'motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200 motion-safe:ease-out'

/**
 * Stable empty-set reference for the fade-id state + baseline ref, so an idle
 * list never re-renders rows just because a fresh `new Set()` changed identity.
 */
export const EMPTY_TODO_ID_SET: ReadonlySet<string> = new Set<string>()

/**
 * Picks the rows that should play the D8 retroactive-populate fade: completed
 * rows that are NEWLY present versus the previous render. Exists to tell a
 * 居残りモード mode-toggle (rows the refetch surfaced → fade IN) apart from an
 * in-place check (a row already on screen that flipped to completed → stays
 * quiet, D7). Called by `TodoList` on every settled render while a toggle is armed.
 *
 * @param currentTodos - Rows about to render (only `id` + `completed` are read).
 * @param previousVisibleTodoIds - Row ids from the previous committed render.
 * @returns
 * - The ids of completed rows absent last render (the retroactive-populate set)
 * - An empty array when nothing newly-completed appeared (e.g. an in-place check)
 * @example
 * // 居残りモード switched ON: row 2 (completed) was not visible before → fades
 * selectNewlyPresentCompletedTodoIds(
 *   [{ id: '1', completed: false }, { id: '2', completed: true }],
 *   new Set(['1']),
 * ) // => ['2']
 * @example
 * // In-place check: row 1 was already visible → no fade (D7 quiet)
 * selectNewlyPresentCompletedTodoIds(
 *   [{ id: '1', completed: true }],
 *   new Set(['1']),
 * ) // => []
 */
export function selectNewlyPresentCompletedTodoIds(
  currentTodos: ReadonlyArray<Pick<Todo, 'id' | 'completed'>>,
  previousVisibleTodoIds: ReadonlySet<string>,
): string[] {
  return currentTodos
    .filter((todo) => todo.completed && !previousVisibleTodoIds.has(todo.id))
    .map((todo) => todo.id)
}
