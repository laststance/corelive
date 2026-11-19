import {
  DashboardAppearanceSchema,
  GetDashboardAppearanceSchema,
  SetDashboardAppearanceSchema,
} from '@corelive/desktop-contract/dashboard-appearance'
import { ORPCError } from '@orpc/server'
import { eq, sql } from 'drizzle-orm'

import { db } from '@/db'
import { requireRow } from '@/db/requireRow'
import { dashboardAppearanceTable } from '@/db/schema'

import { authMiddleware } from '../middleware/auth'

/** A browser may have switched sessions while its queued preference request was waiting to send.
 * @throws {ORPCError} When the initiating account differs from the account the server verified.
 * @example assertAccount(context.user.clerkId, input.expectedAccountId)
 */
function assertAccount(
  authenticated: string,
  expected: string | undefined,
): void {
  if (expected !== undefined && expected !== authenticated)
    throw new ORPCError('FORBIDDEN', {
      message: 'The dashboard account changed before this request.',
    })
}

const theme = { theme: dashboardAppearanceTable.theme }

/** Reads the authenticated account's confirmed dashboard choice without initializing it.
 * @example await client.dashboardAppearance.get({expectedAccountId})
 */
export const getDashboardAppearance = authMiddleware
  .input(GetDashboardAppearanceSchema)
  .output(DashboardAppearanceSchema)
  .handler(async ({ input, context }) => {
    assertAccount(context.user.clerkId, input?.expectedAccountId)
    const [preference] = await db
      .select(theme)
      .from(dashboardAppearanceTable)
      .where(eq(dashboardAppearanceTable.userId, context.user.id))
      .limit(1)
    return preference ?? { theme: null }
  })

/** Stores an explicit selection or atomically preserves the winning selection during browser migration.
 * @example await client.dashboardAppearance.set({theme:'system', initializeOnly:true, expectedAccountId})
 */
export const setDashboardAppearance = authMiddleware
  .input(SetDashboardAppearanceSchema)
  .output(DashboardAppearanceSchema)
  .handler(async ({ input, context }) => {
    assertAccount(context.user.clerkId, input.expectedAccountId)
    const saved = await db
      .insert(dashboardAppearanceTable)
      .values({ userId: context.user.id, theme: input.theme })
      .onConflictDoUpdate({
        target: dashboardAppearanceTable.userId,
        // PostgreSQL locks the conflicting row. A migration returns its current choice even if another browser won.
        set: {
          theme: input.initializeOnly
            ? sql`${dashboardAppearanceTable.theme}`
            : input.theme,
        },
      })
      .returning(theme)
    return requireRow(saved, 'dashboardAppearance.set')
  })
