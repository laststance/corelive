import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

export interface EditorSlice {
  mode: 'Simple' | 'Plate'
  content: string
}

const initialState: EditorSlice = {
  mode: 'Simple',
  content: '',
}

export const editorSlice = createSlice({
  name: 'Editor',
  initialState,
  reducers: {
    updateEditorMode: (state, action: PayloadAction<EditorSlice['mode']>) => {
      state.mode = action.payload
    },
  },
  selectors: {
    selectEditorMode: (state: EditorSlice) => state.mode,
  },
})

export const { updateEditorMode } = editorSlice.actions

export const { selectEditorMode } = editorSlice.selectors
