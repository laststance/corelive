import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

export interface BackDropSlice {
  drawer: boolean
}

const initialState: BackDropSlice = {
  drawer: false,
}

export const backDropSlice = createSlice({
  name: 'Editor',
  initialState,
  reducers: {
    openDrawer: (state) => {
      state.drawer = true
    },
    closeDrawer: (state) => {
      state.drawer = false
    },
  },
  selectors: {
    selectDrawer: (state: BackDropSlice) => state.drawer,
  },
})

export const { openDrawer, closeDrawer } = backDropSlice.actions

export const { selectDrawer } = backDropSlice.selectors
