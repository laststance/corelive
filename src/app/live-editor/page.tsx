'use client'

import { useQuery } from '@tanstack/react-query'

import { LiveEditor } from '@/components/live-editor/LiveEditor'
import { useClerkQueryReady } from '@/hooks/useClerkQueryReady'
import { orpc } from '@/lib/orpc/client-query'
import type { CategoryWithCount } from '@/server/schemas/category'

/**
 * Route loaded by the LiveEditor Electron window
 * (`https://corelive.app/live-editor`). Protected by `src/proxy.ts`, so the
 * packaged panel keeps its `/login` redirect contract while signed out.
 *
 * Opened in a normal browser tab it renders the same editor through the web
 * host (device-local notes, account keeps); the public, signed-out-capable
 * browser entry point is `/write`.
 */
const LiveEditorPage = function LiveEditorPage() {
  const isClerkReady = useClerkQueryReady()
  const { data, isLoading, error } = useQuery({
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

  // Distinguish a network/server failure from a legitimately empty list so
  // users don't stare at a "No categories" editor when the API is broken.
  if (error) {
    return (
      <div className="bg-background/60 flex h-screen w-full items-center justify-center px-6 text-center text-sm text-destructive">
        Couldn’t load categories. Check your connection and try reopening
        LiveEditor.
      </div>
    )
  }

  return (
    <div className="bg-background/40 h-screen w-full overflow-hidden">
      <LiveEditor categories={categories} />
    </div>
  )
}

export default LiveEditorPage
