'use client'

import dynamic from 'next/dynamic'
import React from 'react'
import { match } from 'ts-pattern'

import { PlateEditor } from '@/components/PlateEditor'
import { useIsFirstRender } from '@/hooks/useIsFirstRender'
import { cn } from '@/lib/utils'
import { selectEditorMode } from '@/redux/editorSlice'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'

export const SimpleEditor = dynamic(
  async () => import('@/components/SimpleEditor'),
  {
    ssr: false,
    loading: () => (
      <div
        className={cn(
          `textarea textarea-bordered textarea-lg flex h-full w-full max-w-xs flex-col gap-4`,
          'mt-8 h-[calc(100%-4rem)] w-full max-w-xl text-xl',
        )}
      >
        <div className="skeleton h-32 w-full"></div>
        <div className="skeleton h-4 w-28"></div>
        <div className="skeleton h-4 w-full"></div>
        <div className="skeleton h-4 w-full"></div>
        <div className="skeleton h-4 w-28"></div>
        <div className="skeleton h-4 w-full"></div>
        <div className="skeleton h-4 w-full"></div>
      </div>
    ),
  },
)

interface Props {}

export const EditorView: React.FC<Props> = () => {
  const dispatch = useAppDispatch()
  const firstRender = useIsFirstRender()
  const editorMode = useAppSelector(selectEditorMode)

  if (firstRender) {
    dispatch({ type: 'Run/InitListener' })
  }

  return match(editorMode)
    .with('Simple', () => (
      <SimpleEditor className="mt-8 h-[calc(100%-4rem)] w-full max-w-xl text-xl" />
    ))
    .with('Plate', () => <PlateEditor className="mt-8 flex items-center" />)
    .exhaustive()
}
