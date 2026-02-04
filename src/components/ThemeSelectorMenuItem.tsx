'use client'

import { Palette, Check } from 'lucide-react'
import { useTheme } from 'next-themes'

import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { THEMES, THEME_META } from '@/providers/ThemeProvider'

/**
 * Theme selector as a dropdown submenu item.
 * Displays available themes with preview colors and active state.
 * @returns Dropdown submenu for theme selection
 */
export function ThemeSelectorMenuItem() {
  const { theme, setTheme } = useTheme()

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Palette className="mr-2 h-4 w-4" />
        <span className="text-sm">Change Theme</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="w-40">
          {THEMES.map((themeId) => {
            const { name, preview } = THEME_META[themeId]
            const isActive = theme === themeId

            return (
              <DropdownMenuItem
                key={themeId}
                onClick={() => setTheme(themeId)}
                className={cn('cursor-pointer gap-2', isActive && 'bg-accent')}
              >
                <div
                  className="h-3 w-3 rounded-full border"
                  style={{ backgroundColor: preview }}
                />
                <span className="flex-1">{name}</span>
                {isActive && <Check className="h-3 w-3" />}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  )
}
