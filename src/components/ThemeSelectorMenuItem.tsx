'use client'

import { Palette, Check } from 'lucide-react'

import { ThemePreviewSwatch } from '@/components/ThemePreviewSwatch'
import { MODE_META } from '@/components/ThemeSelector'
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu'
import {
  useThemeAxis,
  THEME_MODE_CHOICES,
  type ThemeModeChoice,
} from '@/hooks/useThemeAxis'
import { getThemePreview } from '@/lib/themes/preview'
import { getThemeId, type ThemeFamilyId } from '@/lib/themes/registry'
import { cn } from '@/lib/utils'

/**
 * Sidebar quick-switch: the same two axes as the Settings picker, compacted into a
 * dropdown submenu — a Mode row (Light / Dark, plus System for Warm Cathedral) and
 * a Palette list whose rows carry a mini composite preview (no single hex dot).
 * Switching a family preserves the current mode; both flow through `useThemeAxis`.
 * @returns the "Change Theme" submenu for the user dropdown.
 * @example
 * <DropdownMenuContent><ThemeSelectorMenuItem /></DropdownMenuContent>
 */
export const ThemeSelectorMenuItem = function ThemeSelectorMenuItem() {
  const {
    family,
    mode,
    resolvedMode,
    availableModes,
    families,
    setFamily,
    setMode,
  } = useThemeAxis()

  // Stable per-item handlers — the lint rule bans inline onClick closures, and the
  // complete key sets (all modes / all families) keep the Record casts honest.
  const modeHandlers = Object.fromEntries(
    THEME_MODE_CHOICES.map((modeChoice) => [
      modeChoice,
      () => setMode(modeChoice),
    ]),
  ) as Record<ThemeModeChoice, () => void>

  const familyHandlers = Object.fromEntries(
    families.map(({ family: familyId }) => [
      familyId,
      () => setFamily(familyId),
    ]),
  ) as Record<ThemeFamilyId, () => void>

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Palette className="mr-2 h-4 w-4" />
        <span className="text-sm">Change Theme</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="w-56">
          {/* Mode axis */}
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Mode
          </DropdownMenuLabel>
          {availableModes.map((modeChoice) => {
            const { label, Icon } = MODE_META[modeChoice]
            const isActive = modeChoice === mode
            return (
              <DropdownMenuItem
                key={modeChoice}
                onClick={modeHandlers[modeChoice]}
                className={cn('cursor-pointer gap-2', isActive && 'bg-accent')}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{label}</span>
                {isActive && <Check className="h-4 w-4" />}
              </DropdownMenuItem>
            )
          })}

          <DropdownMenuSeparator />

          {/* Family axis — each row previews the family at the current mode. */}
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Palette
          </DropdownMenuLabel>
          {families.map(({ family: familyId, label }) => {
            const isActive = familyId === family
            return (
              <DropdownMenuItem
                key={familyId}
                onClick={familyHandlers[familyId]}
                className={cn('cursor-pointer gap-2', isActive && 'bg-accent')}
              >
                <ThemePreviewSwatch
                  preview={getThemePreview(getThemeId(familyId, resolvedMode))}
                  className="h-5 w-8 shrink-0"
                />

                <span className="flex-1">{label}</span>
                {isActive && <Check className="h-4 w-4" />}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  )
}
