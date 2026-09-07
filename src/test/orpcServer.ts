import { ORPCError, os } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { z } from 'zod'

import {
  CategoryListResponseSchema,
  CategorySchema,
  CreateCategorySchema,
  UpdateCategorySchema,
  type CategoryWithCount,
} from '@/server/schemas/category'

/**
 * In-memory stand-in for the `Category` table. Each spec seeds it, and the
 * procedures below mirror the conflict and guard shape of
 * `src/server/procedures/category.ts` — same conflicts, same error codes.
 * Deliberately NOT mirrored, because no spec needs them: the real `list` seeds
 * `DEFAULT_CATEGORY_SEED` when the table comes back empty, and every real
 * procedure runs behind `authMiddleware`. Nothing enforces this parity, so a
 * new guard on the real procedure has to be copied here by hand.
 */
let categories: CategoryWithCount[] = []
let nextCategoryId = 1

/** Set by a spec to make the next call fail the way a dead network does. */
let isNetworkFailureArmed = false

/** Non-null while a spec is holding every request open mid-flight. */
let writeGate: Promise<void> | null = null
let releaseWriteGate: (() => void) | null = null

/**
 * Resets every piece of module state between specs — the table, the armed
 * network failure, and any still-held request. Vitest keeps this module alive
 * for the whole file, so a spec that never fires its armed failure would
 * otherwise hand it to the next one.
 * @param seed - Rows the category list should start with.
 * @returns Nothing; also resets the id sequence past the seeded rows.
 * @example
 * beforeEach(() => resetOrpcServer([buildCategory({ id: 1, isDefault: true })]))
 */
export function resetOrpcServer(seed: CategoryWithCount[] = []): void {
  categories = seed.map((category) => ({ ...category }))
  nextCategoryId = Math.max(0, ...categories.map((row) => row.id)) + 1
  isNetworkFailureArmed = false
  releaseWriteGate?.()
  writeGate = null
  releaseWriteGate = null
}

/**
 * Reads the fake table, so a spec can assert what the server actually stored
 * rather than what the client believed it stored.
 * @returns A copy of the current rows.
 * @example
 * expect(readCategories().map((row) => row.name)).toContain('Reading')
 */
export function readCategories(): CategoryWithCount[] {
  return categories.map((category) => ({ ...category }))
}

/**
 * Arms a transport-level failure for the next oRPC call, so a spec can prove the
 * client falls back to its own copy instead of echoing "Failed to fetch".
 * @returns Nothing; disarms itself once the failure fires.
 * @example
 * armNetworkFailure()
 */
export function armNetworkFailure(): void {
  isNetworkFailureArmed = true
}

/**
 * Holds every request open so an optimistic row stays on screen — the only way
 * to observe the `id: -Date.now()` state {@link useCategoryMutations} mints,
 * since `onSettled`'s refetch replaces it the moment the server answers.
 * @returns The release function; call it before the spec ends.
 * @example
 * const release = holdRequests()
 * await user.click(addButton) // the create hangs, the optimistic row persists
 * release()
 */
export function holdRequests(): () => void {
  writeGate = new Promise<void>((resolve) => {
    releaseWriteGate = resolve
  })
  return () => {
    releaseWriteGate?.()
    writeGate = null
    releaseWriteGate = null
  }
}

/**
 * Finds a row or rejects exactly as `src/server/procedures/category.ts` does for
 * an unknown id — including the negative ids an in-flight optimistic create carries.
 * @param id - The category id the caller named.
 * @returns The stored row.
 * @example
 * requireCategory(12) // => { id: 12, name: 'Work', … }
 */
function requireCategory(id: number): CategoryWithCount {
  const existing = categories.find((category) => category.id === id)
  if (!existing) {
    throw new ORPCError('NOT_FOUND', { message: 'Category not found' })
  }
  return existing
}

const list = os.output(CategoryListResponseSchema).handler(() => ({
  categories,
}))

const create = os
  .input(CreateCategorySchema)
  .output(CategorySchema)
  .handler(({ input }) => {
    // Mirrors the real @@unique([name, userId]) violation -> P2002 -> CONFLICT.
    if (categories.some((category) => category.name === input.name)) {
      throw new ORPCError('CONFLICT', {
        message: `Category "${input.name}" already exists`,
      })
    }

    const created: CategoryWithCount = {
      id: nextCategoryId++,
      name: input.name,
      color: input.color,
      isDefault: false,
      userId: 1,
      _count: { todos: 0 },
      createdAt: new Date('2026-09-07T00:00:00.000Z'),
      updatedAt: new Date('2026-09-07T00:00:00.000Z'),
    }
    categories = [...categories, created]
    return created
  })

const update = os
  .input(
    z.object({ id: z.number().int().positive(), data: UpdateCategorySchema }),
  )
  .output(CategorySchema)
  .handler(({ input }) => {
    const existing = requireCategory(input.id)
    if (
      input.data.name !== undefined &&
      categories.some(
        (category) =>
          category.name === input.data.name && category.id !== input.id,
      )
    ) {
      throw new ORPCError('CONFLICT', {
        message: `Category "${input.data.name}" already exists`,
      })
    }

    const updated = { ...existing, ...input.data, updatedAt: new Date() }
    categories = categories.map((category) =>
      category.id === input.id ? updated : category,
    )
    return updated
  })

const remove = os
  .input(z.object({ id: z.number().int().positive() }))
  .output(z.object({ success: z.boolean() }))
  .handler(({ input }) => {
    const existing = requireCategory(input.id)
    if (existing.isDefault) {
      throw new ORPCError('FORBIDDEN', {
        message: 'Cannot delete the default category',
      })
    }

    categories = categories.filter((category) => category.id !== input.id)
    return { success: true }
  })

/** Same keys as `src/server/router.ts`, minus the Prisma and Clerk halves. */
const testRouter = {
  category: { list, create, update, delete: remove },
}

const handler = new RPCHandler(testRouter)

/**
 * MSW server answering `/api/orpc/*` with real oRPC RPC responses. Nothing above
 * the socket is stubbed: a spec exercises the same TanStack cache wiring, the
 * same serialization and the same error envelope production does — only Postgres
 * and Clerk are replaced.
 * @example
 * beforeAll(() => orpcServer.listen({ onUnhandledRequest: 'error' }))
 */
export const orpcServer = setupServer(
  http.all('*/api/orpc/*', async ({ request }) => {
    if (isNetworkFailureArmed) {
      isNetworkFailureArmed = false
      return HttpResponse.error()
    }
    if (writeGate) await writeGate

    // Identical call to src/app/api/orpc/[...path]/route.ts, so a wire-format
    // change breaks the tests instead of slipping past them.
    const { response } = await handler.handle(request, {
      prefix: '/api/orpc',
      context: {},
    })
    return response ?? new HttpResponse('Not found', { status: 404 })
  }),
)
