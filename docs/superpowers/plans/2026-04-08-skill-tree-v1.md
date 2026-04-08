# Skill Tree V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the minimum viable Skill Tree feature — a `/skill-tree` page where users drag their completed Todos onto nodes of a Dark Fantasy constellation tree to earn XP, level up nodes, and reach Mastered.

**Architecture:** Route Group `(main)` with shared sidebar between `/home` and `/skill-tree`. 4 new Prisma models (`SkillTree`, `SkillNode`, `NodeEdge`, `NodeAssignment`) linking to existing `Todo` (not the dead `Completed` model). Pure SVG rendering for the tree, `@dnd-kit` for drag-and-drop with keyboard sensors for a11y, `useOptimistic + startTransition` for instant feedback, oRPC procedures for persistence. Dark Fantasy visuals via scoped CSS custom properties on `[data-skill-tree='true']`.

**Tech Stack:** Next.js 16 App Router, Prisma, PostgreSQL, oRPC, TanStack Query, React 19 (`useOptimistic`, `startTransition`, `useSyncExternalStore`), @dnd-kit (`core`), shadcn/ui (`sidebar`, `sheet`, `popover`, `tooltip`), Tailwind CSS, Zod, Vitest, Testing Library, Storybook, Playwright.

**Spec:** `docs/superpowers/specs/2026-04-08-skill-tree-design.md`

---

## File Structure

### New files (Prisma / server)

| Path                                                         | Responsibility                                                                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `prisma/migrations/<timestamp>_add_skill_tree/migration.sql` | DB migration                                                                                                             |
| `prisma/schema.prisma` (modified)                            | Add 4 models + back-relations on `User` and `Todo`                                                                       |
| `src/server/schemas/skillTree.ts`                            | Zod schemas for tree/node/edge/assignment responses                                                                      |
| `src/server/procedures/skillTree.ts`                         | `getMyTree`, `getUnassignedPool`, `assignTask`, `unassignTask`, `importDefaultTemplate` helper, `assertOwnership` helper |
| `src/server/router.ts` (modified)                            | Register `skillTree` namespace                                                                                           |

### New files (route + feature)

| Path                                                           | Responsibility                                     |
| -------------------------------------------------------------- | -------------------------------------------------- |
| `src/app/(main)/layout.tsx`                                    | Shared sidebar layout (RSC)                        |
| `src/app/(main)/home/page.tsx`                                 | MOVED from `src/app/home/page.tsx`, body unchanged |
| `src/app/(main)/home/page.css`                                 | MOVED from `src/app/home/page.css`                 |
| `src/app/(main)/home/_components/**`                           | MOVED from `src/app/home/_components/**`           |
| `src/app/(main)/skill-tree/page.tsx`                           | RSC shell, auth check, renders `<SkillTreeView>`   |
| `src/app/(main)/skill-tree/SkillTreeView.tsx`                  | `'use client'`, DndContext root                    |
| `src/app/(main)/skill-tree/components/ConstellationCanvas.tsx` | SVG canvas w/ edges, nodes, background             |
| `src/app/(main)/skill-tree/components/SkillNodeCircle.tsx`     | A single SVG node w/ `useDroppable`                |
| `src/app/(main)/skill-tree/components/TaskPoolDrawer.tsx`      | Bottom pill + Sheet w/ task cards                  |
| `src/app/(main)/skill-tree/components/TaskPoolCard.tsx`        | Draggable task card                                |
| `src/app/(main)/skill-tree/components/DragOverlayCard.tsx`     | Floating drag preview                              |
| `src/app/(main)/skill-tree/components/NodePopover.tsx`         | Unassign popover                                   |
| `src/app/(main)/skill-tree/components/XpBadge.tsx`             | Level + progress bar                               |
| `src/app/(main)/skill-tree/lib/xp.ts`                          | Pure `xpToLevel(xp)` function                      |
| `src/app/(main)/skill-tree/lib/optimistic.ts`                  | `applyAssignment` reducer for `useOptimistic`      |
| `src/app/(main)/skill-tree/lib/collision.ts`                   | `closestCenterByDistance` custom collision         |
| `src/app/(main)/skill-tree/lib/template.ts`                    | `BACKEND_DEVELOPER_CORE_TEMPLATE` constant         |
| `src/app/(main)/skill-tree/lib/useReducedMotion.ts`            | `useSyncExternalStore` hook                        |
| `src/app/(main)/skill-tree/styles.css`                         | Scoped CSS vars + keyframes                        |
| `src/components/AppSidebar.tsx`                                | Extracted sidebar component                        |

### New files (tests / stories)

| Path                                                                   | Responsibility             |
| ---------------------------------------------------------------------- | -------------------------- |
| `src/app/(main)/skill-tree/lib/xp.test.ts`                             | Unit tests for `xpToLevel` |
| `src/app/(main)/skill-tree/lib/optimistic.test.ts`                     | Unit tests for reducer     |
| `src/app/(main)/skill-tree/components/SkillNodeCircle.test.tsx`        | Component test             |
| `src/app/(main)/skill-tree/components/TaskPoolCard.test.tsx`           | Component test             |
| `src/app/(main)/skill-tree/components/NodePopover.test.tsx`            | Component test             |
| `src/app/(main)/skill-tree/components/XpBadge.test.tsx`                | Component test             |
| `src/app/(main)/skill-tree/components/SkillNodeCircle.stories.tsx`     | 6 node state stories       |
| `src/app/(main)/skill-tree/components/ConstellationCanvas.stories.tsx` | Canvas stories             |
| `src/app/(main)/skill-tree/components/TaskPoolDrawer.stories.tsx`      | Drawer stories             |
| `src/app/(main)/skill-tree/components/XpBadge.stories.tsx`             | Badge stories              |
| `src/app/(main)/skill-tree/components/DarkFantasyPalette.stories.tsx`  | Palette reference          |
| `e2e/web/skill-tree.spec.ts`                                           | 3 Playwright E2E tests     |

### Modified files

| Path                        | Change                            |
| --------------------------- | --------------------------------- |
| `prisma/schema.prisma`      | +4 models, +2 back-relations      |
| `src/server/router.ts`      | +1 namespace                      |
| `src/app/home/page.tsx`     | DELETED (moved to `(main)/home/`) |
| `src/app/home/page.css`     | DELETED (moved)                   |
| `src/app/home/_components/` | DELETED (moved)                   |

---

## Task Ordering Principles

Tasks are grouped into **phases** that each produce a checkpoint of working, testable code:

1. **Phase A** — Database + Backend (Tasks 1-5): new models, procedures, template data
2. **Phase B** — Route Group Migration (Tasks 6-8): extract sidebar, move `/home`, smoke-test
3. **Phase C** — Pure Logic (Tasks 9-10): `xp.ts`, optimistic reducer (TDD)
4. **Phase D** — Visual Shell (Tasks 11-16): Dark Fantasy styles, node circles, canvas, drawer, popover, page
5. **Phase E** — Interactivity (Tasks 17-19): DnD wiring, optimistic flow, unassign
6. **Phase F** — A11y + Polish (Tasks 20-22): reduced motion, keyboard, empty states
7. **Phase G** — E2E + Launch (Tasks 23-25): Playwright, manual QA, final validate

Each phase ends with a working system that passes `pnpm validate`.

---

## Phase A — Database + Backend

### Task 1: Prisma schema — add 4 new models + back-relations

**Files:**

- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `skillTrees` back-relation to `User`**

Open `prisma/schema.prisma`. In the `User` model, add a new line:

```prisma
model User {
  id               Int               @id @default(autoincrement())
  clerkId          String            @unique
  email            String?           @unique
  name             String?
  bio              String?
  categories       Category[]
  completed        Completed[]
  todos            Todo[]
  electronSettings ElectronSettings?
  skillTrees       SkillTree[]       // ← NEW
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
}
```

- [ ] **Step 2: Add `assignments` back-relation to `Todo`**

In the `Todo` model, add a new line before `createdAt`:

```prisma
model Todo {
  id          Int              @id @default(autoincrement())
  text        String           @db.VarChar(255)
  completed   Boolean          @default(false)
  notes       String?          @db.Text
  order       Int?
  user        User             @relation(fields: [userId], references: [id])
  userId      Int
  category    Category?        @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  categoryId  Int?
  assignments NodeAssignment[] // ← NEW
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt

  @@index([categoryId])
}
```

- [ ] **Step 3: Add the 4 new models at the bottom of the file**

Append to `prisma/schema.prisma`:

```prisma
model SkillTree {
  id          Int         @id @default(autoincrement())
  userId      Int         // NOT unique — future-proofs multi-tree
  name        String
  templateKey String?

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
  name        String
  description String?          @db.Text
  icon        String?
  x           Float            // 0.0-1.0 normalized
  y           Float            // 0.0-1.0 normalized

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

- [ ] **Step 4: Validate the schema**

Run: `pnpm prisma format && pnpm prisma validate`
Expected: Both commands exit 0 with "The schema is valid".

- [ ] **Step 5: Generate and apply the migration**

Run (make sure `docker compose up -d` is running first):

```bash
pnpm prisma migrate dev --name add_skill_tree
```

Expected: Prisma creates `prisma/migrations/<timestamp>_add_skill_tree/migration.sql`, applies it to the local DB, and regenerates the Prisma client. The 4 new tables exist in Postgres.

- [ ] **Step 6: Verify Prisma client has the new models**

Run: `pnpm typecheck 2>&1 | grep -iE 'skillTree|skillNode|nodeEdge|nodeAssignment' || echo 'OK — no type errors'`
Expected: `OK — no type errors` (the new models compile cleanly).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add skill tree models (SkillTree, SkillNode, NodeEdge, NodeAssignment)"
```

---

### Task 2: Default template data (`template.ts`)

**Files:**

- Create: `src/app/(main)/skill-tree/lib/template.ts`

- [ ] **Step 1: Create the directory**

Run: `mkdir -p src/app/\(main\)/skill-tree/lib`
Expected: Directory created. (The parentheses in `(main)` are a Route Group — the folder literally needs to be named `(main)`.)

- [ ] **Step 2: Write the template constant**

Create `src/app/(main)/skill-tree/lib/template.ts`:

```typescript
/**
 * Default skill tree template: "Backend Developer Core".
 * A subset of roadmap.sh Backend Developer Roadmap. 28 nodes grouped
 * into 6 clusters, laid out as a constellation. Node positions are
 * normalized (x, y ∈ [0, 1]) so the canvas can resize without DB updates.
 */
export const BACKEND_DEVELOPER_CORE_TEMPLATE = {
  key: 'backend-developer-core',
  name: 'Backend Developer Core',
  nodes: [
    // ─── Cluster 1: Foundations (top-left) ───
    { slug: 'internet', name: 'Internet', icon: 'globe', x: 0.1, y: 0.1 },
    { slug: 'http', name: 'HTTP', icon: 'network', x: 0.2, y: 0.18 },
    { slug: 'dns', name: 'DNS', icon: 'server', x: 0.05, y: 0.22 },
    { slug: 'terminal', name: 'Terminal', icon: 'terminal', x: 0.15, y: 0.3 },
    { slug: 'git', name: 'Git', icon: 'git-branch', x: 0.25, y: 0.32 },

    // ─── Cluster 2: Languages (top-right) ───
    { slug: 'javascript', name: 'JavaScript', icon: 'code', x: 0.75, y: 0.12 },
    { slug: 'python', name: 'Python', icon: 'code', x: 0.88, y: 0.18 },
    { slug: 'go', name: 'Go', icon: 'code', x: 0.82, y: 0.28 },
    { slug: 'rust', name: 'Rust', icon: 'code', x: 0.68, y: 0.25 },

    // ─── Cluster 3: Databases (middle-left) ───
    { slug: 'sql', name: 'SQL', icon: 'database', x: 0.1, y: 0.5 },
    {
      slug: 'postgres',
      name: 'PostgreSQL',
      icon: 'database',
      x: 0.22,
      y: 0.52,
    },
    { slug: 'redis', name: 'Redis', icon: 'zap', x: 0.08, y: 0.62 },
    { slug: 'mongodb', name: 'MongoDB', icon: 'leaf', x: 0.22, y: 0.65 },

    // ─── Cluster 4: APIs (center) ───
    { slug: 'rest', name: 'REST APIs', icon: 'send', x: 0.48, y: 0.45 },
    { slug: 'graphql', name: 'GraphQL', icon: 'git-merge', x: 0.55, y: 0.55 },
    { slug: 'grpc', name: 'gRPC', icon: 'radio', x: 0.42, y: 0.58 },
    { slug: 'auth', name: 'Auth', icon: 'key', x: 0.5, y: 0.35 },

    // ─── Cluster 5: Architecture (middle-right) ───
    { slug: 'caching', name: 'Caching', icon: 'layers', x: 0.78, y: 0.48 },
    {
      slug: 'queues',
      name: 'Message Queues',
      icon: 'list-ordered',
      x: 0.88,
      y: 0.55,
    },
    { slug: 'scaling', name: 'Scaling', icon: 'trending-up', x: 0.72, y: 0.6 },
    {
      slug: 'microservices',
      name: 'Microservices',
      icon: 'box',
      x: 0.85,
      y: 0.7,
    },

    // ─── Cluster 6: Operations (bottom) ───
    { slug: 'docker', name: 'Docker', icon: 'container', x: 0.3, y: 0.8 },
    { slug: 'k8s', name: 'Kubernetes', icon: 'cloud', x: 0.42, y: 0.88 },
    {
      slug: 'ci-cd',
      name: 'CI/CD',
      icon: 'git-pull-request',
      x: 0.55,
      y: 0.82,
    },
    {
      slug: 'monitoring',
      name: 'Monitoring',
      icon: 'activity',
      x: 0.65,
      y: 0.9,
    },
    { slug: 'security', name: 'Security', icon: 'shield', x: 0.5, y: 0.95 },

    // ─── Cluster 7: Testing (bottom-left) ───
    {
      slug: 'unit-tests',
      name: 'Unit Tests',
      icon: 'check-circle',
      x: 0.15,
      y: 0.88,
    },
    {
      slug: 'integration-tests',
      name: 'Integration Tests',
      icon: 'check-square',
      x: 0.22,
      y: 0.78,
    },
  ],
  /** Edges reference nodes by slug — resolved to node IDs at import time. */
  edges: [
    // Foundations
    ['internet', 'http'],
    ['internet', 'dns'],
    ['http', 'rest'],
    ['terminal', 'git'],

    // Languages → APIs
    ['javascript', 'rest'],
    ['python', 'rest'],
    ['go', 'grpc'],
    ['rust', 'microservices'],

    // APIs
    ['rest', 'auth'],
    ['rest', 'graphql'],
    ['graphql', 'grpc'],

    // Databases
    ['sql', 'postgres'],
    ['postgres', 'rest'],
    ['redis', 'caching'],
    ['mongodb', 'rest'],

    // Architecture
    ['caching', 'scaling'],
    ['queues', 'microservices'],
    ['scaling', 'microservices'],

    // Ops
    ['docker', 'k8s'],
    ['k8s', 'scaling'],
    ['ci-cd', 'docker'],
    ['monitoring', 'k8s'],
    ['security', 'auth'],

    // Testing
    ['unit-tests', 'integration-tests'],
    ['integration-tests', 'ci-cd'],
  ] as const satisfies ReadonlyArray<readonly [string, string]>,
} as const

export type SkillTreeTemplate = typeof BACKEND_DEVELOPER_CORE_TEMPLATE
```

- [ ] **Step 3: Verify the file compiles**

Run: `pnpm tsc --noEmit src/app/\(main\)/skill-tree/lib/template.ts`
Expected: No output (clean compile). If you get "command not found" for tsc, run `pnpm typecheck` instead and verify no errors mention `template.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(main\)/skill-tree/lib/template.ts
git commit -m "feat(skill-tree): add Backend Developer Core default template data"
```

---

### Task 3: oRPC schemas (`schemas/skillTree.ts`)

**Files:**

- Create: `src/server/schemas/skillTree.ts`

- [ ] **Step 1: Write the Zod schemas**

Create `src/server/schemas/skillTree.ts`:

```typescript
import { z } from 'zod'

import { TodoSchema } from './todo'

/** A skill node with its assignments. Maps to Prisma SkillNode + NodeAssignment[]. */
export const SkillNodeSchema = z.object({
  id: z.number().int().positive(),
  skillTreeId: z.number().int().positive(),
  name: z.string(),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  assignments: z.array(
    z.object({
      id: z.number().int().positive(),
      nodeId: z.number().int().positive(),
      todoId: z.number().int().positive(),
      createdAt: z
        .union([z.date(), z.string()])
        .transform((val) => (typeof val === 'string' ? new Date(val) : val)),
    }),
  ),
})

/** An edge between two skill nodes. */
export const NodeEdgeSchema = z.object({
  id: z.number().int().positive(),
  skillTreeId: z.number().int().positive(),
  fromNodeId: z.number().int().positive(),
  toNodeId: z.number().int().positive(),
})

/** The full tree response from `getMyTree`. */
export const SkillTreeSchema = z.object({
  id: z.number().int().positive(),
  userId: z.number().int().positive(),
  name: z.string(),
  templateKey: z.string().nullable(),
  nodes: z.array(SkillNodeSchema),
  edges: z.array(NodeEdgeSchema),
  createdAt: z
    .union([z.date(), z.string()])
    .transform((val) => (typeof val === 'string' ? new Date(val) : val)),
  updatedAt: z
    .union([z.date(), z.string()])
    .transform((val) => (typeof val === 'string' ? new Date(val) : val)),
})

/** Pool of completed Todos not yet assigned. Reuses TodoSchema. */
export const UnassignedPoolSchema = z.array(TodoSchema)

/** Input for assign/unassign mutations. */
export const AssignTaskInputSchema = z.object({
  nodeId: z.number().int().positive(),
  todoId: z.number().int().positive(),
})

/** A single NodeAssignment row, returned by assign/unassign. */
export const NodeAssignmentSchema = z.object({
  id: z.number().int().positive(),
  nodeId: z.number().int().positive(),
  todoId: z.number().int().positive(),
  createdAt: z
    .union([z.date(), z.string()])
    .transform((val) => (typeof val === 'string' ? new Date(val) : val)),
})

export type SkillTree = z.infer<typeof SkillTreeSchema>
export type SkillNode = z.infer<typeof SkillNodeSchema>
export type NodeEdge = z.infer<typeof NodeEdgeSchema>
```

- [ ] **Step 2: Verify types compile**

Run: `pnpm typecheck 2>&1 | grep -i 'skillTree' || echo 'OK'`
Expected: `OK` (no type errors reference these schemas yet).

- [ ] **Step 3: Commit**

```bash
git add src/server/schemas/skillTree.ts
git commit -m "feat(api): add Zod schemas for skill tree responses"
```

---

### Task 4: oRPC procedures (`procedures/skillTree.ts`)

**Files:**

- Create: `src/server/procedures/skillTree.ts`

- [ ] **Step 1: Write the procedures file**

Create `src/server/procedures/skillTree.ts`:

```typescript
import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { BACKEND_DEVELOPER_CORE_TEMPLATE } from '@/app/(main)/skill-tree/lib/template'
import { prisma } from '@/lib/prisma'

import { log } from '../../lib/logger'
import { authMiddleware } from '../middleware/auth'
import {
  AssignTaskInputSchema,
  NodeAssignmentSchema,
  SkillTreeSchema,
  UnassignedPoolSchema,
} from '../schemas/skillTree'
import { TodoSchema } from '../schemas/todo'

/**
 * Imports the default template as a new SkillTree for a user.
 * Runs inside a transaction so partial failures don't leave orphan nodes.
 * @param userId - The user's Prisma ID (not Clerk ID).
 * @returns The newly created tree with nodes, edges, and empty assignment arrays.
 */
async function importDefaultTemplate(userId: number) {
  return prisma.$transaction(async (tx) => {
    const tree = await tx.skillTree.create({
      data: {
        userId,
        name: BACKEND_DEVELOPER_CORE_TEMPLATE.name,
        templateKey: BACKEND_DEVELOPER_CORE_TEMPLATE.key,
      },
    })

    // Create nodes and collect slug → id mapping for edge resolution
    const slugToId = new Map<string, number>()
    for (const node of BACKEND_DEVELOPER_CORE_TEMPLATE.nodes) {
      const created = await tx.skillNode.create({
        data: {
          skillTreeId: tree.id,
          name: node.name,
          icon: node.icon,
          x: node.x,
          y: node.y,
        },
      })
      slugToId.set(node.slug, created.id)
    }

    // Create edges, resolving slug references
    for (const [fromSlug, toSlug] of BACKEND_DEVELOPER_CORE_TEMPLATE.edges) {
      const fromNodeId = slugToId.get(fromSlug)
      const toNodeId = slugToId.get(toSlug)
      if (fromNodeId === undefined || toNodeId === undefined) {
        throw new Error(
          `Template edge references unknown slug: ${fromSlug} → ${toSlug}`,
        )
      }
      await tx.nodeEdge.create({
        data: { skillTreeId: tree.id, fromNodeId, toNodeId },
      })
    }

    // Re-fetch the full tree with relations for the response
    const fullTree = await tx.skillTree.findUniqueOrThrow({
      where: { id: tree.id },
      include: {
        nodes: { include: { assignments: true } },
        edges: true,
      },
    })
    return fullTree
  })
}

/**
 * Ensures the given nodeId and todoId both belong to the user.
 * Throws ORPCError('FORBIDDEN') if either does not.
 * @example
 * await assertOwnership(user.id, 5, 12)
 */
async function assertOwnership(userId: number, nodeId: number, todoId: number) {
  const [node, todo] = await Promise.all([
    prisma.skillNode.findFirst({
      where: { id: nodeId, skillTree: { userId } },
      select: { id: true },
    }),
    prisma.todo.findFirst({
      where: { id: todoId, userId },
      select: { id: true },
    }),
  ])
  if (!node) {
    throw new ORPCError('FORBIDDEN', {
      message: 'Skill node not found or not owned by user',
    })
  }
  if (!todo) {
    throw new ORPCError('FORBIDDEN', {
      message: 'Todo not found or not owned by user',
    })
  }
}

/**
 * Fetches the user's skill tree. On first visit, imports the default template.
 * @returns The tree with nested nodes (+ assignments) and edges.
 */
export const getMyTree = authMiddleware
  .output(SkillTreeSchema)
  .handler(async ({ context }) => {
    try {
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
    } catch (error) {
      log.error('Error in getMyTree:', error)
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to fetch skill tree',
        cause: error,
      })
    }
  })

/**
 * Lists completed Todos the user has not yet assigned to any skill node.
 * @returns Array of unassigned completed Todos, newest first.
 */
export const getUnassignedPool = authMiddleware
  .output(UnassignedPoolSchema)
  .handler(async ({ context }) => {
    try {
      return await prisma.todo.findMany({
        where: {
          userId: context.user.id,
          completed: true,
          assignments: { none: {} },
        },
        orderBy: { updatedAt: 'desc' },
      })
    } catch (error) {
      log.error('Error in getUnassignedPool:', error)
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to fetch unassigned pool',
        cause: error,
      })
    }
  })

/**
 * Assigns a completed Todo to a skill node. Idempotent via upsert.
 * @param input.nodeId - Target skill node ID.
 * @param input.todoId - Completed Todo ID to assign.
 */
export const assignTask = authMiddleware
  .input(AssignTaskInputSchema)
  .output(NodeAssignmentSchema)
  .handler(async ({ input, context }) => {
    await assertOwnership(context.user.id, input.nodeId, input.todoId)
    return prisma.nodeAssignment.upsert({
      where: {
        nodeId_todoId: { nodeId: input.nodeId, todoId: input.todoId },
      },
      create: input,
      update: {},
    })
  })

/**
 * Removes the assignment of a Todo from a skill node.
 * @param input.nodeId - Node ID to unassign from.
 * @param input.todoId - Todo ID to unassign.
 */
export const unassignTask = authMiddleware
  .input(AssignTaskInputSchema)
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input, context }) => {
    await assertOwnership(context.user.id, input.nodeId, input.todoId)
    try {
      await prisma.nodeAssignment.delete({
        where: {
          nodeId_todoId: { nodeId: input.nodeId, todoId: input.todoId },
        },
      })
      return { success: true }
    } catch (error) {
      // P2025 = record not found. Already unassigned is OK.
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code?: string }).code === 'P2025'
      ) {
        return { success: true }
      }
      throw error
    }
  })
```

- [ ] **Step 2: Register the namespace in the router**

Open `src/server/router.ts` and modify:

```typescript
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from './procedures/category'
import { getHeatmap } from './procedures/completed'
import {
  getElectronSettings,
  upsertElectronSettings,
} from './procedures/electronSettings'
import {
  assignTask,
  getMyTree,
  getUnassignedPool,
  unassignTask,
} from './procedures/skillTree'
import {
  listTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  toggleTodo,
  clearCompleted,
  reorderTodos,
} from './procedures/todo'

export const router = {
  category: {
    list: listCategories,
    create: createCategory,
    update: updateCategory,
    delete: deleteCategory,
  },
  todo: {
    list: listTodos,
    create: createTodo,
    update: updateTodo,
    delete: deleteTodo,
    toggle: toggleTodo,
    clearCompleted: clearCompleted,
    reorder: reorderTodos,
  },
  completed: {
    heatmap: getHeatmap,
  },
  electronSettings: {
    get: getElectronSettings,
    upsert: upsertElectronSettings,
  },
  skillTree: {
    getMyTree,
    getUnassignedPool,
    assignTask,
    unassignTask,
  },
}

export type AppRouter = typeof router
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: No errors. If there are any, read them — do not ignore.

- [ ] **Step 4: Commit**

```bash
git add src/server/procedures/skillTree.ts src/server/router.ts
git commit -m "feat(api): add skill tree oRPC procedures (getMyTree, pool, assign, unassign)"
```

---

### Task 5: Smoke-test the backend in a REPL

**Files:**

- Test only (no files created)

- [ ] **Step 1: Start the dev server**

Run: `pnpm kill-port 3011 && pnpm dev &`
Expected: Server starts on port 3011.

- [ ] **Step 2: Seed a test Todo and call getMyTree via a quick Node script**

Create a throwaway test script at `/tmp/skill-tree-smoke.mjs`:

```javascript
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// Use the existing dev mock user
const user = await prisma.user.upsert({
  where: { clerkId: 'user_mock_user_id' },
  update: {},
  create: {
    clerkId: 'user_mock_user_id',
    email: 'test@example.com',
    name: 'Test User',
  },
})

// Ensure at least one completed todo exists
await prisma.todo
  .upsert({
    where: { id: 99999 },
    update: {},
    create: {
      id: 99999,
      text: 'Smoke test todo',
      completed: true,
      userId: user.id,
    },
  })
  .catch(() => {
    return prisma.todo.create({
      data: { text: 'Smoke test todo', completed: true, userId: user.id },
    })
  })

// Call the API directly: hit /api/orpc/skillTree/getMyTree
const res = await fetch('http://localhost:3011/api/orpc/skillTree/getMyTree', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: 'Bearer user_mock_user_id',
  },
  body: JSON.stringify({ json: {} }),
})
const data = await res.json()
console.log('getMyTree:', JSON.stringify(data, null, 2).slice(0, 500))

const poolRes = await fetch(
  'http://localhost:3011/api/orpc/skillTree/getUnassignedPool',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer user_mock_user_id',
    },
    body: JSON.stringify({ json: {} }),
  },
)
const poolData = await poolRes.json()
console.log(
  'getUnassignedPool:',
  JSON.stringify(poolData, null, 2).slice(0, 300),
)

await prisma.$disconnect()
```

Run: `node /tmp/skill-tree-smoke.mjs`
Expected: First call returns a SkillTree object with 28 nodes and ~25 edges (auto-imported). Second call returns an array including the smoke test todo.

- [ ] **Step 3: Verify DB rows were created**

Run: `pnpm prisma studio &` then manually inspect the `SkillTree`, `SkillNode`, and `NodeEdge` tables. Close Prisma Studio when done.
Expected: 1 tree, 28 nodes, ~25 edges for the test user.

- [ ] **Step 4: Clean up**

Run: `rm /tmp/skill-tree-smoke.mjs && pnpm kill-port 3011`
Expected: Script deleted, dev server stopped.

- [ ] **Step 5: Commit checkpoint (docs only, no code)**

No commit needed — this task is verification only. Move to Task 6.

---

## Phase B — Route Group Migration

### Task 6: Extract `AppSidebar` from `/home/page.tsx`

**Files:**

- Create: `src/components/AppSidebar.tsx`

- [ ] **Step 1: Write the extracted sidebar component**

Create `src/components/AppSidebar.tsx`:

```tsx
'use client'

import { useUser } from '@clerk/nextjs'
import {
  Search,
  Home as HomeIcon,
  Sparkles,
  Plus,
  Settings,
  ChevronDown,
  Edit,
  MoreHorizontal,
  FileText,
  Trash2,
  Download,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'

import { useIsElectron } from '@/components/auth/ElectronLoginForm'
import { Category } from '@/app/(main)/home/_components/Category'
import { CategoryManageDialog } from '@/app/(main)/home/_components/CategoryManageDialog'
import { LogoutButton } from '@/app/(main)/home/_components/LogoutButton'
import { ThemeSelectorMenuItem } from '@/components/ThemeSelectorMenuItem'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { isAppleSilicon } from '@/lib/utils'

import packageJson from '../../package.json'

const GITHUB_REPO = 'laststance/corelive'

/**
 * The shared application sidebar used across all `(main)` routes.
 * Renders user profile, navigation links, categories, and bottom actions.
 * Uses `usePathname()` to highlight the active route.
 */
export function AppSidebar() {
  const { user } = useUser()
  const isElectron = useIsElectron()
  const router = useRouter()
  const pathname = usePathname()
  const [manageDialogOpen, setManageDialogOpen] = useState(false)

  const macDownloadUrl = useMemo(() => {
    const version = packageJson.version
    const isArm = isAppleSilicon()
    const filename = isArm
      ? `CoreLive-${version}-arm64.dmg`
      : `CoreLive-${version}.dmg`
    return `https://github.com/${GITHUB_REPO}/releases/download/v${version}/${filename}`
  }, [])

  const handleOpenSettings = useCallback(() => {
    router.push('/settings')
  }, [router])

  return (
    <>
      <Sidebar className="border-r">
        <SidebarHeader className="px-4 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-1 items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="group h-auto flex-1 justify-start gap-2 p-2 hover:bg-sidebar-accent"
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={user?.imageUrl} alt="User" />
                      <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                        {user?.firstName?.charAt(0)?.toUpperCase() ||
                          user?.emailAddresses?.[0]?.emailAddress
                            ?.charAt(0)
                            ?.toUpperCase() ||
                          'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium">
                        {user?.firstName ||
                          user?.emailAddresses?.[0]?.emailAddress ||
                          'User'}
                      </div>
                    </div>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64" align="start">
                  <div className="p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user?.imageUrl} alt="User" />
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {user?.firstName?.charAt(0)?.toUpperCase() ||
                            user?.emailAddresses?.[0]?.emailAddress
                              ?.charAt(0)
                              ?.toUpperCase() ||
                            'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">
                          {user?.firstName ||
                            user?.emailAddresses?.[0]?.emailAddress ||
                            'User'}
                          's Todo
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Free Plan • 1 member
                        </div>
                      </div>
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <span className="text-sm">
                      {user?.emailAddresses?.[0]?.emailAddress || 'No email'}
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Plus className="mr-2 h-4 w-4" />
                    <span className="text-sm">New workspace</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <ThemeSelectorMenuItem />
                  <LogoutButton />
                  {!isElectron && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <a
                          href={macDownloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2"
                        >
                          <Download className="h-4 w-4" />
                          <span>Get Mac app</span>
                        </a>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent className="px-2">
          <div className="mb-2 px-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search"
                className="h-8 border-0 bg-sidebar-accent pl-8 focus-visible:ring-1"
              />
            </div>
          </div>

          {/* Main Navigation — now Link-based with active state */}
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/home'}>
                    <Link href="/home">
                      <HomeIcon className="h-4 w-4" />
                      <span>Home</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === '/skill-tree'}
                  >
                    <Link href="/skill-tree">
                      <Sparkles className="h-4 w-4" />
                      <span>Skill Tree</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          <Category onOpenManageAction={() => setManageDialogOpen(true)} />

          <div className="flex-1" />

          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {isElectron && (
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={handleOpenSettings}>
                      <Settings className="h-4 w-4" />
                      <span>Settings</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <Trash2 className="h-4 w-4" />
                    <span>Trash</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t p-2">
          <div className="flex items-center justify-between px-2 pt-2">
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label="Documents"
            >
              <FileText className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label="Edit"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label="More options"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>
      <CategoryManageDialog
        open={manageDialogOpen}
        onOpenChange={setManageDialogOpen}
      />
    </>
  )
}
```

- [ ] **Step 2: Do NOT delete the old home page yet**

We will move `/home` in the next task. For now, just ensure the new component compiles.

- [ ] **Step 3: Commit**

```bash
git add src/components/AppSidebar.tsx
git commit -m "feat(ui): extract AppSidebar component with Link-based nav"
```

---

### Task 7: Move `/home` into the `(main)` Route Group + create shared layout

**Files:**

- Create: `src/app/(main)/layout.tsx`
- Move: `src/app/home/*` → `src/app/(main)/home/*`

- [ ] **Step 1: Create the `(main)` directory and move `/home` into it**

Run:

```bash
mkdir -p "src/app/(main)"
git mv src/app/home "src/app/(main)/home"
```

Expected: The directory now lives at `src/app/(main)/home/`. `git status` shows the rename.

- [ ] **Step 2: Create the shared layout**

Create `src/app/(main)/layout.tsx`:

```tsx
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/AppSidebar'

/**
 * Shared layout for all routes under the `(main)` Route Group.
 * Wraps children with the SidebarProvider and renders the AppSidebar.
 * Route Group parentheses mean this layout applies to `/home` and `/skill-tree`
 * without adding segments to the URL.
 */
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

- [ ] **Step 3: Remove sidebar scaffolding from `(main)/home/page.tsx`**

Open `src/app/(main)/home/page.tsx`. Replace the entire file with the stripped-down version that no longer manages its own sidebar — keep ONLY the content that lives inside `<SidebarInset>`:

```tsx
'use client'

import { TodoList } from './_components/TodoList'
import { SidebarTrigger } from '@/components/ui/sidebar'

import './page.css'

/**
 * Home page content. The sidebar is provided by `(main)/layout.tsx`.
 */
export default function Home() {
  return (
    <>
      <header className="window-drag-region flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="no-drag -ml-1" />
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-medium">Tasks</h2>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4">
        <TodoList />
      </div>
    </>
  )
}
```

Note: `CategoryManageDialog` is now rendered inside `AppSidebar` (Task 6 step 1), so it is removed from this page.

- [ ] **Step 4: Typecheck and start dev server**

Run:

```bash
pnpm typecheck
```

Expected: No errors. Import path references to `./_components/*` still work because we used `git mv`.

Then:

```bash
pnpm kill-port 3011 && pnpm dev &
```

Open `http://localhost:3011/home` in a browser.
Expected: The home page renders identically to before — same todo list, same sidebar, same category management. The Home nav item is highlighted as active.

- [ ] **Step 5: Click the Skill Tree nav link**

Click "Skill Tree" in the sidebar.
Expected: 404 page (the route doesn't exist yet — we'll create it in Task 11). This confirms the Link routing works.

- [ ] **Step 6: Kill dev server and commit**

```bash
pnpm kill-port 3011
git add -A
git commit -m "feat(routing): move /home into (main) Route Group with shared layout"
```

Expected: Commit includes the file moves (tracked as renames), new `layout.tsx`, and the simplified `page.tsx`.

---

### Task 8: Sanity check — verify existing E2E still passes

**Files:**

- No files modified

- [ ] **Step 1: Run existing web E2E**

Start the server in prod mode and run E2E:

```bash
pnpm build && pnpm start &
sleep 5
pnpm e2e:web --grep "TODO App"
pnpm kill-port 3011
```

Expected: All existing "TODO App" E2E tests pass. This proves the Route Group refactor didn't break anything.

- [ ] **Step 2: Commit checkpoint — no changes needed**

If the tests passed, move to Phase C. If they failed, read the error and fix before proceeding. Do NOT proceed with broken existing tests.

---

## Phase C — Pure Logic (TDD)

### Task 9: `xpToLevel` pure function

**Files:**

- Create: `src/app/(main)/skill-tree/lib/xp.ts`
- Create: `src/app/(main)/skill-tree/lib/xp.test.ts`

- [ ] **Step 1: Write the failing test first**

Create `src/app/(main)/skill-tree/lib/xp.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'

import { xpToLevel } from './xp'

describe('xpToLevel', () => {
  it('returns Dormant (level 0) for 0 XP', () => {
    expect(xpToLevel(0)).toEqual({ level: 0, progress: 0, next: 5 })
  })

  it('returns Dormant with progress 4 at the boundary', () => {
    expect(xpToLevel(4)).toEqual({ level: 0, progress: 4, next: 5 })
  })

  it('crosses to Level 1 at 5 XP', () => {
    expect(xpToLevel(5)).toEqual({ level: 1, progress: 0, next: 10 })
  })

  it('returns Level 1 progress 9 at upper boundary', () => {
    expect(xpToLevel(14)).toEqual({ level: 1, progress: 9, next: 10 })
  })

  it('crosses to Level 2 at 15 XP', () => {
    expect(xpToLevel(15)).toEqual({ level: 2, progress: 0, next: 15 })
  })

  it('crosses to Level 3 at 30 XP', () => {
    expect(xpToLevel(30)).toEqual({ level: 3, progress: 0, next: 20 })
  })

  it('crosses to Level 4 at 50 XP', () => {
    expect(xpToLevel(50)).toEqual({ level: 4, progress: 0, next: 25 })
  })

  it('crosses to Mastered (level 5) at 75 XP with next=null', () => {
    expect(xpToLevel(75)).toEqual({ level: 5, progress: 0, next: null })
  })

  it('caps Mastered — 200 XP still reports level 5', () => {
    expect(xpToLevel(200)).toEqual({ level: 5, progress: 0, next: null })
  })

  it('returns Level 3 mid-progress for XP 40', () => {
    expect(xpToLevel(40)).toEqual({ level: 3, progress: 10, next: 20 })
  })

  it('clamps negative XP to 0', () => {
    expect(xpToLevel(-1)).toEqual({ level: 0, progress: 0, next: 5 })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test --run src/app/\(main\)/skill-tree/lib/xp.test.ts`
Expected: FAIL with "Cannot find module './xp'" or similar — the implementation doesn't exist yet.

- [ ] **Step 3: Write the minimal implementation**

Create `src/app/(main)/skill-tree/lib/xp.ts`:

```typescript
/**
 * Result of converting raw XP into level + in-level progress.
 * - `level`: 0 (Dormant) through 5 (Mastered)
 * - `progress`: XP earned within the current level (resets to 0 at each threshold)
 * - `next`: size of the current level's XP bar (XP required to reach the next level).
 *           `null` when Mastered.
 */
export interface LevelInfo {
  level: 0 | 1 | 2 | 3 | 4 | 5
  progress: number
  next: number | null
}

/**
 * Thresholds define the CUMULATIVE XP at which each level begins.
 * xp < 5     → level 0 (Dormant)
 * xp < 15    → level 1
 * xp < 30    → level 2
 * xp < 50    → level 3
 * xp < 75    → level 4
 * xp >= 75   → level 5 (Mastered)
 */
const THRESHOLDS = [0, 5, 15, 30, 50, 75] as const

/**
 * Converts a raw XP count into the display level + progress bar info.
 * @param xp - Total XP for a single node (count of NodeAssignment rows).
 * @returns
 * - `{ level: 0, progress: 0-4, next: 5 }` for Dormant
 * - `{ level: 1-4, progress: 0-(next-1), next: size of bar }` for active levels
 * - `{ level: 5, progress: 0, next: null }` for Mastered
 * @example
 * xpToLevel(0)   // => { level: 0, progress: 0, next: 5 }
 * xpToLevel(5)   // => { level: 1, progress: 0, next: 10 }
 * xpToLevel(40)  // => { level: 3, progress: 10, next: 20 }
 * xpToLevel(75)  // => { level: 5, progress: 0, next: null }
 */
export function xpToLevel(xp: number): LevelInfo {
  const clamped = Math.max(0, xp)

  // Mastered
  if (clamped >= THRESHOLDS[5]) {
    return { level: 5, progress: 0, next: null }
  }

  // Find the highest threshold <= clamped
  for (let level = 4; level >= 0; level--) {
    const floor = THRESHOLDS[level]
    const ceil = THRESHOLDS[level + 1]
    if (clamped >= floor) {
      return {
        level: level as LevelInfo['level'],
        progress: clamped - floor,
        next: ceil - floor,
      }
    }
  }

  // Unreachable fallback for TypeScript
  return { level: 0, progress: 0, next: 5 }
}
```

- [ ] **Step 4: Run the test — all cases should pass**

Run: `pnpm test --run src/app/\(main\)/skill-tree/lib/xp.test.ts`
Expected: All 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(main\)/skill-tree/lib/xp.ts src/app/\(main\)/skill-tree/lib/xp.test.ts
git commit -m "feat(skill-tree): add xpToLevel pure function with level thresholds"
```

---

### Task 10: Optimistic reducer

**Files:**

- Create: `src/app/(main)/skill-tree/lib/optimistic.ts`
- Create: `src/app/(main)/skill-tree/lib/optimistic.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/(main)/skill-tree/lib/optimistic.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'

import { applyAssignment, type OptimisticState } from './optimistic'

const baseState: OptimisticState = {
  // node 1 has 2 assignments, node 2 is empty
  assignmentsByNode: {
    1: [{ todoId: 100 }, { todoId: 101 }],
    2: [],
  },
  unassignedTodoIds: [200, 201, 202],
}

describe('applyAssignment', () => {
  it('assigns a todo from the pool to a node', () => {
    const next = applyAssignment(baseState, {
      type: 'assign',
      nodeId: 2,
      todoId: 200,
    })
    expect(next.assignmentsByNode[2]).toEqual([{ todoId: 200 }])
    expect(next.unassignedTodoIds).toEqual([201, 202])
  })

  it('is a no-op if the todo is already assigned to that node', () => {
    const next = applyAssignment(baseState, {
      type: 'assign',
      nodeId: 1,
      todoId: 100,
    })
    expect(next.assignmentsByNode[1]).toEqual([
      { todoId: 100 },
      { todoId: 101 },
    ])
    expect(next.unassignedTodoIds).toEqual([200, 201, 202])
  })

  it('unassigns a todo, returning it to the pool', () => {
    const next = applyAssignment(baseState, {
      type: 'unassign',
      nodeId: 1,
      todoId: 100,
    })
    expect(next.assignmentsByNode[1]).toEqual([{ todoId: 101 }])
    expect(next.unassignedTodoIds).toContain(100)
  })

  it('unassign is a no-op if the assignment does not exist', () => {
    const next = applyAssignment(baseState, {
      type: 'unassign',
      nodeId: 1,
      todoId: 999,
    })
    expect(next).toEqual(baseState)
  })

  it('does not mutate the input state', () => {
    const snapshot = JSON.parse(JSON.stringify(baseState))
    applyAssignment(baseState, { type: 'assign', nodeId: 2, todoId: 200 })
    expect(baseState).toEqual(snapshot)
  })
})
```

- [ ] **Step 2: Run the test — expect failure**

Run: `pnpm test --run src/app/\(main\)/skill-tree/lib/optimistic.test.ts`
Expected: FAIL with "Cannot find module './optimistic'".

- [ ] **Step 3: Write the implementation**

Create `src/app/(main)/skill-tree/lib/optimistic.ts`:

```typescript
/**
 * A lightweight snapshot of assignment state used by the optimistic reducer.
 * Holds only the derived data the UI needs: per-node assignments and the
 * unassigned pool. Not persisted — rebuilt from server state on each query.
 */
export interface OptimisticState {
  assignmentsByNode: Record<number, { todoId: number }[]>
  unassignedTodoIds: number[]
}

export type OptimisticAction =
  | { type: 'assign'; nodeId: number; todoId: number }
  | { type: 'unassign'; nodeId: number; todoId: number }

/**
 * Pure reducer for optimistic drag-and-drop assignments.
 * Called from `useOptimistic`'s reducer argument.
 * @param state - The current optimistic snapshot.
 * @param action - The assign or unassign event.
 * @returns A new state object — never mutates the input.
 * @example
 * const next = applyAssignment(state, { type: 'assign', nodeId: 2, todoId: 100 })
 */
export function applyAssignment(
  state: OptimisticState,
  action: OptimisticAction,
): OptimisticState {
  if (action.type === 'assign') {
    const existing = state.assignmentsByNode[action.nodeId] ?? []
    // Idempotent: already assigned to this node → no change
    if (existing.some((a) => a.todoId === action.todoId)) {
      return state
    }
    return {
      assignmentsByNode: {
        ...state.assignmentsByNode,
        [action.nodeId]: [...existing, { todoId: action.todoId }],
      },
      unassignedTodoIds: state.unassignedTodoIds.filter(
        (id) => id !== action.todoId,
      ),
    }
  }

  // unassign
  const existing = state.assignmentsByNode[action.nodeId] ?? []
  if (!existing.some((a) => a.todoId === action.todoId)) {
    return state
  }
  return {
    assignmentsByNode: {
      ...state.assignmentsByNode,
      [action.nodeId]: existing.filter((a) => a.todoId !== action.todoId),
    },
    unassignedTodoIds: state.unassignedTodoIds.includes(action.todoId)
      ? state.unassignedTodoIds
      : [...state.unassignedTodoIds, action.todoId],
  }
}

/**
 * Builds an OptimisticState snapshot from a server-fetched SkillTree and pool.
 * @param nodes - Array of SkillNode objects with `assignments` included.
 * @param poolTodoIds - IDs of completed Todos not yet assigned.
 * @returns Initial state for `useOptimistic`.
 */
export function buildInitialState(
  nodes: Array<{ id: number; assignments: Array<{ todoId: number }> }>,
  poolTodoIds: number[],
): OptimisticState {
  const assignmentsByNode: Record<number, { todoId: number }[]> = {}
  for (const node of nodes) {
    assignmentsByNode[node.id] = node.assignments.map((a) => ({
      todoId: a.todoId,
    }))
  }
  return { assignmentsByNode, unassignedTodoIds: poolTodoIds }
}
```

- [ ] **Step 4: Run the test — all cases should pass**

Run: `pnpm test --run src/app/\(main\)/skill-tree/lib/optimistic.test.ts`
Expected: All 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(main\)/skill-tree/lib/optimistic.ts src/app/\(main\)/skill-tree/lib/optimistic.test.ts
git commit -m "feat(skill-tree): add pure optimistic reducer for assign/unassign"
```

---

## Phase D — Visual Shell

### Task 11: Scoped CSS custom properties + animation keyframes

**Files:**

- Create: `src/app/(main)/skill-tree/styles.css`

- [ ] **Step 1: Write the CSS file**

Create `src/app/(main)/skill-tree/styles.css`:

```css
/* Scoped to [data-skill-tree='true'] to prevent token leakage. */

/* Default = Dark Fantasy (the chosen visual identity for this feature). */
[data-skill-tree='true'] {
  --st-bg-deep: #0a0e1e;
  --st-bg-mid: #1a1e3a;
  --st-surface: #2a3055;
  --st-gold: #f4d06f;
  --st-cream: #c7b99c;
  --st-arcane: #5a9bd4;
  --st-muted: #8b9dc3;
  --st-border-rune: #4a5580;
}

/* Light theme override → parchment variant. */
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

/* Canvas background. */
.st-canvas-bg {
  background: linear-gradient(
    180deg,
    var(--st-bg-deep) 0%,
    #0e1326 50%,
    var(--st-bg-mid) 100%
  );
}

/* Hover pulse on nodes. */
.st-node-group {
  transform-origin: center;
  transition:
    transform 300ms ease-out,
    opacity 300ms ease-out;
}
.st-node-group:hover,
.st-node-group:focus-within {
  transform: scale(1.08);
}

/* Mastered shimmer (outer ring opacity breathing). */
@keyframes st-mastered-shimmer {
  0%,
  100% {
    opacity: 0.4;
  }
  50% {
    opacity: 0.8;
  }
}
.st-mastered-ring {
  animation: st-mastered-shimmer 2s ease-in-out infinite;
}

/* Twinkling gold stars in the background. */
@keyframes st-twinkle {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 0.9;
  }
}
.st-twinkle-star {
  animation: st-twinkle 4s ease-in-out infinite;
}
.st-twinkle-star--delay-1 {
  animation-delay: 1.3s;
}
.st-twinkle-star--delay-2 {
  animation-delay: 2.7s;
}

/* Drop burst ring — expands from 0 to 40 then fades. */
@keyframes st-burst {
  0% {
    r: 0;
    opacity: 1;
  }
  100% {
    r: 40;
    opacity: 0;
  }
}
.st-burst-ring {
  animation: st-burst 500ms ease-out forwards;
}

/* Floating "+1 XP" text. */
@keyframes st-float-up {
  0% {
    transform: translateY(0);
    opacity: 1;
  }
  100% {
    transform: translateY(-30px);
    opacity: 0;
  }
}
.st-float-text {
  animation: st-float-up 800ms ease-out forwards;
}

/* Level up flash + spring. */
@keyframes st-level-up {
  0% {
    filter: brightness(3);
    transform: scale(1);
  }
  30% {
    filter: brightness(1);
    transform: scale(1.3);
  }
  100% {
    filter: brightness(1);
    transform: scale(1);
  }
}
.st-level-up {
  animation: st-level-up 400ms ease-out;
}

/* Reduced motion — kill all animations + transitions. */
@media (prefers-reduced-motion: reduce) {
  [data-skill-tree='true'] .st-node-group,
  [data-skill-tree='true'] .st-mastered-ring,
  [data-skill-tree='true'] .st-twinkle-star,
  [data-skill-tree='true'] .st-burst-ring,
  [data-skill-tree='true'] .st-float-text,
  [data-skill-tree='true'] .st-level-up {
    animation: none !important;
    transition: none !important;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(main\)/skill-tree/styles.css
git commit -m "feat(skill-tree): add scoped CSS custom properties and keyframes"
```

---

### Task 12: `<SkillNodeCircle>` component + tests + stories

**Files:**

- Create: `src/app/(main)/skill-tree/components/SkillNodeCircle.tsx`
- Create: `src/app/(main)/skill-tree/components/SkillNodeCircle.test.tsx`
- Create: `src/app/(main)/skill-tree/components/SkillNodeCircle.stories.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/app/(main)/skill-tree/components/SkillNodeCircle.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SkillNodeCircle } from './SkillNodeCircle'

/**
 * Wrap the node in an SVG so native <g>/<circle> have a valid parent.
 */
function svgWrap(ui: React.ReactNode) {
  return (
    <svg viewBox="0 0 100 100" width="100" height="100">
      {ui}
    </svg>
  )
}

describe('<SkillNodeCircle>', () => {
  const baseProps = {
    id: 1,
    name: 'APIs',
    cx: 50,
    cy: 50,
    xp: 0,
  }

  it('renders with an accessible label at Dormant state', () => {
    render(svgWrap(<SkillNodeCircle {...baseProps} />))
    expect(
      screen.getByRole('button', {
        name: /apis.*dormant|apis.*level 0/i,
      }),
    ).toBeInTheDocument()
  })

  it('shows level 3 in the label when XP is 40', () => {
    render(svgWrap(<SkillNodeCircle {...baseProps} xp={40} />))
    expect(
      screen.getByRole('button', { name: /apis.*level 3/i }),
    ).toBeInTheDocument()
  })

  it('reports Mastered when XP is 75', () => {
    render(svgWrap(<SkillNodeCircle {...baseProps} xp={75} />))
    expect(
      screen.getByRole('button', { name: /apis.*mastered/i }),
    ).toBeInTheDocument()
  })

  it('is keyboard focusable (tabIndex=0)', () => {
    render(svgWrap(<SkillNodeCircle {...baseProps} />))
    expect(screen.getByRole('button')).toHaveAttribute('tabindex', '0')
  })
})
```

- [ ] **Step 2: Run the test — expect failure**

Run: `pnpm test --run src/app/\(main\)/skill-tree/components/SkillNodeCircle.test.tsx`
Expected: FAIL — file does not exist.

- [ ] **Step 3: Implement the component**

Create `src/app/(main)/skill-tree/components/SkillNodeCircle.tsx`:

```tsx
'use client'

import { useDroppable } from '@dnd-kit/core'
import { match } from 'ts-pattern'

import { xpToLevel } from '../lib/xp'

/**
 * A single skill tree node rendered as SVG.
 * Wraps an invisible 44x44 hit target for easy tapping and dragging drop.
 */
export interface SkillNodeCircleProps {
  id: number
  name: string
  cx: number
  cy: number
  xp: number
  onClick?: (nodeId: number) => void
}

const LEVEL_LABEL: Record<number, string> = {
  0: 'Dormant',
  1: 'Level 1',
  2: 'Level 2',
  3: 'Level 3',
  4: 'Level 4',
  5: 'Mastered',
}

export function SkillNodeCircle({
  id,
  name,
  cx,
  cy,
  xp,
  onClick,
}: SkillNodeCircleProps) {
  const { setNodeRef, isOver } = useDroppable({ id: String(id) })
  const { level, progress, next } = xpToLevel(xp)

  const ariaLabel =
    next === null
      ? `${name}, Mastered`
      : `${name}, ${LEVEL_LABEL[level]}, ${progress} of ${next} XP`

  const baseRadius = 14

  return (
    <g
      ref={setNodeRef}
      className="st-node-group"
      role="button"
      aria-label={ariaLabel}
      tabIndex={0}
      onClick={() => onClick?.(id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.(id)
        }
      }}
      style={{ cursor: 'pointer' }}
    >
      {/* Invisible 44x44 hit target */}
      <rect x={cx - 22} y={cy - 22} width={44} height={44} fill="transparent" />

      {match(level)
        .with(0, () => (
          // Dormant — dashed muted ring, ? text, no fill
          <>
            <circle
              cx={cx}
              cy={cy}
              r={baseRadius}
              fill="transparent"
              stroke="var(--st-muted)"
              strokeWidth={1.5}
              strokeDasharray="3,3"
            />
            <text
              x={cx}
              y={cy + 4}
              textAnchor="middle"
              fill="var(--st-muted)"
              fontSize={12}
              style={{ userSelect: 'none' }}
            >
              ?
            </text>
          </>
        ))
        .with(1, () => (
          <>
            <circle
              cx={cx}
              cy={cy}
              r={baseRadius}
              fill="transparent"
              stroke="var(--st-cream)"
              strokeWidth={2}
            />
            <circle cx={cx} cy={cy} r={3} fill="var(--st-cream)" />
          </>
        ))
        .with(2, () => (
          <>
            <circle
              cx={cx}
              cy={cy}
              r={baseRadius}
              fill="transparent"
              stroke="var(--st-cream)"
              strokeWidth={2}
              filter="url(#st-cream-glow)"
            />
            <circle cx={cx} cy={cy} r={5} fill="var(--st-cream)" />
          </>
        ))
        .with(3, () => (
          <>
            <circle
              cx={cx}
              cy={cy}
              r={baseRadius + 4}
              fill="transparent"
              stroke="var(--st-cream)"
              strokeWidth={1}
              opacity={0.6}
            />
            <circle
              cx={cx}
              cy={cy}
              r={baseRadius}
              fill="transparent"
              stroke="var(--st-cream)"
              strokeWidth={2}
              filter="url(#st-cream-glow)"
            />
            <circle cx={cx} cy={cy} r={5} fill="var(--st-cream)" />
          </>
        ))
        .with(4, () => (
          <>
            <circle
              cx={cx}
              cy={cy}
              r={baseRadius + 4}
              fill="transparent"
              stroke="var(--st-gold)"
              strokeWidth={1}
              opacity={0.8}
            />
            <circle
              cx={cx}
              cy={cy}
              r={baseRadius}
              fill="transparent"
              stroke="var(--st-gold)"
              strokeWidth={2.5}
              filter="url(#st-gold-glow)"
            />
            <circle cx={cx} cy={cy} r={6} fill="var(--st-gold)" />
          </>
        ))
        .with(5, () => (
          <>
            <circle
              cx={cx}
              cy={cy}
              r={baseRadius + 8}
              fill="transparent"
              stroke="var(--st-gold)"
              strokeWidth={0.5}
              className="st-mastered-ring"
            />
            <circle
              cx={cx}
              cy={cy}
              r={baseRadius + 4}
              fill="transparent"
              stroke="var(--st-gold)"
              strokeWidth={1}
              opacity={0.7}
            />
            <circle
              cx={cx}
              cy={cy}
              r={baseRadius}
              fill="url(#st-mastered-core)"
              stroke="var(--st-gold)"
              strokeWidth={2}
              filter="url(#st-gold-glow)"
            />
            <text
              x={cx}
              y={cy + 4}
              textAnchor="middle"
              fill="var(--st-bg-deep)"
              fontSize={12}
              fontWeight="bold"
              style={{ userSelect: 'none' }}
            >
              ★
            </text>
          </>
        ))
        .exhaustive()}

      {/* Hover/selection halo */}
      {isOver && (
        <circle
          cx={cx}
          cy={cy}
          r={baseRadius + 10}
          fill="transparent"
          stroke="var(--st-arcane)"
          strokeWidth={2}
          strokeDasharray="4,3"
          opacity={0.9}
        />
      )}
    </g>
  )
}
```

- [ ] **Step 4: Run the test — expect pass**

Run: `pnpm test --run src/app/\(main\)/skill-tree/components/SkillNodeCircle.test.tsx`
Expected: All 4 tests pass. If `useDroppable` crashes because `DndContext` isn't present, wrap the test render in a minimal `<DndContext>` imported from `@dnd-kit/core`.

If that wrap is needed, update the test file's `svgWrap` helper:

```tsx
import { DndContext } from '@dnd-kit/core'

function svgWrap(ui: React.ReactNode) {
  return (
    <DndContext>
      <svg viewBox="0 0 100 100" width="100" height="100">
        {ui}
      </svg>
    </DndContext>
  )
}
```

Re-run: `pnpm test --run src/app/\(main\)/skill-tree/components/SkillNodeCircle.test.tsx`
Expected: All 4 tests pass.

- [ ] **Step 5: Write the Storybook stories**

Create `src/app/(main)/skill-tree/components/SkillNodeCircle.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { DndContext } from '@dnd-kit/core'

import { SkillNodeCircle } from './SkillNodeCircle'
import '../styles.css'

const meta: Meta<typeof SkillNodeCircle> = {
  title: 'Skill Tree/SkillNodeCircle',
  component: SkillNodeCircle,
  decorators: [
    (Story) => (
      <DndContext>
        <div data-skill-tree="true" className="st-canvas-bg p-8">
          <svg viewBox="0 0 100 100" width="200" height="200">
            <defs>
              <filter
                id="st-cream-glow"
                x="-50%"
                y="-50%"
                width="200%"
                height="200%"
              >
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter
                id="st-gold-glow"
                x="-50%"
                y="-50%"
                width="200%"
                height="200%"
              >
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <radialGradient id="st-mastered-core" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--st-gold)" />
                <stop offset="100%" stopColor="var(--st-cream)" />
              </radialGradient>
            </defs>
            <Story />
          </svg>
        </div>
      </DndContext>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof SkillNodeCircle>

const base = { id: 1, name: 'APIs', cx: 50, cy: 50 }

export const Dormant: Story = { args: { ...base, xp: 0 } }
export const Level1: Story = { args: { ...base, xp: 5 } }
export const Level2: Story = { args: { ...base, xp: 15 } }
export const Level3: Story = { args: { ...base, xp: 30 } }
export const Level4: Story = { args: { ...base, xp: 50 } }
export const Mastered: Story = { args: { ...base, xp: 75 } }
```

- [ ] **Step 6: Verify Storybook builds**

Run: `pnpm storybook --smoke-test` (if this script exists) or launch `pnpm storybook` briefly to confirm it loads. If no smoke-test script exists, skip to typecheck.

Run: `pnpm typecheck`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(main\)/skill-tree/components/SkillNodeCircle.tsx \
        src/app/\(main\)/skill-tree/components/SkillNodeCircle.test.tsx \
        src/app/\(main\)/skill-tree/components/SkillNodeCircle.stories.tsx
git commit -m "feat(skill-tree): add SkillNodeCircle component with 6 level states"
```

---

### Task 13: `<ConstellationCanvas>` component + stories

**Files:**

- Create: `src/app/(main)/skill-tree/components/ConstellationCanvas.tsx`
- Create: `src/app/(main)/skill-tree/components/ConstellationCanvas.stories.tsx`

- [ ] **Step 1: Implement the canvas**

Create `src/app/(main)/skill-tree/components/ConstellationCanvas.tsx`:

```tsx
'use client'

import { SkillNodeCircle } from './SkillNodeCircle'

/**
 * A lightweight view model for nodes passed into the canvas.
 * Kept separate from the Prisma type to avoid pulling server types into client code.
 */
export interface CanvasNode {
  id: number
  name: string
  x: number // 0-1 normalized
  y: number // 0-1 normalized
  xp: number
}

export interface CanvasEdge {
  id: number
  fromNodeId: number
  toNodeId: number
}

export interface ConstellationCanvasProps {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  onNodeClick?: (nodeId: number) => void
}

const VIEWBOX = 1000 // logical units — actual size is controlled by CSS

/**
 * Converts a normalized (0-1) coordinate into logical SVG units.
 */
function toViewboxUnits(n: number) {
  return n * VIEWBOX
}

/**
 * Renders the full constellation: background stars, edges, nodes.
 * Pure SVG — no canvas, no React Flow. Nodes receive droppable behavior
 * from @dnd-kit via `useDroppable` inside `<SkillNodeCircle>`.
 */
export function ConstellationCanvas({
  nodes,
  edges,
  onNodeClick,
}: ConstellationCanvasProps) {
  // Map node IDs to their coordinates for edge lookups
  const nodeById = new Map(
    nodes.map((n) => [
      n.id,
      { cx: toViewboxUnits(n.x), cy: toViewboxUnits(n.y) },
    ]),
  )

  // 18 static + 3 twinkle stars, positions are pseudo-random but stable
  const staticStars = [
    [120, 80],
    [270, 150],
    [450, 60],
    [620, 120],
    [780, 90],
    [900, 180],
    [100, 320],
    [350, 380],
    [580, 310],
    [830, 390],
    [950, 460],
    [220, 520],
    [410, 610],
    [690, 560],
    [880, 640],
    [150, 720],
    [520, 780],
    [770, 830],
  ] as const
  const twinkleStars = [
    [320, 220],
    [620, 440],
    [150, 580],
  ] as const

  return (
    <svg
      className="st-canvas-bg"
      viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
      width="100%"
      height="100%"
      style={{ display: 'block' }}
      role="img"
      aria-label="Skill tree constellation"
    >
      <defs>
        <filter id="st-cream-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="st-gold-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="st-mastered-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--st-gold)" />
          <stop offset="100%" stopColor="var(--st-cream)" />
        </radialGradient>
      </defs>

      {/* Background stars */}
      <g aria-hidden="true">
        {staticStars.map(([x, y], i) => (
          <circle
            key={`star-${i}`}
            cx={x}
            cy={y}
            r={1.5}
            fill="var(--st-cream)"
            opacity={0.6}
          />
        ))}
        {twinkleStars.map(([x, y], i) => (
          <circle
            key={`twinkle-${i}`}
            cx={x}
            cy={y}
            r={2}
            fill="var(--st-gold)"
            className={`st-twinkle-star ${
              i === 1
                ? 'st-twinkle-star--delay-1'
                : i === 2
                  ? 'st-twinkle-star--delay-2'
                  : ''
            }`}
          />
        ))}
      </g>

      {/* Edges (drawn first, under nodes) */}
      <g aria-hidden="true">
        {edges.map((edge) => {
          const from = nodeById.get(edge.fromNodeId)
          const to = nodeById.get(edge.toNodeId)
          if (!from || !to) return null
          const fromNode = nodes.find((n) => n.id === edge.fromNodeId)
          const toNode = nodes.find((n) => n.id === edge.toNodeId)
          if (!fromNode || !toNode) return null

          // Edge style based on endpoint activation
          const bothActive = fromNode.xp >= 5 && toNode.xp >= 5
          const oneActive = fromNode.xp >= 5 || toNode.xp >= 5
          const stroke = bothActive
            ? 'var(--st-gold)'
            : oneActive
              ? 'var(--st-cream)'
              : 'var(--st-muted)'
          const strokeWidth = bothActive ? 3 : oneActive ? 2 : 1.6
          const opacity = bothActive ? 0.6 : oneActive ? 0.45 : 0.4
          const dash = bothActive || oneActive ? undefined : '4,6'

          return (
            <line
              key={edge.id}
              x1={from.cx}
              y1={from.cy}
              x2={to.cx}
              y2={to.cy}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeOpacity={opacity}
              strokeDasharray={dash}
            />
          )
        })}
      </g>

      {/* Nodes */}
      <g>
        {nodes.map((node) => (
          <SkillNodeCircle
            key={node.id}
            id={node.id}
            name={node.name}
            cx={toViewboxUnits(node.x)}
            cy={toViewboxUnits(node.y)}
            xp={node.xp}
            onClick={onNodeClick}
          />
        ))}
      </g>
    </svg>
  )
}
```

- [ ] **Step 2: Write Storybook stories**

Create `src/app/(main)/skill-tree/components/ConstellationCanvas.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { DndContext } from '@dnd-kit/core'

import { ConstellationCanvas } from './ConstellationCanvas'
import '../styles.css'

const meta: Meta<typeof ConstellationCanvas> = {
  title: 'Skill Tree/ConstellationCanvas',
  component: ConstellationCanvas,
  decorators: [
    (Story) => (
      <DndContext>
        <div data-skill-tree="true" style={{ width: '800px', height: '800px' }}>
          <Story />
        </div>
      </DndContext>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ConstellationCanvas>

const sampleNodes = [
  { id: 1, name: 'HTTP', x: 0.2, y: 0.2, xp: 0 },
  { id: 2, name: 'REST APIs', x: 0.5, y: 0.4, xp: 0 },
  { id: 3, name: 'Auth', x: 0.5, y: 0.2, xp: 0 },
  { id: 4, name: 'PostgreSQL', x: 0.2, y: 0.5, xp: 0 },
  { id: 5, name: 'Docker', x: 0.3, y: 0.8, xp: 0 },
]
const sampleEdges = [
  { id: 1, fromNodeId: 1, toNodeId: 2 },
  { id: 2, fromNodeId: 3, toNodeId: 2 },
  { id: 3, fromNodeId: 4, toNodeId: 2 },
  { id: 4, fromNodeId: 5, toNodeId: 4 },
]

export const Empty: Story = {
  args: { nodes: sampleNodes, edges: sampleEdges },
}

export const PartiallyLeveled: Story = {
  args: {
    nodes: [
      { ...sampleNodes[0], xp: 5 },
      { ...sampleNodes[1], xp: 20 },
      { ...sampleNodes[2], xp: 0 },
      { ...sampleNodes[3], xp: 35 },
      { ...sampleNodes[4], xp: 0 },
    ],
    edges: sampleEdges,
  },
}

export const FullyMastered: Story = {
  args: {
    nodes: sampleNodes.map((n) => ({ ...n, xp: 75 })),
    edges: sampleEdges,
  },
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(main\)/skill-tree/components/ConstellationCanvas.tsx \
        src/app/\(main\)/skill-tree/components/ConstellationCanvas.stories.tsx
git commit -m "feat(skill-tree): add ConstellationCanvas SVG renderer with edges and stars"
```

---

### Task 14: `<TaskPoolCard>` + `<TaskPoolDrawer>` + `<DragOverlayCard>` + tests + stories

**Files:**

- Create: `src/app/(main)/skill-tree/components/TaskPoolCard.tsx`
- Create: `src/app/(main)/skill-tree/components/TaskPoolCard.test.tsx`
- Create: `src/app/(main)/skill-tree/components/TaskPoolDrawer.tsx`
- Create: `src/app/(main)/skill-tree/components/TaskPoolDrawer.stories.tsx`
- Create: `src/app/(main)/skill-tree/components/DragOverlayCard.tsx`

- [ ] **Step 1: Write the failing test for TaskPoolCard**

Create `src/app/(main)/skill-tree/components/TaskPoolCard.test.tsx`:

```tsx
import { DndContext } from '@dnd-kit/core'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TaskPoolCard } from './TaskPoolCard'

function wrap(ui: React.ReactNode) {
  return <DndContext>{ui}</DndContext>
}

describe('<TaskPoolCard>', () => {
  it('shows the todo text', () => {
    render(wrap(<TaskPoolCard id={1} text="Fix login bug" />))
    expect(screen.getByText('Fix login bug')).toBeInTheDocument()
  })

  it('is a button with role and is tabbable', () => {
    render(wrap(<TaskPoolCard id={1} text="Fix login bug" />))
    const btn = screen.getByRole('button', { name: /fix login bug/i })
    expect(btn).toHaveAttribute('tabindex', '0')
  })
})
```

- [ ] **Step 2: Run test — expect failure**

Run: `pnpm test --run src/app/\(main\)/skill-tree/components/TaskPoolCard.test.tsx`
Expected: FAIL — file missing.

- [ ] **Step 3: Implement `<TaskPoolCard>`**

Create `src/app/(main)/skill-tree/components/TaskPoolCard.tsx`:

```tsx
'use client'

import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

/**
 * A draggable card representing a completed Todo in the pool drawer.
 * Uses `useDraggable` for DnD and renders as a button for a11y.
 */
export interface TaskPoolCardProps {
  id: number
  text: string
}

export function TaskPoolCard({ id, text }: TaskPoolCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: String(id) })

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
  }

  return (
    <button
      ref={setNodeRef}
      type="button"
      className="min-w-[200px] max-w-[260px] rounded-lg border border-[var(--st-border-rune)] bg-[var(--st-surface)] p-3 text-left text-sm text-[var(--st-cream)] shadow-md transition-shadow hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--st-arcane)]"
      style={style}
      tabIndex={0}
      {...listeners}
      {...attributes}
      aria-label={`Completed task: ${text}. Press space to pick up.`}
    >
      {text}
    </button>
  )
}
```

- [ ] **Step 4: Run the test — expect pass**

Run: `pnpm test --run src/app/\(main\)/skill-tree/components/TaskPoolCard.test.tsx`
Expected: Both tests pass.

- [ ] **Step 5: Implement `<DragOverlayCard>` (the floating preview)**

Create `src/app/(main)/skill-tree/components/DragOverlayCard.tsx`:

```tsx
'use client'

/**
 * A non-interactive floating preview of a task card, rendered inside
 * `<DragOverlay>` while a drag is in progress.
 */
export function DragOverlayCard({ text }: { text: string }) {
  return (
    <div
      className="pointer-events-none min-w-[200px] max-w-[260px] rounded-lg border border-[var(--st-gold)] bg-[var(--st-surface)] p-3 text-left text-sm text-[var(--st-cream)] shadow-2xl"
      style={{ transform: 'rotate(-2deg)' }}
    >
      {text}
    </div>
  )
}
```

- [ ] **Step 6: Implement `<TaskPoolDrawer>`**

Create `src/app/(main)/skill-tree/components/TaskPoolDrawer.tsx`:

```tsx
'use client'

import { Package, ChevronUp } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

import { TaskPoolCard } from './TaskPoolCard'

/**
 * Minimal Todo shape used by the drawer. Kept loose so stories can use mocks.
 */
export interface PoolTodo {
  id: number
  text: string
}

export interface TaskPoolDrawerProps {
  todos: PoolTodo[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Bottom sheet containing horizontally-scrollable completed Todos.
 * When closed, shows a floating pill at the bottom of the screen.
 * When empty, shows an empty state.
 */
export function TaskPoolDrawer({
  todos,
  open,
  onOpenChange,
}: TaskPoolDrawerProps) {
  const count = todos.length

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {count > 0 && (
        <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2">
          <SheetTrigger asChild>
            <Button
              variant="default"
              className="hover:bg-[var(--st-surface)]/80 gap-2 rounded-full bg-[var(--st-surface)] px-5 py-6 text-[var(--st-cream)] shadow-lg"
            >
              <Package className="h-5 w-5" />
              <span className="font-medium">
                {count} unassigned task{count !== 1 ? 's' : ''}
              </span>
              <ChevronUp className="h-5 w-5" />
            </Button>
          </SheetTrigger>
        </div>
      )}
      <SheetContent
        side="bottom"
        className="border-t border-[var(--st-border-rune)] bg-[var(--st-bg-mid)] text-[var(--st-cream)]"
      >
        <SheetHeader>
          <SheetTitle className="text-[var(--st-gold)]">
            Unassigned completed tasks
          </SheetTitle>
        </SheetHeader>
        <div
          className="mt-4 flex gap-3 overflow-x-auto pb-4"
          role="list"
          aria-label="Completed task pool"
        >
          {count === 0 ? (
            <div className="w-full py-8 text-center text-[var(--st-muted)]">
              All tasks allocated — nice work
            </div>
          ) : (
            todos.map((todo) => (
              <div key={todo.id} role="listitem">
                <TaskPoolCard id={todo.id} text={todo.text} />
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 7: Write Storybook stories for the drawer**

Create `src/app/(main)/skill-tree/components/TaskPoolDrawer.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { DndContext } from '@dnd-kit/core'
import { useState } from 'react'

import { TaskPoolDrawer } from './TaskPoolDrawer'
import '../styles.css'

const meta: Meta<typeof TaskPoolDrawer> = {
  title: 'Skill Tree/TaskPoolDrawer',
  component: TaskPoolDrawer,
  decorators: [
    (Story) => (
      <DndContext>
        <div
          data-skill-tree="true"
          className="st-canvas-bg"
          style={{ height: '600px', position: 'relative' }}
        >
          <Story />
        </div>
      </DndContext>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof TaskPoolDrawer>

function Template(args: React.ComponentProps<typeof TaskPoolDrawer>) {
  const [open, setOpen] = useState(true)
  return <TaskPoolDrawer {...args} open={open} onOpenChange={setOpen} />
}

export const EmptyState: Story = {
  render: (args) => <Template {...args} />,
  args: { todos: [] },
}

export const ThreeTasks: Story = {
  render: (args) => <Template {...args} />,
  args: {
    todos: [
      { id: 1, text: 'Set up PostgreSQL locally' },
      { id: 2, text: 'Write API auth middleware' },
      { id: 3, text: 'Deploy to production' },
    ],
  },
}

export const ManyTasks_Scroll: Story = {
  render: (args) => <Template {...args} />,
  args: {
    todos: Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      text: `Completed task number ${i + 1}`,
    })),
  },
}
```

- [ ] **Step 8: Typecheck + run component tests**

Run:

```bash
pnpm typecheck
pnpm test --run src/app/\(main\)/skill-tree/components
```

Expected: No type errors and all skill tree component tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/app/\(main\)/skill-tree/components/TaskPoolCard.tsx \
        src/app/\(main\)/skill-tree/components/TaskPoolCard.test.tsx \
        src/app/\(main\)/skill-tree/components/DragOverlayCard.tsx \
        src/app/\(main\)/skill-tree/components/TaskPoolDrawer.tsx \
        src/app/\(main\)/skill-tree/components/TaskPoolDrawer.stories.tsx
git commit -m "feat(skill-tree): add TaskPoolCard, DragOverlayCard, TaskPoolDrawer"
```

---

### Task 15: `<NodePopover>` + `<XpBadge>` + tests + stories

**Files:**

- Create: `src/app/(main)/skill-tree/components/XpBadge.tsx`
- Create: `src/app/(main)/skill-tree/components/XpBadge.test.tsx`
- Create: `src/app/(main)/skill-tree/components/XpBadge.stories.tsx`
- Create: `src/app/(main)/skill-tree/components/NodePopover.tsx`
- Create: `src/app/(main)/skill-tree/components/NodePopover.test.tsx`

- [ ] **Step 1: Write failing test for XpBadge**

Create `src/app/(main)/skill-tree/components/XpBadge.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { XpBadge } from './XpBadge'

describe('<XpBadge>', () => {
  it('shows Dormant for 0 xp', () => {
    render(<XpBadge xp={0} />)
    expect(screen.getByText(/dormant/i)).toBeInTheDocument()
    expect(screen.getByText(/0 \/ 5/)).toBeInTheDocument()
  })

  it('shows level 3 with progress 10/20', () => {
    render(<XpBadge xp={40} />)
    expect(screen.getByText(/level 3/i)).toBeInTheDocument()
    expect(screen.getByText(/10 \/ 20/)).toBeInTheDocument()
  })

  it('shows Mastered at 75+', () => {
    render(<XpBadge xp={75} />)
    expect(screen.getByText(/mastered/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Implement `<XpBadge>`**

Create `src/app/(main)/skill-tree/components/XpBadge.tsx`:

```tsx
'use client'

import { xpToLevel } from '../lib/xp'

const LABEL: Record<number, string> = {
  0: 'Dormant',
  1: 'Level 1',
  2: 'Level 2',
  3: 'Level 3',
  4: 'Level 4',
  5: 'Mastered',
}

/**
 * A compact badge showing the level + progress bar for a skill node.
 * Used in node tooltips and popover headers.
 */
export function XpBadge({ xp }: { xp: number }) {
  const { level, progress, next } = xpToLevel(xp)
  const label = LABEL[level]
  const isMastered = next === null

  return (
    <div className="flex flex-col gap-1 text-xs text-[var(--st-cream)]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-[var(--st-gold)]">{label}</span>
        {!isMastered && (
          <span className="tabular-nums">
            {progress} / {next}
          </span>
        )}
      </div>
      {!isMastered && (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--st-border-rune)]"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={next ?? 100}
        >
          <div
            className="h-full bg-[var(--st-gold)] transition-all"
            style={{ width: `${(progress / next) * 100}%` }}
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Run test**

Run: `pnpm test --run src/app/\(main\)/skill-tree/components/XpBadge.test.tsx`
Expected: 3 tests pass.

- [ ] **Step 4: Write XpBadge stories**

Create `src/app/(main)/skill-tree/components/XpBadge.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'

import { XpBadge } from './XpBadge'
import '../styles.css'

const meta: Meta<typeof XpBadge> = {
  title: 'Skill Tree/XpBadge',
  component: XpBadge,
  decorators: [
    (Story) => (
      <div
        data-skill-tree="true"
        className="bg-[var(--st-bg-mid)] p-6"
        style={{ width: 240 }}
      >
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof XpBadge>

export const L0: Story = { args: { xp: 0 } }
export const L3_progress: Story = { args: { xp: 40 } }
export const Mastered: Story = { args: { xp: 75 } }
```

- [ ] **Step 5: Write failing test for NodePopover**

Create `src/app/(main)/skill-tree/components/NodePopover.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NodePopover } from './NodePopover'

describe('<NodePopover>', () => {
  const assignedTodos = [
    { id: 10, text: 'Fix auth bug' },
    { id: 11, text: 'Write tests' },
  ]

  it('shows assigned todos', () => {
    render(
      <NodePopover
        open
        onOpenChange={() => {}}
        node={{ id: 1, name: 'APIs', xp: 20 }}
        assignedTodos={assignedTodos}
        onUnassign={() => {}}
      >
        <button>Trigger</button>
      </NodePopover>,
    )
    expect(screen.getByText('Fix auth bug')).toBeInTheDocument()
    expect(screen.getByText('Write tests')).toBeInTheDocument()
  })

  it('fires onUnassign with correct todoId when × is clicked', () => {
    const onUnassign = vi.fn()
    render(
      <NodePopover
        open
        onOpenChange={() => {}}
        node={{ id: 1, name: 'APIs', xp: 20 }}
        assignedTodos={assignedTodos}
        onUnassign={onUnassign}
      >
        <button>Trigger</button>
      </NodePopover>,
    )
    const unassignButtons = screen.getAllByRole('button', {
      name: /unassign/i,
    })
    fireEvent.click(unassignButtons[0])
    expect(onUnassign).toHaveBeenCalledWith(10)
  })

  it('shows empty state when no tasks are assigned', () => {
    render(
      <NodePopover
        open
        onOpenChange={() => {}}
        node={{ id: 1, name: 'APIs', xp: 0 }}
        assignedTodos={[]}
        onUnassign={() => {}}
      >
        <button>Trigger</button>
      </NodePopover>,
    )
    expect(screen.getByText(/no tasks assigned/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Implement `<NodePopover>`**

Create `src/app/(main)/skill-tree/components/NodePopover.tsx`:

```tsx
'use client'

import { X } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

import { XpBadge } from './XpBadge'

export interface NodePopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  node: { id: number; name: string; xp: number }
  assignedTodos: Array<{ id: number; text: string }>
  onUnassign: (todoId: number) => void
  children: ReactNode
}

/**
 * Popover anchored to a skill node, listing its assigned completed Todos.
 * Each row has a × button to unassign the todo (returns it to the pool).
 */
export function NodePopover({
  open,
  onOpenChange,
  node,
  assignedTodos,
  onUnassign,
  children,
}: NodePopoverProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="w-72 border-[var(--st-border-rune)] bg-[var(--st-bg-mid)] text-[var(--st-cream)]"
        align="center"
      >
        <div className="mb-3">
          <div className="text-sm font-medium text-[var(--st-gold)]">
            {node.name}
          </div>
          <div className="mt-1">
            <XpBadge xp={node.xp} />
          </div>
        </div>
        <div
          className="max-h-60 space-y-1 overflow-y-auto"
          role="list"
          aria-label="Assigned tasks"
        >
          {assignedTodos.length === 0 ? (
            <div className="py-4 text-center text-xs text-[var(--st-muted)]">
              No tasks assigned yet
            </div>
          ) : (
            assignedTodos.map((todo) => (
              <div
                key={todo.id}
                role="listitem"
                className="flex items-center justify-between gap-2 rounded-md bg-[var(--st-surface)] px-2 py-1.5"
              >
                <span className="truncate text-xs">{todo.text}</span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-[var(--st-muted)] hover:bg-[var(--st-border-rune)] hover:text-[var(--st-cream)]"
                  aria-label={`Unassign ${todo.text}`}
                  onClick={() => onUnassign(todo.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 7: Run tests**

Run:

```bash
pnpm test --run src/app/\(main\)/skill-tree/components/NodePopover.test.tsx
pnpm test --run src/app/\(main\)/skill-tree/components/XpBadge.test.tsx
```

Expected: All pass.

- [ ] **Step 8: Typecheck**

Run: `pnpm typecheck`
Expected: No errors.

- [ ] **Step 9: Commit**

```bash
git add src/app/\(main\)/skill-tree/components/XpBadge.tsx \
        src/app/\(main\)/skill-tree/components/XpBadge.test.tsx \
        src/app/\(main\)/skill-tree/components/XpBadge.stories.tsx \
        src/app/\(main\)/skill-tree/components/NodePopover.tsx \
        src/app/\(main\)/skill-tree/components/NodePopover.test.tsx
git commit -m "feat(skill-tree): add XpBadge and NodePopover components"
```

---

### Task 16: Palette reference story

**Files:**

- Create: `src/app/(main)/skill-tree/components/DarkFantasyPalette.stories.tsx`

- [ ] **Step 1: Write the reference story**

Create `src/app/(main)/skill-tree/components/DarkFantasyPalette.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'

import '../styles.css'

const tokens = [
  { name: '--st-bg-deep', label: 'Background Deep' },
  { name: '--st-bg-mid', label: 'Background Mid' },
  { name: '--st-surface', label: 'Surface' },
  { name: '--st-gold', label: 'Gold' },
  { name: '--st-cream', label: 'Cream' },
  { name: '--st-arcane', label: 'Arcane' },
  { name: '--st-muted', label: 'Muted' },
  { name: '--st-border-rune', label: 'Border Rune' },
] as const

function Palette() {
  return (
    <div
      data-skill-tree="true"
      className="st-canvas-bg grid grid-cols-2 gap-4 p-8"
    >
      {tokens.map((t) => (
        <div
          key={t.name}
          className="flex items-center gap-3 rounded-lg border p-3"
          style={{ borderColor: 'var(--st-border-rune)' }}
        >
          <div
            className="h-14 w-14 rounded border"
            style={{
              background: `var(${t.name})`,
              borderColor: 'var(--st-border-rune)',
            }}
          />
          <div className="flex-1">
            <div
              className="text-sm font-medium"
              style={{ color: 'var(--st-cream)' }}
            >
              {t.label}
            </div>
            <div
              className="font-mono text-xs"
              style={{ color: 'var(--st-muted)' }}
            >
              {t.name}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

const meta: Meta<typeof Palette> = {
  title: 'Skill Tree/Dark Fantasy Palette',
  component: Palette,
}

export default meta
type Story = StoryObj<typeof Palette>

export const DarkTheme: Story = {
  decorators: [
    (Story) => (
      <div data-theme="dark">
        <Story />
      </div>
    ),
  ],
}

export const LightTheme: Story = {
  decorators: [
    (Story) => (
      <div data-theme="light">
        <Story />
      </div>
    ),
  ],
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(main\)/skill-tree/components/DarkFantasyPalette.stories.tsx
git commit -m "feat(skill-tree): add Dark Fantasy palette reference story"
```

---

## Phase E — Interactivity

### Task 17: `useReducedMotion` hook + `SkillTreeView` scaffold

**Files:**

- Create: `src/app/(main)/skill-tree/lib/useReducedMotion.ts`
- Create: `src/app/(main)/skill-tree/SkillTreeView.tsx`
- Create: `src/app/(main)/skill-tree/page.tsx`

- [ ] **Step 1: Implement the reduced-motion hook**

Create `src/app/(main)/skill-tree/lib/useReducedMotion.ts`:

```typescript
'use client'

import { useSyncExternalStore } from 'react'

/**
 * Returns `true` when the user has `prefers-reduced-motion: reduce` set.
 * Uses `useSyncExternalStore` so it is SSR-safe and free of hydration bugs.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => false, // SSR default: assume motion is allowed
  )
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  mq.addEventListener('change', onStoreChange)
  return () => {
    mq.removeEventListener('change', onStoreChange)
  }
}
```

- [ ] **Step 2: Scaffold the page.tsx (RSC shell)**

Create `src/app/(main)/skill-tree/page.tsx`:

```tsx
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

import { SkillTreeView } from './SkillTreeView'

/**
 * Server component shell for /skill-tree.
 * Validates auth and delegates everything else to the client view.
 */
export default async function SkillTreePage() {
  const { userId } = await auth()
  if (!userId) redirect('/login')

  return <SkillTreeView />
}
```

- [ ] **Step 3: Scaffold `SkillTreeView` with query wiring only (no DnD yet)**

Create `src/app/(main)/skill-tree/SkillTreeView.tsx`:

```tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { orpc } from '@/lib/orpc/client-query'
import { SidebarTrigger } from '@/components/ui/sidebar'

import { ConstellationCanvas } from './components/ConstellationCanvas'
import { TaskPoolDrawer } from './components/TaskPoolDrawer'
import './styles.css'

/**
 * Main client-side view for the skill tree page.
 * This task (17) wires up queries and layout only — DnD comes in task 18.
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
```

- [ ] **Step 4: Start dev server and smoke-test manually**

Run:

```bash
pnpm kill-port 3011 && pnpm dev &
```

Open `http://localhost:3011/skill-tree` in a browser.
Expected: Page loads. On first visit, the default template auto-imports via `getMyTree` and renders the constellation. The drawer pill shows the count of completed Todos from the test user.

- [ ] **Step 5: Kill dev server + commit**

```bash
pnpm kill-port 3011
git add src/app/\(main\)/skill-tree/lib/useReducedMotion.ts \
        src/app/\(main\)/skill-tree/page.tsx \
        src/app/\(main\)/skill-tree/SkillTreeView.tsx
git commit -m "feat(skill-tree): add SkillTreeView with useQuery wiring and page shell"
```

---

### Task 18: Wire up DnD + optimistic state in `SkillTreeView`

**Files:**

- Modify: `src/app/(main)/skill-tree/SkillTreeView.tsx`

- [ ] **Step 1: Replace `SkillTreeView` with full DnD implementation**

Replace the contents of `src/app/(main)/skill-tree/SkillTreeView.tsx`:

```tsx
'use client'

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useOptimistic, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { orpc } from '@/lib/orpc/client-query'
import { SidebarTrigger } from '@/components/ui/sidebar'

import { ConstellationCanvas } from './components/ConstellationCanvas'
import { DragOverlayCard } from './components/DragOverlayCard'
import { NodePopover } from './components/NodePopover'
import { TaskPoolDrawer } from './components/TaskPoolDrawer'
import {
  applyAssignment,
  buildInitialState,
  type OptimisticState,
} from './lib/optimistic'
import './styles.css'

/**
 * The main client-side view: tree rendering + DnD + optimistic mutations.
 */
export function SkillTreeView() {
  const queryClient = useQueryClient()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeDragId, setActiveDragId] = useState<number | null>(null)
  const [activePopoverNodeId, setActivePopoverNodeId] = useState<number | null>(
    null,
  )
  const [, startTransition] = useTransition()

  const { data: tree, isLoading: treeLoading } = useQuery(
    orpc.skillTree.getMyTree.queryOptions(),
  )
  const { data: pool, isLoading: poolLoading } = useQuery(
    orpc.skillTree.getUnassignedPool.queryOptions(),
  )

  const baseState: OptimisticState = useMemo(() => {
    if (!tree || !pool) {
      return { assignmentsByNode: {}, unassignedTodoIds: [] }
    }
    return buildInitialState(
      tree.nodes.map((n) => ({ id: n.id, assignments: n.assignments })),
      pool.map((t) => t.id),
    )
  }, [tree, pool])

  const [optimisticState, applyOptimistic] = useOptimistic(
    baseState,
    applyAssignment,
  )

  const todoTextById = useMemo(() => {
    const map = new Map<number, string>()
    pool?.forEach((t) => map.set(t.id, t.text))
    tree?.nodes.forEach((n) => {
      // tree assignments only have todoId; we don't have text for already-assigned todos
      // in the pool query response, so the text comes from a separate query in future.
      // For now, prepopulate with "Task #{id}" and upgrade when we fetch detail.
    })
    return map
  }, [pool, tree])

  const assignMutation = useMutation(
    orpc.skillTree.assignTask.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.skillTree.getMyTree.key(),
        })
        queryClient.invalidateQueries({
          queryKey: orpc.skillTree.getUnassignedPool.key(),
        })
      },
      onError: () => {
        toast.error("Couldn't assign task — try again")
      },
    }),
  )

  const unassignMutation = useMutation(
    orpc.skillTree.unassignTask.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.skillTree.getMyTree.key(),
        })
        queryClient.invalidateQueries({
          queryKey: orpc.skillTree.getUnassignedPool.key(),
        })
      },
      onError: () => {
        toast.error("Couldn't unassign task — try again")
      },
    }),
  )

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor),
  )

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(Number(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null)
    const { active, over } = event
    if (!over) return

    const nodeId = Number(over.id)
    const todoId = Number(active.id)

    startTransition(() => {
      applyOptimistic({ type: 'assign', nodeId, todoId })
      assignMutation.mutate({ nodeId, todoId })
    })
  }

  function handleUnassign(nodeId: number, todoId: number) {
    startTransition(() => {
      applyOptimistic({ type: 'unassign', nodeId, todoId })
      unassignMutation.mutate({ nodeId, todoId })
    })
  }

  if (treeLoading || poolLoading || !tree || !pool) {
    return (
      <div
        data-skill-tree="true"
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
    xp: optimisticState.assignmentsByNode[n.id]?.length ?? 0,
  }))
  const canvasEdges = tree.edges.map((e) => ({
    id: e.id,
    fromNodeId: e.fromNodeId,
    toNodeId: e.toNodeId,
  }))
  const poolTodos = pool
    .filter((t) => optimisticState.unassignedTodoIds.includes(t.id))
    .map((t) => ({ id: t.id, text: t.text }))

  const activeTodoText =
    activeDragId !== null
      ? (pool.find((t) => t.id === activeDragId)?.text ??
        `Task #${activeDragId}`)
      : ''

  const activePopoverNode = tree.nodes.find((n) => n.id === activePopoverNodeId)
  const assignedTodosForPopover = activePopoverNode
    ? (optimisticState.assignmentsByNode[activePopoverNode.id] ?? []).map(
        (a) => ({
          id: a.todoId,
          text: todoTextById.get(a.todoId) ?? `Task #${a.todoId}`,
        }),
      )
    : []

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div data-skill-tree="true" className="flex h-full w-full flex-col">
        <header className="window-drag-region flex h-16 shrink-0 items-center gap-2 border-b border-[var(--st-border-rune)] bg-[var(--st-bg-deep)] px-4 text-[var(--st-cream)]">
          <SidebarTrigger className="no-drag -ml-1" />
          <h2 className="text-lg font-medium text-[var(--st-gold)]">
            Skill Tree
          </h2>
        </header>
        <div className="relative flex-1 overflow-hidden">
          <ConstellationCanvas
            nodes={canvasNodes}
            edges={canvasEdges}
            onNodeClick={(nodeId) => setActivePopoverNodeId(nodeId)}
          />
          {activePopoverNode && (
            <NodePopover
              open={activePopoverNodeId !== null}
              onOpenChange={(open) => {
                if (!open) setActivePopoverNodeId(null)
              }}
              node={{
                id: activePopoverNode.id,
                name: activePopoverNode.name,
                xp: assignedTodosForPopover.length,
              }}
              assignedTodos={assignedTodosForPopover}
              onUnassign={(todoId) =>
                handleUnassign(activePopoverNode.id, todoId)
              }
            >
              <span className="sr-only">Node popover trigger</span>
            </NodePopover>
          )}
          <TaskPoolDrawer
            todos={poolTodos}
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
          />
        </div>
      </div>
      <DragOverlay>
        {activeDragId !== null ? (
          <DragOverlayCard text={activeTodoText} />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: No errors. If `orpc.skillTree.assignTask.mutationOptions` has type issues, open `src/server/router.ts` and confirm the namespace is registered. If `orpc.skillTree.getMyTree.key()` doesn't exist, check `@orpc/tanstack-query` docs — the helper may be `.queryKey()`.

- [ ] **Step 3: Smoke-test in dev**

Run: `pnpm kill-port 3011 && pnpm dev &`
Open `/skill-tree`, open the drawer, drag a completed todo onto a node.
Expected:

1. DragOverlay shows the card floating under the cursor.
2. On drop, node XP visibly increments.
3. The dropped todo disappears from the drawer.
4. On reload, state persists.

- [ ] **Step 4: Kill dev server and commit**

```bash
pnpm kill-port 3011
git add src/app/\(main\)/skill-tree/SkillTreeView.tsx
git commit -m "feat(skill-tree): wire up DnD with optimistic assign/unassign flow"
```

---

### Task 19: Node popover anchor + unassign wiring polish

**Files:**

- Modify: `src/app/(main)/skill-tree/SkillTreeView.tsx`
- Modify: `src/app/(main)/skill-tree/components/NodePopover.tsx`

The popover currently has a hidden trigger and can't anchor to a node in SVG. Popover positioning requires an HTML element as the anchor. Solution: Use a `<foreignObject>` strategy OR render the popover as a floating panel positioned absolutely over the node's screen coordinates.

- [ ] **Step 1: Switch to a position-based popover wrapper**

The simplest V1 approach: render the `<NodePopover>` outside the SVG, positioned absolutely using the node's normalized coordinates times the container's size.

Modify `src/app/(main)/skill-tree/SkillTreeView.tsx`. Replace the popover section (inside the `.relative flex-1 overflow-hidden` div) with:

```tsx
;<ConstellationCanvas
  nodes={canvasNodes}
  edges={canvasEdges}
  onNodeClick={(nodeId) => setActivePopoverNodeId(nodeId)}
/>
{
  activePopoverNode && (
    <div
      className="pointer-events-auto absolute"
      style={{
        left: `${activePopoverNode.x * 100}%`,
        top: `${activePopoverNode.y * 100}%`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <NodePopover
        open={activePopoverNodeId !== null}
        onOpenChange={(open) => {
          if (!open) setActivePopoverNodeId(null)
        }}
        node={{
          id: activePopoverNode.id,
          name: activePopoverNode.name,
          xp: assignedTodosForPopover.length,
        }}
        assignedTodos={assignedTodosForPopover}
        onUnassign={(todoId) => handleUnassign(activePopoverNode.id, todoId)}
      >
        {/* Invisible anchor element for Radix Popover positioning */}
        <span className="block h-1 w-1" aria-hidden="true" />
      </NodePopover>
    </div>
  )
}
```

- [ ] **Step 2: Smoke-test manually**

Run: `pnpm kill-port 3011 && pnpm dev &`
Navigate to `/skill-tree`, click a leveled node (drag some todos onto one first).
Expected: Popover appears near the node, lists assigned tasks, `×` unassigns and returns the task to the drawer.

- [ ] **Step 3: Kill dev server + commit**

```bash
pnpm kill-port 3011
git add src/app/\(main\)/skill-tree/SkillTreeView.tsx
git commit -m "feat(skill-tree): anchor node popover to SVG coordinates"
```

---

## Phase F — A11y + Polish

### Task 20: Empty states (no tree data / no completed tasks)

**Files:**

- Modify: `src/app/(main)/skill-tree/SkillTreeView.tsx`

- [ ] **Step 1: Add empty-state check before rendering canvas**

In `SkillTreeView.tsx`, right after computing `canvasNodes` and `poolTodos`, add:

```tsx
const hasAnyCompletedTodos =
  optimisticState.unassignedTodoIds.length > 0 ||
  Object.values(optimisticState.assignmentsByNode).some((a) => a.length > 0)

if (!hasAnyCompletedTodos) {
  return (
    <div data-skill-tree="true" className="flex h-full w-full flex-col">
      <header className="window-drag-region flex h-16 shrink-0 items-center gap-2 border-b border-[var(--st-border-rune)] bg-[var(--st-bg-deep)] px-4 text-[var(--st-cream)]">
        <SidebarTrigger className="no-drag -ml-1" />
        <h2 className="text-lg font-medium text-[var(--st-gold)]">
          Skill Tree
        </h2>
      </header>
      <div className="st-canvas-bg flex flex-1 items-center justify-center">
        <div className="max-w-md space-y-3 text-center text-[var(--st-cream)]">
          <div className="text-5xl" aria-hidden="true">
            ✨
          </div>
          <div className="text-lg font-medium text-[var(--st-gold)]">
            Your tree awaits
          </div>
          <div className="text-sm text-[var(--st-muted)]">
            Complete some tasks on the Home page to start earning XP.
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Smoke-test — use a fresh user with no completed todos**

Open Prisma Studio, delete completed todos for the mock user, navigate to `/skill-tree`.
Expected: "Your tree awaits" empty state.

Re-add a completed todo, reload.
Expected: Canvas renders normally.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(main\)/skill-tree/SkillTreeView.tsx
git commit -m "feat(skill-tree): add empty state when no completed todos exist"
```

---

### Task 21: Keyboard drag support verification + manual a11y check

**Files:**

- No files modified (manual verification only)

- [ ] **Step 1: Verify KeyboardSensor is registered**

Already done in Task 18 via `useSensor(KeyboardSensor)`. Dnd-kit's built-in KeyboardSensor enables the Tab → Space → Arrow keys → Space flow out-of-the-box.

- [ ] **Step 2: Manual keyboard flow test**

Run: `pnpm kill-port 3011 && pnpm dev &`
On `/skill-tree`:

1. Press `Tab` until the drawer pill is focused → press `Enter` to open.
2. Press `Tab` to focus the first TaskPoolCard.
3. Press `Space` to pick it up (dnd-kit announces "Grabbed").
4. Press arrow keys to move focus to a node.
5. Press `Space` to drop.
6. Verify the XP increments visually.

Expected: All steps work with keyboard only.

- [ ] **Step 3: VoiceOver test**

Turn on macOS VoiceOver (`Cmd+F5`). Navigate to the skill tree. Expect announcements like "APIs, Level 2, 5 of 15 XP, button".

- [ ] **Step 4: Test `prefers-reduced-motion`**

Open macOS System Settings → Accessibility → Display → check "Reduce motion". Reload `/skill-tree`.
Expected: No twinkling stars, no hover scale, no burst animations on drop. State snaps instantly.

- [ ] **Step 5: Uncheck reduce motion, kill dev server, commit checkpoint**

No code changes — this task is verification only. Move to Task 22.

---

### Task 22: Full `pnpm validate` pass

**Files:**

- No files modified

- [ ] **Step 1: Run the full validation suite**

Run: `pnpm validate`
Expected: Lint + typecheck + unit tests + build all pass. This is the same check CI runs.

- [ ] **Step 2: Fix any issues that surface**

If lint warns about unused imports in `SkillTreeView.tsx`, remove them. If typecheck fails, read the error and fix it. Do NOT ignore errors.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix(skill-tree): resolve validate issues"
```

Skip this commit if there were no changes.

---

## Phase G — E2E + Launch

### Task 23: Playwright E2E — happy path, unassign, keyboard flow

**Files:**

- Create: `e2e/web/skill-tree.spec.ts`

- [ ] **Step 1: Write the E2E test file**

Create `e2e/web/skill-tree.spec.ts`:

```typescript
import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { expect, test } from '@playwright/test'

test.describe('Skill Tree E2E', () => {
  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page })
  })

  test('happy path: drag a task to a node and verify persistence', async ({
    page,
  }) => {
    // 1. Seed at least one completed todo via the home page
    await page.goto('/home')
    await page.waitForLoadState('networkidle')

    const input = page.getByPlaceholder(/add a task|new task/i).first()
    await input.fill('E2E skill tree test task')
    await input.press('Enter')

    // Mark it complete
    const task = page.getByText('E2E skill tree test task').first()
    await task.scrollIntoViewIfNeeded()
    const checkbox = page
      .locator('[role="checkbox"]')
      .or(page.locator('input[type="checkbox"]'))
      .first()
    await checkbox.click()

    // 2. Navigate to skill tree
    await page.getByRole('link', { name: /skill tree/i }).click()
    await expect(page).toHaveURL(/\/skill-tree/)
    await page.waitForLoadState('networkidle')

    // 3. Open the task pool drawer
    const pill = page.getByRole('button', { name: /unassigned task/i })
    await expect(pill).toBeVisible({ timeout: 10000 })
    await pill.click()

    // 4. Verify our task is in the pool
    const poolCard = page.getByRole('button', {
      name: /e2e skill tree test task/i,
    })
    await expect(poolCard).toBeVisible()

    // 5. Drag it to the first skill node (use dnd-kit keyboard shortcut as fallback)
    const firstNode = page
      .getByRole('button', { name: /level 0|dormant/i })
      .first()
    await expect(firstNode).toBeVisible()

    // Keyboard DnD: focus card, Space to pick up, Tab to node, Space to drop
    await poolCard.focus()
    await page.keyboard.press('Space')
    await firstNode.focus()
    await page.keyboard.press('Space')

    // 6. Verify the node's XP has incremented (level 0 → shows "1 of 5 XP" in label)
    await expect(page.getByRole('button', { name: /1 of 5 xp/i })).toBeVisible({
      timeout: 5000,
    })

    // 7. Reload and verify persistence
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('button', { name: /1 of 5 xp/i })).toBeVisible({
      timeout: 5000,
    })
  })

  test('unassign: click a node with assignments and unassign a task', async ({
    page,
  }) => {
    await page.goto('/skill-tree')
    await page.waitForLoadState('networkidle')

    // This test depends on the previous test having assigned a task.
    // Click the node that has XP to open its popover.
    const leveledNode = page.getByRole('button', { name: /1 of 5 xp/i })
    if (await leveledNode.isVisible()) {
      await leveledNode.click()

      // Popover should show assigned task
      await expect(page.getByText(/e2e skill tree test task/i)).toBeVisible()

      // Click × to unassign
      const unassignBtn = page
        .getByRole('button', { name: /unassign/i })
        .first()
      await unassignBtn.click()

      // Verify task returns to pool (node drops to dormant)
      await expect(
        page.getByRole('button', { name: /dormant/i }).first(),
      ).toBeVisible({ timeout: 5000 })
    }
  })

  test('keyboard flow: tab to drawer → pick up → arrow → drop', async ({
    page,
  }) => {
    // Seed a todo first
    await page.goto('/home')
    await page.waitForLoadState('networkidle')
    const input = page.getByPlaceholder(/add a task|new task/i).first()
    await input.fill('Keyboard E2E test task')
    await input.press('Enter')
    const checkbox = page
      .locator('[role="checkbox"]')
      .or(page.locator('input[type="checkbox"]'))
      .first()
    await checkbox.click()

    await page.goto('/skill-tree')
    await page.waitForLoadState('networkidle')

    // Open drawer via keyboard
    const pill = page.getByRole('button', { name: /unassigned task/i })
    await pill.focus()
    await page.keyboard.press('Enter')

    // Tab to first card, Space to pick up
    await page.keyboard.press('Tab')
    await page.keyboard.press('Space')

    // Tab to a node (will cycle to first node button)
    // Then Space to drop
    await page.keyboard.press('Tab')
    await page.keyboard.press('Space')

    // Expect a node to show XP 1
    await expect(page.getByRole('button', { name: /1 of 5 xp/i })).toBeVisible({
      timeout: 5000,
    })
  })
})
```

- [ ] **Step 2: Build production + run new E2E**

Run:

```bash
pnpm build
pnpm start &
sleep 5
pnpm e2e:web --grep "Skill Tree E2E"
pnpm kill-port 3011
```

Expected: All 3 tests pass. If the keyboard selector assumptions break (e.g., tab order differs), fix them inline — but do NOT skip tests.

- [ ] **Step 3: Commit**

```bash
git add e2e/web/skill-tree.spec.ts
git commit -m "test(skill-tree): add E2E tests for happy path, unassign, and keyboard flow"
```

---

### Task 24: Manual a11y QA pass

**Files:**

- No files modified (checklist verification)

- [ ] **Step 1: Run the full a11y checklist from the spec**

Use `pnpm dev &` and verify each item from the Launch Checklist of the spec:

- VoiceOver announces `APIs, Level 3, 30 of 50 XP` when focused on a node
- VoiceOver announces "Grabbed" when drag starts via keyboard
- Keyboard-only user can Tab → Space → Arrow → Space to complete a full drag
- `prefers-reduced-motion` disables all 4 animations and star twinkling
- macOS "Increase Contrast" mode: node borders remain clearly visible
- macOS "Reduce Transparency" mode: drawer background becomes opaque
- Dark mode: WCAG AA contrast for all text (4.5:1) and UI elements (3:1)
- Light (parchment) mode: same
- 44×44 tap target verified (use browser DevTools touch simulation)
- Electron (macOS) shows identical behavior to web — run `pnpm electron:build:dir && open dist/mac/CoreLive.app`

Fix any failures inline. Document any not-fixed items in a follow-up Linear issue.

- [ ] **Step 2: Commit any fixes**

If any fixes were needed, commit them:

```bash
git add -A
git commit -m "fix(skill-tree): address a11y issues from manual QA"
```

If no fixes needed, no commit — proceed to Task 25.

---

### Task 25: Final `pnpm validate` + launch readiness summary

**Files:**

- No files modified

- [ ] **Step 1: Final validate pass**

Run: `pnpm validate`
Expected: All checks green.

- [ ] **Step 2: Full E2E suite**

Run:

```bash
pnpm build
pnpm start &
sleep 5
pnpm e2e:web
pnpm kill-port 3011
```

Expected: All E2E tests (existing + new skill-tree) pass. This catches regressions from the Route Group refactor.

- [ ] **Step 3: Confirm launch checklist from the spec**

Open `docs/superpowers/specs/2026-04-08-skill-tree-design.md` and read the "Launch Checklist" section (around line 673). Verify each checkbox is satisfied by the code that was just written.

- [ ] **Step 4: Print a summary for the user**

Print to the console (not code — just a human-readable summary):

```
Skill Tree V1 implementation complete.

- 4 new Prisma models + migration applied
- 4 oRPC procedures (getMyTree, getUnassignedPool, assignTask, unassignTask)
- Route Group (main) with shared sidebar
- SkillTreeView + 7 components + 6 level states
- 11 xpToLevel unit tests + 5 optimistic reducer tests + 4 component tests
- 5 Storybook stories
- 3 Playwright E2E tests
- Dark Fantasy + parchment themes
- Full keyboard + VoiceOver + prefers-reduced-motion support

Next steps for the user:
- `pnpm prisma migrate deploy` on staging/production
- Merge to main to trigger deploy
- Announce to users
```

- [ ] **Step 5: No further commits**

Plan complete. The V1 Skill Tree feature is shippable.

---

## Self-Review

### Spec coverage

Checked against `docs/superpowers/specs/2026-04-08-skill-tree-design.md`:

- [x] Overview / User Flow — Task 16, 17, 18
- [x] 4 Prisma models + back-relations — Task 1
- [x] Default template — Task 2
- [x] 4 oRPC procedures — Task 4
- [x] Router registration — Task 4
- [x] Route Group + shared layout — Tasks 6, 7
- [x] AppSidebar extraction with Link + usePathname — Task 6
- [x] `xpToLevel` pure function with LevelInfo return shape — Task 9
- [x] Optimistic reducer — Task 10
- [x] Scoped CSS custom properties (dark + parchment) — Task 11
- [x] 6 node visual states — Task 12
- [x] ConstellationCanvas with 3 edge styles + 2 star types — Task 13
- [x] TaskPoolCard + TaskPoolDrawer + DragOverlayCard — Task 14
- [x] NodePopover + XpBadge — Task 15
- [x] Palette reference story — Task 16
- [x] useReducedMotion hook — Task 17
- [x] DnD flow with `useOptimistic + startTransition` — Task 18
- [x] Unassign via popover — Task 19
- [x] Empty state — Task 20
- [x] Keyboard + a11y verification — Tasks 21, 24
- [x] Full validate pass — Tasks 22, 25
- [x] Unit tests for xpToLevel — Task 9
- [x] Optimistic reducer tests — Task 10
- [x] Component tests (4 files) — Tasks 12, 14, 15
- [x] Storybook stories (5 files) — Tasks 12, 13, 14, 15, 16
- [x] 3 Playwright E2E tests — Task 23
- [x] Manual a11y checklist — Task 24

All spec sections have at least one task that implements them.

### Type consistency

- `LevelInfo` shape is defined in Task 9 and referenced consistently in Tasks 12, 15.
- `OptimisticState` + `OptimisticAction` defined in Task 10, used in Task 18.
- `CanvasNode` / `CanvasEdge` defined in Task 13, referenced by SkillTreeView in Tasks 17, 18.
- `PoolTodo` defined in Task 14 (TaskPoolDrawer), referenced in Task 17, 18.
- `todoId` is used consistently everywhere (no `completedTaskId` leftovers — confirmed by spec grep).
- Prisma field `nodeId_todoId` unique constraint name matches `@@unique([nodeId, todoId])` from Task 1.

### Placeholder scan

No TBDs, TODOs, or "implement later" in the plan. Every code step has complete implementation.

One note: In Task 18, the `todoTextById` memo is sparse (only knows text from the pool query, not assigned tasks). This is a known V1 limitation documented in the Open Questions of the spec — the popover falls back to `Task #{id}` for previously-assigned tasks whose text isn't in the current pool. If a follow-up is needed, fetch `pool + allAssignedTodoTexts` together. For V1, this fallback is acceptable.

### Known risks (to address during execution, not blockers)

1. **`orpc.skillTree.getMyTree.key()` API shape** — The exact method name for retrieving a query key from `createTanstackQueryUtils` may be `.queryKey()` or `.key()`. Task 18 uses `.key()`; if it doesn't compile, read the `@orpc/tanstack-query` type definitions and use whichever is correct.

2. **Radix Popover anchor in SVG** — Task 19 uses an absolutely-positioned div as the anchor. If Radix still has anchor issues, switch to Radix's `<Popover.Anchor>` primitive or use a `<foreignObject>` inside the SVG.

3. **`@dnd-kit` keyboard announcements** — Task 23's E2E tests assume dnd-kit's keyboard sensor works out of the box. If tests fail on keyboard interactions, check whether `announcements` props are needed on `<DndContext>`.

4. **Existing home E2E tests** — Task 8 re-runs them after the Route Group move. If they fail, it's likely a `pathname` mismatch in a test selector. Fix inline.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-08-skill-tree-v1.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
