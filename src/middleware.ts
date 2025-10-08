import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isProtectedRoute = createRouteMatcher(['/home(.*)'])

const middleware = clerkMiddleware(async (auth, req) => {
  // Skip auth protection in E2E test mode
  // This allows E2E tests to access protected routes with mock authentication
  if (process.env.E2E_TEST_MODE === 'true') {
    return
  }

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
