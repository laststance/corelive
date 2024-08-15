'use client'

import dynamic from 'next/dynamic'
import React from 'react'

import { Skeleton } from '@/components/Skeleton'
import { useAppDispatch } from '@/redux/hooks'
import { setUser } from '@/redux/userSlice'
import type { User } from '@/types/prisma'

const SimpleEditor = dynamic(
  async () => import('@/app/dashboard/SimpleEditor'),
  {
    ssr: false,
    loading: () => <Skeleton />,
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
