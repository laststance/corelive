import { createSlice } from '@reduxjs/toolkit'

export interface SideMenuSlice {
  drawer: boolean
}

const initialState: SideMenuSlice = {
  drawer: false,
}

export const sideMenuSlice = createSlice({
  name: 'SideMenu',
  initialState,
  reducers: {
    toggleDrawer: (state) => {
      state.drawer = !state.drawer
    },
  },
  selectors: {
    selectDrawer: (state: SideMenuSlice) => state.drawer,
  },
})

export const { toggleDrawer } = sideMenuSlice.actions

export const { selectDrawer } = sideMenuSlice.selectors
