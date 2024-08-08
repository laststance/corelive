import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

import type { Category } from '@/types/prisma'

export interface CategorySlice {
  mode: 'Simple' | 'Todo'
  currentText: Category['text']
  currentCategory: Category['name']
  categories: Category[]
}

const initialState: CategorySlice = {
  mode: 'Simple',
  currentCategory: 'general',
  currentText: '',
  categories: [],
}

export const categorySlice = createSlice({
  name: 'Category',
  initialState,
  reducers: {
    updateEditorMode: (state, action: PayloadAction<CategorySlice['mode']>) => {
      state.mode = action.payload
    },
    setCurrentText: (
      state,
      action: PayloadAction<CategorySlice['currentText']>,
    ) => {
      state.currentText = action.payload
    },
    setCategories: (state, action: PayloadAction<Category[]>) => {
      state.categories = action.payload
    },
    removeCategory: (state, action: PayloadAction<Category['id']>) => {
      state.categories = state.categories.filter((category) => {
        return category.id !== action.payload
      })
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
    selectEditorMode: (state: CategorySlice) => state.mode,
    selectCurrentCategory: (state: CategorySlice) => state.currentCategory,
    selectCategories: (state: CategorySlice) => state.categories,
    selectCurrentText: (state: CategorySlice) => state.currentText,
  },
})

export const {
  updateEditorMode,
  setCurrentText,
  setCategories,
  removeCompletedTaskFromEditorText,
  removeCategory,
} = categorySlice.actions

export const {
  selectCurrentCategory,
  selectEditorMode,
  selectCurrentText,
  selectCategories,
} = categorySlice.selectors
