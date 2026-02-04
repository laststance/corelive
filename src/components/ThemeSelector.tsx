'use client'

import { Check, Palette } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { THEMES, THEME_META } from '@/providers/ThemeProvider'

interface ThemeSelectorProps {
  align?: 'start' | 'center' | 'end'
  className?: string
}

/**
 * Standalone theme selector dropdown button.
 * Use ThemeSelectorMenuItem for embedding in existing dropdowns.
 * @param align - Dropdown alignment
 * @param className - Additional CSS classes
 */
export function ThemeSelector({
  align = 'end',
  className,
}: ThemeSelectorProps) {
  const { theme, setTheme } = useTheme()
  const [isOpen, setIsOpen] = useState(false)

  const currentMeta = theme
    ? THEME_META[theme as keyof typeof THEME_META]
    : null

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('gap-2', className)}
          data-slot="theme-selector-trigger"
        >
          <Palette className="h-4 w-4" />
          <span className="hidden sm:inline">
            {currentMeta?.name || 'Select Theme'}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className="w-48"
        data-slot="theme-selector-content"
      >
        <DropdownMenuLabel>Select Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {THEMES.map((themeId) => {
          const { name, preview } = THEME_META[themeId]
          const isActive = theme === themeId

          return (
            <DropdownMenuItem
              key={themeId}
              onClick={() => {
                setTheme(themeId)
                setIsOpen(false)
              }}
              className={cn('cursor-pointer gap-2', isActive && 'bg-accent')}
            >
              <div
                className="h-4 w-4 rounded-full border"
                style={{ backgroundColor: preview }}
              />
              <span className="flex-1">{name}</span>
              {isActive && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Compact theme selector using native select element.
 * @param className - Additional CSS classes
 */
export function ThemeSelectorCompact({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()

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
      {THEMES.map((themeId) => (
        <option key={themeId} value={themeId}>
          {THEME_META[themeId].name}
        </option>
      ))}
    </select>
  )
}
