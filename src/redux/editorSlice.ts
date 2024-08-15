import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { nanoid } from 'nanoid/non-secure'
export type CategoryId = ReturnType<typeof nanoid>
export interface Category {
  text: string
  name: string
}

export interface EditorSlice {
  currentCategoryId: CategoryId
  categories: Record<CategoryId, Category>
}

const defaultCategoryId = nanoid()

const initialState: EditorSlice = {
  currentCategoryId: defaultCategoryId,
  categories: {
    [defaultCategoryId]: { text: '', name: 'General' },
    [nanoid()]: { text: '', name: 'SubCategory' },
  },
}

export const editorSlice = createSlice({
  name: 'Editor',
  initialState,
  reducers: {
    switchCategory: (state, action: PayloadAction<CategoryId>) => {
      state.currentCategoryId = action.payload
    },
    setCurrentCategoryId: (
      state,
      action: PayloadAction<EditorSlice['currentCategoryId']>,
    ) => {
      state.currentCategoryId = action.payload
    },
    setCurrentCategoryText: (
      state,
      action: PayloadAction<EditorSlice['categories'][CategoryId]['text']>,
    ) => {
      state.categories[state.currentCategoryId]!.text = action.payload
    },
    addCategory: (state, action: PayloadAction<Category['name']>) => {
      state.categories[nanoid()] = { text: '', name: action.payload }
    },
    removeCategory: (state, action: PayloadAction<CategoryId>) => {
      delete state.categories[action.payload]
    },
    removeCompletedTaskFromEditorText: (
      state,
      action: PayloadAction<Category['text']>,
    ) => {
      const text = action.payload
      const ref = state.categories[state.currentCategoryId]!.text.split(text)
      // Non duplicate scenario
      if (
        Array.isArray(ref) &&
        ref.length === 2 &&
        typeof ref[0] === 'string' &&
        typeof ref[1] === 'string'
      ) {
        state.categories[state.currentCategoryId]!.text = ref[0] + ref[1]
      }

      // TODO Duplicate scenario
    },
  },
  selectors: {
    selectCurrentCategoryId: (state: EditorSlice) => state.currentCategoryId,
    selectCategories: (state: EditorSlice) => state.categories,
    selectSwitchDropdownCategories: (state: EditorSlice) => {
      const copy = { ...state.categories }
      delete copy[state.currentCategoryId]
      return copy
    },
  },
})

export const {
  switchCategory,
  setCurrentCategoryId,
  addCategory,
  removeCategory,
  setCurrentCategoryText,
  removeCompletedTaskFromEditorText,
} = editorSlice.actions

export const {
  selectCurrentCategoryId,
  selectCategories,
  selectSwitchDropdownCategories,
} = editorSlice.selectors
