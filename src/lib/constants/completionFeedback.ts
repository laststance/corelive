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
/** Near-zero gain the decay ramp targets — Web Audio exponential ramps cannot
 * reach exactly 0, so the release fades toward this tiny floor instead. */
export const COMPLETION_SOUND_RELEASE_TARGET_GAIN = 0.0001
