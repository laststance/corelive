'use client'

import { Palette, Check } from 'lucide-react'
import { useTheme } from 'next-themes'
import React from 'react'

import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { THEME_METADATA } from '@/providers/ThemeProvider'

/**
 * Theme selector as a dropdown menu item
 * Designed to be integrated within existing dropdown menus
 */
export function ThemeSelectorMenuItem() {
  const { theme, setTheme } = useTheme()

  const defaultThemes = ['light', 'dark']

  const renderThemeItem = (themeId: string) => {
    const themeData = THEME_METADATA[themeId]
    if (!themeData) return null

    const isActive = theme === themeId

    return (
      <DropdownMenuItem
        key={themeId}
        onClick={() => setTheme(themeId)}
        className={cn('cursor-pointer gap-2', isActive && 'bg-accent')}
      >
        <div
          className="h-3 w-3 rounded-full border"
          style={{ backgroundColor: themeData.preview }}
        />
        <span className="flex-1">{themeData.name}</span>
        {isActive && <Check className="h-3 w-3" />}
      </DropdownMenuItem>
    )
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Palette className="mr-2 h-4 w-4" />
        <span className="text-sm">Change Theme</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="max-h-96 w-48 overflow-y-auto">
          {defaultThemes.map(renderThemeItem)}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  )
}
