'use client'

import { createORPCReactQueryUtils } from '@orpc/react-query'
import type { RouterClient } from '@orpc/server'
import { QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

import type { AppRouter } from '@/server/router'

import { createQueryClient } from '../lib/orpc/query-client'
import { createClient } from '../lib/orpc/unified-client'

// oPRC React Query ユーティリティの作成
// Create oPRC React Query utilities
export function useORPCUtils() {
  const [client] = useState<RouterClient<AppRouter>>(() => createClient())
  const [orpc] = useState(() => createORPCReactQueryUtils(client))

  return orpc
}

// Providers コンポーネント
// Providers component
export function ORPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => createQueryClient())

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
