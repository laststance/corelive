import type { Action } from '@reduxjs/toolkit'

import { toggleDrawer } from '@/redux/drawerSlice'
import type { AppListenerEffectAPI } from '@/redux/store'

export const drawerListener = {
  actionCreator: toggleDrawer,
  effect: performToggleDrawerEffect,
}

function performToggleDrawerEffect(
  _action: Action,
  listenerApi: AppListenerEffectAPI,
): void {
  const checkbox = document.querySelector('#sidebar') as HTMLInputElement
  checkbox.checked = listenerApi.getState().Drawer.drawer
}
