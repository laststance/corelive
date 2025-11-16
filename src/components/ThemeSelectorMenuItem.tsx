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

  // Group themes by free/premium for the menu
  const defaultThemes = ['light', 'dark']
  const coreliveBases = ['corelive-base-light', 'corelive-base-dark']
  const traditionalThemes = ['traditional-light', 'traditional-dark']

  const harmonizedThemes = [
    'harmonized-red',
    'harmonized-mustard',
    'harmonized-turquoise',
    'harmonized-azure',
    'harmonized-fuchsia',
    'harmonized-red-dark',
    'harmonized-mustard-dark',
    'harmonized-turquoise-dark',
    'harmonized-azure-dark',
    'harmonized-fuchsia-dark',
  ]

  const premiumThemes = [
    'dark-midnight',
    'dark-charcoal',
    'light-pearl',
    'light-snow',
    'gradient-aurora',
    'gradient-sunset',
    'retro-synthwave',
    'retro-terminal',
    'seasonal-spring-blossom',
    'seasonal-winter-snow',
  ]

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
          {/* Default shadcn/ui Themes */}
          <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
            Default
          </div>
          {defaultThemes.map(renderThemeItem)}

          {/* CoreLive Base Themes */}
          <div className="mt-2 border-t px-2 py-1 pt-2 text-xs font-medium text-muted-foreground">
            CoreLive Base
          </div>
          {coreliveBases.map(renderThemeItem)}

          {/* Traditional TODO Themes */}
          <div className="mt-2 border-t px-2 py-1 pt-2 text-xs font-medium text-muted-foreground">
            Traditional TODO
          </div>
          {traditionalThemes.map(renderThemeItem)}

          {/* Harmonized Themes */}
          <div className="mt-2 border-t px-2 py-1 pt-2 text-xs font-medium text-muted-foreground">
            Harmonized Palette
          </div>
          {harmonizedThemes.map(renderThemeItem)}

          {/* Premium Themes */}
          <div className="mt-2 border-t px-2 py-1 pt-2 text-xs font-medium text-muted-foreground">
            Premium Themes ✨
          </div>
          {premiumThemes.map(renderThemeItem)}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  )
}
