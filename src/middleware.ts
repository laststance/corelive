import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { env } from '@/env.mjs'

const isProtectedRoute = createRouteMatcher(['/home(.*)'])

// When mocking is enabled we bypass Clerk completely to avoid JWT parsing
const middleware =
  env.NEXT_PUBLIC_ENABLE_MSW_MOCK === 'true'
    ? async () => NextResponse.next()
    : clerkMiddleware(async (auth, req) => {
        if (isProtectedRoute(req)) {
          await auth.protect()
        }
      })

export default middleware

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
