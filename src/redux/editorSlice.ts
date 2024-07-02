import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

import type { Editor, EditorList } from '@/types/app'

export interface EditorSlice {
  mode: 'Simple' | 'Plate'
  currentText: Editor['text']
  currentCategory: Editor['category']['name']
  editorList: EditorList
}

const initialState: EditorSlice = {
  mode: 'Simple',
  currentCategory: 'general',
  currentText: '',
  editorList: [],
}

export const editorSlice = createSlice({
  name: 'Editor',
  initialState,
  reducers: {
    updateEditorMode: (state, action: PayloadAction<EditorSlice['mode']>) => {
      state.mode = action.payload
    },
    setCurrentText: (
      state,
      action: PayloadAction<EditorSlice['currentText']>,
    ) => {
      state.currentText = action.payload
    },
    removeCompletedTaskFromEditorText: (
      state,
      action: PayloadAction<Editor['text']>,
    ) => {
      const text = action.payload

      const ref = state.currentText.split(text)
      // Non duplicate scenario
      if (
        Array.isArray(ref) &&
        ref.length === 2 &&
        typeof ref[0] === 'string' &&
        typeof ref[1] === 'string'
      ) {
        state.currentText = ref[0] + ref[1]
      }

      // TODO Duplicate scenario
    },
  },
  selectors: {
    selectEditorMode: (state: EditorSlice) => state.mode,
    selectCurrentCategory: (state: EditorSlice) => state.currentCategory,
    selectCurrentText: (state: EditorSlice) => state.currentText,
  },
})

export const {
  updateEditorMode,
  setCurrentText,
  removeCompletedTaskFromEditorText,
} = editorSlice.actions

export const { selectCurrentCategory, selectEditorMode, selectCurrentText } =
  editorSlice.selectors
