import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

import type { User } from '@/types/app'

export interface UserSlice {
  user: User | null
}

const initialState: UserSlice = {
  user: null,
}

export const userSlice = createSlice({
  name: 'User',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<UserSlice['user']>) => {
      state.user = action.payload
    },
  },
  selectors: {
    selectUser: (state: UserSlice) => state.user,
  },
})

export const { setUser } = userSlice.actions

export const { selectUser } = userSlice.selectors
