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
import { PG_UNIQUE_VIOLATION } from '@/db/constants'
import { isPgError } from '@/db/isPgError'
import { requireRow } from '@/db/requireRow'
import { electronSettingsTable } from '@/db/schema'
import { createModuleLogger } from '@/lib/logger'

import { authMiddleware } from '../middleware/auth'
import {
  ElectronSettingsSchema,
  UpdateElectronSettingsSchema,
  DEFAULT_ELECTRON_SETTINGS,
} from '../schemas/electronSettings'

const log = createModuleLogger('electronSettings')

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
      const { user } = context

      // Try to find existing settings first
      let [settings] = await db
        .select()
        .from(electronSettingsTable)
        .where(eq(electronSettingsTable.userId, user.id))
        .limit(1)

      // If not found, create with defaults
      if (!settings) {
        try {
          settings = requireRow(
            await db
              .insert(electronSettingsTable)
              .values({
                userId: user.id,
                ...DEFAULT_ELECTRON_SETTINGS,
              })
              .returning(),
            'electronSettings.insert',
          )
        } catch (createError: unknown) {
          // Handle race condition: if another request created settings
          // between the select and the insert, catch the unique violation and re-fetch
          if (isPgError(createError, PG_UNIQUE_VIOLATION)) {
            // Settings were created by another request - fetch the existing record
            ;[settings] = await db
              .select()
              .from(electronSettingsTable)
              .where(eq(electronSettingsTable.userId, user.id))
              .limit(1)
            if (!settings) {
              // Still not found after race - this shouldn't happen but handle it
              throw new ORPCError('INTERNAL_SERVER_ERROR', {
                message: 'Failed to create or retrieve Electron settings',
                cause: createError,
              })
            }
          } else {
            // Re-throw everything except the unique violation
            throw createError
          }
        }
      }

      return settings
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
