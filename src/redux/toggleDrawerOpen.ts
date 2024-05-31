export function toggleDrawerOpen(): void {
  const checkbox = document.querySelector('#sidebar') as HTMLInputElement
  checkbox.checked = !checkbox.checked
}
