import dynamic from 'next/dynamic'
import React from 'react'

import { createCategory } from '@/actions/createCategory'
import { getAllCompleted } from '@/actions/getAllCompleted'
import { getCategories } from '@/actions/getCategories'
import { getCompletedCount } from '@/actions/getCompletedCount'
import { getLoginUser } from '@/actions/getLoginUser'
import { Spinner } from '@/components/Spinner'

import { CompletedView } from './CompletedView'
import { EditorView } from './EditorView'

const HeatmapView = dynamic(async () => import('./HeatmapView'), {
  ssr: false,
  loading: () => <Spinner />,
})

const Page = async () => {
  const user = await getLoginUser()

  const [completed, count, categories] = await Promise.all([
    getAllCompleted(user),
    getCompletedCount(user),
    getCategories(user.id),
  ])

  if (categories.length === 0) {
    const defaultCategory = await createCategory(user.id, 'General')
    categories.push(defaultCategory)
  }

  return (
    <div className="grid min-h-screen grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="h-[49vh]">
        <EditorView user={user} categories={categories} />
      </section>
      <section className="prose prose-xl grid h-[49vh] place-content-center rounded-md border border-neutral-content p-4">
        <h1>{count} EXP</h1>
      </section>
      <section className="prose prose-xl flex h-[48vh] flex-col items-center overflow-scroll rounded-md bg-neutral-content p-4">
        <CompletedView completedTasks={completed} />
      </section>
      <section className="grid h-[48vh] place-content-center overflow-scroll rounded-md border-neutral-content p-4">
        <HeatmapView />
      </section>
    </div>
  )
}

export default Page
