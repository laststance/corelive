import type { Metadata } from 'next'

import { TodoList } from './_components/TodoList'

export const metadata: Metadata = {
  title: 'Home',
}

export default function Home() {
  return (
    <div className="bg-background min-h-screen">
      <div className="container mx-auto h-screen max-w-7xl px-4 py-8">
        <div className="flex h-full flex-col">
          <TodoList />
        </div>
      </div>
    </div>
  )
}
