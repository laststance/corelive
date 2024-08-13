import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

export interface Category {
  text: string
  name: string
}

export interface EditorSlice {
  mode: 'Simple' | 'Todo'
  currentText: Category['text']
  currentCategory: Category['name']
  categories: Category[]
}

const initialState: EditorSlice = {
  mode: 'Simple',
  currentCategory: 'General',
  currentText: '',
  categories: [
    { text: '', name: 'General' },
    { text: '', name: 'SubCategory' },
  ],
}

export const editorSlice = createSlice({
  name: 'Editor',
  initialState,
  reducers: {
    switchCategory: (
      state,
      action: PayloadAction<{
        nextCategory: Category['name']
      }>,
    ) => {
      for (const category of state.categories) {
        if (category.name === action.payload.nextCategory) {
          state.currentCategory = action.payload.nextCategory
          state.currentText = category.text
          break
        }
      }
    },
    updateEditorMode: (state, action: PayloadAction<EditorSlice['mode']>) => {
      state.mode = action.payload
    },
    setCurrentText: (
      state,
      action: PayloadAction<EditorSlice['currentText']>,
    ) => {
      state.currentText = action.payload
    },
    setCurrentCategory: (
      state,
      action: PayloadAction<EditorSlice['currentCategory']>,
    ) => {
      state.currentCategory = action.payload
    },
    addCategory: (state, action: PayloadAction<Category['name']>) => {
      state.categories.push({ text: '', name: action.payload })
    },
    removeCategory: (state, action: PayloadAction<Category['name']>) => {
      state.categories = state.categories.filter(
        (category) => category.name !== action.payload,
      )
    },
    removeCompletedTaskFromEditorText: (
      state,
      action: PayloadAction<Category['text']>,
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
    selectCategories: (state: EditorSlice) => state.categories,
    selectCurrentText: (state: EditorSlice) => state.currentText,
  },
})

export const {
  updateEditorMode,
  setCurrentText,
  setCurrentCategory,
  addCategory,
  removeCategory,
  removeCompletedTaskFromEditorText,
} = editorSlice.actions

export const {
  selectCurrentCategory,
  selectEditorMode,
  selectCurrentText,
  selectCategories,
} = editorSlice.selectors
