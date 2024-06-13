import { useRef } from 'react'

export function useIsFirstRender(): boolean {
  const mounted = useRef<boolean>()
  if (!mounted.current) {
    mounted.current = true
  } else {
    mounted.current = false
  }
  return mounted.current
}
