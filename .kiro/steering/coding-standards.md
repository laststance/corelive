---
inclusion: fileMatch
fileMatchPattern: ['*.ts', '*.tsx', '*.js', '*.jsx']
---

# Coding Standards

## TypeScript Standards

### Type Safety

- Use strict TypeScript configuration
- **NEVER** use `any` type - prefer `unknown` for uncertain types
- Use proper type annotations for function parameters and return types
- Leverage TypeScript's type inference when obvious
- Use proper generic constraints with `extends`

### Interface and Type Definitions

- Use interfaces for object shapes that might be extended
- Use type aliases for unions, intersections, and computed types
- Export types and interfaces for reuse across modules
- Name interfaces with descriptive names (avoid generic names like `Props`)

```typescript
// Good
interface UserProfileProps {
  user: User
  onEdit: (userId: string) => void
}

// Bad
interface Props {
  user: any
  onEdit: Function
}
```

## React Standards

### Component Definition

- Use functional components with TypeScript
- Define prop types with interfaces
- Use React.FC sparingly, prefer direct function definitions
- Export components as default exports

```typescript
interface UserCardProps {
  user: User
  className?: string
}

const UserCard: React.FC<UserCardProps> = ({ user, className }) => {
  // Component implementation
}

export default UserCard
```

### Hooks Usage

- Follow Rules of Hooks consistently
- Use custom hooks for shared stateful logic
- Prefer `useCallback` and `useMemo` for performance optimization
- Use proper dependency arrays in effect hooks

### Event Handling

- Use proper TypeScript event types
- Handle events with descriptive function names
- Prefer arrow functions for inline handlers

```typescript
const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
  event.preventDefault()
  // Handle form submission
}
```

## Next.js App Router Standards

### Server vs Client Components

- Use `'use client'` directive **only** at the boundary component for client-side tree
- Use `'use server'` for files that must only run on the server
- Prefer server components when possible for better performance
- Use client components for interactivity and browser APIs

### Route Handlers

- Place API routes in appropriate `route.ts` files
- Use proper HTTP methods and status codes
- Handle errors gracefully with appropriate responses
- Validate request data with Zod schemas

## Code Quality

### ESLint and Prettier

- Adhere strictly to the project's ESLint configuration
- Use Prettier for consistent code formatting
- Fix linting errors before committing
- **Only** fix TypeScript errors in code that is valid JavaScript and runs correctly at runtime

### Naming Conventions

- Use PascalCase for components and classes
- Use camelCase for variables, functions, and methods
- Use SCREAMING_SNAKE_CASE for constants
- Use descriptive and meaningful names

### Import Organization

```typescript
// 1. External libraries
import React from 'react'
import { NextResponse } from 'next/server'

// 2. Internal modules (absolute imports with @/)
import { Button } from '@/components/ui/button'
import { env } from '@/env.mjs'

// 3. Relative imports
import './styles.css'
```

### Error Handling

- Use proper error boundaries in React
- Handle async operations with try-catch blocks
- Log errors appropriately for debugging
- Provide meaningful error messages to users

### Performance

- Use React.memo for expensive component re-renders
- Implement proper loading states
- Use Suspense boundaries for data fetching
- Optimize images with Next.js Image component

## Code Comments

- **ALL** code comments, documentation, and inline explanations must be written in **English** as per [.cursor/language.mdc](mdc:.cursor/language.mdc)
- Write JSDoc comments for public APIs
- Explain complex business logic with inline comments
- Avoid obvious comments that don't add value
