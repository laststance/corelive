'use client'

import React from 'react'
import { match } from 'ts-pattern'

import { PlateEditor } from '@/components/PlateEditor'
import { SimpleEditor } from '@/components/SimpleEditor'
import { selectEditorMode } from '@/redux/editorSlice'
import { useAppSelector } from '@/redux/hooks'

interface Props {}

export const EditorView: React.FC<Props> = () => {
  const editorMode = useAppSelector(selectEditorMode)

  return match(editorMode)
    .with('Simple', () => (
      <SimpleEditor className="mt-8 h-[calc(100%-4rem)] w-full max-w-xl text-xl" />
    ))
    .with('Plate', () => <PlateEditor className="mt-8 flex items-center" />)
    .exhaustive()
}
