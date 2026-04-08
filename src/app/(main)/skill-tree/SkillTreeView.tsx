'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { SidebarTrigger } from '@/components/ui/sidebar'
import { orpc } from '@/lib/orpc/client-query'

import { ConstellationCanvas } from './components/ConstellationCanvas'
import { TaskPoolDrawer } from './components/TaskPoolDrawer'
import './styles.css'

/**
 * Main client-side view for the skill tree page.
 * This task (17) wires up queries and layout only — DnD comes in task 18.
 *
 * @returns A full-height flex layout containing the constellation canvas and
 *   the task pool drawer. Renders a loading indicator while the server data is
 *   in flight. No props are required — all data is fetched internally via oRPC.
 *
 * @example
 * ```tsx
 * // Used directly from the RSC page shell:
 * export default async function SkillTreePage() {
 *   const { userId } = await auth()
 *   if (!userId) redirect('/login')
 *   return <SkillTreeView />
 * }
 * ```
 */
export function SkillTreeView() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const { data: tree, isLoading: treeLoading } = useQuery(
    orpc.skillTree.getMyTree.queryOptions(),
  )
  const { data: pool, isLoading: poolLoading } = useQuery(
    orpc.skillTree.getUnassignedPool.queryOptions(),
  )

  if (treeLoading || poolLoading || !tree || !pool) {
    return (
      <div
        data-skill-tree="true"
        // eslint-disable-next-line dslint/token-only -- skill-tree scoped CSS class from styles.css
        className="st-canvas-bg flex h-full w-full items-center justify-center"
      >
        <div className="text-[var(--st-muted)]">Loading skill tree…</div>
      </div>
    )
  }

  const canvasNodes = tree.nodes.map((n) => ({
    id: n.id,
    name: n.name,
    x: n.x,
    y: n.y,
    xp: n.assignments.length,
  }))
  const canvasEdges = tree.edges.map((e) => ({
    id: e.id,
    fromNodeId: e.fromNodeId,
    toNodeId: e.toNodeId,
  }))
  const poolTodos = pool.map((t) => ({ id: t.id, text: t.text }))

  return (
    <div data-skill-tree="true" className="flex h-full w-full flex-col">
      <header className="window-drag-region flex h-16 shrink-0 items-center gap-2 border-b border-[var(--st-border-rune)] bg-[var(--st-bg-deep)] px-4 text-[var(--st-cream)]">
        <SidebarTrigger className="no-drag -ml-1" />
        <h2 className="text-lg font-medium text-[var(--st-gold)]">
          Skill Tree
        </h2>
      </header>
      <div className="relative flex-1 overflow-hidden">
        <ConstellationCanvas nodes={canvasNodes} edges={canvasEdges} />
        <TaskPoolDrawer
          todos={poolTodos}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
        />
      </div>
    </div>
  )
}
