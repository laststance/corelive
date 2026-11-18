import Link from 'next/link'

import { Flex } from '@/components/flex'
import { Button } from '@/components/ui/button'

function DashboardLandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 px-6 py-8 text-center">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          CoreLive Dashboard
        </h1>
        <p className="text-muted-foreground">
          Revisit the tasks you finish in CoreLive for Mac and see how they add
          up.
        </p>
      </div>
      <Flex className="justify-center gap-4">
        <Button asChild>
          <Link href="/login">Sign in</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/sign-up">Create account</Link>
        </Button>
      </Flex>
    </main>
  )
}

export default DashboardLandingPage
