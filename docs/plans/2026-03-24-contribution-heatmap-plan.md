# Plan: Contribution Heatmap (草UI) — Pattern 1: GitHub Classic

## Overview

GitHub-style contribution heatmap in the right pane, above CompletedTodos.
Hover shows category breakdown tooltip, click shows day details via popover.

## Pre-existing (already done)

- `@uiw/react-heat-map` v2.3.3 installed
- `src/server/schemas/completed.ts` — Zod schemas for heatmap API
- `src/server/procedures/completed.ts` — `getHeatmap` procedure (aggregates completed todos by date + category)
- `src/server/router.ts` — `completed.heatmap` registered

## Task 1: Create useHeatmapData hook

**File**: `src/hooks/useHeatmapData.ts` (CREATE)

### Step 1.1: Create hook file

```typescript
'use client'

import { useQuery } from '@tanstack/react-query'
import { orpc } from '@/lib/orpc/client-query'

export type HeatmapDay = {
  date: string
  count: number
  categories: { id: number; name: string; color: string; count: number }[]
}

export function useHeatmapData(days: number = 365) {
  const { data, isLoading, isError } = useQuery(
    orpc.completed.heatmap.queryOptions({ input: { days } }),
  )

  const heatmapValues =
    data?.data.map((d) => ({
      date: d.date.replace(/-/g, '/'),
      count: d.count,
    })) ?? []

  const dataByDate = new Map(data?.data.map((d) => [d.date, d]) ?? [])

  return {
    heatmapValues,
    dataByDate,
    streaks: data?.streaks ?? { current: 0, longest: 0 },
    total: data?.total ?? 0,
    isLoading,
    isError,
  }
}
```

**Verify**: `pnpm typecheck` passes

---

## Task 2: Create ContributionGraph component

**File**: `src/app/home/_components/ContributionGraph.tsx` (CREATE)

### Step 2.1: Create component

Key design:

- `@uiw/react-heat-map` with `rectRender` for shadcn Tooltip
- Green gradient: `#161b22` → `#0e4429` → `#006d32` → `#26a641` → `#39d353`
- Card wrapper with "Activity" title + Badge total
- `overflow-x-auto` for responsive
- `CategoryBreakdown` sub-component for tooltip content
- Category color map: blue→#3b82f6, red→#ef4444, green→#22c55e, etc.

### Step 2.2: Component structure

```
<Card>
  <CardHeader>
    <CardTitle>Activity <Badge>{total} completed</Badge></CardTitle>
    <CardDescription>Task completions in the last year</CardDescription>
  </CardHeader>
  <CardContent>
    <div className="overflow-x-auto">
      <TooltipProvider>
        <HeatMap
          value={heatmapValues}
          startDate={365 days ago}
          weekLabels={['', 'Mon', '', 'Wed', '', 'Fri', '']}
          panelColors={green gradient}
          rectSize={11}
          space={2}
          rectRender={(props, data) => {
            // Wrap <rect> with shadcn Tooltip
            // Look up categoryData via dataByDate.get(dateKey)
          }}
        />
      </TooltipProvider>
    </div>
    {/* Legend: Less → gradient squares → More */}
  </CardContent>
</Card>
```

### Step 2.3: Tooltip content

Each tooltip shows:

- Formatted date (e.g., "March 24, 2026")
- Per-category: colored dot + name + count
- Total count

**Verify**: `pnpm typecheck` passes

---

## Task 3: Integrate into TodoList right column

**File**: `src/app/home/_components/TodoList.tsx` (MODIFY)

### Step 3.1: Import ContributionGraph

Add import at top of file:

```typescript
import { ContributionGraph } from './ContributionGraph'
```

### Step 3.2: Modify right column layout

Current (line ~332):

```jsx
<div className="h-full">
  <CompletedTodos ... />
</div>
```

Change to:

```jsx
<div className="space-y-6">
  <ContributionGraph />
  <CompletedTodos ... />
</div>
```

Remove `h-full` since we now have two cards stacked.

**Verify**: `pnpm typecheck && pnpm lint`

---

## Task 4: Visual verification

### Step 4.1: Start dev server

```bash
pnpm dev
```

### Step 4.2: Navigate to localhost:3011/home (logged in)

- Confirm ContributionGraph card appears above CompletedTodos
- Confirm heatmap renders with green gradient
- Confirm hover tooltip shows date + category breakdown
- Confirm responsive (overflow-x-auto works on narrow screens)

### Step 4.3: Run full validation

```bash
pnpm validate
```

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────┐
│ TodoList.tsx                                          │
│  grid grid-cols-1 lg:grid-cols-2                     │
│  ├── Left: Todo List Card + DnD Items                │
│  └── Right:                                          │
│       ├── ContributionGraph Card (NEW)               │
│       │    ├── useHeatmapData(365)                   │
│       │    │    └── orpc.completed.heatmap            │
│       │    │         └── Prisma: Todo(completed=true) │
│       │    ├── @uiw/react-heat-map (SVG)             │
│       │    ├── shadcn Tooltip (hover)                │
│       │    └── Legend (Less → More)                   │
│       └── CompletedTodos Card (existing)             │
└──────────────────────────────────────────────────────┘
```

## Files Summary

| Action | File                                             |
| ------ | ------------------------------------------------ |
| CREATE | `src/hooks/useHeatmapData.ts`                    |
| CREATE | `src/app/home/_components/ContributionGraph.tsx` |
| MODIFY | `src/app/home/_components/TodoList.tsx`          |
| EXISTS | `src/server/schemas/completed.ts`                |
| EXISTS | `src/server/procedures/completed.ts`             |
| EXISTS | `src/server/router.ts` (already modified)        |
