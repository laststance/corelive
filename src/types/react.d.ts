import type React from 'react'
import type { SetStateAction } from 'react'

declare module 'react' {
  export type SetState<S> = React.Dispatch<SetStateAction<S>>
}
