import { z } from 'zod'

import type { IPCChannel } from '../types/ipc'

// Mirror renderer-side caps (`COMPLETED_TITLE_MAX_LENGTH * BRAINDUMP_NOTE_LINES_PER_CAP`)
// without importing from `src/` (Electron tsconfig excludes it). If the
// renderer constants change, update both this and `src/lib/constants/braindump.ts`.
const BRAINDUMP_NOTE_MAX_LENGTH = 255 * 200
// Electron accelerator strings are short tokens like "CommandOrControl+Shift+B".
// 64 is generous and bounds memory/log noise from malformed payloads.
const BRAINDUMP_SHORTCUT_MAX_LENGTH = 64
// Window dimension floor matches `WindowStateManager` minWidth/minHeight (320).
// Ceiling is loose enough for 8K displays but rejects runaway values.
const BRAINDUMP_WINDOW_DIMENSION_MIN = 320
const BRAINDUMP_WINDOW_DIMENSION_MAX = 8192

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
 *   'performance-get-metrics': z.tuple([]),
 *   // Single-arg channel
 *   'config-get': z.tuple([z.string()]),
 *   // Tuple-arg channel (multiple positional args)
 *   'config-set': z.tuple([z.string(), z.unknown()]),
 */
const notificationActionSchema = z.strictObject({
  type: z.literal('button'),
  text: z.string(),
})

const notificationOptionsSchema = z.strictObject({
  type: z.enum(['info', 'warning', 'error', 'success']).optional(),
  silent: z.boolean().optional(),
  tag: z.string().optional(),
  urgency: z.enum(['low', 'normal', 'critical']).optional(),
  timeoutMs: z.number().optional(),
  icon: z.string().optional(),
  actions: z.array(notificationActionSchema).optional(),
})

const notificationPreferencesUpdateSchema = z.strictObject({
  enabled: z.boolean().optional(),
  taskCreated: z.boolean().optional(),
  taskCompleted: z.boolean().optional(),
  taskUpdated: z.boolean().optional(),
  taskDeleted: z.boolean().optional(),
  sound: z.boolean().optional(),
  showInTray: z.boolean().optional(),
  autoHide: z.boolean().optional(),
  autoHideDelay: z.number().optional(),
  position: z
    .enum(['topRight', 'topLeft', 'bottomRight', 'bottomLeft'])
    .optional(),
})

export const IPC_ARG_SCHEMAS: Record<IPCChannel, z.ZodTypeAny> = {
  // ──────────────────────────────────────────────────────────────────────────
  // App (all void-arg)
  // ──────────────────────────────────────────────────────────────────────────
  'app-version': z.tuple([]),
  'app-quit': z.tuple([]),

  // ──────────────────────────────────────────────────────────────────────────
  // Deep Linking
  // ──────────────────────────────────────────────────────────────────────────
  'deep-link-generate': z.tuple([
    z.string(),
    z.record(z.string(), z.unknown()).optional(),
  ]),
  'deep-link-get-examples': z.tuple([]),
  'deep-link-handle-url': z.tuple([z.string()]),

  // ──────────────────────────────────────────────────────────────────────────
  // Menu
  // ──────────────────────────────────────────────────────────────────────────
  'menu-action': z.tuple([z.string()]),

  // ──────────────────────────────────────────────────────────────────────────
  // System Tray
  // ──────────────────────────────────────────────────────────────────────────
  'tray-show-notification': z.tuple([
    z.string(),
    z.string(),
    notificationOptionsSchema.optional(),
  ]),
  'tray-update-menu': z.tuple([
    z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        completed: z.boolean().optional(),
      }),
    ),
  ]),
  'tray-set-tooltip': z.tuple([z.string()]),
  'tray-set-icon-state': z.tuple([
    z.enum(['default', 'active', 'notification', 'disabled']),
  ]),

  // ──────────────────────────────────────────────────────────────────────────
  // Notifications
  // ──────────────────────────────────────────────────────────────────────────
  'notification-show': z.tuple([
    z.string(),
    z.string(),
    notificationOptionsSchema.optional(),
  ]),
  'notification-get-preferences': z.tuple([]),
  'notification-update-preferences': z.tuple([
    notificationPreferencesUpdateSchema,
  ]),
  'notification-clear-all': z.tuple([]),
  'notification-clear': z.tuple([z.string()]),
  'notification-is-enabled': z.tuple([]),
  'notification-get-active-count': z.tuple([]),

  // ──────────────────────────────────────────────────────────────────────────
  // Shortcuts
  // ──────────────────────────────────────────────────────────────────────────
  'shortcuts-get-registered': z.tuple([]),
  'shortcuts-get-defaults': z.tuple([]),
  'shortcuts-update': z.tuple([z.record(z.string(), z.string())]),
  'shortcuts-register': z.tuple([
    z.object({
      id: z.string(),
      accelerator: z.string(),
      description: z.string(),
      enabled: z.boolean(),
      isGlobal: z.boolean(),
    }),
  ]),
  'shortcuts-unregister': z.tuple([z.string()]),
  'shortcuts-is-registered': z.tuple([z.string()]),
  'shortcuts-enable': z.tuple([]),
  'shortcuts-disable': z.tuple([]),
  'shortcuts-get-stats': z.tuple([]),

  // ──────────────────────────────────────────────────────────────────────────
  // Configuration
  // ──────────────────────────────────────────────────────────────────────────
  'config-get': z.tuple([z.string(), z.unknown().optional()]),
  'config-set': z.tuple([z.string(), z.unknown()]),
  'config-get-all': z.tuple([]),
  'config-get-section': z.tuple([
    z.enum([
      'window',
      'notifications',
      'shortcuts',
      'general',
      'appearance',
      'tray',
      'behavior',
      'advanced',
      'braindump',
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
      'tray',
      'behavior',
      'advanced',
      'braindump',
    ]),
  ]),
  'config-validate': z.tuple([]),
  'config-export': z.tuple([]),
  'config-import': z.tuple([]),
  'config-backup': z.tuple([]),
  'config-get-paths': z.tuple([]),

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
  // Performance (all void-arg)
  // ──────────────────────────────────────────────────────────────────────────
  'performance-get-metrics': z.tuple([]),
  'performance-trigger-cleanup': z.tuple([]),
  'performance-get-startup-time': z.tuple([]),

  // ──────────────────────────────────────────────────────────────────────────
  // Settings
  // ──────────────────────────────────────────────────────────────────────────
  'settings:open': z.tuple([]),
  'settings:close': z.tuple([]),
  'settings:setHideAppIcon': z.tuple([z.boolean()]),
  'settings:setShowInMenuBar': z.tuple([z.boolean()]),
  'settings:setStartAtLogin': z.tuple([z.boolean()]),
  'settings:getLoginItemSettings': z.tuple([]),

  // ──────────────────────────────────────────────────────────────────────────
  // Window Management (all void-arg)
  // ──────────────────────────────────────────────────────────────────────────
  'window-minimize': z.tuple([]),
  'window-close': z.tuple([]),
  'window-toggle-floating-navigator': z.tuple([]),
  'window-show-floating-navigator': z.tuple([]),
  'window-hide-floating-navigator': z.tuple([]),
  'window-show-main': z.tuple([]),

  // ──────────────────────────────────────────────────────────────────────────
  // Floating Window
  // ──────────────────────────────────────────────────────────────────────────
  'floating-window-get-visible-on-all-workspaces': z.tuple([]),
  'floating-window-set-visible-on-all-workspaces': z.tuple([z.boolean()]),
  'floating-window-close': z.tuple([]),
  'floating-window-minimize': z.tuple([]),
  'floating-window-toggle-always-on-top': z.tuple([]),
  'floating-window-get-bounds': z.tuple([]),
  'floating-window-set-bounds': z.tuple([
    z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    }),
  ]),
  'floating-window-is-always-on-top': z.tuple([]),

  // ──────────────────────────────────────────────────────────────────────────
  // Window State Management
  // ──────────────────────────────────────────────────────────────────────────
  'window-state-get': z.tuple([z.enum(['main', 'floating', 'braindump'])]),
  'window-state-set': z.tuple([
    z.enum(['main', 'floating', 'braindump']),
    z
      .object({
        x: z.number().optional(),
        y: z.number().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        isMaximized: z.boolean().optional(),
        isFullScreen: z.boolean().optional(),
        isMinimized: z.boolean().optional(),
        alwaysOnTop: z.boolean().optional(),
        displayId: z.number().optional(),
        lastSaved: z.number().optional(),
      })
      .passthrough(),
  ]),
  'window-state-reset': z.tuple([z.enum(['main', 'floating', 'braindump'])]),
  'window-state-get-stats': z.tuple([]),
  'window-state-move-to-display': z.tuple([
    z.enum(['main', 'floating', 'braindump']),
    z.number(),
  ]),
  'window-state-snap-to-edge': z.tuple([
    z.enum(['main', 'floating', 'braindump']),
    z.enum([
      'left',
      'right',
      'top',
      'bottom',
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
      'maximize',
    ]),
  ]),
  'window-state-get-display': z.tuple([
    z.enum(['main', 'floating', 'braindump']),
  ]),
  'window-state-get-all-displays': z.tuple([]),

  // ──────────────────────────────────────────────────────────────────────────
  // BrainDump
  // ──────────────────────────────────────────────────────────────────────────
  'window-toggle-braindump': z.tuple([]),
  'braindump-window-toggle': z.tuple([]),
  'braindump-window-show': z.tuple([]),
  'braindump-window-hide': z.tuple([]),
  // Opacity is clamped in main; we only validate the bounded range here.
  'braindump-window-set-opacity': z.tuple([z.number().min(0).max(1)]),
  'braindump-window-get-opacity': z.tuple([]),
  'braindump-window-get-bounds': z.tuple([]),
  'braindump-window-set-bounds': z.tuple([
    z.object({
      // x/y can be negative on multi-monitor setups (left/above primary display).
      x: z.number().finite(),
      y: z.number().finite(),
      width: z
        .number()
        .min(BRAINDUMP_WINDOW_DIMENSION_MIN)
        .max(BRAINDUMP_WINDOW_DIMENSION_MAX),
      height: z
        .number()
        .min(BRAINDUMP_WINDOW_DIMENSION_MIN)
        .max(BRAINDUMP_WINDOW_DIMENSION_MAX),
    }),
  ]),

  'braindump-note-get': z.tuple([z.number().int().positive()]),
  // Cap text length to mirror the renderer textarea `maxLength`. A compromised
  // renderer cannot starve disk by sending megabytes of note text.
  'braindump-note-set': z.tuple([
    z.number().int().positive(),
    z.string().max(BRAINDUMP_NOTE_MAX_LENGTH),
  ]),

  'braindump-config-get-sync': z.tuple([]),
  'braindump-config-set-sync': z.tuple([z.boolean()]),
  'braindump-config-get-shortcut': z.tuple([]),
  'braindump-config-set-shortcut': z.tuple([
    z.string().max(BRAINDUMP_SHORTCUT_MAX_LENGTH),
  ]),
  'braindump-config-get-last-category': z.tuple([]),
  'braindump-config-set-last-category': z.tuple([z.number().int().positive()]),
}
