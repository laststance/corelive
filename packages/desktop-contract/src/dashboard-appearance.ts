import { z } from 'zod'

import { getThemeId, THEME_FAMILY_IDS } from './theme-identity'

/** Accepts every concrete registered palette and the preference that follows the OS. */
export const DashboardThemeSchema = z.enum([
  'system',
  ...THEME_FAMILY_IDS.flatMap((family) => [
    getThemeId(family, 'light'),
    getThemeId(family, 'dark'),
  ]),
])
export type DashboardTheme = z.infer<typeof DashboardThemeSchema>

/** A newly connected account has no saved theme until a browser migrates or a user selects one. */
export const DashboardAppearanceSchema = z.strictObject({
  theme: DashboardThemeSchema.nullable(),
})
export type DashboardAppearance = z.infer<typeof DashboardAppearanceSchema>

const accountGuard = {
  expectedAccountId: z.string().min(1).optional(),
}
/** Browsers pin reads to the initiating Clerk identity; the Mac verifies identity through its broker. */
export const GetDashboardAppearanceSchema = z
  .strictObject(accountGuard)
  .optional()
export type GetDashboardAppearance = z.infer<
  typeof GetDashboardAppearanceSchema
>
/** A one-time browser import preserves any choice that reached the account first. */
export const SetDashboardAppearanceSchema = z.strictObject({
  ...accountGuard,
  theme: DashboardThemeSchema,
  initializeOnly: z.boolean().optional(),
})
export type SetDashboardAppearance = z.infer<
  typeof SetDashboardAppearanceSchema
>
