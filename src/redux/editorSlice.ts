import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

export interface EditorSlice {
  editorMode: 'Simple' | 'Plate'
}

const initialState: EditorSlice = {
  editorMode: 'Simple',
}

export const editorSlice = createSlice({
  name: 'Editor',
  initialState,
  reducers: {
    updateEditorMode: (
      state,
      action: PayloadAction<EditorSlice['editorMode']>,
    ) => {
      state.editorMode = action.payload
    },
  },
  selectors: {
    selectEditorMode: (state: EditorSlice) => state.editorMode,
  },
})

export const { updateEditorMode } = editorSlice.actions

export const { selectEditorMode } = editorSlice.selectors
