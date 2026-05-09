'use client'

import { useQuery } from '@tanstack/react-query'

import { BrainDumpEditor } from '@/components/braindump/BrainDumpEditor'
import { useClerkQueryReady } from '@/hooks/useClerkQueryReady'
import { orpc } from '@/lib/orpc/client-query'
import type { CategoryWithCount } from '@/server/schemas/category'

/**
 * Route loaded by the BrainDump Electron window
 * (`https://corelive.app/braindump`).
 *
 * The route is intentionally browser-tolerant: when opened in a normal tab
 * (no `brainDumpAPI`), the editor renders a placeholder message so devs can
 * iterate from a regular Next.js dev server.
 */
export default function BrainDumpPage() {
  const isClerkReady = useClerkQueryReady()
  const { data, isLoading } = useQuery({
    ...orpc.category.list.queryOptions({}),
    enabled: isClerkReady,
  })
  const categories: CategoryWithCount[] = data?.categories ?? []

  if (isLoading || !isClerkReady) {
    return (
      <div className="bg-background/60 flex h-screen w-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  return (
    <div className="bg-background/40 h-screen w-full overflow-hidden">
      <BrainDumpEditor categories={categories} />
    </div>
  )
}
