import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

import type { Editor, EditorList } from '@/types/app'

export interface EditorSlice {
  mode: 'Simple' | 'Plate' | 'Todo'
  editorList: EditorList
  // TODO map Prisma type
  completed: string[]
}

const initialState: EditorSlice = {
  mode: 'Simple',
  editorList: [{ category: 'general', text: '' }],
  completed: [],
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
      state.completed.push(ac)
      // remove completed item from editorList
      const ref = state.s.split(action.payload)
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

export const { updateEditorMode, setEditorText, setCompleted } =
  editorSlice.actions

export const { selectEditorMode, selectSimpleEditorText, selectCompleted } =
  editorSlice.selectors
