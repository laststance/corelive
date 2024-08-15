import dynamic from 'next/dynamic'
import React from 'react'

import { getAllCompleted } from '@/actions/getAllCompleted'
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
  const [completedList, count] = await Promise.all([
    getAllCompleted(user),
    getCompletedCount(user),
  ])

  return (
    <div className="grid min-h-screen grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="h-[49vh]">
        <EditorView user={user} />
      </section>
      <section className="prose prose-xl grid h-[49vh] place-content-center rounded-md border border-neutral-content p-4">
        <h1>{count} EXP</h1>
      </section>
      <section className="prose prose-xl flex h-[48vh] flex-col items-center overflow-scroll rounded-md bg-neutral-content p-4">
        <CompletedView completedList={completedList} />
      </section>
      <section className="grid h-[48vh] place-content-center overflow-scroll rounded-md border-neutral-content p-4">
        <HeatmapView />
      </section>
    </div>
  )
}

export default Page
