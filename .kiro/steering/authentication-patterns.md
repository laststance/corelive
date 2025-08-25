---
inclusion: manual
---

# Authentication Patterns

## Clerk Integration

This project uses [Clerk](https://clerk.com) for authentication and user management.

### Setup and Configuration

#### Environment Variables

Authentication configuration is managed in [src/env.mjs](mdc:src/env.mjs):

- `CLERK_SECRET_KEY` - Server-side secret key
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Client-side publishable key
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL` - Sign-in page URL
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL` - Sign-up page URL
- `WEBHOOK_SECRET` - For Clerk webhooks

#### Root Layout Provider

The `ClerkProvider` is configured in [src/app/layout.tsx](mdc:src/app/layout.tsx):

```typescript
import { ClerkProvider } from '@clerk/nextjs'

const RootLayout: React.FC<RootLayoutProps> = ({ children }) => {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className={cn('mx-auto min-h-screen antialiased')}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
```

### Middleware Protection

Protected routes are defined in [src/middleware.ts](mdc:src/middleware.ts):

```typescript
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isProtectedRoute = createRouteMatcher(['/dashboard(.*)'])

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) await auth.protect()
})
```

### Authentication Routes

#### Sign-in/Sign-up Pages

- Sign-in: `src/app/sign-in/[[...sign-in]]/page.tsx`
- Sign-up: `src/app/sign-up/[[...sign-up]]/page.tsx`

Use Clerk's built-in components:

```typescript
import { SignIn, SignUp } from '@clerk/nextjs'

export default function SignInPage() {
  return <SignIn />
}
```

### User Data Management

#### Database User Model

User data is stored in PostgreSQL via Prisma schema [prisma/schema.prisma](mdc:prisma/schema.prisma):

```prisma
model User {
  id        Int         @id @default(autoincrement())
  clerkId   String      @unique
  email     String?     @unique
  name      String?
  bio       String?
  categories Category[]
  completed Completed[]
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
}
```

#### User Synchronization

Handle user creation/updates through Clerk webhooks in [src/app/api/webhooks/route.ts](mdc:src/app/api/webhooks/route.ts).

### Authentication Hooks and Utilities

#### Client-Side Authentication

```typescript
import { useUser, useAuth, useClerk } from '@clerk/nextjs'

// Get current user information
const { user, isLoaded, isSignedIn } = useUser()

// Get authentication state
const { userId, sessionId, getToken } = useAuth()

// Get Clerk instance for sign out
const { signOut } = useClerk()
```

#### Server-Side Authentication

```typescript
import { auth } from '@clerk/nextjs/server'

// In API routes or server components
export async function GET() {
  const { userId } = await auth()

  if (!userId) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Handle authenticated request
}
```

### Component Patterns

#### Protected Components

```typescript
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export default async function ProtectedPage() {
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  // Render protected content
}
```

#### Sign Out Component

Example from [src/components/SignoutButton.tsx](mdc:src/components/SignoutButton.tsx):

```typescript
'use client'

import { useClerk } from '@clerk/nextjs'

const SignOutButton: React.FC<SignOutButtonProps> = ({ className }) => {
  const { signOut } = useClerk()

  return (
    <button
      onClick={() => signOut()}
      className={cn('sign-out-button-styles', className)}
    >
      Sign Out
    </button>
  )
}
```

## Security Best Practices

### Route Protection

- Use `clerkMiddleware` for route-level protection
- Implement server-side auth checks in API routes
- Validate user permissions for sensitive operations

### Data Access Control

- Always verify user ownership of resources
- Use Clerk's `userId` for database queries
- Implement proper authorization checks

### Environment Security

- Never expose secret keys in client-side code
- Use server-side environment variables for sensitive data
- Validate webhook signatures for security

### Session Management

- Clerk handles session management automatically
- Use `getToken()` for API authentication
- Implement proper token validation in API routes

## Error Handling

### Authentication Errors

```typescript
try {
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')
} catch (error) {
  // Log authentication error
  console.error('Authentication failed:', error)
  return new Response('Authentication required', { status: 401 })
}
```

### User Data Errors

```typescript
try {
  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
  })
  if (!user) throw new Error('User not found')
} catch (error) {
  // Handle user data errors
  console.error('User data error:', error)
  return new Response('User not found', { status: 404 })
}
```
