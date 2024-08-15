import { createSlice } from '@reduxjs/toolkit'

export interface DrawerSlice {
  open: boolean
}

const initialState: DrawerSlice = {
  open: false,
}

export const drawerSlice = createSlice({
  name: 'Drawer',
  initialState,
  reducers: {
    toggleDrawer: (state) => {
      state.open = !state.open
    },
  },
  selectors: {
    selectDrawer: (state: DrawerSlice) => state.open,
  },
})

export const { toggleDrawer } = drawerSlice.actions

export const { selectDrawer } = drawerSlice.selectors
