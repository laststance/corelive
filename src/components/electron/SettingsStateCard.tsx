'use client'

/**
 * @fileoverview Shared status-card scaffold for the Electron Settings page.
 *
 * The Startup / Floating / BrainDump settings cards each render the SAME small
 * header-only Card in three non-interactive states — desktop-app-only, an
 * "update CoreLive" version-skew notice, and a loading placeholder. This extracts
 * that repeated `<Card><CardHeader>` scaffold so the three components stay in
 * lockstep (one icon + title + one-line description) and their degraded/loading
 * copy renders identically instead of drifting apart per component.
 *
 * @module components/electron/SettingsStateCard
 */
import type { LucideIcon } from 'lucide-react'
import { type ReactElement } from 'react'

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface SettingsStateCardProps {
  /** Lucide icon shown beside the title (the same glyph the live card uses). */
  icon: LucideIcon
  /** Card title — the feature name (e.g. "On launch", "BrainDump Note"). */
  title: string
  /** One-line status message (desktop-only / update-prompt / loading). */
  description: string
  /** Forwarded to the Card so the parent keeps control of outer spacing. */
  className?: string
}

/**
 * Header-only settings Card for a non-interactive state (desktop-only,
 * version-skew update prompt, or loading). Extracted from the three Electron
 * settings cards so their degraded/loading states render identically and the
 * copy stays consistent. Purely presentational — the parent still owns the
 * guard logic that decides WHICH state to show; this only draws it.
 *
 * @param props - icon, title, description, and optional className
 * @returns A Card with an icon + title header and a one-line description
 * @example
 * <SettingsStateCard icon={Sunrise} title="On launch" description="Loading startup window settings…" />
 */
export const SettingsStateCard = function SettingsStateCard({
  icon: Icon,
  title,
  description,
  className,
}: SettingsStateCardProps): ReactElement {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  )
}

export default SettingsStateCard
