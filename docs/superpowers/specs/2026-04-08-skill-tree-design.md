# Skill Tree Feature — Design Spec

**Date:** 2026-04-08
**Status:** Draft — pending implementation
**Owner:** Raphtalia
**Related:** Brainstorming session 31210-1775649329

---

## Overview

Add a new `/skill-tree` screen to CoreLive that visualizes the user's accumulated completed tasks as experience points (XP) on a skill tree. The user can drag completed tasks from a pool into nodes to earn XP, level up nodes, and master skills. The experience is inspired by Final Fantasy's Sphere Grid and RPG-style skill trees, with a Dark Fantasy aesthetic.

V1 ships a "Minimum" scope: one hardcoded "Backend Developer Core" template, core drag-and-drop allocation, levels 1–5 with mastery, and Dark Fantasy visuals. Node CRUD, AI suggestions, multiple templates, and advanced features are explicitly deferred to V2+.

## Goals & Non-Goals

### Goals

- Give users a visual, gamified representation of their accumulated work across skill areas
- Let users allocate completed tasks to skill nodes via an intuitive drag-and-drop interaction
- Provide a satisfying progression arc (Dormant → Lv1 → … → Mastered) with visual feedback at each threshold
- Ship the minimum viable experience that lets us validate whether users find it motivating

### Non-Goals (V1)

- Supporting multiple skill tree templates or a template marketplace
- Letting users add, rename, or delete nodes themselves
- Integrating AI-based suggestions (during task creation or auto-allocation)
- Supporting prerequisite gates (locked nodes)
- Providing social/sharing features

## Assumptions

- Users are authenticated via Clerk (existing)
- Users have at least some completed tasks to allocate (the feature is valuable only when there's something to drop)
- V1 ships on both web (corelive.app) and macOS Electron (same codepath, WebView)
- The default template fits most users well enough to test the core loop — we will learn from feedback before building customization
- Performance is not a concern at V1 scale (≤30 nodes per tree, ≤thousands of completed tasks per user)

## User Flow

```
1. User clicks "Skill Tree" in the sidebar
    ↓
2. /skill-tree loads the user's tree (or auto-imports default template on first visit)
    ↓
3. User sees the constellation-style tree with current XP state
    ↓
4. If unassigned completed tasks exist → bottom pill appears: "📦 N unassigned tasks ▲" (N = count)
    ↓
5. User taps pill → drawer slides up with horizontally-scrollable task cards
    ↓
6. User drags a task card from the drawer onto a node
    ↓
7. Node highlights (arcane ring + tooltip) while hovered
    ↓
8. User releases → burst animation + "+1 XP" floating text + optimistic state update
    ↓
9. Server persists the assignment; if successful, the optimistic state reconciles.
   If level threshold crossed, node plays Level-Up flash animation
    ↓
10. User can repeat until all tasks are allocated, or click a node to open a
    popover and unassign (×) tasks to return them to the pool
```

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│ Browser / Electron WebView                                       │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ /skill-tree (RSC shell)                                    │ │
│  │   ↓                                                         │ │
│  │ <SkillTreeView>  — 'use client', wraps DndContext          │ │
│  │   ├─ <ConstellationCanvas>                                 │ │
│  │   │    └─ N × <SkillNodeCircle>  (useDroppable + 44×44 hit)│ │
│  │   ├─ <TaskPoolDrawer>                                      │ │
│  │   │    └─ N × <TaskPoolCard>  (useDraggable)               │ │
│  │   ├─ <DragOverlayCard>   (floating drag preview)           │ │
│  │   └─ <NodePopover>   (unassign UI)                         │ │
│  └────────────────────────────────────────────────────────────┘ │
│          ↑↓                                                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ TanStack Query + useOptimistic + orpcClient                │ │
│  └────────────────────────────────────────────────────────────┘ │
│          ↑↓ HTTP                                                 │
└──────────│───────────────────────────────────────────────────────┘
           │
┌──────────│───────────────────────────────────────────────────────┐
│ Next.js   API: /api/orpc/*                                       │
│                                                                  │
│  src/server/procedures/skillTree.ts:                             │
│    - getMyTree       (fetch or auto-import on first visit)       │
│    - getUnassignedPool                                           │
│    - assignTask      (upsert NodeAssignment)                     │
│    - unassignTask    (delete NodeAssignment)                     │
│                                                                  │
│          ↓ Prisma                                                │
│  PostgreSQL: SkillTree + SkillNode + NodeEdge + NodeAssignment   │
└──────────────────────────────────────────────────────────────────┘
```

## Data Model (Prisma)

Four new models, following the project's existing pattern of `Int` autoincrement IDs.

```prisma
model SkillTree {
  id          Int         @id @default(autoincrement())
  userId      Int         // FK to User.id (NOT unique — preserves future multi-tree)
  name        String
  templateKey String?     // which template this was cloned from (nullable for future custom trees)

  user        User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  nodes       SkillNode[]
  edges       NodeEdge[]
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  @@index([userId])
}

model SkillNode {
  id          Int              @id @default(autoincrement())
  skillTreeId Int
  name        String           // e.g., "APIs"
  description String?          @db.Text
  icon        String?          // rune icon key (e.g., "rune-api")
  x           Float            // 0.0–1.0 normalized position on canvas
  y           Float            // 0.0–1.0 normalized position on canvas

  skillTree   SkillTree        @relation(fields: [skillTreeId], references: [id], onDelete: Cascade)
  outEdges    NodeEdge[]       @relation("FromNode")
  inEdges     NodeEdge[]       @relation("ToNode")
  assignments NodeAssignment[]

  @@index([skillTreeId])
}

model NodeEdge {
  id          Int       @id @default(autoincrement())
  skillTreeId Int
  fromNodeId  Int
  toNodeId    Int

  skillTree   SkillTree @relation(fields: [skillTreeId], references: [id], onDelete: Cascade)
  fromNode    SkillNode @relation("FromNode", fields: [fromNodeId], references: [id], onDelete: Cascade)
  toNode      SkillNode @relation("ToNode", fields: [toNodeId], references: [id], onDelete: Cascade)

  @@unique([fromNodeId, toNodeId])
  @@index([skillTreeId])
}

model NodeAssignment {
  id        Int       @id @default(autoincrement())
  nodeId    Int
  todoId    Int
  createdAt DateTime  @default(now())

  node      SkillNode @relation(fields: [nodeId], references: [id], onDelete: Cascade)
  todo      Todo      @relation(fields: [todoId], references: [id], onDelete: Cascade)

  @@unique([nodeId, todoId])
  @@index([nodeId])
  @@index([todoId])
}
```

**Back-relations to add to existing models:**

```prisma
model User {
  // ...existing fields
  skillTrees SkillTree[]
}

model Todo {
  // ...existing fields
  assignments NodeAssignment[]
}
```

**Note on the `Completed` model:** The project has a legacy `Completed` model that is defined in `schema.prisma` but never queried anywhere in the codebase (`grep "prisma\.completed\."` → 0 results). All completed tasks live on the `Todo` model with `completed: true` — this is what `CompletedTodos.tsx` and `getHeatmap` both use. The skill tree therefore links `NodeAssignment` to `Todo`, not to `Completed`. The `Completed` model remains untouched (removal is out of scope).

### Rationale

| Decision                             | Why                                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **XP is computed**, not stored       | `xp = count(NodeAssignment where nodeId = X)`. Always accurate, no denormalization drift. Perf is fine at V1 scale. |
| **Unique `(nodeId, todoId)`**        | Dropping the same task on the same node twice should be a no-op (via upsert), not a double-count.                   |
| **`userId` not unique on SkillTree** | Future-proofs multi-tree without requiring a migration. V1 code uses the first tree per user.                       |
| **Cascade deletes**                  | Deleting a Todo (e.g. via `clearCompleted`) also removes any assignments referencing it — node XP auto-decrements.  |
| **`x`, `y` normalized (0–1)**        | Decouples node positions from canvas pixel size. Allows responsive scaling without DB updates.                      |
| **`templateKey` on SkillTree**       | Lets us trace which template a tree was cloned from. Nullable because future custom trees won't have one.           |

### Level / XP rules

XP per node is a simple count of `NodeAssignment` rows for that node. Level thresholds:

| Level | XP range | Label        |
| ----- | -------- | ------------ |
| 0     | 0 – 4    | Dormant      |
| 1     | 5 – 14   | Lv 1         |
| 2     | 15 – 29  | Lv 2         |
| 3     | 30 – 49  | Lv 3         |
| 4     | 50 – 74  | Lv 4         |
| 5     | 75 +     | **Mastered** |

This logic lives in one place: `src/app/(main)/skill-tree/lib/xp.ts` as a pure function `xpToLevel(xp)`. The return shape is:

- `level`: current level, 0 (Dormant) through 5 (Mastered)
- `progress`: XP earned within the current level (0-indexed — resets to 0 each time a threshold is crossed)
- `next`: size of the current level's XP bar, i.e. XP required to reach the next level. `null` when Mastered.

This lets the UI render a simple `progress / next` bar without recomputing thresholds at call sites.

## Page & Component Architecture

### Route structure

Use Next.js App Router's **Route Group** feature to share the sidebar between `/home` and `/skill-tree` without affecting URL paths.

```
src/app/
├── (main)/                       ← Route Group (parentheses = not in URL)
│   ├── layout.tsx                ← NEW: shared sidebar layout
│   ├── home/
│   │   └── page.tsx              ← MOVED from src/app/home/page.tsx (content unchanged)
│   └── skill-tree/
│       ├── page.tsx              ← NEW: RSC shell, auth check
│       ├── SkillTreeView.tsx     ← NEW: 'use client', DndContext root
│       ├── components/
│       │   ├── ConstellationCanvas.tsx
│       │   ├── SkillNodeCircle.tsx
│       │   ├── TaskPoolDrawer.tsx
│       │   ├── TaskPoolCard.tsx
│       │   ├── DragOverlayCard.tsx
│       │   └── NodePopover.tsx
│       ├── lib/
│       │   ├── xp.ts             ← xpToLevel pure function
│       │   ├── collision.ts      ← closestCenter strategy
│       │   └── template.ts       ← default template data (for seed)
│       └── styles.css            ← scoped CSS custom properties
├── layout.tsx                    ← root layout (unchanged)
└── ...
```

### Sidebar extraction

Current `/home/page.tsx` embeds `<SidebarProvider>` inline. For two pages to share the sidebar, extract it into a reusable component.

```
src/components/
└── AppSidebar.tsx     ← NEW: exported sidebar with Link-based nav + isActive via usePathname()
```

`src/app/(main)/layout.tsx`:

```tsx
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/AppSidebar'

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  )
}
```

`AppSidebar` navigation items:

| Label      | href                  | Icon       | Active when                  |
| ---------- | --------------------- | ---------- | ---------------------------- |
| Home       | `/home`               | `Home`     | `pathname === '/home'`       |
| Skill Tree | `/skill-tree`         | `Sparkles` | `pathname === '/skill-tree'` |
| Categories | (existing)            | existing   | existing                     |
| Settings   | (existing bottom nav) | existing   | existing                     |
| Trash      | (existing bottom nav) | existing   | existing                     |

### Rendering approach

**Pure SVG + dnd-kit**, NOT React Flow or Canvas/PIXI.

| Alternative   | Why rejected                                                      |
| ------------- | ----------------------------------------------------------------- |
| React Flow    | Adds a dependency, designed for node editors we don't need in V1  |
| Canvas / PIXI | Overkill for ≤30 nodes; harder to integrate with dnd-kit and a11y |
| HTML / CSS    | Difficult to render smooth curved edges between arbitrary points  |

Pure SVG gives us: built-in a11y (native `<circle>` + `aria-label`), easy DnD integration via `useDroppable` on wrapper `<g>` elements, crisp rendering at any zoom level, and simple animations via CSS.

## Visual Design (Dark Fantasy)

### Color palette (scoped tokens)

8 CSS custom properties, scoped to `[data-skill-tree='true']` in `src/app/(main)/skill-tree/styles.css`. This prevents token leakage into other pages and avoids modifying `tailwind.config.ts`.

**Theme structure note:** The existing project follows the convention `:root` = light defaults + `[data-theme='dark']` = dark overrides (see `src/globals.css`). The skill tree intentionally inverts this for its scope: Dark Fantasy is the primary aesthetic and lives at the base selector; the parchment variant is the light-theme override. This is a deliberate decision because the Dark Fantasy identity is the feature's core visual choice.

```css
/* Default = Dark Fantasy (the chosen visual identity for this feature) */
[data-skill-tree='true'] {
  --st-bg-deep: #0a0e1e; /* Void / deep night */
  --st-bg-mid: #1a1e3a; /* Midnight blue */
  --st-surface: #2a3055; /* Drawer / cards */
  --st-gold: #f4d06f; /* Mastered / CTA */
  --st-cream: #c7b99c; /* Leveled node */
  --st-arcane: #5a9bd4; /* Active / selected */
  --st-muted: #8b9dc3; /* Dormant / text-2 */
  --st-border-rune: #4a5580; /* Borders */
}

/* Light theme override → parchment variant */
[data-theme='light'] [data-skill-tree='true'] {
  --st-bg-deep: #f5ecd4;
  --st-bg-mid: #e8d9b0;
  --st-surface: #ddc89c;
  --st-gold: #c99933;
  --st-cream: #d4b985;
  --st-arcane: #8b5a2b;
  --st-muted: #8b7a5a;
  --st-border-rune: #8b5a2b;
}
```

### Node visual states

6 distinct tiers, rendered with different SVG treatments:

| State    | XP      | Visual                                                                        |
| -------- | ------- | ----------------------------------------------------------------------------- |
| Dormant  | 0 – 4   | Dashed muted ring, "?" text, no fill                                          |
| Lv 1     | 5 – 14  | Cream solid ring + small inner dot                                            |
| Lv 2     | 15 – 29 | Cream ring, cream inner glow via `feGaussianBlur`                             |
| Lv 3     | 30 – 49 | **Double** ring, larger inner glow                                            |
| Lv 4     | 50 – 74 | Double ring **gold**, strong glow                                             |
| Mastered | 75 +    | **Triple** ring, `radialGradient` core, rune star overlay, continuous shimmer |

Glow filters are defined once in `<defs>` and reused:

```xml
<filter id="goldGlow" x="-50%" y="-50%" width="200%" height="200%">
  <feGaussianBlur stdDeviation="3" result="blur"/>
  <feMerge>
    <feMergeNode in="blur"/>
    <feMergeNode in="SourceGraphic"/>
  </feMerge>
</filter>
```

### Edge rendering

3 edge types based on endpoint states:

| Endpoint state       | Stroke                          | Width | Opacity |
| -------------------- | ------------------------------- | ----- | ------- |
| Both active (Lv ≥ 1) | gold                            | 1.5px | 0.6     |
| One active           | cream                           | 1px   | 0.45    |
| Both dormant         | muted, `stroke-dasharray="2,3"` | 0.8px | 0.4     |

### Background

- 3-stop navy vertical gradient (`--st-bg-deep` → `#0e1326` → `--st-bg-mid`)
- 18 static cream stars (SVG `<circle>` with small `r`, opacity 0.6)
- 3 twinkling gold stars (CSS `@keyframes twinkle 4s infinite`)

### Animations

4 key moments:

| #   | Moment               | Implementation                                                                 |
| --- | -------------------- | ------------------------------------------------------------------------------ |
| 1   | **Hover pulse**      | `transform: scale(1.08)`, 300ms ease-out, outer ring opacity 0.25→0.5          |
| 2   | **Drop impact**      | SVG circle `r: 0→40` + opacity `1→0` burst, 500ms + floating "+1 XP" text      |
| 3   | **Level up flash**   | Node whites out 100ms → springs to new size 400ms, "Lv N" label floats + fades |
| 4   | **Mastered shimmer** | Outer ring opacity breathing 0.4↔0.8, 2s ease-in-out infinite                  |

### `prefers-reduced-motion`

All 4 animations are disabled. State changes snap instantly. Twinkling stars become static. Implemented via a `useSyncExternalStore` hook subscribing to the `matchMedia` query (SSR-safe, matches the CoreLive pattern used elsewhere).

## Allocation Mechanics (DnD Flow)

### 6-frame state machine

| Frame | State                      | What's on screen                                                                         |
| ----- | -------------------------- | ---------------------------------------------------------------------------------------- |
| 1     | **Idle**                   | Canvas + bottom pill `📦 N unassigned tasks ▲` (hidden if N=0)                           |
| 2     | **Drawer open**            | shadcn `Sheet side="bottom"`, horizontally-scrollable task cards                         |
| 3     | **Dragging**               | `DragOverlay` with floating task card (-2° tilt), original slot shows dashed ghost       |
| 4     | **Hovering valid node**    | Target node: dashed arcane ring + halo; tooltip shows name, level, XP progress           |
| 5     | **Drop**                   | Burst ring expand + "+1 XP" floating text, drawer auto-updates, optimistic state commits |
| 6     | **Level up (conditional)** | If XP crossed a threshold, flash + spring-grow animation with label                      |

### dnd-kit primitives

| Primitive                  | Role                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `DndContext`               | Wraps `<SkillTreeView>` root                                                         |
| `DragOverlay`              | Renders the floating drag preview                                                    |
| `useDraggable`             | On each `<TaskPoolCard>` in the drawer                                               |
| `useDroppable`             | On each `<SkillNodeCircle>`, wrapped with invisible 44×44 hit rect                   |
| `PointerSensor`            | Mouse/trackpad                                                                       |
| `TouchSensor`              | 250ms activation delay to avoid hijacking scroll                                     |
| `KeyboardSensor`           | Tab → Space → Arrow keys → Space for full keyboard control                           |
| Custom collision detection | Pointer-based `closestCenter`; SVG circles need distance-to-center, not bounding-box |

### `onDragEnd` flow

```tsx
function onDragEnd(event: DragEndEvent) {
  const { active, over } = event
  if (!over) return

  const nodeId = Number(over.id)
  const todoId = Number(active.id)

  // 1. Optimistic state dispatch, wrapped in a transition
  startTransition(() => {
    setOptimisticAssignments({ type: 'assign', nodeId, todoId })
  })

  // 2. Fire mutation via TanStack Query + oRPC
  assignMutation.mutate(
    { nodeId, todoId },
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['skillTree'] })
      },
      onError: () => {
        // React auto-reverts optimistic state when the transition settles
        toast.error("Couldn't assign task — try again")
      },
    },
  )
}
```

### Unassign flow

Clicking a node opens a shadcn `Popover` listing the tasks currently assigned to it. Each row has a small `×` button that calls `unassignTask`. The same optimistic pattern applies.

### Edge cases

| Case                                    | Handling                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------- |
| Duplicate drop (same task on same node) | DB unique constraint → server no-op; UI shows a brief shake animation       |
| Empty drawer                            | Show "✨ All tasks allocated — nice work" state                             |
| Empty tree (no completed tasks)         | Show "Complete some tasks to start earning XP" state                        |
| Network failure                         | Optimistic state reverts, `toast.error` displayed                           |
| User deletes / clears an assigned Todo  | Cascade delete removes the NodeAssignment, node XP decrements automatically |
| User signs out and back in              | Tree persists via `userId` FK                                               |

## oRPC API

New procedures under `src/server/procedures/skillTree.ts`:

```typescript
// GET my tree (auto-imports default template on first visit)
getMyTree: authMiddleware.handler(async ({ context }) => {
  let tree = await prisma.skillTree.findFirst({
    where: { userId: context.user.id },
    include: {
      nodes: { include: { assignments: true } },
      edges: true,
    },
  })
  if (!tree) {
    tree = await importDefaultTemplate(context.user.id)
  }
  return tree
})

// GET unassigned pool — completed Todos not yet assigned to any node
getUnassignedPool: authMiddleware.handler(async ({ context }) => {
  return prisma.todo.findMany({
    where: {
      userId: context.user.id,
      completed: true,
      assignments: { none: {} },
    },
    orderBy: { updatedAt: 'desc' },
  })
})

// Assign a task to a node (upsert, idempotent)
assignTask: authMiddleware
  .input(
    z.object({
      nodeId: z.number().int().positive(),
      todoId: z.number().int().positive(),
    }),
  )
  .handler(async ({ input, context }) => {
    // Verify ownership of both node and todo
    await assertOwnership(context.user.id, input.nodeId, input.todoId)
    return prisma.nodeAssignment.upsert({
      where: {
        nodeId_todoId: {
          nodeId: input.nodeId,
          todoId: input.todoId,
        },
      },
      create: input,
      update: {},
    })
  })

// Unassign a task from a node
unassignTask: authMiddleware
  .input(
    z.object({
      nodeId: z.number().int().positive(),
      todoId: z.number().int().positive(),
    }),
  )
  .handler(async ({ input, context }) => {
    await assertOwnership(context.user.id, input.nodeId, input.todoId)
    return prisma.nodeAssignment.delete({
      where: {
        nodeId_todoId: {
          nodeId: input.nodeId,
          todoId: input.todoId,
        },
      },
    })
  })
```

`importDefaultTemplate(userId)` creates a new SkillTree + nodes + edges from the template data in `src/app/(main)/skill-tree/lib/template.ts` (a TypeScript constant seeded at first access).

## V1 Scope (Minimum Ship)

### In scope

- 4 new Prisma models + migration + seed
- 1 hardcoded template: "Backend Developer Core" (subset of roadmap.sh backend, ~25–30 nodes)
- 4 oRPC procedures: `getMyTree`, `getUnassignedPool`, `assignTask`, `unassignTask`
- Route Group `(main)` with shared layout; `/home` moved, `/skill-tree` new
- `AppSidebar` extracted from `/home/page.tsx` with `Link`-based nav + active state
- Full DnD flow (Drawer + Drag) with optimistic updates
- Unassign via node popover
- Dark Fantasy + light parchment visuals
- 4 core animations + `prefers-reduced-motion` fallback
- Keyboard and touch a11y via dnd-kit sensors
- Unit tests for `xpToLevel` and level boundaries
- Component tests for node states and draggable cards
- Storybook stories for all 6 node states
- 3 Playwright E2E tests (happy path, unassign, keyboard flow)

### Explicitly deferred to V2+

| Feature                               | Rationale                                      |
| ------------------------------------- | ---------------------------------------------- |
| Multiple templates / marketplace      | Validate core loop first                       |
| Custom node CRUD                      | Large UI surface; template is enough for V1    |
| AI Auto-sort button                   | Requires Claude API + UX polish                |
| AI suggestions at task creation       | Defer until core proven                        |
| Task→Node assignment during task flow | User explicitly chose FF-style pool as default |
| Prerequisite gates (locked nodes)     | User explicitly chose "no gates"               |
| Multi-tree per user                   | DB supports it; UI uses first tree in V1       |
| XP weighting (task priority/size)     | User explicitly chose flat 1 XP                |
| Streaks / achievements / badges       | Separate gamification initiative               |
| Export / share tree                   | Social feature; future work                    |
| Zoom / pan / minimap                  | SVG `viewBox` auto-fit is enough at V1 scale   |
| Search within tree                    | Not needed at V1 scale                         |

### YAGNI guard rails (intentionally not built)

- Node editor UI for repositioning
- Custom tree builder wizard
- Undo/redo stack
- Batch assign (multi-select)
- Filter/search on drawer
- Animation settings panel
- Per-node color override
- Custom XP formulas

## Testing Strategy

### Unit tests (Vitest)

Pure logic tests for `src/app/(main)/skill-tree/lib/xp.ts`:

```typescript
xpToLevel(xp: number): { level: 0|1|2|3|4|5, progress: number, next: number | null }
```

| Input | Expected output                                  |
| ----- | ------------------------------------------------ |
| `0`   | `{ level: 0, progress: 0, next: 5 }`             |
| `4`   | `{ level: 0, progress: 4, next: 5 }`             |
| `5`   | `{ level: 1, progress: 0, next: 10 }`            |
| `14`  | `{ level: 1, progress: 9, next: 10 }`            |
| `15`  | `{ level: 2, progress: 0, next: 15 }`            |
| `30`  | `{ level: 3, progress: 0, next: 20 }`            |
| `50`  | `{ level: 4, progress: 0, next: 25 }`            |
| `75`  | `{ level: 5, progress: 0, next: null }`          |
| `200` | `{ level: 5, progress: 0, next: null }` (capped) |

Also test the optimistic reducer: `applyAssignment(state, { type: 'assign' | 'unassign', nodeId, todoId })`.

### Component tests (Vitest + Testing Library)

| Component                     | Assertions                                                   |
| ----------------------------- | ------------------------------------------------------------ |
| `<SkillNodeCircle level={N}>` | Correct `aria-label`, correct visual class/filter, focusable |
| `<TaskPoolCard>`              | `role="button"`, tabbable, responds to Space                 |
| `<NodePopover>`               | Shows assigned tasks, `×` fires callback                     |
| `<XpBadge>`                   | Displays progress text correctly                             |

No snapshot tests — Storybook covers visual regression.

### Storybook stories

| File                              | Stories                                                       |
| --------------------------------- | ------------------------------------------------------------- |
| `SkillNodeCircle.stories.tsx`     | `Dormant`, `Level1`, `Level2`, `Level3`, `Level4`, `Mastered` |
| `ConstellationCanvas.stories.tsx` | `Empty`, `PartiallyLeveled`, `FullyMastered`                  |
| `TaskPoolDrawer.stories.tsx`      | `EmptyState`, `ThreeTasks`, `ManyTasks_Scroll`                |
| `XpBadge.stories.tsx`             | `L0`, `L3_progress`, `Mastered`                               |
| `DarkFantasyPalette.stories.tsx`  | Color token reference page                                    |

### E2E tests (Playwright)

Three critical-path tests under `e2e/skill-tree.spec.ts`:

1. **Happy path**: login → navigate to /skill-tree → open drawer → drag task to node → verify XP displayed → reload → verify persistence
2. **Unassign**: navigate to /skill-tree → click node with assignments → click × on a task → verify task returns to pool
3. **Keyboard flow**: navigate to /skill-tree → Tab to task card → Space to pick up → Arrow keys to reach node → Space to drop

Use existing Clerk dev credentials (`E2E_CLERK_USER_*`) and the existing `pnpm e2e:web` runner.

### Manual a11y QA checklist

Before ship:

- [ ] VoiceOver announces `APIs, Level 3, 30 of 50 XP` when focused on a node
- [ ] VoiceOver announces "Grabbed" when drag starts via keyboard
- [ ] Keyboard-only user can Tab → Space → Arrow → Space to complete a full drag
- [ ] `prefers-reduced-motion` disables all 4 animations and star twinkling
- [ ] macOS "Increase Contrast" mode: node borders remain clearly visible
- [ ] macOS "Reduce Transparency" mode: drawer background becomes opaque
- [ ] Dark mode: WCAG AA contrast for all text (4.5:1) and UI elements (3:1)
- [ ] Light (parchment) mode: same
- [ ] 44×44 tap target verified on iPad Safari
- [ ] Electron (macOS) shows identical behavior to web

### CI integration

No new CI changes required. The existing `pnpm validate` script (test + lint + build + typecheck in parallel, runs on pre-commit + CI) picks up the new tests. Playwright E2E runs in the existing E2E workflow.

### What we intentionally don't test

- Every animation timing (flakey, low value)
- Exact SVG DOM structure (too coupled to implementation)
- dnd-kit library behavior (not our code)
- Exhaustive color contrast (spot-check only)
- Performance benchmarks (V1 scale is trivial for React 19)

## Launch Checklist

Ship when all of these are true:

- [ ] Prisma migration applied in dev, staging, and production
- [ ] `pnpm prisma:seed` populates the default template for new users
- [ ] `AppSidebar` extracted and both `/home` and `/skill-tree` render it correctly
- [ ] `/home` content is unchanged (sanity check)
- [ ] First visit to `/skill-tree` auto-imports the default template
- [ ] Drawer → Drag → Drop persists XP across reloads
- [ ] Node popover shows current assignments and unassign works
- [ ] Level thresholds trigger the flash animation at exactly 5 / 15 / 30 / 50 / 75 XP
- [ ] `prefers-reduced-motion` honored
- [ ] Keyboard drag-drop flow works end-to-end (manual a11y test)
- [ ] Both dark and light themes render correctly
- [ ] `pnpm validate` passes
- [ ] Unit tests for `xpToLevel` pass
- [ ] E2E tests for happy path, unassign, and keyboard flow pass
- [ ] Storybook stories for all 6 node states exist

## Open Questions

1. **Exact default template shape** — The V1 template is "Backend Developer Core" based on a subset of roadmap.sh. The precise list of ~25–30 nodes and their edge connections will be finalized during implementation in `src/app/(main)/skill-tree/lib/template.ts`. The spec does not prescribe the exact nodes because the template can evolve independently of the feature code.

2. **Rune icon asset source** — The spec references "rune icons" for nodes but doesn't specify whether we use Unicode glyphs, SVG paths from an icon library (e.g., Lucide), or custom SVG. Decision deferred to implementation; default is to start with Lucide icons and optionally swap in custom rune SVGs later.

3. **First-time auto-import timing** — `getMyTree` auto-imports on first call. An alternative is a dedicated "onboarding" step or an explicit "Start your tree" button. Going with auto-import for V1 (zero friction), but we may revisit if testing reveals surprise.
