import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isProtectedRoute = createRouteMatcher([
  '/home(.*)',
  '/skill-tree(.*)',
  '/braindump(.*)',
])

const middleware = clerkMiddleware(async (auth, req) => {
  if (!isProtectedRoute(req)) {
    return
  }

  const { isAuthenticated } = await auth()

  if (!isAuthenticated) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('redirect_url', req.url)
    return NextResponse.redirect(loginUrl)
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
