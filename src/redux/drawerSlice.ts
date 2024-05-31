import { createSlice } from '@reduxjs/toolkit'

export interface DrawerSlice {
  drawer: boolean
}

const initialState: DrawerSlice = {
  drawer: false,
}

export const drawerSlice = createSlice({
  name: 'Drawer',
  initialState,
  reducers: {
    toggleDrawer: (state) => {
      state.drawer = !state.drawer
    },
  },
  selectors: {
    selectDrawer: (state: DrawerSlice) => state.drawer,
  },
})

export const { toggleDrawer } = drawerSlice.actions

export const { selectDrawer } = drawerSlice.selectors
