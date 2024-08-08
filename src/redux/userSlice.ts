import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

import type { User } from '@/types/prisma'

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
    selectUserId: (state: UserSlice) => state.user?.id,
  },
})

export const { setUser } = userSlice.actions

export const { selectUser, selectUserId } = userSlice.selectors
