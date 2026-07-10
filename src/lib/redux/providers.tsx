'use client'

/**
 * Redux Provider Component
 *
 * Provides the Redux store to the React component tree.
 * This is a client component for SSR-safe Redux integration
 * with Next.js App Router.
 *
 * The redux-storage-middleware handles SSR-safe hydration automatically,
 * so no additional state rehydration logic is needed.
 *
 * @module lib/redux/providers
 *
 * @example
 * // In app/layout.tsx
 * import { memo } from 'react'
 * import { ReduxProvider } from '@/lib/redux/providers'
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <ReduxProvider>
 *           {children}
 *         </ReduxProvider>
 *       </body>
 *     </html>
 *   )
 * }
 */
import { type ReactNode } from 'react'
import { Provider } from 'react-redux'

import { store } from './store'

// Capture the server-rendered default before the storage middleware's hydration
// microtask runs. React Redux uses this for the first browser render, then
// immediately publishes the restored localStorage state without losing an
// update that completed before descendant subscriptions were attached.
const serverState = store.getState()

/**
 * Props for ReduxProvider component.
 */
interface ReduxProviderProps {
  /** Child components to wrap with Redux context */
  children: ReactNode
}

/**
 * Redux Provider for Next.js App Router.
 *
 * Wraps children with React-Redux Provider, making the Redux store
 * available to all descendant components via hooks.
 *
 * The store uses redux-storage-middleware for localStorage persistence,
 * which automatically handles SSR-safe hydration on the client side.
 *
 * @param props - Provider props containing children
 * @returns Provider-wrapped children
 *
 * @example
 * <ReduxProvider>
 *   <HomePage />
 * </ReduxProvider>
 */
export const ReduxProvider = function ReduxProvider({
  children,
}: ReduxProviderProps): ReactNode {
  return (
    <Provider store={store} serverState={serverState}>
      {children}
    </Provider>
  )
}
