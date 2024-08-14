import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

export interface Category {
  text: string
  name: string
}

export interface EditorSlice {
  currentCategory: Category
  categories: Category[]
}

const initialState: EditorSlice = {
  currentCategory: { text: '', name: 'General' },
  categories: [
    { text: '', name: 'General' },
    { text: '', name: 'SubCategory' },
  ],
}

export const editorSlice = createSlice({
  name: 'Editor',
  initialState,
  reducers: {
    switchCategory: (state, action: PayloadAction<Category>) => {
      state.categories = state.categories.map((category) => {
        if (category.name === state.currentCategory.name) {
          category.text = state.currentCategory.text
        }
        return category
      })

      state.currentCategory = action.payload
    },
    setCurrentCategory: (
      state,
      action: PayloadAction<EditorSlice['currentCategory']>,
    ) => {
      state.currentCategory = action.payload
    },
    setCurrentCategoryText: (
      state,
      action: PayloadAction<Category['text']>,
    ) => {
      state.currentCategory.text = action.payload
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
      const ref = state.currentCategory.text.split(text)
      // Non duplicate scenario
      if (
        Array.isArray(ref) &&
        ref.length === 2 &&
        typeof ref[0] === 'string' &&
        typeof ref[1] === 'string'
      ) {
        state.currentCategory.text = ref[0] + ref[1]
      }

      // TODO Duplicate scenario
    },
  },
  selectors: {
    selectCurrentCategory: (state: EditorSlice) => state.currentCategory,
    selectCategories: (state: EditorSlice) => state.categories,
  },
})

export const {
  switchCategory,
  setCurrentCategory,
  setCurrentCategoryText,
  addCategory,
  removeCategory,
  removeCompletedTaskFromEditorText,
} = editorSlice.actions

export const { selectCurrentCategory, selectEditorMode, selectCategories } =
  editorSlice.selectors
