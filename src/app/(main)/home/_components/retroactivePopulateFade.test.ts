import { describe, expect, it } from 'vitest'

import { selectNewlyPresentCompletedTodoIds } from './retroactivePopulateFade'

// The D8/D7 boundary lives here: switching 居残りモード ON fades in the
// completed-since-clear rows the refetch surfaces, while checking a task that is
// already on screen must stay quiet. If this gate regresses, an in-place check
// would wrongly flash a fade (breaks D7) or the retroactively-loaded rows would
// pop in with no motion (breaks D8).
describe('selectNewlyPresentCompletedTodoIds — 居残りモード retroactive-populate fade gate', () => {
  it('fades the completed tasks that retroactively appear when 居残りモード is switched on', () => {
    // Arrange: before the toggle only pending rows were visible; the refetch now
    // surfaces two completed-since-clear rows alongside them.
    const previousVisibleTodoIds = new Set(['1', '2'])
    const currentTodos = [
      { id: '1', completed: false },
      { id: '2', completed: false },
      { id: '3', completed: true },
      { id: '4', completed: true },
    ]

    // Act
    const fadeIds = selectNewlyPresentCompletedTodoIds(
      currentTodos,
      previousVisibleTodoIds,
    )

    // Assert: only the newly-surfaced completed rows fade in.
    expect(fadeIds).toEqual(['3', '4'])
  })

  it('stays quiet when a task already on screen is checked off in place (no false D8 fade)', () => {
    // Arrange: row 1 was already visible (pending) and the user just checked it —
    // same id, now completed. That is an in-place check, not a populate.
    const previousVisibleTodoIds = new Set(['1', '2'])
    const currentTodos = [
      { id: '1', completed: true },
      { id: '2', completed: false },
    ]

    // Act
    const fadeIds = selectNewlyPresentCompletedTodoIds(
      currentTodos,
      previousVisibleTodoIds,
    )

    // Assert: an already-present row never fades — the check stays quiet (D7).
    expect(fadeIds).toEqual([])
  })

  it('fades nothing when the toggle surfaces no completed tasks', () => {
    // Arrange: 居残りモード on, but nothing has been completed since the last clear.
    const previousVisibleTodoIds = new Set(['1'])
    const currentTodos = [{ id: '1', completed: false }]

    // Act
    const fadeIds = selectNewlyPresentCompletedTodoIds(
      currentTodos,
      previousVisibleTodoIds,
    )

    // Assert
    expect(fadeIds).toEqual([])
  })

  it('does not re-fade a completed task that was already visible last render', () => {
    // Arrange: a completed row that persisted across renders (it already faded
    // once on the toggle that surfaced it).
    const previousVisibleTodoIds = new Set(['3'])
    const currentTodos = [{ id: '3', completed: true }]

    // Act
    const fadeIds = selectNewlyPresentCompletedTodoIds(
      currentTodos,
      previousVisibleTodoIds,
    )

    // Assert: present last render → not newly present → no replay.
    expect(fadeIds).toEqual([])
  })
})
