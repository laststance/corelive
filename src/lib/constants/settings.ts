/**
 * Default user settings — derived from the Zod schema SSoT (D2) via
 * `UserSettingsStateSchema.parse({})`, so the defaults can NEVER drift from the
 * validated shape. Persisted choices survive hydration while missing fields use
 * the defaults for completed-history decoration and LiveEditor behavior.
 *
 * Read settings through the slice's defensive `?? DEFAULT` selectors. The
 * persistence middleware's `deepMerge` fills fields missing from older blobs,
 * while the selector fallback also protects non-hydrated and malformed edges.
 *
 * @module lib/constants/settings
 */
import { UserSettingsStateSchema } from '@/lib/schemas/settings'

/**
 * Default completed-history decoration and LiveEditor appearance and behavior.
 */
export const DEFAULT_SETTINGS = Object.freeze(UserSettingsStateSchema.parse({}))
