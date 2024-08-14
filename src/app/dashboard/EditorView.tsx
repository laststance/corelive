'use client'

import dynamic from 'next/dynamic'
import React from 'react'

import { cn } from '@/lib/utils'
import { selectEditorMode } from '@/redux/editorSlice'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { setUser } from '@/redux/userSlice'
import type { User } from '@/types/prisma'

const SimpleEditor = dynamic(
  async () => import('@/app/dashboard/SimpleEditor'),
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

interface Props {
  user: User
}

export const EditorView: React.FC<Props> = ({ user }) => {
  const dispatch = useAppDispatch()
  dispatch(setUser(user))

  return <SimpleEditor className="h-full w-full max-w-xl text-xl" />
}
