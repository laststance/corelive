import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

import type { CompletedList, Editor, EditorList } from '@/types/app'

export interface EditorSlice {
  mode: 'Simple' | 'Plate'
  currentCategory: Editor['category']
  editorList: EditorList
  completedList: CompletedList
}

const initialState: EditorSlice = {
  mode: 'Simple',
  currentCategory: 'general',
  editorList: [{ category: 'general', text: '' }],
  completedList: [],
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
    setCompleted: (state, action: PayloadAction<Editor>) => {
      const { category, text } = action.payload

      // Add to completed task
      state.completedList.push({ category, title: text, archived: false })
      // remove completed item from editorList
      const cureentEditor = state.editorList.find(
        (editor) => editor.category === category,
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
    selectCompleted: (state: EditorSlice) => state.completedList,
  },
})

export const { updateEditorMode, setEditorText, setCompleted } =
  editorSlice.actions

export const {
  selectCurrentCategory,
  selectEditorMode,
  selectCurrenteEditorText,
  selectCompleted,
} = editorSlice.selectors
