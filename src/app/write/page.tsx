'use client'

import { useUser } from '@clerk/nextjs'
import { useQuery } from '@tanstack/react-query'

import { LiveEditor } from '@/components/live-editor/LiveEditor'
import { orpc } from '@/lib/orpc/client-query'
import type { CategoryWithCount } from '@/server/schemas/category'

/**
 * Public `/write` route — the no-login LiveEditor. It is not in the
 * `src/proxy.ts` protected list, so a stranger lands here already writing:
 * `LiveEditor` paints its web frame (caption row, a disabled stand-in textarea
 * with the real placeholder, footer) at first paint and turns live once Clerk
 * resolves — no spinner (design review DR5). Signed in it loads the account's
 * categories; signed out the editor writes into the implicit local category.
 * `/live-editor` stays the Electron panel's protected route (D14).
 */
const WritePage = function WritePage() {
  const { isSignedIn } = useUser()
  const { data } = useQuery({
    ...orpc.category.list.queryOptions({}),
    // Signed-out visitors never trigger a server read; the list stays empty.
    enabled: isSignedIn === true,
  })
  const categories: CategoryWithCount[] = data?.categories ?? []

  return (
    <main className="min-h-dvh w-full bg-background text-foreground">
      <LiveEditor categories={categories} />
    </main>
  )
}

export default WritePage
