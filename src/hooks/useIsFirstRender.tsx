import { useRef } from 'react'

export function useIsFirstRender(): boolean {
  const mounted = useRef<boolean | null>(null)
  if (mounted.current === null) {
    mounted.current = true
  } else {
    mounted.current = false
  }
  return mounted.current
}
