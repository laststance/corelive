import { describe, it, expect } from 'vitest'

import { cn } from './utils'

describe('cn utility function', () => {
  it('should merge class names correctly', () => {
    const result = cn('px-2 py-1', 'p-3')
    expect(result).toBe('p-3')
  })

  it('should handle conditional classes', () => {
    // Note: false && 'text-xl' evaluates to false, which clsx ignores
    // true && 'text-lg' evaluates to 'text-lg', which is included
    // tailwind-merge will merge text-base and text-lg since they're the same type
    const condition1 = true
    const condition2 = false
    const result = cn(
      'font-bold',
      condition1 && 'text-lg',
      condition2 && 'text-xl',
    )
    expect(result).toBe('font-bold text-lg')
  })

  it('should handle falsy conditional with merge', () => {
    // eslint-disable-next-line no-constant-binary-expression
    const result = cn('text-base', false && 'text-lg')
    expect(result).toBe('text-base')
  })

  it('should handle array of classes', () => {
    const result = cn(['text-base', 'font-bold'])
    expect(result).toBe('text-base font-bold')
  })

  it('should handle object syntax', () => {
    const result = cn({
      'text-base': true,
      'text-lg': false,
      'font-bold': true,
    })
    expect(result).toBe('text-base font-bold')
  })

  it('should handle undefined and null values', () => {
    const result = cn('text-base', undefined, null, 'font-bold')
    expect(result).toBe('text-base font-bold')
  })

  it('should merge Tailwind classes intelligently', () => {
    const result = cn('bg-red-500 px-2 py-1', 'bg-blue-500 p-3')
    expect(result).toBe('bg-blue-500 p-3')
  })

  it('should handle complex class merging', () => {
    const result = cn(
      'text-left text-lg text-black',
      'text-center text-white',
      'text-xl',
    )
    expect(result).toBe('text-center text-white text-xl')
  })

  it('should handle empty input', () => {
    const result = cn()
    expect(result).toBe('')
  })

  it('should handle custom class names with Tailwind classes', () => {
    const result = cn('custom-class', 'text-lg', 'custom-class-2')
    expect(result).toBe('custom-class text-lg custom-class-2')
  })

  it('should deduplicate identical classes', () => {
    const result = cn('text-lg', 'text-lg', 'font-bold', 'font-bold')
    expect(result).toBe('text-lg font-bold')
  })
})
