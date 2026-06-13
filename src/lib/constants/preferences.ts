/**
 * Default user preferences — derived from the Zod schema SSoT (D2) via
 * `PreferencesStateSchema.parse({})`, so the defaults can NEVER drift from the
 * validated shape (one place to add a field). Every field defaults OFF/neutral,
 * so existing users — and anyone whose pre-existing persisted Redux blob predates
 * a field — keep today's behavior: a SILENT app, completed todos moving to the
 * Completed list.
 *
 * Read preferences through the slice's defensive `?? DEFAULT` selectors: the
 * persistence middleware's `shallowMerge` replaces the WHOLE preferences slice
 * with the persisted object, so any field ADDED in a later release is simply
 * absent at runtime for users who already persisted — it must coalesce to its
 * default here (eng-review Finding 5).
 *
 * @module lib/constants/preferences
 */
import { PreferencesStateSchema } from '@/lib/schemas/preferences'

/**
 * The full default preferences: completion sound OFF, 居残りモード OFF, every
 * sound moment OFF, the default timbre, and the default master volume.
 */
export const DEFAULT_PREFERENCES = PreferencesStateSchema.parse({})
