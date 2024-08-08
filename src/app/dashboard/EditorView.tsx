'use client'

import dynamic from 'next/dynamic'
import React, { useEffect } from 'react'
import { match } from 'ts-pattern'

import { createCategory } from '@/actions/createCategory'
import { getCategories } from '@/actions/getCategories'
import { getLoginUser } from '@/actions/getLoginUser'
import { TodoEditor } from '@/components/TodoEditor'
import { cn } from '@/lib/utils'
import {
  selectCurrentCategory,
  selectEditorMode,
  setCategories,
} from '@/redux/categorySlice'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { setUser } from '@/redux/userSlice'

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

interface Props {}

export const EditorView: React.FC<Props> = () => {
  const dispatch = useAppDispatch()
  const editorMode = useAppSelector(selectEditorMode)
  const currentCategory = useAppSelector(selectCurrentCategory)
  useEffect(() => {
    dispatch({ type: 'Emit/InitializeListener' })
    const fetchUserAndCategories = async () => {
      const user = await getLoginUser()
      const categories = await getCategories(user.id)
      if (categories.length === 0) {
        const defaultCategory = await createCategory(user.id, currentCategory)
        categories.push(defaultCategory)
      }
      dispatch(setUser(user))
      dispatch(setCategories(categories))
    }
    fetchUserAndCategories()
  }, [])

  return match(editorMode)
    .with('Simple', () => (
      <SimpleEditor className="h-full w-full max-w-xl text-xl" />
    ))
    .with('Todo', () => <TodoEditor />)
    .exhaustive()
}
