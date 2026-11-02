/**
 * @fileoverview Self-contained auto-update download progress markup.
 *
 * Why this module exists: the update download runs in Electron main process
 * while the app may be minimized, offline-ish, or away from authenticated web
 * routes. A native `data:` window paints immediately and keeps the user aware
 * of progress without depending on Next.js, Clerk, or the network.
 *
 * The window paints the user's theme (#214) from the generated
 * {@link THEME_TOKENS} map, because a `data:` document never sees the
 * renderer's `data-theme` attribute or its CSS cascade.
 *
 * @module electron/update-progress-window-html
 */

import type { UpdaterDownloadProgress } from '@corelive/desktop-contract/ipc'
import { THEME_TOKENS } from '@corelive/live-editor/theme-tokens'
import {
  normalizeThemePreference,
  THEME_REGISTRY,
  type ThemeId,
} from '@corelive/live-editor/themes'

/** The five theme tokens the HUD paints with (shadcn Popover + Progress semantics). */
const HUD_THEME_TOKENS = [
  '--popover',
  '--popover-foreground',
  '--muted-foreground',
  '--border',
  '--primary',
] as const

/**
 * Renders one theme's HUD token block: its `color-scheme` plus the five
 * {@link HUD_THEME_TOKENS}. Scoped to `.panel` (not `:root`) so the transparent
 * window's root canvas never gets a color-scheme-adjusted background.
 * @param themeId - A concrete registered theme.
 * @param indent - Leading spaces of the selector line inside the `<style>`.
 * @returns the `.panel { ... }` CSS block.
 * @example
 * renderHudTokenBlock('cathedral-light', 6)
 * // => "      .panel {\n        color-scheme: light;\n        --popover: oklch(0.972 0.018 78);\n…      }"
 */
function renderHudTokenBlock(themeId: ThemeId, indent: number): string {
  const tokens = THEME_TOKENS[themeId]
  const outer = ' '.repeat(indent)
  const inner = ' '.repeat(indent + 2)
  const declarations = [
    `color-scheme: ${THEME_REGISTRY[themeId].colorScheme};`,
    ...HUD_THEME_TOKENS.map((token) => `${token}: ${tokens[token]};`),
  ]
  return `${outer}.panel {\n${declarations.map((line) => `${inner}${line}`).join('\n')}\n${outer}}`
}

/**
 * Emits the HUD's theme CSS for a normalized preference. `system` paints the
 * Default pair: light by default and dark under `prefers-color-scheme: dark`,
 * so it keeps following the OS while shown; a concrete theme paints only its own
 * tokens and ignores the OS, as the app does. Module-private: the builder is its
 * only caller, and tests read its output through {@link buildUpdateProgressWindowHtml}.
 * @param preference - Output of `normalizeThemePreference` (never a raw stored value).
 * @returns the token CSS placed at the top of the window `<style>`.
 * @example
 * buildUpdateProgressThemeCss('system') // => ".panel {…light…}\n@media (prefers-color-scheme: dark) { .panel {…dark…} }"
 */
function buildUpdateProgressThemeCss(preference: ThemeId | 'system'): string {
  // An explicit pick is not OS-managed: one block, no media query.
  if (preference !== 'system') return renderHudTokenBlock(preference, 6)
  return `${renderHudTokenBlock('light', 6)}
      @media (prefers-color-scheme: dark) {
${renderHudTokenBlock('dark', 8)}
      }`
}

/**
 * Build the native update-progress window HTML shown while an app update downloads.
 * Called by `AutoUpdater` once per HUD, with the theme preference read at creation.
 * Only the normalized preference selects a {@link THEME_TOKENS} entry; the raw
 * stored string is never written into the document.
 * @param progress - Normalized 0-100 download progress payload.
 * @param themePreference - Raw stored desktop theme (`'system'`, a theme id, a legacy
 *   alias, or anything else); missing or unknown values paint the Default pair following the OS.
 * @returns Complete offline-safe HTML for a transparent data-url BrowserWindow.
 * @example
 * buildUpdateProgressWindowHtml({ percent: 42, bytesPerSecond: 1, transferred: 2, total: 4 })
 * // => Default light/dark HUD following the OS
 * buildUpdateProgressWindowHtml({ percent: 42, bytesPerSecond: 1, transferred: 2, total: 4 }, 'harbor-dark')
 * // => Harbor dark HUD
 */
export function buildUpdateProgressWindowHtml(
  progress: UpdaterDownloadProgress,
  themePreference?: string,
): string {
  const percent = Math.round(progress.percent)
  const themeCss = buildUpdateProgressThemeCss(
    normalizeThemePreference(themePreference),
  )

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
${themeCss}
      * {
        box-sizing: border-box;
      }
      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: transparent;
        user-select: none;
        -webkit-user-select: none;
        pointer-events: none;
        -webkit-app-region: no-drag;
        cursor: default;
      }
      body {
        display: flex;
        align-items: center;
        justify-content: center;
        font-family:
          -apple-system,
          BlinkMacSystemFont,
          'Segoe UI',
          sans-serif;
      }
      .panel {
        width: 320px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px 18px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: var(--popover);
        box-shadow: 0 10px 28px
          light-dark(oklch(0 0 0 / 18%), oklch(0 0 0 / 45%));
      }
      .row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
      }
      .label {
        color: var(--popover-foreground);
        font-size: 14px;
        font-weight: 600;
        line-height: 1.2;
      }
      .percent {
        color: var(--muted-foreground);
        font-family:
          ui-monospace,
          SFMono-Regular,
          Menlo,
          monospace;
        font-size: 13px;
        font-variant-numeric: tabular-nums;
        line-height: 1.2;
      }
      .track {
        height: 8px;
        width: 100%;
        overflow: hidden;
        border-radius: 9999px;
        background: color-mix(in oklch, var(--primary) 20%, transparent);
      }
      .fill {
        height: 100%;
        width: var(--progress-percent);
        border-radius: inherit;
        background: var(--primary);
        transition: width 160ms ease-out;
      }
      .hint {
        color: var(--muted-foreground);
        font-size: 12px;
        line-height: 1.2;
      }
      @media (prefers-reduced-motion: reduce) {
        .fill {
          transition: none;
        }
      }
    </style>
  </head>
  <body>
    <section class="panel" aria-live="polite">
      <div class="row">
        <div class="label">Downloading CoreLive update...</div>
        <div class="percent" id="percent">${percent}%</div>
      </div>
      <div
        class="track"
        role="progressbar"
        aria-label="Update download progress"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow="${percent}"
      >
        <div class="fill" id="fill" style="--progress-percent: ${percent}%"></div>
      </div>
      <div class="hint">You can keep working while this finishes.</div>
    </section>
    <script>
      window.__coreliveSetUpdateProgress = function setUpdateProgress(nextPercent) {
        var safePercent = Math.max(0, Math.min(100, Math.round(Number(nextPercent) || 0)));
        var percent = document.getElementById('percent');
        var fill = document.getElementById('fill');
        var progressbar = document.querySelector('[role="progressbar"]');
        if (percent) percent.textContent = safePercent + '%';
        if (fill) fill.style.setProperty('--progress-percent', safePercent + '%');
        if (progressbar) progressbar.setAttribute('aria-valuenow', String(safePercent));
      };
    </script>
  </body>
</html>
`
}

/**
 * Build the script that updates an already-loaded native progress window.
 * @param progress - Normalized 0-100 download progress payload.
 * @returns JavaScript string safe to pass to `webContents.executeJavaScript`.
 * @example
 * buildUpdateProgressWindowUpdateScript({ percent: 75, bytesPerSecond: 1, transferred: 3, total: 4 })
 */
export function buildUpdateProgressWindowUpdateScript(
  progress: UpdaterDownloadProgress,
): string {
  return `window.__coreliveSetUpdateProgress?.(${JSON.stringify(
    Math.round(progress.percent),
  )})`
}
