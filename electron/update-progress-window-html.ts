/**
 * @fileoverview Self-contained auto-update download progress markup.
 *
 * Why this module exists: the update download runs in Electron main process
 * while the app may be minimized, offline-ish, or away from authenticated web
 * routes. A native `data:` window paints immediately and keeps the user aware
 * of progress without depending on Next.js, Clerk, or the network.
 *
 * @module electron/update-progress-window-html
 */

import type { UpdaterDownloadProgress } from './types/ipc'

/**
 * Build the native update-progress window HTML shown while an app update downloads.
 * @param progress - Normalized 0-100 download progress payload.
 * @returns Complete offline-safe HTML for a transparent data-url BrowserWindow.
 * @example
 * buildUpdateProgressWindowHtml({ percent: 42, bytesPerSecond: 1, transferred: 2, total: 4 })
 */
export function buildUpdateProgressWindowHtml(
  progress: UpdaterDownloadProgress,
): string {
  const percent = Math.round(progress.percent)

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        --surface: oklch(0.98 0.008 70 / 96%);
        --foreground: oklch(0.18 0.015 30);
        --muted: oklch(0.5 0.026 56);
        --border: oklch(0.92 0.01 70);
        --track: oklch(0.88 0.018 74);
        --fill: oklch(0.56 0.16 50);
        --shadow: oklch(0.18 0.015 30 / 20%);
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --surface: oklch(0.22 0.015 40 / 96%);
          --foreground: oklch(0.96 0.005 75);
          --muted: oklch(0.74 0.026 66);
          --border: oklch(1 0 0 / 8%);
          --track: oklch(1 0 0 / 12%);
          --fill: oklch(0.7 0.16 55);
          --shadow: oklch(0 0 0 / 45%);
        }
      }
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
          'Inter Tight',
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
        background: var(--surface);
        box-shadow: 0 10px 28px var(--shadow);
        backdrop-filter: blur(18px);
      }
      .row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
      }
      .label {
        color: var(--foreground);
        font-size: 14px;
        font-weight: 600;
        line-height: 1.2;
      }
      .percent {
        color: var(--muted);
        font-family:
          'Geist Mono',
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
        background: var(--track);
      }
      .fill {
        height: 100%;
        width: var(--progress-percent);
        border-radius: inherit;
        background: var(--fill);
        transition: width 160ms ease-out;
      }
      .hint {
        color: var(--muted);
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
