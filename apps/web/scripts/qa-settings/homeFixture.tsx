import { ORPCError, os } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { z } from 'zod'

import { CompletedTodos } from '@/app/(main)/home/_components/CompletedTodos'
import { AppSidebar } from '@/components/AppSidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import {
  CATEGORY_DELETE_NOT_FOUND_REASON,
  type CategoryWithCount,
} from '@/server/schemas/category'

/** Synthetic user id shared by every seeded category; never a real account. */
const SYNTHETIC_USER_ID = 1

/** oRPC endpoint prefix the browser client posts to (`create-client.ts`). */
const ORPC_PREFIX = '/api/orpc'

/**
 * How the fake `category.delete` answers, chosen with `?delete=` so headless QA can
 * capture each dialog state without a server: `ok` deletes, `pending` holds the
 * request until `window.__homeFixture.release()`, `destination-gone` and
 * `source-gone` fail with the matching `NOT_FOUND` reason.
 */
type DeleteMode = 'ok' | 'pending' | 'destination-gone' | 'source-gone'

/**
 * Builds one seeded category row with the list endpoint's shape.
 * @param id - Row id; 1 is the default `General` category.
 * @param name - Display name.
 * @param isDefault - Whether the row is the undeletable default.
 * @returns A category row as `category.list` returns it.
 * @example seedCategory(2, 'Reading', false) // => { id: 2, name: 'Reading', … }
 */
function seedCategory(
  id: number,
  name: string,
  isDefault: boolean,
): CategoryWithCount {
  const createdAt = new Date('2026-11-01T09:00:00.000Z')
  return {
    id,
    name,
    color: isDefault ? 'blue' : 'green',
    isDefault,
    parentId: null,
    userId: SYNTHETIC_USER_ID,
    createdAt,
    updatedAt: createdAt,
    recordCount: 0,
    _count: { todos: 0 },
  }
}

/**
 * Reads the requested delete behavior from the page URL.
 * @param value - The raw `?delete=` value.
 * @returns A known {@link DeleteMode}; anything else is `ok`.
 * @example toDeleteMode('pending') // => 'pending'
 */
function toDeleteMode(value: string | null): DeleteMode {
  if (
    value === 'pending' ||
    value === 'destination-gone' ||
    value === 'source-gone'
  )
    return value
  return 'ok'
}

/**
 * Routes the browser's `/api/orpc` calls to an in-page fake router and renders Home's
 * sidebar and Completed card, so the `?view=home` QA page needs no sign-in or database.
 * Called by `main.tsx` before the first render.
 * @param parameters - The page's query string (`delete=` picks the delete behavior).
 * @returns The Home fixture element to render inside the shared providers.
 * @example
 * const home = installHomeFixture(new URLSearchParams('view=home&delete=pending'))
 */
export function installHomeFixture(
  parameters: URLSearchParams,
): React.JSX.Element {
  const deleteMode = toDeleteMode(parameters.get('delete'))
  let categories = [
    seedCategory(1, 'General', true),
    seedCategory(2, 'Reading', false),
  ]
  let releasePendingDelete: (() => void) | undefined
  const router = {
    category: {
      list: os.handler(() => ({ categories })),
      create: os.handler(() => {
        throw new ORPCError('FORBIDDEN', {
          message: 'The QA fixture does not create categories',
        })
      }),
      update: os.handler(() => {
        throw new ORPCError('FORBIDDEN', {
          message: 'The QA fixture does not edit categories',
        })
      }),
      delete: os
        .input(
          z.object({
            id: z.number().int().positive(),
            targetCategoryId: z.number().int().positive().optional(),
          }),
        )
        .handler(async ({ input }) => {
          // Each mode reproduces one server answer the dialog must handle.
          if (deleteMode === 'pending')
            await new Promise<void>((resolve) => {
              releasePendingDelete = resolve
            })
          if (deleteMode === 'destination-gone')
            throw new ORPCError('NOT_FOUND', {
              message: 'Destination category not found',
              data: { reason: CATEGORY_DELETE_NOT_FOUND_REASON.destination },
            })
          if (deleteMode === 'source-gone')
            throw new ORPCError('NOT_FOUND', {
              message: 'Category not found',
              data: { reason: CATEGORY_DELETE_NOT_FOUND_REASON.source },
            })
          categories = categories.filter((category) => category.id !== input.id)
          return {
            success: true as const,
            movedToCategoryId: input.targetCategoryId ?? 1,
            promotedCategoryIds: [],
          }
        }),
    },
    completed: {
      journal: os.handler(() => ({ entries: [], total: 0, hasMore: false })),
      heatmap: os.handler(() => ({
        data: [],
        streaks: { current: 0, longest: 0 },
        total: 0,
      })),
    },
  }
  const handler = new RPCHandler(router)
  const realFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const request = new Request(input, init)
    // Only the app's own oRPC endpoint is faked; everything else is a real request.
    if (!new URL(request.url).pathname.startsWith(ORPC_PREFIX))
      return realFetch(input, init)
    const { matched, response } = await handler.handle(request, {
      prefix: ORPC_PREFIX,
    })
    return matched ? response : new Response('Not found', { status: 404 })
  }
  Object.defineProperty(window, '__homeFixture', {
    value: {
      release: () => {
        releasePendingDelete?.()
        releasePendingDelete = undefined
      },
    },
  })
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          <CompletedTodos categories={categories} />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
