import type { Metadata } from 'next'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: {
    template: '%s | Corelive',
    default: 'Corelive',
  },
  description: 'Personal Task navigator for you.',
}

export default function Home() {
  return (
    <div className="container mx-auto min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl lg:text-5xl">
            Hello World
          </h1>
          <div className="flex justify-center gap-4">
            <Button asChild>
              <Link href="/login">Login</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/sign-up">Sign Up</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
