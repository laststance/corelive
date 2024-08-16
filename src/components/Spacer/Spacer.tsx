import React from 'react'

namespace Spacer {
  export type Props = {
    /**
     * The size of the space
     *
     * h-6xs: h-1 (4px)
     *
     * h-5xs: h-2 (8px)
     *
     * h-4xs: h-4 (16px)
     *
     * h-3xs: h-8 (32px)
     *
     * h-2xs: h-12 (48px)
     *
     * h-xs: h-16 (64px)
     *
     * h-sm: h-20 (80px)
     *
     * h-md: h-24 (96px)
     *
     * h-lg: h-28 (112px)
     *
     * h-xl: h-32 (128px)
     *
     * h-2xl: h-36 (144px)
     *
     * h-3xl: h-40 (160px)
     *
     * h-4xl: h-44 (176px)
     *
     * w-6xs: w-1 (4px)
     *
     * w-5xs: w-2 (8px)
     *
     * w-4xs: w-4 (16px)
     *
     * w-3xs: w-8 (32px)
     *
     * w-2xs: w-12 (48px)
     *
     * w-xs: w-16 (64px)
     *
     * w-sm: w-20 (80px)
     *
     * w-md: w-24 (96px)
     *
     * w-lg: w-28 (112px)
     *
     * w-xl: w-32 (128px)
     *
     * w-2xl: w-36 (144px)
     *
     * w-3xl: w-40 (160px)
     *
     * w-4xl: w-44 (176px)
     */
    size:
      | 'h-6xs'
      | 'h-5xs'
      | 'h-4xs'
      | 'h-3xs'
      | 'h-2xs'
      | 'h-xs'
      | 'h-sm'
      | 'h-md'
      | 'h-lg'
      | 'h-xl'
      | 'h-2xl'
      | 'h-3xl'
      | 'h-4xl'
      | 'w-6xs'
      | 'w-5xs'
      | 'w-4xs'
      | 'w-3xs'
      | 'w-2xs'
      | 'w-xs'
      | 'w-sm'
      | 'w-md'
      | 'w-lg'
      | 'w-xl'
      | 'w-2xl'
      | 'w-3xl'
      | 'w-4xl'
  }
}

export const Spacer = function Spacer({ size }: Spacer.Props) {
  const options = {
    'h-6xs': 'h-1',
    'h-5xs': 'h-2',
    'h-4xs': 'h-4',
    'h-3xs': 'h-8',
    'h-2xs': 'h-12',
    'h-xs': 'h-16',
    'h-sm': 'h-20',
    'h-md': 'h-24',
    'h-lg': 'h-28',
    'h-xl': 'h-32',
    'h-2xl': 'h-36',
    'h-3xl': 'h-40',
    'h-4xl': 'h-44',
    'w-6xs': 'w-1',
    'w-5xs': 'w-2',
    'w-4xs': 'w-4',
    'w-3xs': 'w-8',
    'w-2xs': 'w-12',
    'w-xs': 'w-16',
    'w-sm': 'w-20',
    'w-md': 'w-24',
    'w-lg': 'w-28',
    'w-xl': 'w-32',
    'w-2xl': 'w-36',
    'w-3xl': 'w-40',
    'w-4xl': 'w-44',
  } as const
  const className = options[size]
  return <div className={className} />
}
