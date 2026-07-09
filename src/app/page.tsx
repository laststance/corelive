import type { Metadata } from 'next'
import Link from 'next/link'

import { Flex } from '@/components/flex'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: {
    template: '%s | CoreLive',
    default: 'CoreLive',
  },
  description: 'Personal Todo navigator for you.',
}

function Home() {
  return (
    <div className="container mx-auto min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <Flex className="min-h-[calc(100vh-4rem)] flex-col items-center justify-center">
        <div className="flex justify-center gap-4">
          <Button asChild>
            <Link href="/login">Login</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/sign-up">Sign Up</Link>
          </Button>
        </div>
      </Flex>
    </div>
  )
}

export default Home
