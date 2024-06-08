import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

import type { EditorContent } from '@/zod/schema'

export interface EditorSlice {
  mode: 'Simple' | 'Plate'
  simpleEditorText: EditorContent
}

const initialState: EditorSlice = {
  mode: 'Simple',
  simpleEditorText: '',
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
  },
  selectors: {
    selectEditorMode: (state: EditorSlice) => state.mode,
    selectSimpleEditorText: (state: EditorSlice) => state.simpleEditorText,
  },
})

export const { updateEditorMode, setSimpleEditorText } = editorSlice.actions

export const { selectEditorMode, selectSimpleEditorText } =
  editorSlice.selectors
