import { toggleDrawer } from '@/redux/drawerSlice'

export const drawerListener = {
  actionCreator: toggleDrawer,
  effect: performToggleDrawerEffect,
}

function performToggleDrawerEffect(): void {
  const checkbox = document.querySelector('#sidebar') as HTMLInputElement
  checkbox.checked = !checkbox.checked
}
