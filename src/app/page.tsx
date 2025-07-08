import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    template: '%s | Corelive',
    default: 'Corelive',
  },
  description: 'Task navigator for you.',
}

export default function Home() {
  return (
    <div className="container mx-auto min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl lg:text-5xl">
            Hello World
          </h1>
          <div className="mt-8">
            <a
              href="/sign-in"
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
            >
              Sign In
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
