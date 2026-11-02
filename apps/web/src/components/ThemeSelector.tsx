'use client'

import { Check, Monitor, Moon, Sun } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { ThemePreviewSwatch } from '@/components/ThemePreviewSwatch'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useThemeAxis } from '@/hooks/useThemeAxis'
import type { ThemeModeChoice } from '@/hooks/useThemeAxis'
import { getThemePreview } from '@/lib/themes/preview'
import { getThemeId } from '@/lib/themes/registry'
import { cn } from '@/lib/utils'

/** Label + icon for each mode-axis option (shared with the sidebar quick-switch). */
export const MODE_META: Record<
  ThemeModeChoice,
  { label: string; Icon: LucideIcon }
> = {
  light: { label: 'Light', Icon: Sun },
  dark: { label: 'Dark', Icon: Moon },
  system: { label: 'System', Icon: Monitor },
}

/**
 * Two-axis theme picker for the Settings page: a mode toggle (Light / Dark /
 * System) plus a family grid whose cards preview each family's real tokens at the
 * current mode. System is offered only for the Default family (design Fork A —
 * every other family, Warm Cathedral included, is an explicit choice); while a
 * non-Default palette is active a helper line explains how to follow the device
 * setting. Picks flow through `useThemeAxis`, which maps the (family, mode) pair
 * to a stored theme id.
 * @returns the Settings "Theme" section.
 * @example
 * <ThemeSelector />
 */
export const ThemeSelector = function ThemeSelector() {
  const {
    family,
    mode,
    resolvedMode,
    availableModes,
    families,
    selectMode,
    selectFamily,
    mounted,
  } = useThemeAxis()

  // System only exists for Default, so every other palette gets the helper line.
  const showSystemHint = family !== 'default'

  return (
    // The "Theme" CardTitle collapsed into the APPEARANCE section `<h2>`
    // (design-review flatten); this renders bare under that header.
    <div className="@container space-y-8">
      {/* Reserve approximate space until next-themes hydrates, so the selected
           state never flashes from the default to the stored theme. The height
           is a close estimate, not an exact match for the loaded picker. */}
      {!mounted ? (
        <div
          aria-hidden
          className="bg-muted/50 h-48 animate-pulse rounded-md"
        />
      ) : (
        <>
          {/* Mode axis — Light / Dark, plus System for the Default family only. */}
          <div className="space-y-3">
            <Label className="settings-label">Mode</Label>
            <ToggleGroup
              type="single"
              value={mode}
              onValueChange={selectMode}
              className="w-full flex-wrap justify-start gap-2"
              aria-label="Theme mode"
              aria-describedby={
                showSystemHint ? 'theme-mode-system-hint' : undefined
              }
            >
              {availableModes.map((modeChoice) => {
                const { label, Icon } = MODE_META[modeChoice]
                return (
                  <ToggleGroupItem
                    key={modeChoice}
                    value={modeChoice}
                    aria-label={label}
                    data-testid={`theme-mode-${modeChoice}`}
                    className="min-h-11 gap-1.5"
                  >
                    <Icon className="size-4" />
                    <span className="text-sm">{label}</span>
                  </ToggleGroupItem>
                )
              })}
            </ToggleGroup>
            {/* Non-Default palettes have no System mode; say where it lives. */}
            {showSystemHint && (
              <p
                id="theme-mode-system-hint"
                className="type-small text-muted-foreground"
              >
                To follow your device&apos;s light or dark setting, choose the
                Default palette.
              </p>
            )}
          </div>

          {/* Family axis — each card previews the family at the current mode. */}
          <div className="space-y-3">
            <Label className="settings-label">Palette</Label>
            <RadioGroup
              value={family}
              onValueChange={selectFamily}
              aria-label="Theme palette"
              className="settings-theme-grid auto-rows-fr gap-3"
            >
              {families.map(({ family: familyId, label }) => {
                const previewId = getThemeId(familyId, resolvedMode)
                const isActive = familyId === family
                return (
                  <Label
                    key={familyId}
                    htmlFor={`theme-family-${familyId}`}
                    data-testid={`theme-family-card-${familyId}`}
                    className="relative block h-full min-w-0 cursor-pointer"
                  >
                    {/* sr-only radio is the `peer`; the card below shows its
                           keyboard focus via peer-focus-visible (standard variant,
                           so it stays token-only / dslint-clean). */}
                    <RadioGroupItem
                      id={`theme-family-${familyId}`}
                      value={familyId}
                      className="peer sr-only"
                    />

                    <div
                      className={cn(
                        'hover:bg-accent/50 flex h-full w-full min-w-0 flex-col gap-2 rounded-lg border p-3 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 motion-reduce:transition-none',
                        isActive && 'border-primary ring-2 ring-primary',
                      )}
                    >
                      <ThemePreviewSwatch
                        preview={getThemePreview(previewId)}
                        className="h-12 w-full"
                      />

                      <span className="type-body flex min-h-10 items-center justify-between gap-1 font-medium leading-5">
                        <span className="min-w-0 break-words">{label}</span>
                        <span className="size-4 shrink-0">
                          {isActive && (
                            <Check className="size-4 text-primary" />
                          )}
                        </span>
                      </span>
                    </div>
                  </Label>
                )
              })}
            </RadioGroup>
          </div>
        </>
      )}
    </div>
  )
}
