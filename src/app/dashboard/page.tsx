import { auth, clerkClient } from '@clerk/nextjs/server'
import dynamic from 'next/dynamic'
import React from 'react'

import { CompletedView } from './CompletedView'
import { EditorView } from './EditorView'

const HeatmapView = dynamic(async () => import('./HeatmapView'), {
  ssr: false,
  loading: () => <span className="loading loading-spinner loading-lg"></span>,
})

const Page = async () => {
  const { userId } = auth().protect()

  const user = await clerkClient.users.getUser(userId)
  if (!user) return null

  return (
    <div className="grid min-h-screen grid-cols-2 gap-4">
      <section className="h-[49vh]">
        <EditorView />
      </section>
      <section className="prose prose-xl prose-slate h-[49vh] rounded-md bg-neutral-content p-4"></section>
      <section className="prose prose-xl prose-slate flex h-[48vh] flex-col items-center rounded-md bg-neutral-content p-4">
        <CompletedView />
      </section>
      <section className="grid h-[48vh] place-content-center rounded-md border-neutral-content p-4">
        <HeatmapView />
      </section>
    </div>
  )
}

export default Page
