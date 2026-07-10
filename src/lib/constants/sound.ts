/**
 * Sound-palette registry — the single source of truth for the opt-in earned-beat
 * sound feature. Declares the selectable timbres (bundled foley assets in
 * `public/sounds/`) and the task-life "earned beat" moments that may play a cue.
 * Imported by the sound engine, the settings Zod schema, and the Settings UI.
 *
 * The app ships SILENT — these describe WHAT can play, never WHETHER it does
 * (every moment defaults OFF; see the settings schema). The id tuples are the
 * SSoT: both the union types and the Zod enums derive from them, so there is no
 * drift between "valid timbre ids" in types and in runtime validation.
 *
 * @module lib/constants/sound
 */

/**
 * The selectable timbre ids, ordered for the Settings selector. `as const` so the
 * union type AND `z.enum(TIMBRE_IDS)` both derive from this one tuple (no drift).
 */
export const TIMBRE_IDS = ['felt', 'tap', 'wood', 'paper'] as const

/** A selectable sound timbre. The id doubles as the asset filename stem. */
export type TimbreId = (typeof TIMBRE_IDS)[number]

/**
 * The task-life "earned beat" moments that may play a cue, ordered for Settings.
 * `braindump-capture` is deliberately absent (D1) — BrainDump persists on a 400ms
 * debounce with no discrete capture gesture, so a cue there would be a silent
 * first-fire or a per-keystroke soundboard. Reorder / category-switch are excluded
 * by design (too high-frequency to feel "earned").
 */
export const SOUND_MOMENT_IDS = ['task-create', 'complete', 'clear'] as const

/** A task-life moment that can play a sound cue. */
export type SoundMomentId = (typeof SOUND_MOMENT_IDS)[number]

/** A bundled timbre: its asset, license provenance, and loudness-equalizing gain. */
export interface SoundTimbre {
  id: TimbreId
  /** Human-facing label shown in the Settings timbre selector. */
  label: string
  /** Public asset path served by Next.js (inherited by the Electron WebView). */
  assetPath: `/sounds/${TimbreId}.mp3`
  /** License provenance of the bundled asset (for audit / attribution). */
  license: string
  /**
   * Per-timbre gain multiplier that equalizes PERCEIVED loudness across timbres so
   * switching timbre never changes how loud the cue feels. Derived by measuring
   * each asset's mean dBFS (`ffmpeg volumedetect`) and equalizing to a gentle
   * −36 dBFS target; the engine's final gain is `masterVolume × normalizeGain`.
   * These are sane measured defaults — tune by ear in-app if a timbre stands out.
   */
  normalizeGain: number
}

/** Shared license string — all four timbres are ElevenLabs SFX under a paid plan. */
const ELEVENLABS_PAID_LICENSE =
  'ElevenLabs SFX — Starter (paid) plan grants commercial use + redistribution'

/**
 * The selectable timbres, chosen by audition (2026-06-13) from 8 ElevenLabs SFX
 * candidates. `normalizeGain` values are measured (see SoundTimbre.normalizeGain).
 */
export const SOUND_TIMBRES: Record<TimbreId, SoundTimbre> = {
  felt: {
    id: 'felt',
    label: 'Felt',
    assetPath: '/sounds/felt.mp3',
    license: ELEVENLABS_PAID_LICENSE,
    normalizeGain: 1.57,
  },
  tap: {
    id: 'tap',
    label: 'Tap',
    assetPath: '/sounds/tap.mp3',
    license: ELEVENLABS_PAID_LICENSE,
    normalizeGain: 0.83,
  },
  wood: {
    id: 'wood',
    label: 'Wood',
    assetPath: '/sounds/wood.mp3',
    license: ELEVENLABS_PAID_LICENSE,
    normalizeGain: 0.39,
  },
  paper: {
    id: 'paper',
    label: 'Paper',
    assetPath: '/sounds/paper.mp3',
    license: ELEVENLABS_PAID_LICENSE,
    normalizeGain: 1.48,
  },
}

/** The ordered timbre list for rendering the Settings selector. */
export const SOUND_TIMBRE_LIST: readonly SoundTimbre[] = TIMBRE_IDS.map(
  (id) => SOUND_TIMBRES[id],
)

/** The timbre selected on a fresh install (warm felt mallet — the gentlest). */
export const DEFAULT_TIMBRE_ID: TimbreId = 'felt'

/** The default master volume (0–1) before the user adjusts the slider. */
export const DEFAULT_SOUND_VOLUME = 0.6

/** Settings-row metadata for a sound moment (label + quiet-companion description). */
export interface SoundMomentMeta {
  id: SoundMomentId
  label: string
  description: string
}

/**
 * Per-moment Settings copy. Voice is the quiet companion (DESIGN.md), never a
 * coach — "a soft cue when…", never "reward" / "achievement".
 */
export const SOUND_MOMENTS: readonly SoundMomentMeta[] = [
  {
    id: 'task-create',
    label: 'Adding a task',
    description: 'A soft cue when you add something to do.',
  },
  {
    id: 'complete',
    label: 'Checking one off',
    description: 'A soft cue when you complete a task.',
  },
  {
    id: 'clear',
    label: 'Clearing finished tasks',
    description: 'A soft cue when you clear the completed list.',
  },
]
