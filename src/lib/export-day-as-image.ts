/**
 * Type-only import keeps html-to-image out of the initial bundle while
 * still letting the lazy loader stay strongly typed against the module's
 * public API.
 */
import type * as HtmlToImage from 'html-to-image'

/**
 * Hardcoded sRGB palette mirroring the OKLCH design tokens in DESIGN.md.
 *
 * Why hardcoded RGB instead of CSS variables: html-to-image walks
 * computed styles and serializes them into a canvas pipeline. While
 * modern browsers resolve OKLCH to sRGB before painting, the canvas
 * bridge in html-to-image is not guaranteed to preserve P3 / OKLCH
 * fidelity on every Chromium build — share-image output drifting from
 * the live UI is a worse outcome than a slightly less saturated card,
 * so we lock the share-card colors at sRGB hex values that the user
 * can verify with a screenshot.
 *
 * Picked to visually match the Warm Cathedral light-mode tokens
 * (`--background`, `--foreground`, `--muted-foreground`, `--border`,
 * `--primary`) so the share card reads like a frame from the live app.
 */
const SHARE_COLORS = {
  background: '#fbf8f3',
  foreground: '#2c2520',
  mutedForeground: '#7e7368',
  border: '#e8e3dd',
  primary: '#c77843',
  card: '#fdfaf6',
} as const

/**
 * Input payload for {@link exportDayAsImage}. The share card displays a
 * single day's totals + top category — kept minimal so the image stays
 * scannable when shared on a mobile timeline.
 *
 * @example
 * exportDayAsImage({
 *   isoDate: '2026-05-12',
 *   totalCompleted: 8,
 *   topCategoryName: 'writing',
 * })
 */
export type ExportDayInput = {
  /** YYYY-MM-DD UTC date string the share card is anchored on. */
  isoDate: string
  /** Total completions on that day. */
  totalCompleted: number
  /**
   * Optional top-category name; omitted when the day has zero categorized
   * activity — the share card just shows the count + "shown up" line.
   */
  topCategoryName?: string | null
}

/**
 * Lazy reference to the html-to-image module so it is excluded from the
 * initial bundle. The dynamic import resolves on first capture only.
 */
let htmlToImagePromise: Promise<typeof HtmlToImage> | null = null

async function loadHtmlToImage(): Promise<typeof HtmlToImage> {
  if (!htmlToImagePromise) {
    // Stored as a module-level singleton so two rapid-fire captures
    // don't trigger two separate network round-trips to the chunk.
    htmlToImagePromise = import('html-to-image')
  }
  return htmlToImagePromise
}

/**
 * Renders the share card markup with hardcoded sRGB inline styles. Lives
 * as a string-building function (not a React component) so we don't
 * have to render it through React, mount/unmount via portal, and chase
 * layout-timing races inside html-to-image. The DOM node is appended
 * off-screen, captured, then removed in a finally block.
 *
 * @param input - Day payload for the share card
 * @returns
 * - Detached HTMLDivElement ready to be appended to document.body
 * @example
 * const node = buildShareCard({ isoDate: '2026-05-12', totalCompleted: 8 })
 * document.body.appendChild(node)
 */
function buildShareCard(input: ExportDayInput): HTMLDivElement {
  // Pretty-print the ISO date to a readable form. Use the user's locale
  // so the share card reads natural ("May 12, 2026" vs "12 May 2026")
  // — the share card is for the user, not a public feed.
  const prettyDate = new Date(
    `${input.isoDate}T00:00:00.000Z`,
  ).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const root = document.createElement('div')
  // Off-screen positioning keeps the card invisible to the live UI
  // while still being measurable + rendered by the browser. `aria-hidden`
  // tells AT to skip the temporary tree.
  root.setAttribute('aria-hidden', 'true')
  root.style.cssText = [
    'position: fixed',
    'top: -10000px',
    'left: -10000px',
    'width: 480px',
    'height: 600px',
    'padding: 48px',
    `background: ${SHARE_COLORS.background}`,
    `color: ${SHARE_COLORS.foreground}`,
    'font-family: "Inter Tight", system-ui, -apple-system, sans-serif',
    'display: flex',
    'flex-direction: column',
    'justify-content: space-between',
    'box-sizing: border-box',
    `border: 1px solid ${SHARE_COLORS.border}`,
    'border-radius: 16px',
  ].join('; ')

  root.innerHTML = `
    <div>
      <p style="font-family: 'Geist Mono', ui-monospace, monospace; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: ${SHARE_COLORS.mutedForeground}; margin: 0 0 24px 0;">
        corelive · ${escapeHtml(prettyDate)}
      </p>
      <p style="font-family: 'Newsreader', Georgia, serif; font-size: 64px; font-weight: 500; line-height: 1; margin: 0; color: ${SHARE_COLORS.foreground}; font-variant-numeric: tabular-nums;">
        ${input.totalCompleted}
      </p>
      <p style="font-family: 'Newsreader', Georgia, serif; font-size: 20px; font-style: italic; margin: 12px 0 0 0; color: ${SHARE_COLORS.mutedForeground};">
        ${input.totalCompleted === 1 ? 'thing done — a good day.' : 'things done — a good day.'}
      </p>
      ${
        input.topCategoryName
          ? `<p style="font-family: 'Inter Tight', sans-serif; font-size: 14px; margin: 28px 0 0 0; color: ${SHARE_COLORS.foreground};">
              mostly <span style="color: ${SHARE_COLORS.primary}; font-weight: 500;">${escapeHtml(input.topCategoryName)}</span>.
            </p>`
          : ''
      }
    </div>
    <div style="border-top: 1px solid ${SHARE_COLORS.border}; padding-top: 16px;">
      <p style="font-family: 'Newsreader', Georgia, serif; font-size: 13px; font-style: italic; margin: 0; color: ${SHARE_COLORS.mutedForeground};">
        the cathedral remembers.
      </p>
    </div>
  `

  return root
}

/**
 * Escapes user-supplied strings before they are spliced into the share
 * card's innerHTML. Category names come from user input via the
 * category-create flow so a raw `<script>` value MUST not execute when
 * the card renders — even briefly off-screen.
 *
 * @param value - Untrusted text from a category name
 * @returns
 * - HTML-entity-encoded copy safe for innerHTML splicing
 * @example
 * escapeHtml('<b>writing</b>') // => "&lt;b&gt;writing&lt;/b&gt;"
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Exports the given day's stats as a PNG data URL. Dynamic-imports
 * html-to-image on first call so the dependency is excluded from the
 * initial bundle. The share card uses hardcoded sRGB hex colors (NOT
 * OKLCH tokens) so html-to-image's canvas pipeline produces an output
 * that exactly matches what the user sees in the off-screen card.
 *
 * The temporary DOM node is removed in a `finally` so a thrown error
 * inside `toPng` does not leak the off-screen card into the live DOM.
 *
 * Browser-only — calling on the server throws a clear error rather than
 * silently returning an empty data URL.
 *
 * @param input - Day payload (date + totals + optional top category)
 * @returns
 * - PNG data URL (`data:image/png;base64,…`)
 * @throws
 * - When called server-side (no `document`)
 * - When html-to-image fails to capture (rare; e.g. tainted canvas)
 * @example
 * const dataUrl = await exportDayAsImage({
 *   isoDate: '2026-05-12',
 *   totalCompleted: 8,
 *   topCategoryName: 'writing',
 * })
 * const a = document.createElement('a')
 * a.href = dataUrl
 * a.download = 'corelive-2026-05-12.png'
 * a.click()
 */
export async function exportDayAsImage(input: ExportDayInput): Promise<string> {
  if (typeof document === 'undefined') {
    throw new Error(
      'exportDayAsImage is browser-only — call from a client component.',
    )
  }

  const { toPng } = await loadHtmlToImage()
  const node = buildShareCard(input)
  document.body.appendChild(node)
  try {
    return await toPng(node, {
      // The card already has a hardcoded background; passing it again
      // tells html-to-image to fill the canvas BEFORE drawing the node,
      // which avoids transparent pixels at the rounded-corner edges.
      backgroundColor: SHARE_COLORS.background,
      // 2× capture so the resulting PNG looks crisp on retina + 4K.
      pixelRatio: 2,
      // Width / height matched to the card's flex container.
      width: 480,
      height: 600,
      cacheBust: true,
    })
  } finally {
    node.remove()
  }
}
