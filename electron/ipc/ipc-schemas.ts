import { z } from 'zod'

import type { IPCChannel } from '../types/ipc'

// Mirror renderer-side caps (`COMPLETED_TITLE_MAX_LENGTH * LIVE_EDITOR_NOTE_LINES_PER_CAP`)
// without importing from `src/` (Electron tsconfig excludes it). If the
// renderer constants change, update both this and `src/lib/constants/live-editor.ts`.
const LIVE_EDITOR_NOTE_MAX_LENGTH = 255 * 200
// Electron accelerator strings are short tokens like "CommandOrControl+Shift+B".
// 64 is generous and bounds memory/log noise from malformed payloads.
const SHORTCUT_ACCELERATOR_MAX_LENGTH = 64
// Window dimension floor matches `WindowStateManager` minWidth/minHeight (320).
// Ceiling is loose enough for 8K displays but rejects runaway values.
const LIVE_EDITOR_WINDOW_DIMENSION_MIN = 320
const LIVE_EDITOR_WINDOW_DIMENSION_MAX = 8192

const RENDERER_READABLE_LIVE_EDITOR_CONFIG_PATHS = new Set([
  'liveEditor.width',
  'liveEditor.height',
  'liveEditor.visibleOnAllWorkspaces',
  'liveEditor.alwaysOnTop',
  'liveEditor.opacity',
  'liveEditor.shortcut',
])

/** Allows generic renderer reads only for LiveEditor metadata so personal note text stays on its dedicated IPC channel.
 * @param path - Dot-notation config path requested by the renderer.
 * @returns Whether the generic `config-get` channel may read the path.
 * @example
 * isRendererReadableConfigPath('liveEditor.notes.1') // => false
 */
export function isRendererReadableConfigPath(path: string): boolean {
  // Other config sections retain their existing generic getter behavior.
  if (!path.startsWith('liveEditor.')) return true
  return RENDERER_READABLE_LIVE_EDITOR_CONFIG_PATHS.has(path)
}

const rendererReadableConfigPathSchema = z
  .string()
  .refine(
    isRendererReadableConfigPath,
    'LiveEditor note content requires its dedicated IPC channel',
  )

/**
 * Zod schemas for runtime validation of IPC `invoke` arguments at the main-process boundary.
 *
 * Each entry validates the arguments tuple (`ArgsOf<C>`) of a given channel.
 * The type is `Record<IPCChannel, z.ZodTypeAny>` — TypeScript rejects the file
 * if any channel defined in `IPCChannels` lacks a schema here. Adding a new
 * channel to `types/ipc.ts` without a schema is a compile error.
 *
 * Why validate at the main boundary:
 *   Renderer processes can be compromised (e.g., via XSS on the web app shell).
 *   Trusting renderer-supplied payloads with DB/FS access is an OWASP-level risk.
 *   Electron's official security checklist item #17 requires validating IPC senders and payloads.
 *
 * @example
 *   // Void-arg channel
 *   'app-version': z.tuple([]),
 *   // Single-arg channel
 *   'config-get': z.tuple([z.string()]),
 *   // Tuple-arg channel (multiple positional args)
 *   'config-set': z.tuple([z.string(), z.unknown()]),
 */
export const IPC_ARG_SCHEMAS: Record<IPCChannel, z.ZodTypeAny> = {
  // ──────────────────────────────────────────────────────────────────────────
  // App (all void-arg)
  // ──────────────────────────────────────────────────────────────────────────
  'app-version': z.tuple([]),
  'app-quit': z.tuple([]),

  // ──────────────────────────────────────────────────────────────────────────
  // Configuration
  // ──────────────────────────────────────────────────────────────────────────
  'config-get': z.tuple([
    rendererReadableConfigPathSchema,
    z.unknown().optional(),
  ]),
  'config-set': z.tuple([z.string(), z.unknown()]),
  'config-get-all': z.tuple([]),
  'config-get-section': z.tuple([
    z.enum([
      'window',
      'notifications',
      'shortcuts',
      'general',
      'appearance',
      'behavior',
      'advanced',
      'liveEditor',
    ]),
  ]),
  'config-update': z.tuple([z.record(z.string(), z.unknown())]),
  'config-reset': z.tuple([]),
  'config-reset-section': z.tuple([
    z.enum([
      'window',
      'notifications',
      'shortcuts',
      'general',
      'appearance',
      'behavior',
      'advanced',
      'liveEditor',
    ]),
  ]),
  'config-validate': z.tuple([]),
  'config-export': z.tuple([]),
  'config-import': z.tuple([]),
  'config-backup': z.tuple([]),
  'config-get-paths': z.tuple([]),
  'config-open': z.tuple([]),

  // ──────────────────────────────────────────────────────────────────────────
  // Authentication
  // ──────────────────────────────────────────────────────────────────────────
  'auth-get-user': z.tuple([]),
  'auth-set-user': z.tuple([
    z
      .object({
        clerkId: z.string(),
        emailAddresses: z.array(z.string()).optional(),
        firstName: z.string().nullable().optional(),
      })
      .passthrough(),
  ]),
  'auth-logout': z.tuple([]),
  'auth-is-authenticated': z.tuple([]),
  'auth-sync-from-web': z.tuple([
    z
      .object({
        clerkId: z.string(),
        emailAddresses: z.array(z.string()).optional(),
        firstName: z.string().nullable().optional(),
      })
      .passthrough(),
  ]),

  // ──────────────────────────────────────────────────────────────────────────
  // OAuth
  // ──────────────────────────────────────────────────────────────────────────
  'oauth-start': z.tuple([z.string()]),
  'oauth-get-supported-providers': z.tuple([]),
  'oauth-cancel': z.tuple([z.string().nullable().optional()]),
  'oauth-get-pending-token': z.tuple([]),
  'oauth-clear-pending-token': z.tuple([]),

  // ──────────────────────────────────────────────────────────────────────────
  // Auto Updater (all void-arg)
  // ──────────────────────────────────────────────────────────────────────────
  'updater-check-for-updates': z.tuple([]),
  'updater-quit-and-install': z.tuple([]),
  'updater-get-status': z.tuple([]),

  // ──────────────────────────────────────────────────────────────────────────
  // Settings
  // ──────────────────────────────────────────────────────────────────────────
  'settings:setHideAppIcon': z.tuple([z.boolean()]),
  'settings:setShowInMenuBar': z.tuple([z.boolean()]),
  'settings:setStartAtLogin': z.tuple([z.boolean()]),
  'settings:getLoginItemSettings': z.tuple([]),
  // Reset Settings popover to default size + re-anchor to tray; no arguments.
  'settings:resetPopoverSize': z.tuple([]),

  // ──────────────────────────────────────────────────────────────────────────
  // LiveEditor
  // ──────────────────────────────────────────────────────────────────────────
  'live-editor-window-toggle': z.tuple([]),
  'live-editor-window-show': z.tuple([]),
  'live-editor-window-hide': z.tuple([]),
  // Opacity is clamped in main; we only validate the bounded range here.
  'live-editor-window-set-opacity': z.tuple([z.number().min(0).max(1)]),
  'live-editor-window-get-opacity': z.tuple([]),
  'live-editor-window-get-always-on-top': z.tuple([]),
  'live-editor-window-set-always-on-top': z.tuple([z.boolean()]),
  'live-editor-window-get-bounds': z.tuple([]),
  'live-editor-window-set-bounds': z.tuple([
    z.object({
      // x/y can be negative on multi-monitor setups (left/above primary display).
      x: z.number().finite(),
      y: z.number().finite(),
      width: z
        .number()
        .min(LIVE_EDITOR_WINDOW_DIMENSION_MIN)
        .max(LIVE_EDITOR_WINDOW_DIMENSION_MAX),
      height: z
        .number()
        .min(LIVE_EDITOR_WINDOW_DIMENSION_MIN)
        .max(LIVE_EDITOR_WINDOW_DIMENSION_MAX),
    }),
  ]),
  'live-editor-get-visible-on-all-workspaces': z.tuple([]),
  'live-editor-set-visible-on-all-workspaces': z.tuple([z.boolean()]),

  'live-editor-note-get': z.tuple([z.number().int().positive()]),
  // Cap text length to mirror the renderer textarea `maxLength`. A compromised
  // renderer cannot starve disk by sending megabytes of note text.
  'live-editor-note-set': z.tuple([
    z.number().int().positive(),
    z.string().max(LIVE_EDITOR_NOTE_MAX_LENGTH),
  ]),

  'live-editor-config-get-shortcut': z.tuple([]),
  'live-editor-config-set-shortcut': z.tuple([
    z.string().max(SHORTCUT_ACCELERATOR_MAX_LENGTH),
  ]),
  'live-editor-config-get-shortcut-secondary': z.tuple([]),
  'live-editor-config-set-shortcut-secondary': z.tuple([
    z.string().max(SHORTCUT_ACCELERATOR_MAX_LENGTH),
  ]),
}
