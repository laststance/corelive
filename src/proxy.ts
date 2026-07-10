import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isProtectedRoute = createRouteMatcher([
  '/home(.*)',
  '/skill-tree(.*)',
  '/braindump(.*)',
  // /settings is web-reachable (D15) but still requires auth like the rest of
  // the app — the settings it edits belong to a signed-in user's experience.
  '/settings(.*)',
  // NOTE: /floating-navigator is intentionally NOT protected. The Electron
  // companion renders a signed-out "front door" card on this route so the
  // Floating window stays visible + interactive while signed out, and Clerk
  // re-renders it in place after a native OAuth sign-in — there is no main
  // window to surface and no /login redirect to detect. A signed-out web
  // visitor reaching /floating-navigator (a browser tab, not the Electron
  // panel) just sees the existing "desktop app only" notice — the card is
  // Electron-only.
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
