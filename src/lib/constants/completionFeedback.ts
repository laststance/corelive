/**
 * Checkbox amber-fill duration on completion — the short tier (150–250ms) from
 * DESIGN.md, locked to ~200ms (D10). Mirrored by the Tailwind `duration-200`
 * utility applied to the checkbox in useCompletionFeedback; this constant is the
 * documented source of truth (Storybook / tests reference it). It is
 * deliberately NOT the heatmap hero fill (400ms radial-sweep) — the checkbox
 * fill is the quiet, repeatable acknowledgment, the heatmap stays the single
 * performative moment.
 */
export const CHECKBOX_COMPLETION_FILL_MS = 200

// --- Opt-in completion sound (synthesized; soft / warm / non-melodic) ---
// Default OFF (DESIGN.md opt-in-sound exception). Synthesized via Web Audio so
// no asset needs bundling/hosting (the asset choice is an open product question);
// these values shape a soft, low-mid "paper thud", never a gamified chime.

/** Base frequency of the completion thud — low-mid sine reads as warm, not beepy. */
export const COMPLETION_SOUND_FREQUENCY_HZ = 180
/** Peak gain — intentionally low so the cue stays gentle, never a game chime. */
export const COMPLETION_SOUND_PEAK_GAIN = 0.12
/** Fast attack to the peak so the onset is soft, not a click. */
export const COMPLETION_SOUND_ATTACK_MS = 6
/** Total envelope length; ≤400ms per DESIGN.md's opt-in-sound exception. */
export const COMPLETION_SOUND_DURATION_MS = 280
