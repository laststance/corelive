import { useCallback, useRef, useState } from 'react'

/**
 * Keeps reducer-style local state without calling React.useReducer directly.
 *
 * This is a migration bridge for form-like state machines that are not large
 * enough for Redux Toolkit but still benefit from action-based updates.
 *
 * @param reducer - Pure state transition function.
 * @param initialState - Initial state value used by React.useState.
 * @returns Current state and a stable dispatch function.
 * @example
 * const [state, dispatch] = useReducerState(reducer, initialState)
 */
export function useReducerState<State, Action>(
  reducer: (state: State, action: Action) => State,
  initialState: State,
): readonly [State, (action: Action) => void] {
  const [state, setState] = useState(initialState)
  const reducerRef = useRef(reducer)
  reducerRef.current = reducer

  const dispatch = useCallback((action: Action) => {
    setState((currentState) => reducerRef.current(currentState, action))
  }, [])

  return [state, dispatch] as const
}
