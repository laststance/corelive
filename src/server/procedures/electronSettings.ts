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

import { createModuleLogger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'

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
      let settings = await prisma.electronSettings.findUnique({
        where: { userId: user.id },
      })

      // If not found, create with defaults
      if (!settings) {
        try {
          settings = await prisma.electronSettings.create({
            data: {
              userId: user.id,
              ...DEFAULT_ELECTRON_SETTINGS,
            },
          })
        } catch (createError: unknown) {
          // Handle race condition: if another request created settings
          // between findUnique and create, catch P2002 and re-fetch
          if (
            createError &&
            typeof createError === 'object' &&
            'code' in createError &&
            createError.code === 'P2002'
          ) {
            // Settings were created by another request - fetch the existing record
            settings = await prisma.electronSettings.findUnique({
              where: { userId: user.id },
            })
            if (!settings) {
              // Still not found after race - this shouldn't happen but handle it
              throw new ORPCError('INTERNAL_SERVER_ERROR', {
                message: 'Failed to create or retrieve Electron settings',
                cause: createError,
              })
            }
          } else {
            // Re-throw non-P2002 errors
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
 * Uses Prisma upsert to handle both creation and update in one operation.
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

      const settings = await prisma.electronSettings.upsert({
        where: { userId: user.id },
        update: input,
        create: {
          userId: user.id,
          ...DEFAULT_ELECTRON_SETTINGS,
          ...input,
        },
      })

      return settings
    } catch (error) {
      log.error({ error }, 'Error in upsertElectronSettings')
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to update Electron settings',
        cause: error,
      })
    }
  })
