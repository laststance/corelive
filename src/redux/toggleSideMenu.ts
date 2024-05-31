export function toggleSideMenu() {
  const checkbox = document.querySelector('#sidebar') as HTMLInputElement

  checkbox.checked = !checkbox.checked
}
