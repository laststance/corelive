'use client'

import { Check, Palette, Sparkles, Lock } from 'lucide-react'
import { useTheme } from 'next-themes'
import React, { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useThemeContext } from '@/providers/ThemeProvider'

interface ThemeSelectorProps {
  align?: 'start' | 'center' | 'end'
  className?: string
}

/**
 * ThemeSelector component for switching between different themes
 * Shows themes organized by category with preview colors
 */
export function ThemeSelector({
  align = 'end',
  className,
}: ThemeSelectorProps) {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const { categories, metadata } = useThemeContext()
  const [isOpen, setIsOpen] = useState(false)

  // Group themes by category
  const themesByCategory = {
    'Free Themes': {
      themes: categories.FREE,
      icon: Palette,
    },
    'Premium Dark': {
      themes: categories.PREMIUM_DARK,
      icon: Sparkles,
    },
    'Premium Light': {
      themes: categories.PREMIUM_LIGHT,
      icon: Sparkles,
    },
    'Premium Gradient': {
      themes: categories.PREMIUM_GRADIENT,
      icon: Sparkles,
    },
    'Premium Retro': {
      themes: categories.PREMIUM_RETRO,
      icon: Sparkles,
    },
    'Premium Seasonal': {
      themes: categories.PREMIUM_SEASONAL,
      icon: Sparkles,
    },
  }

  const currentThemeData = theme ? metadata[theme] : null

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('gap-2', className)}
          data-slot="theme-selector-trigger"
          aria-label="Select theme"
        >
          <Palette className="h-4 w-4" />
          <span className="hidden sm:inline">
            {currentThemeData?.name || 'Select Theme'}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className="w-80"
        data-slot="theme-selector-content"
      >
        <DropdownMenuLabel className="flex items-center gap-2">
          <Palette className="h-4 w-4" />
          Select Theme
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="h-[400px]">
          {Object.entries(themesByCategory).map(([categoryName, category]) => {
            const hasThemes = category.themes.some((t) => metadata[t])
            if (!hasThemes && categoryName !== 'Free Themes') return null

            const Icon = category.icon

            return (
              <div key={categoryName} className="mb-2">
                <DropdownMenuLabel className="flex items-center gap-2 text-xs opacity-60">
                  <Icon className="h-3 w-3" />
                  {categoryName}
                </DropdownMenuLabel>
                {category.themes.map((themeId) => {
                  const themeData = metadata[themeId]
                  if (!themeData) {
                    // Theme not yet implemented
                    return (
                      <DropdownMenuItem
                        key={themeId}
                        disabled
                        className="cursor-not-allowed opacity-40"
                      >
                        <div className="flex w-full items-center gap-2">
                          <Lock className="h-3 w-3" />
                          <span className="text-sm">{themeId}</span>
                          <span className="ml-auto text-xs opacity-60">
                            Coming Soon
                          </span>
                        </div>
                      </DropdownMenuItem>
                    )
                  }

                  const isActive = theme === themeId

                  return (
                    <DropdownMenuItem
                      key={themeId}
                      onClick={() => {
                        setTheme(themeId)
                        setIsOpen(false)
                      }}
                      className={cn('cursor-pointer', isActive && 'bg-accent')}
                    >
                      <div className="flex w-full items-center gap-3">
                        {/* Theme preview color */}
                        <div
                          className="h-4 w-4 rounded-full border"
                          style={{ backgroundColor: themeData.preview }}
                        />

                        {/* Theme name and description */}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {themeData.name}
                            </span>
                            {themeData.isPremium && (
                              <Sparkles className="h-3 w-3 text-yellow-500" />
                            )}
                          </div>
                          {themeData.description && (
                            <span className="text-xs opacity-60">
                              {themeData.description}
                            </span>
                          )}
                        </div>

                        {/* Active indicator */}
                        {isActive && (
                          <Check className="ml-auto h-4 w-4 text-primary" />
                        )}
                      </div>
                    </DropdownMenuItem>
                  )
                })}
                {categoryName !== 'Premium Seasonal' && (
                  <DropdownMenuSeparator />
                )}
              </div>
            )
          })}
        </ScrollArea>
        <DropdownMenuSeparator />
        <div className="p-2 text-xs text-muted-foreground">
          <p>
            Current theme: <strong>{currentThemeData?.name || theme}</strong>
          </p>
          <p>
            System preference: <strong>{resolvedTheme}</strong>
          </p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Compact theme selector for use in smaller spaces
 */
export function ThemeSelectorCompact({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const { themes, metadata } = useThemeContext()

  return (
    <select
      value={theme}
      onChange={(e) => setTheme(e.target.value)}
      className={cn(
        'h-8 rounded-md border border-input bg-background px-3 text-sm',
        className,
      )}
      data-slot="theme-selector-compact"
    >
      {themes.map((themeId) => {
        const themeData = metadata[themeId]
        return (
          <option key={themeId} value={themeId}>
            {themeData?.name || themeId}
          </option>
        )
      })}
    </select>
  )
}
