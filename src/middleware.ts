import { clerkMiddleware } from '@clerk/nextjs/server'

export default clerkMiddleware({
  afterSignInUrl: '/dashboard',
  afterSignUpUrl: '/dashboard',
})

export const config = {
  matcher: ['/((?!.+.[w]+$|_next).*)', '/', '/(api|trpc)(.*)'],
}
