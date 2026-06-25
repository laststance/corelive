'use client'

import { useTheme } from 'next-themes'
import * as React from 'react'
import type { ToasterProps } from 'sonner'
import { Toaster as Sonner } from 'sonner'

import { getThemeMode } from '@/lib/themes/registry'

function Toaster({ toastOptions, ...props }: ToasterProps) {
  const { theme } = useTheme()
  // Sonner accepts only 'light' | 'dark' | 'system'. next-themes returns the raw
  // stored data-theme id (today 'light'/'dark'; a future '*-dark' from T7), so
  // resolve it to the mode axis. Keep 'system'/undefined (pre-hydration) as
  // 'system' so Sonner tracks prefers-color-scheme until a theme is picked.
  const sonnerTheme: ToasterProps['theme'] =
    theme === undefined || theme === 'system' ? 'system' : getThemeMode(theme)

  return (
    <Sonner
      theme={sonnerTheme}
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as React.CSSProperties
      }
      // The close ✕ is a per-toast opt-in (`closeButton: true`), but its aria-label
      // is a Toaster-level setting in sonner v2 (not a per-toast option), so it
      // lives here. Only the BrainDump completion toast opts into the ✕ today, so
      // this label applies just to it (#109). A caller's own toastOptions win.
      toastOptions={{ closeButtonAriaLabel: 'Dismiss', ...toastOptions }}
      {...props}
    />
  )
}

export { Toaster }
