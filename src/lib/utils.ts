import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getModalDOM(id: string): HTMLDialogElement {
  return document.getElementById(id) as HTMLDialogElement
}
