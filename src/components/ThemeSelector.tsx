'use client'

import { Check, Monitor, Moon, Sun } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { memo, useCallback } from 'react'

import { ThemePreviewSwatch } from '@/components/ThemePreviewSwatch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
 * current mode. System is offered only for the default Warm Cathedral family
 * (design Fork A — colored families are explicit choices). Picks flow through
 * `useThemeAxis`, which maps the (family, mode) pair to a stored theme id.
 * @returns the Settings "Theme" section.
 * @example
 * <ThemeSelector />
 */
export const ThemeSelector = memo(function ThemeSelector() {
  const {
    family,
    mode,
    resolvedMode,
    availableModes,
    families,
    setFamily,
    setMode,
    mounted,
  } = useThemeAxis()

  const handleModeChange = useCallback(
    (value: string): void => {
      // ToggleGroup emits '' when the active item is re-clicked; ignore that so a
      // mode stays selected, and only react to a mode the active family offers.
      const next = availableModes.find((modeChoice) => modeChoice === value)
      if (next) setMode(next)
    },
    [availableModes, setMode],
  )

  const handleFamilyChange = useCallback(
    (value: string): void => {
      const next = families.find((option) => option.family === value)
      if (next) setFamily(next.family)
    },
    [families, setFamily],
  )

  return (
    <div className="space-y-4 p-4">
      <Card className="border-0 bg-transparent shadow-none">
        <CardHeader className="px-2 pb-2 pt-0">
          <CardTitle className="text-lg">Theme</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-2">
          {/* Hold a same-height placeholder until next-themes hydrates, so the
              selected state never flashes from the default to the stored theme. */}
          {!mounted ? (
            <div
              aria-hidden
              className="bg-muted/50 h-48 animate-pulse rounded-md"
            />
          ) : (
            <>
              {/* Mode axis — Light / Dark, plus System for Warm Cathedral only. */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Mode</Label>
                <ToggleGroup
                  type="single"
                  value={mode}
                  onValueChange={handleModeChange}
                  className="justify-start gap-2"
                  aria-label="Theme mode"
                >
                  {availableModes.map((modeChoice) => {
                    const { label, Icon } = MODE_META[modeChoice]
                    return (
                      <ToggleGroupItem
                        key={modeChoice}
                        value={modeChoice}
                        aria-label={label}
                        data-testid={`theme-mode-${modeChoice}`}
                        className="gap-1.5"
                      >
                        <Icon className="size-4" />
                        <span className="text-sm">{label}</span>
                      </ToggleGroupItem>
                    )
                  })}
                </ToggleGroup>
              </div>

              {/* Family axis — each card previews the family at the current mode. */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Palette</Label>
                <RadioGroup
                  value={family}
                  onValueChange={handleFamilyChange}
                  className="grid grid-cols-2 gap-3 sm:grid-cols-3"
                >
                  {families.map(({ family: familyId, label }) => {
                    const previewId = getThemeId(familyId, resolvedMode)
                    const isActive = familyId === family
                    return (
                      <Label
                        key={familyId}
                        htmlFor={`theme-family-${familyId}`}
                        data-testid={`theme-family-card-${familyId}`}
                        className="relative cursor-pointer"
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
                            'hover:bg-accent/50 flex flex-col gap-2 rounded-lg border p-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2',
                            isActive && 'border-primary ring-2 ring-primary',
                          )}
                        >
                          <ThemePreviewSwatch
                            preview={getThemePreview(previewId)}
                            className="h-12 w-full"
                          />
                          <span className="flex items-center justify-between text-sm font-medium">
                            {label}
                            {isActive && (
                              <Check className="size-4 text-primary" />
                            )}
                          </span>
                        </div>
                      </Label>
                    )
                  })}
                </RadioGroup>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
})
