import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

export interface CompletedSlice {
  completed: string[] & TODO
}

const initialState: CompletedSlice = {
  completed: [],
}

export const completedSlice = createSlice({
  name: 'Completed',
  initialState,
  reducers: {
    setCompleted: (
      state,
      action: PayloadAction<CompletedSlice['completed']>,
    ) => {
      state.completed.push(action.payload)
    },
  },
  selectors: {
    selectCompleted: (state: CompletedSlice) => state.completed,
  },
})

export const { setCompleted } = completedSlice.actions

export const { selectCompleted } = completedSlice.selectors
