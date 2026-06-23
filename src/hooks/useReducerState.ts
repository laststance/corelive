import { useReducer } from 'react'

/**
 * Keeps reducer-style local state for form-like state machines too small for
 * Redux Toolkit but that still benefit from action-based updates. Backed by
 * React.useReducer, so `dispatch` keeps a stable identity for the component's
 * lifetime (safe to pass as a prop or list in an effect's deps).
 *
 * @param reducer - Pure state transition function.
 * @param initialState - Initial state value.
 * @returns Current state and a stable dispatch function.
 * @example
 * const [state, dispatch] = useReducerState(reducer, initialState)
 */
export function useReducerState<State, Action>(
  reducer: (state: State, action: Action) => State,
  initialState: State,
): readonly [State, (action: Action) => void] {
  const [state, dispatch] = useReducer(reducer, initialState)

  return [state, dispatch] as const
}
