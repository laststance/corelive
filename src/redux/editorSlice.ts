import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

import type { EditorContent } from '@/zod/schema'

export interface EditorSlice {
  mode: 'Simple' | 'Plate'
  simpleEditorText: EditorContent
  completed: string[]
}

const initialState: EditorSlice = {
  mode: 'Simple',
  simpleEditorText: '',
  completed: [],
}

export const editorSlice = createSlice({
  name: 'Editor',
  initialState,
  reducers: {
    updateEditorMode: (state, action: PayloadAction<EditorSlice['mode']>) => {
      state.mode = action.payload
    },
    setSimpleEditorText: (
      state,
      action: PayloadAction<EditorSlice['simpleEditorText']>,
    ) => {
      state.simpleEditorText = action.payload
    },
    setCompleted: (state, action: PayloadAction<string>) => {
      // Add to completed task
      state.completed.push(action.payload)
      // remove completed item from simpleEditorText
      const ref = state.simpleEditorText.split(action.payload)
      // Non duplicate scenario
      if (
        Array.isArray(ref) &&
        ref.length === 2 &&
        typeof ref[0] === 'string' &&
        typeof ref[1] === 'string'
      ) {
        state.simpleEditorText = ref[0] + ref[1]
      }

      // TODO Duplicate scenario
    },
  },
  selectors: {
    selectEditorMode: (state: EditorSlice) => state.mode,
    selectSimpleEditorText: (state: EditorSlice) => state.simpleEditorText,
    selectCompleted: (state: EditorSlice) => state.completed,
  },
})

export const { updateEditorMode, setSimpleEditorText, setCompleted } =
  editorSlice.actions

export const { selectEditorMode, selectSimpleEditorText, selectCompleted } =
  editorSlice.selectors
