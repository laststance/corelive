import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

import type { Editor, EditorList } from '@/types/app'

export interface EditorSlice {
  mode: 'Simple' | 'Plate'
  currentCategory: Editor['category']
  editorList: EditorList
}

const initialState: EditorSlice = {
  mode: 'Simple',
  currentCategory: 'general',
  editorList: [{ category: 'general', text: '' }],
}

export const editorSlice = createSlice({
  name: 'Editor',
  initialState,
  reducers: {
    updateEditorMode: (state, action: PayloadAction<EditorSlice['mode']>) => {
      state.mode = action.payload
    },
    setEditorText: (state, action: PayloadAction<Editor>) => {
      state.editorList = state.editorList.map((editor) => {
        if (editor.category === action.payload.category) {
          editor.text = action.payload.text
        }
        return editor
      })
    },
    removeCompletedTaskFromEditorText: (
      state,
      action: PayloadAction<Editor['text']>,
    ) => {
      const text = action.payload

      // remove completed item from editorList
      const cureentEditor = state.editorList.find(
        (editor) => editor.category === state.currentCategory,
      )!
      const ref = cureentEditor?.text.split(text)
      // Non duplicate scenario
      if (
        Array.isArray(ref) &&
        ref.length === 2 &&
        typeof ref[0] === 'string' &&
        typeof ref[1] === 'string'
      ) {
        cureentEditor.text = ref[0] + ref[1]
      }

      // TODO Duplicate scenario
    },
  },
  selectors: {
    selectEditorMode: (state: EditorSlice) => state.mode,
    selectCurrentCategory: (state: EditorSlice) => state.currentCategory,
    selectCurrenteEditorText: (state: EditorSlice) =>
      state.editorList?.find(
        (editor) => editor.category === state.currentCategory,
      )?.text,
  },
})

export const {
  updateEditorMode,
  setEditorText,
  removeCompletedTaskFromEditorText,
} = editorSlice.actions

export const {
  selectCurrentCategory,
  selectEditorMode,
  selectCurrenteEditorText,
} = editorSlice.selectors
