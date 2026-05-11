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
    // The `.catch` resets the cache so a transient network failure
    // (offline blip, cancelled chunk fetch) doesn't permanently break
    // share-image capture for the rest of the session — a rejected
    // promise is still truthy, so without this every retry would
    // re-throw the cached rejection instead of attempting the import.
    htmlToImagePromise = import('html-to-image').catch((error: unknown) => {
      htmlToImagePromise = null
      throw error
    })
  }
  return htmlToImagePromise
}

/**
 * Renders the share card markup with hardcoded sRGB inline styles. Lives
 * as a string-building function (not a React component) so we don't
 * have to render it through React, mount/unmount via portal, and chase
 * layout-timing races inside html-to-image.
 *
 * Returns BOTH the clipping wrapper and the inner card because of how
 * html-to-image works: it clones the captured node, copies its computed
 * style via `cssText`, and renders it inside an SVG `<foreignObject>`.
 * That means ANY hiding style on the captured node (off-screen `top`,
 * `opacity: 0`, `visibility: hidden`, `transform: translate`, etc.)
 * propagates to the clone and produces a blank PNG.
 *
 * The fix: leave the card itself completely "visible" (no hiding styles
 * at all) and put it inside a 0×0 `overflow: hidden` wrapper. The
 * wrapper clips the card visually so the user never sees it flash on
 * screen, but the card keeps its full 480×600 computed dimensions and
 * solid colors — exactly what html-to-image needs to capture content.
 *
 * Pass the inner `card` (NOT the wrapper) to `toPng`, append the wrapper
 * to `document.body`, and remove the wrapper in a `finally` block.
 *
 * @param input - Day payload for the share card
 * @returns
 * - `wrapper` — 0×0 clipping container to append to document.body
 * - `card` — the 480×600 share card to pass into `toPng`
 * @example
 * const { wrapper, card } = buildShareCard({ isoDate: '2026-05-12', totalCompleted: 8 })
 * document.body.appendChild(wrapper)
 * try { dataUrl = await toPng(card, ...) } finally { wrapper.remove() }
 */
export function buildShareCard(input: ExportDayInput): {
  wrapper: HTMLDivElement
  card: HTMLDivElement
} {
  // Pretty-print the ISO date to a readable form. Use the user's locale
  // so the share card reads natural ("May 12, 2026" vs "12 May 2026")
  // — the share card is for the user, not a public feed.
  //
  // `timeZone: 'UTC'` mirrors `DayDetailDialog`'s `formatDate` so the
  // exported card shows the same calendar day as the dialog. Without it,
  // a user in UTC-8 sees "April 30, 2026" on the share card for an
  // `isoDate` of `2026-05-01` because `toLocaleDateString` defaults to
  // local TZ and the constructed Date is UTC midnight.
  const prettyDate = new Date(
    `${input.isoDate}T00:00:00.000Z`,
  ).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })

  // Clipping wrapper: 0×0 fixed at the viewport origin with overflow
  // hidden so the card inside doesn't paint anything visible to the
  // user, but the card's own layout (width: 480, height: 600) stays
  // intact. `position: fixed` removes the wrapper from document flow
  // so it doesn't push surrounding content — 0×0 + overflow:hidden
  // keeps the wrapper invisible regardless of containing block, so a
  // transformed/filtered ancestor re-anchoring `fixed` doesn't matter.
  //
  // CRITICAL: hiding styles MUST live on the wrapper, NOT the card.
  // html-to-image's `cloneCSSStyle` copies the captured node's
  // `cssText` onto the clone — any hiding style on the card itself
  // (top: -10000px / opacity: 0 / visibility: hidden) propagates into
  // the SVG foreignObject and produces a blank PNG.
  const wrapper = document.createElement('div')
  wrapper.setAttribute('aria-hidden', 'true')
  wrapper.style.cssText = [
    'position: fixed',
    'top: 0',
    'left: 0',
    'width: 0',
    'height: 0',
    'overflow: hidden',
    'pointer-events: none',
    'z-index: -1',
  ].join('; ')

  // Card: visible at full 480×600 with the hardcoded sRGB palette.
  // No `position` / `top` / `opacity` / `visibility` — those would
  // propagate to the html-to-image clone and break capture. Default
  // `position: static` keeps the card flowing inside the wrapper's
  // clipped box.
  const card = document.createElement('div')
  card.style.cssText = [
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

  card.innerHTML = `
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

  wrapper.appendChild(card)
  return { wrapper, card }
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
  const { wrapper, card } = buildShareCard(input)
  document.body.appendChild(wrapper)
  try {
    // Pass the inner `card` (NOT the wrapper). html-to-image clones the
    // node, copies its computed style via `cssText`, and renders it in a
    // SVG `<foreignObject>` — the card's solid dimensions/colors are
    // what produces visible pixels. The wrapper exists only to hide the
    // card from the user; html-to-image never sees the wrapper.
    return await toPng(card, {
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
    wrapper.remove()
  }
}
