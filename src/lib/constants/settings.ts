/**
 * Default user settings — derived from the Zod schema SSoT (D2) via
 * `UserSettingsStateSchema.parse({})`, so the defaults can NEVER drift from the
 * validated shape (one place to add a field). Every field defaults OFF/neutral,
 * so existing users — and anyone whose pre-existing persisted Redux blob predates
 * a field — keep today's behavior: a SILENT app, completed todos moving to the
 * Completed list.
 *
 * Read settings through the slice's defensive `?? DEFAULT` selectors. The
 * persistence middleware's `deepMerge` fills fields missing from older blobs,
 * while the selector fallback also protects non-hydrated and malformed edges.
 *
 * @module lib/constants/settings
 */
import { UserSettingsStateSchema } from '@/lib/schemas/settings'

/**
 * The full default settings: completion sound OFF, 居残りモード OFF, every
 * sound moment OFF, the default timbre, and the default master volume.
 */
export const DEFAULT_SETTINGS = UserSettingsStateSchema.parse({})
