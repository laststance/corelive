'use client'

import { MODE_META } from '@corelive/live-editor/ui/ThemeSelector'
import { Palette } from 'lucide-react'

import { ThemePreviewSwatch } from '@/components/ThemePreviewSwatch'
import {
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'
import { useThemeAxis } from '@/hooks/useThemeAxis'
import { getThemePreview } from '@/lib/themes/preview'
import { getThemeId } from '@/lib/themes/registry'

/**
 * Sidebar quick-switch: the same two axes as the Settings picker, compacted into a
 * dropdown submenu — a Mode row (Light / Dark, plus System for Default) and
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
    selectMode,
    selectFamily,
  } = useThemeAxis()

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
          <DropdownMenuRadioGroup value={mode} onValueChange={selectMode}>
            {availableModes.map((modeChoice) => {
              const { label, Icon } = MODE_META[modeChoice]
              return (
                <DropdownMenuRadioItem
                  key={modeChoice}
                  value={modeChoice}
                  className="cursor-pointer"
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1">{label}</span>
                </DropdownMenuRadioItem>
              )
            })}
          </DropdownMenuRadioGroup>

          <DropdownMenuSeparator />

          {/* Family axis — each row previews the family at the current mode. */}
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Palette
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup value={family} onValueChange={selectFamily}>
            {families.map(({ family: familyId, label }) => (
              <DropdownMenuRadioItem
                key={familyId}
                value={familyId}
                className="cursor-pointer"
              >
                <ThemePreviewSwatch
                  preview={getThemePreview(getThemeId(familyId, resolvedMode))}
                  className="h-5 w-8 shrink-0"
                />
                <span className="flex-1">{label}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  )
}
