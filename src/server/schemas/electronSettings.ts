/**
 * Electron Settings Schema
 *
 * Zod schemas for validating Electron-specific settings data
 * used in oRPC procedures.
 *
 * @module server/schemas/electronSettings
 */
import { z } from 'zod'

import { DEFAULT_ELECTRON_SETTINGS } from '@/lib/constants/electronSettings'

/**
 * Helper schema for date fields that accepts Date objects or valid date strings.
 * Rejects invalid dates (NaN) to prevent "Invalid Date" objects.
 */
const validDateSchema = z.coerce
  .date()
  .refine((date) => !isNaN(date.getTime()), {
    message: 'Invalid date value',
  })

/**
 * Schema for ElectronSettings database model.
 * Validates the complete settings object returned from the database.
 */
export const ElectronSettingsSchema = z.object({
  id: z.number().int().positive(),
  userId: z.number().int().positive(),
  hideAppIcon: z.boolean(),
  showInMenuBar: z.boolean(),
  startAtLogin: z.boolean(),
  createdAt: validDateSchema,
  updatedAt: validDateSchema,
})

/**
 * Type inferred from ElectronSettingsSchema.
 */
export type ElectronSettings = z.infer<typeof ElectronSettingsSchema>

/**
 * Schema for updating Electron settings.
 * All fields are optional for partial updates.
 */
export const UpdateElectronSettingsSchema = z.object({
  hideAppIcon: z.boolean().optional(),
  showInMenuBar: z.boolean().optional(),
  startAtLogin: z.boolean().optional(),
})

/**
 * Type inferred from UpdateElectronSettingsSchema.
 */
export type UpdateElectronSettings = z.infer<
  typeof UpdateElectronSettingsSchema
>

/**
 * Default values for Electron settings.
 * Re-exported from shared constants to maintain backward compatibility.
 * @deprecated Import from '@/lib/constants/electronSettings' instead
 */
export { DEFAULT_ELECTRON_SETTINGS }
