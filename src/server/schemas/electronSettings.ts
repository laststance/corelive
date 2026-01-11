/**
 * Electron Settings Schema
 *
 * Zod schemas for validating Electron-specific settings data
 * used in oRPC procedures.
 *
 * @module server/schemas/electronSettings
 */
import { z } from 'zod'

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
  createdAt: z
    .union([z.date(), z.string()])
    .transform((val) => (typeof val === 'string' ? new Date(val) : val)),
  updatedAt: z
    .union([z.date(), z.string()])
    .transform((val) => (typeof val === 'string' ? new Date(val) : val)),
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
 * Used when creating new settings records.
 */
export const DEFAULT_ELECTRON_SETTINGS = {
  hideAppIcon: false,
  showInMenuBar: true,
  startAtLogin: false,
} as const
