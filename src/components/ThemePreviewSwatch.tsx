import { memo } from 'react'

import type { ThemePreview } from '@/lib/themes/preview'
import { cn } from '@/lib/utils'

interface ThemePreviewSwatchProps {
  /** The composite swatches to render, from `getThemePreview(id)`. */
  preview: ThemePreview
  /** Sizing/spacing overrides from the caller (Settings grid vs sidebar mini). */
  className?: string
}

/**
 * Renders a theme's identity as a composite chip — its surface, a raised panel
 * with the accent + a text sample, and the 5-stop heatmap ramp — entirely from the
 * derived OKLCH tokens (the design's "multi-swatch preview, no single hex dot").
 * Shared by the two-axis Settings picker and the sidebar quick-switch. Decorative
 * (`aria-hidden`): the adjacent family label is the accessible choice.
 * @param preview - Swatches from {@link getThemePreview}.
 * @param className - Caller sizing (e.g. a fixed height/width).
 * @returns the preview chip.
 * @example
 * <ThemePreviewSwatch preview={getThemePreview('harbor-dark')} className="h-12 w-full" />
 */
export const ThemePreviewSwatch = memo(function ThemePreviewSwatch({
  preview,
  className,
}: ThemePreviewSwatchProps) {
  return (
    <div
      aria-hidden
      className={cn(
        'flex flex-col overflow-hidden rounded-md border',
        className,
      )}
      style={{ backgroundColor: preview.surface }}
    >
      {/* Raised panel (60% height): accent dot, a card-tone bar, a text-tone line.
          Percentage heights (not fixed px) let the same chip scale from the sidebar
          mini (~20px) to the Settings card (~48px) without overflow. */}
      <div className="flex h-3/5 items-center gap-1 px-1.5">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: preview.accent }}
        />
        <span
          className="h-1 flex-1 rounded-full"
          style={{ backgroundColor: preview.card }}
        />
        <span
          className="h-1 w-1/4 rounded-full"
          style={{ backgroundColor: preview.text }}
        />
      </div>
      {/* Heatmap ramp (40% height) — rest→warm-apex, the app's signature gradient. */}
      <div className="flex h-2/5 w-full">
        {preview.heatmap.map((color) => (
          <span
            key={color}
            className="flex-1"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
  )
})
