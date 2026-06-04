import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isProtectedRoute = createRouteMatcher([
  '/home(.*)',
  '/skill-tree(.*)',
  '/braindump(.*)',
  // /settings is web-reachable (D15) but still requires auth like the rest of
  // the app — the preferences it edits belong to a signed-in user's experience.
  '/settings(.*)',
  // Floating Navigator must redirect to /login like the other panels so the
  // Electron main-process nav-watch can detect an unauthenticated cold boot
  // and surface the main window instead of an empty panel.
  '/floating-navigator(.*)',
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
