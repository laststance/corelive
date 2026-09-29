/**
 * Electron Settings Procedures
 *
 * oRPC procedures for managing Electron-specific settings.
 * Provides get and upsert operations with authentication.
 *
 * @module server/procedures/electronSettings
 *
 * @example
 * // Client usage
 * const settings = await orpcClient.electronSettings.get()
 * await orpcClient.electronSettings.upsert({ hideAppIcon: true })
 */
import { ORPCError } from '@orpc/server'
import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { requireRow } from '@/db/requireRow'
import { electronSettingsTable, type User } from '@/db/schema'
import { createModuleLogger } from '@/lib/logger'

import { authMiddleware } from '../middleware/auth'
import {
  ElectronSettingsSchema,
  UpdateElectronSettingsSchema,
  DEFAULT_ELECTRON_SETTINGS,
} from '../schemas/electronSettings'

const log = createModuleLogger('electronSettings')

/**
 * Loads the caller's settings row, creating it with defaults on first use.
 *
 * Two requests can both find no row and both insert; the loser's insert does nothing (unique index on `userId`), and it re-reads the winner's row instead of failing.
 * Called by {@link getElectronSettings} and by {@link upsertElectronSettings} when a save carries no fields.
 *
 * @param userId - Owner of the settings row.
 * @returns The stored settings row.
 * @throws ORPCError INTERNAL_SERVER_ERROR when the insert lost a race yet the row cannot be read back.
 * @example
 * const settings = await findOrCreateSettings(user.id)
 */
async function findOrCreateSettings(userId: User['id']) {
  const readSettings = () =>
    db
      .select()
      .from(electronSettingsTable)
      .where(eq(electronSettingsTable.userId, userId))
      .limit(1)

  const [existing] = await readSettings()
  if (existing) return existing

  // DO NOTHING on the unique userId index: a concurrent first read may have inserted the row
  // already, in which case this returns no row and we read the winner's.
  const [created] = await db
    .insert(electronSettingsTable)
    .values({ userId, ...DEFAULT_ELECTRON_SETTINGS })
    .onConflictDoNothing({ target: electronSettingsTable.userId })
    .returning()
  if (created) return created

  const [raced] = await readSettings()
  if (!raced) {
    // Still not found after the race - this shouldn't happen but handle it
    throw new ORPCError('INTERNAL_SERVER_ERROR', {
      message: 'Failed to create or retrieve Electron settings',
    })
  }
  return raced
}

/**
 * Get Electron settings for the authenticated user.
 *
 * If no settings exist, creates a new record with default values.
 * This ensures the user always has a settings record.
 *
 * @returns ElectronSettings object for the current user
 *
 * @example
 * // Returns settings with all fields
 * {
 *   id: 1,
 *   userId: 123,
 *   hideAppIcon: false,
 *   showInMenuBar: true,
 *   startAtLogin: false,
 *   createdAt: Date,
 *   updatedAt: Date
 * }
 */
export const getElectronSettings = authMiddleware
  .output(ElectronSettingsSchema)
  .handler(async ({ context }) => {
    try {
      return await findOrCreateSettings(context.user.id)
    } catch (error) {
      log.error({ error }, 'Error in getElectronSettings')
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to fetch Electron settings',
        cause: error,
      })
    }
  })

/**
 * Upsert (create or update) Electron settings for the authenticated user.
 *
 * Uses one `INSERT … ON CONFLICT ("userId") DO UPDATE` to handle both creation and update.
 * Only provided fields are updated; others retain their current values.
 *
 * @param input - Partial settings object with fields to update
 * @returns Updated ElectronSettings object
 *
 * @example
 * // Update only hideAppIcon
 * await orpcClient.electronSettings.upsert({ hideAppIcon: true })
 *
 * // Update multiple fields
 * await orpcClient.electronSettings.upsert({
 *   hideAppIcon: true,
 *   showInMenuBar: false
 * })
 */
export const upsertElectronSettings = authMiddleware
  .input(UpdateElectronSettingsSchema)
  .output(ElectronSettingsSchema)
  .handler(async ({ input, context }) => {
    try {
      const { user } = context

      // Log only changed keys at debug level to reduce noise
      const changedKeys = Object.keys(input)
      if (changedKeys.length > 0) {
        log.debug(
          { userId: user.id, changedKeys },
          'Upserting Electron settings',
        )
      }

      // An empty save changes nothing: return the stored row (created on first use) and leave
      // `updatedAt` alone, as the previous ORM did. Drizzle would reject an empty SET ("No values
      // to set") before it stamps `$onUpdate`, so this cannot be left to the UPDATE.
      if (Object.values(input).every((value) => value === undefined)) {
        return await findOrCreateSettings(user.id)
      }

      const settings = requireRow(
        await db
          .insert(electronSettingsTable)
          .values({
            userId: user.id,
            ...DEFAULT_ELECTRON_SETTINGS,
            ...input,
          })
          // Conflict target = the unique index on userId; only provided fields change.
          .onConflictDoUpdate({
            target: electronSettingsTable.userId,
            set: input,
          })
          .returning(),
        'electronSettings.upsert',
      )

      return settings
    } catch (error) {
      log.error({ error }, 'Error in upsertElectronSettings')
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to update Electron settings',
        cause: error,
      })
    }
  })
