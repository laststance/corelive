import { ORPCError, os } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { z } from 'zod'

import { DashboardContent } from '@/app/(main)/home/_components/DashboardContent'
import { AppSidebar } from '@/components/AppSidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import {
  CATEGORY_DELETE_NOT_FOUND_REASON,
  type CategoryWithCount,
} from '@/server/schemas/category'

import { createActivityFixture } from './activityFixture'

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
 * Routes the browser's `/api/orpc` calls to an in-page fake router and renders the Dashboard
 * with its sidebar, activity and journal, so the `?view=home` QA page needs no sign-in or database.
 * Called by `main.tsx` before the first render.
 * @param parameters - The page's query string (`delete=` picks the delete behavior).
 * @returns The Home element and the teardown for its browser globals.
 * @example
 * const { element, uninstall } = installHomeFixture(new URLSearchParams('delete=pending'))
 */
export function installHomeFixture(parameters: URLSearchParams): {
  element: React.JSX.Element
  uninstall: () => void
} {
  const deleteMode = toDeleteMode(parameters.get('delete'))
  const general = seedCategory(1, 'General', true)
  const reading = seedCategory(2, 'Reading', false)
  const categories = new Map([
    [general.id, general],
    [reading.id, reading],
  ])
  const activity = createActivityFixture(categories, parameters)
  let releasePendingDelete: (() => void) | undefined
  const router = {
    category: {
      list: os.handler(() => ({
        categories: [...categories.values()].map((category) => ({
          ...category,
          recordCount: activity.countCategoryRecords(category.id),
        })),
      })),
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
          const source = categories.get(input.id)
          const destinationId = input.targetCategoryId ?? general.id
          if (deleteMode === 'source-gone' || !source)
            throw new ORPCError('NOT_FOUND', {
              message: 'Category not found',
              data: { reason: CATEGORY_DELETE_NOT_FOUND_REASON.source },
            })
          if (source.isDefault)
            throw new ORPCError('FORBIDDEN', {
              message: 'Cannot delete the default category',
            })
          if (source.id === destinationId)
            throw new ORPCError('BAD_REQUEST', {
              message: 'Choose a different destination category',
            })
          if (
            deleteMode === 'destination-gone' ||
            !categories.has(destinationId)
          )
            throw new ORPCError('NOT_FOUND', {
              message: 'Destination category not found',
              data: { reason: CATEGORY_DELETE_NOT_FOUND_REASON.destination },
            })
          activity.moveCategoryRecords(source.id, destinationId)
          categories.delete(source.id)
          return {
            success: true as const,
            movedToCategoryId: destinationId,
            promotedCategoryIds: [],
          }
        }),
    },
    completed: activity.completed,
  }
  const handler = new RPCHandler(router)
  const realFetch = window.fetch
  const previousControl = Object.getOwnPropertyDescriptor(
    window,
    '__homeFixture',
  )
  window.fetch = async (input, init) => {
    const request = new Request(input, init)
    // Only the app's own oRPC endpoint is faked; everything else is a real request.
    if (!new URL(request.url).pathname.startsWith(ORPC_PREFIX))
      return realFetch.call(window, input, init)
    const { matched, response } = await handler.handle(request, {
      prefix: ORPC_PREFIX,
    })
    return matched ? response : new Response('Not found', { status: 404 })
  }
  Object.defineProperty(window, '__homeFixture', {
    configurable: true,
    value: {
      release: () => {
        releasePendingDelete?.()
        releasePendingDelete = undefined
      },
    },
  })
  return {
    element: (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <DashboardContent />
        </SidebarInset>
      </SidebarProvider>
    ),
    uninstall: (): void => {
      window.fetch = realFetch
      if (previousControl) {
        Object.defineProperty(window, '__homeFixture', previousControl)
      } else {
        Reflect.deleteProperty(window, '__homeFixture')
      }
    },
  }
}
