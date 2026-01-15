import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// IME変換中はEnterキーでSubmitしない
export function isEnterKeyPress(event: React.KeyboardEvent): boolean {
  if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
    return true
  }
  return false
}
