import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

// Relative import (NOT the `@/` alias): tsx does not reliably honor tsconfig
// `paths`, and this template module is pure data with zero imports, so pulling
// it in by relative path is safe and cheap. We deliberately do NOT import
// `importDefaultTemplate` / `@/lib/prisma` — those rely on the server Prisma
// singleton + logger + auth middleware and would throw inside a tsx script.
import { BACKEND_DEVELOPER_CORE_TEMPLATE } from '../src/app/(main)/skill-tree/lib/template'

// Shared seeded-user identity (single source of truth with prisma/seed.ts).
import { SEED_USER_CLERK_ID, SEED_USER_EMAIL } from './seedUser'

const adapter = new PrismaPg({
  connectionString: process.env.POSTGRES_PRISMA_URL!,
})

const prisma = new PrismaClient({ adapter })

// ─────────────────────────────────────────────────────────────────────────────
// Localhost safety gate (in-script, defense-in-depth)
//
// The `seed:dev` npm script already runs `scripts/assert-local-db.cjs` first,
// but a bare `tsx prisma/seed.dev.ts` would bypass it. This seed performs a
// USER-WIDE wipe (every Todo/Completed for the seeded user — far broader than
// seed.ts's scoped 10-row delete), so we re-assert localhost here ourselves.
// fail-closed: only proceed when the host is provably local.
// ─────────────────────────────────────────────────────────────────────────────

/** Hostnames we treat as local (mirrors `scripts/assert-local-db.cjs`). */
const LOCAL_DB_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  'postgres',
  'corelive-postgres',
])

/**
 * Throws unless `POSTGRES_PRISMA_URL` points at a local Docker/localhost DB —
 * the in-script twin of `scripts/assert-local-db.cjs`, so even a direct
 * `tsx prisma/seed.dev.ts` (which skips the npm-script gate) cannot wipe a
 * remote DB. Called once at the top of `seedDev`, before any delete.
 * @param connectionString - The raw `POSTGRES_PRISMA_URL` value.
 * @returns void — returns normally only when the host is local; otherwise throws.
 * @example
 * assertLocalDatabase('postgresql://postgres:password@localhost:5491/corelive') // ok
 * assertLocalDatabase('postgresql://u:p@prod.neon.tech/db') // throws
 */
function assertLocalDatabase(connectionString: string | undefined): void {
  if (!connectionString) {
    throw new Error(
      '[seed:dev] POSTGRES_PRISMA_URL is not set — refusing to run a destructive seed.',
    )
  }
  let host: string
  try {
    host = new URL(connectionString).hostname
  } catch {
    throw new Error(
      '[seed:dev] Could not parse POSTGRES_PRISMA_URL — refusing (fail closed).',
    )
  }
  // libpq honors a `?host=` query param over the authority host; if present and
  // non-local, refuse (matches the cjs guard's fail-closed posture).
  const queryHost = new URL(connectionString).searchParams.get('host')
  if (queryHost && !LOCAL_DB_HOSTS.has(queryHost.trim())) {
    throw new Error(
      `[seed:dev] ?host=${queryHost} is not local — refusing destructive seed.`,
    )
  }
  if (!LOCAL_DB_HOSTS.has(host)) {
    throw new Error(
      `[seed:dev] DB host "${host}" is not local — refusing destructive seed.`,
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tunable counts & ratios (all magic numbers live here, SCREAMING_SNAKE_CASE)
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic PRNG seed — fixed so re-runs on the same day are identical. */
const RANDOM_SEED = 0x5eed_c0de

/** Size of the activity window the heatmap/journal render (oRPC default = 365). */
const HISTORY_DAYS = 365

/** Milliseconds in one day — used to back-date `completedAt` across the year. */
const ONE_DAY_MS = 24 * 60 * 60 * 1000

/** Target count of completed `Todo` rows spread across the last year. */
const COMPLETED_TODO_COUNT = 360

/** Target count of still-active (incomplete) `Todo` rows so the list isn't empty. */
const ACTIVE_TODO_COUNT = 40

/** Target count of `Completed`-table rows (the separate import/braindump store). */
const COMPLETED_TABLE_COUNT = 200

/**
 * Fraction of history rows whose day is pulled from EARLIER in the year rather
 * than skewed toward recent days — guarantees the back half of the heatmap is
 * populated too (brief asks for ~30% back-dated).
 */
const BACKDATED_RATIO = 0.3

/** A completed row is "recent-clustered" when above this many days from today. */
const RECENT_WINDOW_DAYS = 90

/** Probability a given history day is a "rest day" with zero completions. */
const REST_DAY_PROBABILITY = 0.25

/** Probability a weekend day is a rest day (weekends are lighter than weekdays). */
const WEEKEND_REST_DAY_PROBABILITY = 0.45

/**
 * Probability an ACTIVE day is a "busy" multi-completion day rather than a
 * single. Most active days emit exactly 1 completion (≈1/day keeps 360 rows
 * spread across the full 365-day window); a minority burst to 2..MAX for the
 * believable streak/cluster texture the heatmap should show.
 */
const BUSY_DAY_PROBABILITY = 0.22

/** Max completions clustered onto a single busy day (2..this, inclusive). */
const MAX_COMPLETIONS_PER_DAY = 6

/**
 * Number of paste-import batches to simulate in the `Completed` table. Each
 * batch groups 10..40 rows under a shared `importBatchId` (the rest are
 * braindump-style singles with a null batch id).
 */
const IMPORT_BATCH_COUNT = 6

/** Min / max rows grouped under a single simulated paste-import batch. */
const MIN_BATCH_SIZE = 10
const MAX_BATCH_SIZE = 40

/**
 * XP (= NodeAssignment row count) assigned to representative nodes so the skill
 * tree spans every level band defined in `skill-tree/lib/xp.ts`:
 *   < 5 Dormant · 5-14 L1 · 15-29 L2 · 30-49 L3 · 50-74 L4 · ≥75 Mastered.
 * One node lands squarely inside each band; the remaining ~22 template nodes
 * stay Dormant at 0 XP (a realistic "mostly untouched roadmap" shape).
 */
const XP_BANDS: ReadonlyArray<{ nodeName: string; xp: number }> = [
  { nodeName: 'Internet', xp: 2 }, // Dormant  (L0)
  { nodeName: 'HTTP', xp: 10 }, // Level 1
  { nodeName: 'Git', xp: 22 }, // Level 2
  { nodeName: 'PostgreSQL', xp: 40 }, // Level 3
  { nodeName: 'REST APIs', xp: 60 }, // Level 4
  { nodeName: 'Docker', xp: 90 }, // Mastered (L5)
]

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic PRNG + small helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * mulberry32 — a tiny, fast, seeded PRNG. Seeding it (instead of `Math.random`)
 * makes the whole seed reproducible: identical data on every run with the same
 * `RANDOM_SEED`. Returns a closure yielding floats in [0, 1).
 * @param seed - 32-bit integer seed.
 * @returns A `() => number` generator producing floats in [0, 1).
 * @example
 * const rng = mulberry32(42); rng() // => 0.6011… (same every run)
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return function next(): number {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rng = mulberry32(RANDOM_SEED)

/**
 * Returns an integer in [min, max] inclusive, drawn from the seeded PRNG.
 * @param min - Lower bound (inclusive).
 * @param max - Upper bound (inclusive).
 * @returns A deterministic integer within the range.
 * @example
 * randomInt(1, 6) // => e.g. 4 (same on every run)
 */
function randomInt(min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

/**
 * Picks one element from a non-empty array using the seeded PRNG.
 * @param items - A non-empty readonly array.
 * @returns A deterministically chosen element.
 * @example
 * pickOne(['a', 'b', 'c']) // => 'b'
 */
function pickOne<T>(items: readonly T[]): T {
  // Callers always pass non-empty literal arrays, so the index is always valid.
  return items[Math.floor(rng() * items.length)]!
}

// ─────────────────────────────────────────────────────────────────────────────
// Realistic content pools (repetition of habit-like titles is INTENTIONAL —
// repeating a task is the habit/XP signal this app celebrates, never noise.)
// ─────────────────────────────────────────────────────────────────────────────

/** Category seed set: a believable mix of work + life buckets. */
const CATEGORY_SEEDS: ReadonlyArray<{ name: string; color: string }> = [
  { name: 'Work', color: 'blue' },
  { name: 'Health', color: 'green' },
  { name: 'Learning', color: 'purple' },
  { name: 'Home', color: 'orange' },
  { name: 'Side Project', color: 'pink' },
]

/**
 * Task titles keyed by category. Heavy on recurring habits (Standup, Morning
 * run, Read 20 pages) on purpose — repetition is the signal, so we never dedupe.
 */
/**
 * Fallback title pool — the General bucket. Declared standalone (not just a
 * record key) so it's a definitely-defined `readonly string[]`, giving callers
 * a non-`undefined` fallback under `noUncheckedIndexedAccess`.
 */
const DEFAULT_TITLE_POOL: readonly string[] = [
  'Inbox zero',
  'Plan the day',
  'Tidy desk',
  'Review weekly goals',
  'Back up laptop',
]

const TASK_TITLES_BY_CATEGORY: Record<string, readonly string[]> = {
  General: DEFAULT_TITLE_POOL,
  Work: [
    'Standup',
    'Review a teammate PR',
    'Reply to customer ticket',
    'Write design doc',
    'Deploy to staging',
    'Triage bug backlog',
    'Pair on the auth refactor',
    'Update the sprint board',
    'Sync with product',
    'Cut the release notes',
  ],
  Health: [
    'Morning run',
    'Drink 2L water',
    '20-minute stretch',
    'Leg day at the gym',
    'Walk 8000 steps',
    'Meditate 10 minutes',
    'Cook a real dinner',
    'Lights out by 11pm',
    'Take vitamins',
  ],
  Learning: [
    'Read 20 pages',
    'Finish a Go exercise',
    'Watch one system-design talk',
    'Practice typing drills',
    'Anki review',
    'Write a blog draft',
    'Study SQL window functions',
    'Build a tiny CLI',
  ],
  Home: [
    'Do the laundry',
    'Wash the dishes',
    'Water the plants',
    'Grocery run',
    'Pay the electricity bill',
    'Vacuum the living room',
    'Take out recycling',
    'Meal prep for the week',
  ],
  'Side Project': [
    'Ship the landing page tweak',
    'Fix a flaky test',
    'Answer a GitHub issue',
    'Refactor the seed script',
    'Record a demo clip',
    'Write changelog entry',
    'Tune the onboarding copy',
  ],
}

/** Optional notes occasionally attached to a Todo for realistic variety. */
const SAMPLE_NOTES: ReadonlyArray<string> = [
  'felt good today',
  'almost skipped this one',
  'do it earlier tomorrow',
  'small win counts',
  'streak going strong',
]

/**
 * Resolves a non-empty title pool for a category name, falling back to the
 * General pool when the name has no dedicated list. Centralizes the lookup so
 * every call site gets a guaranteed `readonly string[]` (no `| undefined`)
 * under `noUncheckedIndexedAccess`.
 * @param categoryName - The category's display name (e.g. "Work", "Health").
 * @returns A non-empty array of candidate task titles.
 * @example
 * titlePoolFor('Work')    // => ['Standup', 'Review a teammate PR', …]
 * titlePoolFor('Unknown') // => the General pool
 */
function titlePoolFor(categoryName: string): readonly string[] {
  // DEFAULT_TITLE_POOL is a definitely-defined non-empty array, so the result
  // is never `undefined` even under noUncheckedIndexedAccess.
  return TASK_TITLES_BY_CATEGORY[categoryName] ?? DEFAULT_TITLE_POOL
}

// ─────────────────────────────────────────────────────────────────────────────
// Date-distribution helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Captured once so same-day re-runs anchor on an identical window (idempotent). */
const TODAY_START = (() => {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now
})()

/**
 * Picks a `completedAt` Date within the last `HISTORY_DAYS`, with realistic
 * clustering: ~`BACKDATED_RATIO` of rows land in the OLDER back-half of the
 * window (so the whole year shows activity), the rest skew toward recent days.
 * A random intra-day time is added so the journal ordering looks human.
 * @returns A Date between today and `HISTORY_DAYS` ago.
 * @example
 * pickCompletedAt() // => 2026-02-14T09:31:00 (varies, deterministic per call)
 */
function pickCompletedAt(): Date {
  let daysAgo: number
  // ~30% of rows are pulled from the older back-half so the heatmap's left edge
  // isn't blank; the remaining ~70% cluster into the recent window.
  if (rng() < BACKDATED_RATIO) {
    daysAgo = randomInt(RECENT_WINDOW_DAYS, HISTORY_DAYS - 1)
  } else {
    daysAgo = randomInt(0, RECENT_WINDOW_DAYS)
  }
  const day = new Date(TODAY_START.getTime() - daysAgo * ONE_DAY_MS)
  // Reuse the shared intra-day stamper (06:00–22:59) so rows order naturally.
  return stampOnDay(day)
}

/**
 * Returns a random intra-day completion timestamp (06:00–22:59) on the given
 * day so same-day rows order naturally in the journal.
 * @param day - The calendar day (time component is overwritten).
 * @returns A new Date on `day` at a random working-hours time.
 * @example
 * stampOnDay(new Date('2026-02-14')) // => 2026-02-14T09:31:42
 */
function stampOnDay(day: Date): Date {
  const stamp = new Date(day.getTime())
  stamp.setHours(randomInt(6, 22), randomInt(0, 59), randomInt(0, 59), 0)
  return stamp
}

/**
 * Builds a believable completion calendar that spans the ENTIRE 365-day window
 * (not just until `target` is hit) so the heatmap's whole year is populated, not
 * just recent months. Walks every day today→365-ago: rest days emit 0, weekends
 * rest more often, most active days emit 1, a minority burst to MAX for streak
 * texture. Then reconciles to EXACTLY `target` — trimming random excess, or
 * padding extra singles onto older (back-half) days so the left edge stays dense.
 * @param target - Exact number of completion timestamps to return.
 * @returns An array of `Date`s, length === target, spread across all 365 days.
 * @example
 * buildCompletionCalendar(360) // => [Date, …] length 360, oldest ~365d back
 */
function buildCompletionCalendar(target: number): Date[] {
  const timestamps: Date[] = []
  // Walk the full window day-by-day (today = offset 0 … 364 days ago).
  for (let dayOffset = 0; dayOffset < HISTORY_DAYS; dayOffset++) {
    const day = new Date(TODAY_START.getTime() - dayOffset * ONE_DAY_MS)
    const isWeekend = day.getDay() === 0 || day.getDay() === 6
    // Weekends rest more often than weekdays.
    const restProbability = isWeekend
      ? WEEKEND_REST_DAY_PROBABILITY
      : REST_DAY_PROBABILITY
    // Rest day → no completions.
    if (rng() < restProbability) continue
    // Most active days emit exactly 1; a minority are "busy" and burst to 2..MAX
    // (≈1/day average keeps `target` rows spread across the whole window).
    const count =
      rng() < BUSY_DAY_PROBABILITY ? randomInt(2, MAX_COMPLETIONS_PER_DAY) : 1
    for (let i = 0; i < count; i++) {
      timestamps.push(stampOnDay(day))
    }
  }

  // Reconcile to EXACTLY `target`. Over → drop random rows; under → pad singles
  // onto random back-half days so padding reinforces the older months.
  while (timestamps.length > target) {
    // Remove a random element (order is re-sorted by the DB on read anyway).
    timestamps.splice(randomInt(0, timestamps.length - 1), 1)
  }
  while (timestamps.length < target) {
    // Back half = days [HISTORY_DAYS/2, HISTORY_DAYS) ago, keeping the left edge dense.
    const dayOffset = randomInt(Math.floor(HISTORY_DAYS / 2), HISTORY_DAYS - 1)
    const day = new Date(TODAY_START.getTime() - dayOffset * ONE_DAY_MS)
    timestamps.push(stampOnDay(day))
  }
  return timestamps
}

// ─────────────────────────────────────────────────────────────────────────────
// Main seeding routine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Seeds a year-deep, realistic dev dataset for the Clerk test user so display /
 * scale bugs (heatmap, journal, skill-tree XP bands, long lists) surface in dev
 * rather than production. Idempotent: clean-slates this user's owned rows, then
 * bulk-inserts deterministic data. Run via `pnpm seed:dev`.
 * @returns Resolves once all rows are inserted; throws on any DB error.
 * @example
 * await seedDev() // same-day re-runs are identical (fixed PRNG + today-anchored window)
 */
async function seedDev(): Promise<void> {
  // Defense-in-depth: refuse to run against a non-local DB even if the npm
  // guard was bypassed (e.g. a bare `tsx prisma/seed.dev.ts`).
  assertLocalDatabase(process.env.POSTGRES_PRISMA_URL)

  // ── 1. User (the SAME identity prisma/seed.ts targets — never a new scheme) ──
  const user = await prisma.user.upsert({
    where: { clerkId: SEED_USER_CLERK_ID },
    update: {},
    create: {
      clerkId: SEED_USER_CLERK_ID,
      email: SEED_USER_EMAIL,
      name: 'test01',
      bio: 'Test account for development and E2E testing',
    },
  })

  // ── 2. Categories (idempotent upsert; General stays the default) ──
  // General mirrors prisma/seed.ts; the rest give realistic life/work buckets.
  const generalCategory = await prisma.category.upsert({
    where: { name_userId: { name: 'General', userId: user.id } },
    update: { isDefault: true },
    create: {
      name: 'General',
      color: 'blue',
      isDefault: true,
      userId: user.id,
    },
  })

  // Upsert each extra category and collect every category id for FK use.
  const categories: { id: number; name: string }[] = [
    { id: generalCategory.id, name: 'General' },
  ]
  for (const seed of CATEGORY_SEEDS) {
    const category = await prisma.category.upsert({
      where: { name_userId: { name: seed.name, userId: user.id } },
      update: {},
      create: {
        name: seed.name,
        color: seed.color,
        isDefault: false,
        userId: user.id,
      },
    })
    categories.push({ id: category.id, name: category.name })
  }

  // ── 3. Idempotent clean-slate of THIS USER's seeded rows (approach (a)) ──
  // FK-safe order. The only Restrict FK is Category→Todo/Completed, and we
  // upsert (never delete) categories above, so it never fires. Deleting the
  // user's SkillTree cascades to SkillNode/NodeEdge/NodeAssignment, but we also
  // delete NodeAssignment explicitly first for readability. ImportBatch only
  // cascades from User, so we delete it explicitly too. Scoped to this user and
  // already gated to localhost by `assertLocalDatabase` above.
  await prisma.nodeAssignment.deleteMany({
    where: { node: { skillTree: { userId: user.id } } },
  })
  await prisma.skillTree.deleteMany({ where: { userId: user.id } })
  await prisma.todo.deleteMany({ where: { userId: user.id } })
  await prisma.completed.deleteMany({ where: { userId: user.id } })
  await prisma.importBatch.deleteMany({ where: { userId: user.id } })

  // ── 4. ~360 completed Todos spread across the year ──
  // A clustered calendar gives believable rest days, weekend dips, and streaks.
  const completedCalendar = buildCompletionCalendar(COMPLETED_TODO_COUNT)
  const completedTodoRows = completedCalendar.map((completedAt) => {
    const category = pickOne(categories)
    const titlePool = titlePoolFor(category.name)
    // createdAt is back-dated 0–3 days BEFORE completion so createdAt ≤ completedAt.
    const createdAt = new Date(
      completedAt.getTime() - randomInt(0, 3) * ONE_DAY_MS,
    )
    return {
      text: pickOne(titlePool),
      completed: true,
      completedAt,
      createdAt,
      // ~20% carry a note for variety; the rest stay null.
      notes: rng() < 0.2 ? pickOne(SAMPLE_NOTES) : null,
      userId: user.id,
      categoryId: category.id,
    }
  })
  await prisma.todo.createMany({ data: completedTodoRows })

  // ── 5. ~40 active (incomplete) Todos so the active list is populated ──
  const activeTodoRows = Array.from(
    { length: ACTIVE_TODO_COUNT },
    (_, index) => {
      const category = pickOne(categories)
      const titlePool = titlePoolFor(category.name)
      return {
        text: pickOne(titlePool),
        completed: false,
        // `order` drives drag-and-drop; index keeps a stable initial ordering.
        order: index,
        userId: user.id,
        categoryId: category.id,
      }
    },
  )
  await prisma.todo.createMany({ data: activeTodoRows })

  // ── 6. ~200 Completed-table rows (the import/braindump store) ──
  // First create the ImportBatch parent rows, then tag a slice of Completed rows
  // with those batch ids (paste-import groups); the remainder are braindump
  // singles with a null importBatchId.
  const batchIds: string[] = Array.from(
    { length: IMPORT_BATCH_COUNT },
    (_, i) => `dev-seed-batch-${i + 1}`,
  )
  await prisma.importBatch.createMany({
    data: batchIds.map((id) => ({ id, userId: user.id })),
  })

  // Decide how many rows each batch owns (10..40), capped by the total target.
  const completedTableRows: {
    title: string
    archived: boolean
    completedAt: Date
    createdAt: Date
    importBatchId: string | null
    userId: number
    categoryId: number
  }[] = []

  // Build the grouped (paste-import) rows first.
  let remaining = COMPLETED_TABLE_COUNT
  for (const batchId of batchIds) {
    if (remaining <= 0) break
    const size = Math.min(remaining, randomInt(MIN_BATCH_SIZE, MAX_BATCH_SIZE))
    // Each paste-import batch shares a single createdAt "moment" (one paste),
    // while completedAt can be a past date the user back-filled.
    const importedAt = pickCompletedAt()
    for (let i = 0; i < size; i++) {
      const category = pickOne(categories)
      const titlePool = titlePoolFor(category.name)
      completedTableRows.push({
        title: pickOne(titlePool),
        archived: false,
        completedAt: pickCompletedAt(),
        createdAt: importedAt,
        importBatchId: batchId,
        userId: user.id,
        categoryId: category.id,
      })
    }
    remaining -= size
  }

  // Fill the rest as braindump-style singles (null batch id).
  for (let i = 0; i < remaining; i++) {
    const category = pickOne(categories)
    const titlePool = titlePoolFor(category.name)
    const completedAt = pickCompletedAt()
    completedTableRows.push({
      title: pickOne(titlePool),
      archived: false,
      completedAt,
      // Braindump singles: createdAt tracks the (near-) completion moment.
      createdAt: completedAt,
      importBatchId: null,
      userId: user.id,
      categoryId: category.id,
    })
  }
  await prisma.completed.createMany({ data: completedTableRows })

  // ── 7. Skill tree: reuse the real "Backend Developer Core" template ──
  // Replicates importDefaultTemplate's logic with our own client: create the
  // tree, bulk-insert the 28 nodes, re-read to map name→id (createMany returns
  // no ids), then bulk-insert the edges. One tree per user (@@unique([userId])).
  const tree = await prisma.skillTree.create({
    data: {
      userId: user.id,
      name: BACKEND_DEVELOPER_CORE_TEMPLATE.name,
      templateKey: BACKEND_DEVELOPER_CORE_TEMPLATE.key,
    },
  })
  await prisma.skillNode.createMany({
    data: BACKEND_DEVELOPER_CORE_TEMPLATE.nodes.map((node) => ({
      skillTreeId: tree.id,
      name: node.name,
      icon: node.icon,
      x: node.x,
      y: node.y,
    })),
  })
  // Re-read by name to resolve node ids (template names are unique).
  const createdNodes = await prisma.skillNode.findMany({
    where: { skillTreeId: tree.id },
    select: { id: true, name: true },
  })
  const nodeNameToId = new Map(createdNodes.map((node) => [node.name, node.id]))
  const slugToId = new Map<string, number>()
  for (const tplNode of BACKEND_DEVELOPER_CORE_TEMPLATE.nodes) {
    const id = nodeNameToId.get(tplNode.name)
    if (id === undefined) {
      throw new Error(
        `Template node "${tplNode.name}" missing after createMany`,
      )
    }
    slugToId.set(tplNode.slug, id)
  }
  // Bulk-insert edges, resolving each slug pair to node ids.
  const edgeRows = BACKEND_DEVELOPER_CORE_TEMPLATE.edges.map(
    ([fromSlug, toSlug]) => {
      const fromNodeId = slugToId.get(fromSlug)
      const toNodeId = slugToId.get(toSlug)
      if (fromNodeId === undefined || toNodeId === undefined) {
        throw new Error(
          `Template edge references unknown slug: ${fromSlug} → ${toSlug}`,
        )
      }
      return { skillTreeId: tree.id, fromNodeId, toNodeId }
    },
  )
  await prisma.nodeEdge.createMany({ data: edgeRows })

  // ── 8. XP distribution: orphan NodeAssignment rows across every level band ──
  // XP per node = COUNT of its NodeAssignment rows. We use ORPHAN assignments
  // (todoId = null) because @@unique([todoId]) allows only one assignment per
  // real todo, but treats NULLs as distinct — so we can stack many onto one node
  // to hit any band. The read path counts rows where todoId IS NULL OR the todo
  // is completed (skillTree.ts), so these orphans all count toward the level.
  const assignmentRows: { nodeId: number; todoId: null; todoText: string }[] =
    []
  for (const band of XP_BANDS) {
    const nodeId = nodeNameToId.get(band.nodeName)
    if (nodeId === undefined) {
      throw new Error(`XP band node "${band.nodeName}" not found in template`)
    }
    const titlePool = titlePoolFor('Learning')
    // Emit `band.xp` orphan assignments — each one earns the node +1 XP.
    for (let i = 0; i < band.xp; i++) {
      assignmentRows.push({
        nodeId,
        todoId: null,
        // todoText snapshots a plausible task title (VarChar(255)).
        todoText: pickOne(titlePool),
      })
    }
  }
  await prisma.nodeAssignment.createMany({ data: assignmentRows })

  // Lightweight summary so the operator sees what landed. Uses console.warn —
  // the only intentional-stdout channel ESLint's no-console rule allows (the
  // same pattern scripts/generate-tray-icons.js uses for progress output).
  const totalXp = XP_BANDS.reduce((sum, band) => sum + band.xp, 0)
  console.warn('✅ [seed:dev] Done. Inserted for user', user.id, ':')
  console.warn(
    `   • ${completedTodoRows.length} completed Todos (year history)`,
  )
  console.warn(`   • ${activeTodoRows.length} active Todos`)
  console.warn(
    `   • ${completedTableRows.length} Completed rows (${batchIds.length} import batches + braindump singles)`,
  )
  console.warn(
    `   • 1 skill tree · ${createdNodes.length} nodes · ${edgeRows.length} edges · ${totalXp} XP assignments across all level bands`,
  )
}

seedDev()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('❌ Error during dev database seeding:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
