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
    <div>
      <h1>Hello World</h1>
      <a href="/sign-in">Sign In</a>
    </div>
  )
}
