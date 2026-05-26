/**
 * @fileoverview Cold-boot "startup pill" markup for the Electron main process.
 *
 * Why this module exists: on a panel-only launch (`behavior.startup.showMain`
 * is false) there can be a sub-second-to-several-second gap with NO window on
 * screen — the main window is hidden and each panel stays hidden until its
 * auth-gated load resolves. To reassure the user the app is "waking up for
 * them" (never "is it broken?"), `WindowManager` shows a tiny always-on-top
 * pill during that gap. The pill paints instantly from memory because it is
 * loaded as a `data:` URL built here, NOT a packaged file: electron-builder's
 * `files` allowlist excludes the `electron/` TypeScript sources and there is no
 * renderer build pipeline, so a static `.html` asset would never ship. Inlining
 * the markup is
 * the only way to guarantee it is present and paints before any web content,
 * and it sidesteps the session CSP (which only applies to http(s) responses,
 * never `data:` documents).
 *
 * @module electron/startup-pill-html
 */

/**
 * Build the self-contained HTML document for the cold-boot startup pill; pure so
 * it unit-tests in isolation and inlines into a `data:text/html` URL via
 * `WindowManager.armStartupPill`. Carries its own DESIGN.md tokens (warm card,
 * amber ember dot, editorial serif), adapts to `prefers-color-scheme`, stays
 * non-interactive (`pointer-events:none`), and "breathes" the dot unless
 * `prefers-reduced-motion: reduce`.
 *
 * @returns A complete `<!doctype html>` string with all CSS inlined and ZERO
 *   network dependencies — fonts resolve from locally installed families
 *   (Newsreader if present, else Georgia), never a render-blocking web-font
 *   `<link>`, so the pill paints instantly even on an offline cold boot.
 * @example
 * const html = buildStartupPillHtml()
 * panel.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
 * // Renders: ( ● Opening CoreLive… ) as a warm floating pill.
 */
export function buildStartupPillHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        --pill-surface: oklch(0.98 0.008 70);
        --pill-foreground: oklch(0.18 0.015 30);
        --pill-border: oklch(0.92 0.01 70);
        --pill-ember: oklch(0.62 0.16 50);
        --pill-shadow: oklch(0.18 0.015 30 / 18%);
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --pill-surface: oklch(0.22 0.015 40);
          --pill-foreground: oklch(0.96 0.005 75);
          --pill-border: oklch(1 0 0 / 8%);
          --pill-ember: oklch(0.7 0.16 55);
          --pill-shadow: oklch(0 0 0 / 45%);
        }
      }
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      html,
      body {
        width: 100%;
        height: 100%;
        background: transparent;
        overflow: hidden;
        /* The pill floats over the desktop and must never intercept a click,
           a drag, or a text selection — it is a passive reassurance surface. */
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
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 12px 20px;
        background: var(--pill-surface);
        border: 1px solid var(--pill-border);
        /* Full radius = the badge/pill token from DESIGN.md. */
        border-radius: 9999px;
        box-shadow: 0 4px 14px var(--pill-shadow);
      }
      .dot {
        width: 9px;
        height: 9px;
        flex: none;
        border-radius: 9999px;
        background: var(--pill-ember);
        /* "Breathing" morning-light pulse — waking up, not an anxious spinner. */
        animation: breathe 1.8s ease-in-out infinite;
      }
      .label {
        /* Editorial serif (DESIGN.md), never a convergence sans. No web-font
           <link> on purpose: an external stylesheet is render-blocking in
           Chromium, so on a slow/offline cold boot the transparent window would
           show bare desktop until it loaded or timed out. Newsreader is used
           only if locally installed; otherwise Georgia paints instantly. */
        font-family: 'Newsreader', Georgia, 'Times New Roman', serif;
        font-size: 15px;
        font-weight: 500;
        line-height: 1;
        letter-spacing: 0.01em;
        white-space: nowrap;
        color: var(--pill-foreground);
      }
      @keyframes breathe {
        0%,
        100% {
          opacity: 0.4;
          transform: scale(0.85);
        }
        50% {
          opacity: 1;
          transform: scale(1);
        }
      }
      /* Honor the OS reduce-motion preference: hold the dot steady. */
      @media (prefers-reduced-motion: reduce) {
        .dot {
          animation: none;
          opacity: 1;
          transform: none;
        }
      }
    </style>
  </head>
  <body>
    <div class="pill" role="status" aria-live="polite">
      <span class="dot"></span>
      <span class="label">Opening CoreLive…</span>
    </div>
  </body>
</html>
`
}
