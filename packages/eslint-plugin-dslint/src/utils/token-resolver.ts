/**
 * Token Resolver
 *
 * Reads tailwind.config.ts and extracts all design tokens.
 * Builds an allowlist of valid Tailwind classes from the config.
 */
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'

export interface DesignTokens {
  colors: string[]
  borderRadius: string[]
  spacing: string[]
  raw: Record<string, unknown>
}

export interface TokenResolverOptions {
  tokenSource: string
  cwd?: string
}

/**
 * Default Tailwind spacing scale
 * These are always available unless overridden
 */
const DEFAULT_SPACING = [
  '0',
  '0.5',
  '1',
  '1.5',
  '2',
  '2.5',
  '3',
  '3.5',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '14',
  '16',
  '20',
  '24',
  '28',
  '32',
  '36',
  '40',
  '44',
  '48',
  '52',
  '56',
  '60',
  '64',
  '72',
  '80',
  '96',
  'px',
  'auto',
  'full',
  'screen',
  'min',
  'max',
  'fit',
]

/**
 * Default Tailwind border radius scale
 */
const DEFAULT_BORDER_RADIUS = [
  'none',
  'sm',
  'DEFAULT',
  'md',
  'lg',
  'xl',
  '2xl',
  '3xl',
  'full',
]

/**
 * Tailwind utility classes that don't depend on design tokens.
 * These are always allowed.
 */
export const TAILWIND_CORE_UTILITIES = [
  // Layout
  'block',
  'inline-block',
  'inline',
  'flex',
  'inline-flex',
  'grid',
  'inline-grid',
  'contents',
  'hidden',
  'flow-root',
  'list-item',
  // Flex
  'flex-row',
  'flex-row-reverse',
  'flex-col',
  'flex-col-reverse',
  'flex-wrap',
  'flex-wrap-reverse',
  'flex-nowrap',
  'flex-1',
  'flex-auto',
  'flex-initial',
  'flex-none',
  'grow',
  'grow-0',
  'shrink',
  'shrink-0',
  // Grid
  'grid-cols-1',
  'grid-cols-2',
  'grid-cols-3',
  'grid-cols-4',
  'grid-cols-5',
  'grid-cols-6',
  'grid-cols-7',
  'grid-cols-8',
  'grid-cols-9',
  'grid-cols-10',
  'grid-cols-11',
  'grid-cols-12',
  'grid-cols-none',
  'grid-cols-subgrid',
  'grid-rows-1',
  'grid-rows-2',
  'grid-rows-3',
  'grid-rows-4',
  'grid-rows-5',
  'grid-rows-6',
  'grid-rows-none',
  'grid-rows-subgrid',
  'col-auto',
  'col-span-full',
  'row-auto',
  'row-span-full',
  // Gap
  'gap-x-0',
  'gap-y-0',
  // Justify
  'justify-start',
  'justify-end',
  'justify-center',
  'justify-between',
  'justify-around',
  'justify-evenly',
  'justify-stretch',
  'justify-normal',
  'justify-items-start',
  'justify-items-end',
  'justify-items-center',
  'justify-items-stretch',
  'justify-self-auto',
  'justify-self-start',
  'justify-self-end',
  'justify-self-center',
  'justify-self-stretch',
  // Align
  'items-start',
  'items-end',
  'items-center',
  'items-baseline',
  'items-stretch',
  'content-start',
  'content-end',
  'content-center',
  'content-between',
  'content-around',
  'content-evenly',
  'content-stretch',
  'content-baseline',
  'content-normal',
  'self-auto',
  'self-start',
  'self-end',
  'self-center',
  'self-stretch',
  'self-baseline',
  'place-content-center',
  'place-content-start',
  'place-content-end',
  'place-content-between',
  'place-content-around',
  'place-content-evenly',
  'place-content-stretch',
  'place-content-baseline',
  'place-items-start',
  'place-items-end',
  'place-items-center',
  'place-items-stretch',
  'place-items-baseline',
  'place-self-auto',
  'place-self-start',
  'place-self-end',
  'place-self-center',
  'place-self-stretch',
  // Order
  'order-first',
  'order-last',
  'order-none',
  // Position
  'static',
  'fixed',
  'absolute',
  'relative',
  'sticky',
  'inset-0',
  'inset-auto',
  'inset-x-0',
  'inset-y-0',
  'top-0',
  'right-0',
  'bottom-0',
  'left-0',
  'top-auto',
  'right-auto',
  'bottom-auto',
  'left-auto',
  // Visibility
  'visible',
  'invisible',
  'collapse',
  // Z-index
  'z-0',
  'z-10',
  'z-20',
  'z-30',
  'z-40',
  'z-50',
  'z-auto',
  // Sizing
  'w-auto',
  'w-full',
  'w-screen',
  'w-min',
  'w-max',
  'w-fit',
  'w-svw',
  'w-lvw',
  'w-dvw',
  'min-w-0',
  'min-w-full',
  'min-w-min',
  'min-w-max',
  'min-w-fit',
  'max-w-0',
  'max-w-none',
  'max-w-xs',
  'max-w-sm',
  'max-w-md',
  'max-w-lg',
  'max-w-xl',
  'max-w-2xl',
  'max-w-3xl',
  'max-w-4xl',
  'max-w-5xl',
  'max-w-6xl',
  'max-w-7xl',
  'max-w-full',
  'max-w-min',
  'max-w-max',
  'max-w-fit',
  'max-w-prose',
  'max-w-screen-sm',
  'max-w-screen-md',
  'max-w-screen-lg',
  'max-w-screen-xl',
  'max-w-screen-2xl',
  'h-auto',
  'h-full',
  'h-screen',
  'h-min',
  'h-max',
  'h-fit',
  'h-svh',
  'h-lvh',
  'h-dvh',
  'min-h-0',
  'min-h-full',
  'min-h-screen',
  'min-h-min',
  'min-h-max',
  'min-h-fit',
  'min-h-svh',
  'min-h-lvh',
  'min-h-dvh',
  'max-h-0',
  'max-h-none',
  'max-h-full',
  'max-h-screen',
  'max-h-min',
  'max-h-max',
  'max-h-fit',
  'max-h-svh',
  'max-h-lvh',
  'max-h-dvh',
  'size-auto',
  'size-full',
  'size-min',
  'size-max',
  'size-fit',
  // Typography
  'text-left',
  'text-center',
  'text-right',
  'text-justify',
  'text-start',
  'text-end',
  'text-xs',
  'text-sm',
  'text-base',
  'text-lg',
  'text-xl',
  'text-2xl',
  'text-3xl',
  'text-4xl',
  'text-5xl',
  'text-6xl',
  'text-7xl',
  'text-8xl',
  'text-9xl',
  'font-thin',
  'font-extralight',
  'font-light',
  'font-normal',
  'font-medium',
  'font-semibold',
  'font-bold',
  'font-extrabold',
  'font-black',
  'font-sans',
  'font-serif',
  'font-mono',
  'italic',
  'not-italic',
  'underline',
  'overline',
  'line-through',
  'no-underline',
  'uppercase',
  'lowercase',
  'capitalize',
  'normal-case',
  'truncate',
  'text-ellipsis',
  'text-clip',
  'text-wrap',
  'text-nowrap',
  'text-balance',
  'text-pretty',
  'break-normal',
  'break-words',
  'break-all',
  'break-keep',
  'leading-none',
  'leading-tight',
  'leading-snug',
  'leading-normal',
  'leading-relaxed',
  'leading-loose',
  'tracking-tighter',
  'tracking-tight',
  'tracking-normal',
  'tracking-wide',
  'tracking-wider',
  'tracking-widest',
  'whitespace-normal',
  'whitespace-nowrap',
  'whitespace-pre',
  'whitespace-pre-line',
  'whitespace-pre-wrap',
  'whitespace-break-spaces',
  // Lists
  'list-inside',
  'list-outside',
  'list-none',
  'list-disc',
  'list-decimal',
  // Decoration
  'underline-offset-auto',
  'underline-offset-0',
  'underline-offset-1',
  'underline-offset-2',
  'underline-offset-4',
  'underline-offset-8',
  'decoration-solid',
  'decoration-double',
  'decoration-dotted',
  'decoration-dashed',
  'decoration-wavy',
  'decoration-auto',
  'decoration-from-font',
  'decoration-0',
  'decoration-1',
  'decoration-2',
  'decoration-4',
  'decoration-8',
  // Backgrounds
  'bg-inherit',
  'bg-current',
  'bg-transparent',
  'bg-black',
  'bg-white',
  'bg-fixed',
  'bg-local',
  'bg-scroll',
  'bg-clip-border',
  'bg-clip-padding',
  'bg-clip-content',
  'bg-clip-text',
  'bg-repeat',
  'bg-no-repeat',
  'bg-repeat-x',
  'bg-repeat-y',
  'bg-repeat-round',
  'bg-repeat-space',
  'bg-origin-border',
  'bg-origin-padding',
  'bg-origin-content',
  'bg-auto',
  'bg-cover',
  'bg-contain',
  'bg-center',
  'bg-top',
  'bg-right',
  'bg-bottom',
  'bg-left',
  'bg-right-top',
  'bg-right-bottom',
  'bg-left-top',
  'bg-left-bottom',
  'bg-none',
  // Borders
  'border',
  'border-0',
  'border-2',
  'border-4',
  'border-8',
  'border-x',
  'border-x-0',
  'border-x-2',
  'border-x-4',
  'border-x-8',
  'border-y',
  'border-y-0',
  'border-y-2',
  'border-y-4',
  'border-y-8',
  'border-t',
  'border-t-0',
  'border-t-2',
  'border-t-4',
  'border-t-8',
  'border-r',
  'border-r-0',
  'border-r-2',
  'border-r-4',
  'border-r-8',
  'border-b',
  'border-b-0',
  'border-b-2',
  'border-b-4',
  'border-b-8',
  'border-l',
  'border-l-0',
  'border-l-2',
  'border-l-4',
  'border-l-8',
  'border-solid',
  'border-dashed',
  'border-dotted',
  'border-double',
  'border-hidden',
  'border-none',
  'border-inherit',
  'border-current',
  'border-transparent',
  'border-black',
  'border-white',
  'divide-x',
  'divide-y',
  'divide-x-0',
  'divide-y-0',
  'divide-x-2',
  'divide-y-2',
  'divide-x-4',
  'divide-y-4',
  'divide-x-8',
  'divide-y-8',
  'divide-x-reverse',
  'divide-y-reverse',
  'divide-solid',
  'divide-dashed',
  'divide-dotted',
  'divide-double',
  'divide-none',
  'divide-inherit',
  'divide-current',
  'divide-transparent',
  'divide-black',
  'divide-white',
  'outline',
  'outline-none',
  'outline-dashed',
  'outline-dotted',
  'outline-double',
  'outline-0',
  'outline-1',
  'outline-2',
  'outline-4',
  'outline-8',
  'outline-offset-0',
  'outline-offset-1',
  'outline-offset-2',
  'outline-offset-4',
  'outline-offset-8',
  'outline-inherit',
  'outline-current',
  'outline-transparent',
  'outline-black',
  'outline-white',
  'ring',
  'ring-0',
  'ring-1',
  'ring-2',
  'ring-4',
  'ring-8',
  'ring-inset',
  'ring-inherit',
  'ring-current',
  'ring-transparent',
  'ring-black',
  'ring-white',
  'ring-offset-0',
  'ring-offset-1',
  'ring-offset-2',
  'ring-offset-4',
  'ring-offset-8',
  'ring-offset-inherit',
  'ring-offset-current',
  'ring-offset-transparent',
  'ring-offset-black',
  'ring-offset-white',
  // Rounded
  'rounded',
  'rounded-none',
  'rounded-sm',
  'rounded-md',
  'rounded-lg',
  'rounded-xl',
  'rounded-2xl',
  'rounded-3xl',
  'rounded-full',
  'rounded-t',
  'rounded-t-none',
  'rounded-t-sm',
  'rounded-t-md',
  'rounded-t-lg',
  'rounded-t-xl',
  'rounded-t-2xl',
  'rounded-t-3xl',
  'rounded-t-full',
  'rounded-r',
  'rounded-r-none',
  'rounded-r-sm',
  'rounded-r-md',
  'rounded-r-lg',
  'rounded-r-xl',
  'rounded-r-2xl',
  'rounded-r-3xl',
  'rounded-r-full',
  'rounded-b',
  'rounded-b-none',
  'rounded-b-sm',
  'rounded-b-md',
  'rounded-b-lg',
  'rounded-b-xl',
  'rounded-b-2xl',
  'rounded-b-3xl',
  'rounded-b-full',
  'rounded-l',
  'rounded-l-none',
  'rounded-l-sm',
  'rounded-l-md',
  'rounded-l-lg',
  'rounded-l-xl',
  'rounded-l-2xl',
  'rounded-l-3xl',
  'rounded-l-full',
  'rounded-tl',
  'rounded-tl-none',
  'rounded-tl-sm',
  'rounded-tl-md',
  'rounded-tl-lg',
  'rounded-tl-xl',
  'rounded-tl-2xl',
  'rounded-tl-3xl',
  'rounded-tl-full',
  'rounded-tr',
  'rounded-tr-none',
  'rounded-tr-sm',
  'rounded-tr-md',
  'rounded-tr-lg',
  'rounded-tr-xl',
  'rounded-tr-2xl',
  'rounded-tr-3xl',
  'rounded-tr-full',
  'rounded-bl',
  'rounded-bl-none',
  'rounded-bl-sm',
  'rounded-bl-md',
  'rounded-bl-lg',
  'rounded-bl-xl',
  'rounded-bl-2xl',
  'rounded-bl-3xl',
  'rounded-bl-full',
  'rounded-br',
  'rounded-br-none',
  'rounded-br-sm',
  'rounded-br-md',
  'rounded-br-lg',
  'rounded-br-xl',
  'rounded-br-2xl',
  'rounded-br-3xl',
  'rounded-br-full',
  // Effects
  'shadow',
  'shadow-sm',
  'shadow-md',
  'shadow-lg',
  'shadow-xl',
  'shadow-2xl',
  'shadow-inner',
  'shadow-none',
  'shadow-inherit',
  'shadow-current',
  'shadow-transparent',
  'shadow-black',
  'shadow-white',
  'opacity-0',
  'opacity-5',
  'opacity-10',
  'opacity-15',
  'opacity-20',
  'opacity-25',
  'opacity-30',
  'opacity-35',
  'opacity-40',
  'opacity-45',
  'opacity-50',
  'opacity-55',
  'opacity-60',
  'opacity-65',
  'opacity-70',
  'opacity-75',
  'opacity-80',
  'opacity-85',
  'opacity-90',
  'opacity-95',
  'opacity-100',
  'mix-blend-normal',
  'mix-blend-multiply',
  'mix-blend-screen',
  'mix-blend-overlay',
  'mix-blend-darken',
  'mix-blend-lighten',
  'mix-blend-color-dodge',
  'mix-blend-color-burn',
  'mix-blend-hard-light',
  'mix-blend-soft-light',
  'mix-blend-difference',
  'mix-blend-exclusion',
  'mix-blend-hue',
  'mix-blend-saturation',
  'mix-blend-color',
  'mix-blend-luminosity',
  'mix-blend-plus-darker',
  'mix-blend-plus-lighter',
  'bg-blend-normal',
  'bg-blend-multiply',
  'bg-blend-screen',
  'bg-blend-overlay',
  'bg-blend-darken',
  'bg-blend-lighten',
  'bg-blend-color-dodge',
  'bg-blend-color-burn',
  'bg-blend-hard-light',
  'bg-blend-soft-light',
  'bg-blend-difference',
  'bg-blend-exclusion',
  'bg-blend-hue',
  'bg-blend-saturation',
  'bg-blend-color',
  'bg-blend-luminosity',
  // Filters
  'blur',
  'blur-none',
  'blur-sm',
  'blur-md',
  'blur-lg',
  'blur-xl',
  'blur-2xl',
  'blur-3xl',
  'brightness-0',
  'brightness-50',
  'brightness-75',
  'brightness-90',
  'brightness-95',
  'brightness-100',
  'brightness-105',
  'brightness-110',
  'brightness-125',
  'brightness-150',
  'brightness-200',
  'contrast-0',
  'contrast-50',
  'contrast-75',
  'contrast-100',
  'contrast-125',
  'contrast-150',
  'contrast-200',
  'grayscale',
  'grayscale-0',
  'hue-rotate-0',
  'hue-rotate-15',
  'hue-rotate-30',
  'hue-rotate-60',
  'hue-rotate-90',
  'hue-rotate-180',
  'invert',
  'invert-0',
  'saturate-0',
  'saturate-50',
  'saturate-100',
  'saturate-150',
  'saturate-200',
  'sepia',
  'sepia-0',
  'drop-shadow',
  'drop-shadow-sm',
  'drop-shadow-md',
  'drop-shadow-lg',
  'drop-shadow-xl',
  'drop-shadow-2xl',
  'drop-shadow-none',
  'backdrop-blur',
  'backdrop-blur-none',
  'backdrop-blur-sm',
  'backdrop-blur-md',
  'backdrop-blur-lg',
  'backdrop-blur-xl',
  'backdrop-blur-2xl',
  'backdrop-blur-3xl',
  'backdrop-brightness-0',
  'backdrop-brightness-50',
  'backdrop-brightness-75',
  'backdrop-brightness-90',
  'backdrop-brightness-95',
  'backdrop-brightness-100',
  'backdrop-brightness-105',
  'backdrop-brightness-110',
  'backdrop-brightness-125',
  'backdrop-brightness-150',
  'backdrop-brightness-200',
  'backdrop-contrast-0',
  'backdrop-contrast-50',
  'backdrop-contrast-75',
  'backdrop-contrast-100',
  'backdrop-contrast-125',
  'backdrop-contrast-150',
  'backdrop-contrast-200',
  'backdrop-grayscale',
  'backdrop-grayscale-0',
  'backdrop-hue-rotate-0',
  'backdrop-hue-rotate-15',
  'backdrop-hue-rotate-30',
  'backdrop-hue-rotate-60',
  'backdrop-hue-rotate-90',
  'backdrop-hue-rotate-180',
  'backdrop-invert',
  'backdrop-invert-0',
  'backdrop-opacity-0',
  'backdrop-opacity-5',
  'backdrop-opacity-10',
  'backdrop-opacity-15',
  'backdrop-opacity-20',
  'backdrop-opacity-25',
  'backdrop-opacity-30',
  'backdrop-opacity-35',
  'backdrop-opacity-40',
  'backdrop-opacity-45',
  'backdrop-opacity-50',
  'backdrop-opacity-55',
  'backdrop-opacity-60',
  'backdrop-opacity-65',
  'backdrop-opacity-70',
  'backdrop-opacity-75',
  'backdrop-opacity-80',
  'backdrop-opacity-85',
  'backdrop-opacity-90',
  'backdrop-opacity-95',
  'backdrop-opacity-100',
  'backdrop-saturate-0',
  'backdrop-saturate-50',
  'backdrop-saturate-100',
  'backdrop-saturate-150',
  'backdrop-saturate-200',
  'backdrop-sepia',
  'backdrop-sepia-0',
  // Transitions
  'transition',
  'transition-none',
  'transition-all',
  'transition-colors',
  'transition-opacity',
  'transition-shadow',
  'transition-transform',
  'duration-0',
  'duration-75',
  'duration-100',
  'duration-150',
  'duration-200',
  'duration-300',
  'duration-500',
  'duration-700',
  'duration-1000',
  'ease-linear',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'delay-0',
  'delay-75',
  'delay-100',
  'delay-150',
  'delay-200',
  'delay-300',
  'delay-500',
  'delay-700',
  'delay-1000',
  'animate-none',
  'animate-spin',
  'animate-ping',
  'animate-pulse',
  'animate-bounce',
  // Transforms
  'scale-0',
  'scale-50',
  'scale-75',
  'scale-90',
  'scale-95',
  'scale-100',
  'scale-105',
  'scale-110',
  'scale-125',
  'scale-150',
  'scale-x-0',
  'scale-x-50',
  'scale-x-75',
  'scale-x-90',
  'scale-x-95',
  'scale-x-100',
  'scale-x-105',
  'scale-x-110',
  'scale-x-125',
  'scale-x-150',
  'scale-y-0',
  'scale-y-50',
  'scale-y-75',
  'scale-y-90',
  'scale-y-95',
  'scale-y-100',
  'scale-y-105',
  'scale-y-110',
  'scale-y-125',
  'scale-y-150',
  'rotate-0',
  'rotate-1',
  'rotate-2',
  'rotate-3',
  'rotate-6',
  'rotate-12',
  'rotate-45',
  'rotate-90',
  'rotate-180',
  '-rotate-1',
  '-rotate-2',
  '-rotate-3',
  '-rotate-6',
  '-rotate-12',
  '-rotate-45',
  '-rotate-90',
  '-rotate-180',
  'translate-x-0',
  'translate-x-full',
  '-translate-x-full',
  'translate-x-1/2',
  '-translate-x-1/2',
  'translate-y-0',
  'translate-y-full',
  '-translate-y-full',
  'translate-y-1/2',
  '-translate-y-1/2',
  'skew-x-0',
  'skew-x-1',
  'skew-x-2',
  'skew-x-3',
  'skew-x-6',
  'skew-x-12',
  '-skew-x-1',
  '-skew-x-2',
  '-skew-x-3',
  '-skew-x-6',
  '-skew-x-12',
  'skew-y-0',
  'skew-y-1',
  'skew-y-2',
  'skew-y-3',
  'skew-y-6',
  'skew-y-12',
  '-skew-y-1',
  '-skew-y-2',
  '-skew-y-3',
  '-skew-y-6',
  '-skew-y-12',
  'origin-center',
  'origin-top',
  'origin-top-right',
  'origin-right',
  'origin-bottom-right',
  'origin-bottom',
  'origin-bottom-left',
  'origin-left',
  'origin-top-left',
  // Interactivity
  'accent-auto',
  'accent-inherit',
  'accent-current',
  'accent-transparent',
  'accent-black',
  'accent-white',
  'appearance-none',
  'appearance-auto',
  'cursor-auto',
  'cursor-default',
  'cursor-pointer',
  'cursor-wait',
  'cursor-text',
  'cursor-move',
  'cursor-help',
  'cursor-not-allowed',
  'cursor-none',
  'cursor-context-menu',
  'cursor-progress',
  'cursor-cell',
  'cursor-crosshair',
  'cursor-vertical-text',
  'cursor-alias',
  'cursor-copy',
  'cursor-no-drop',
  'cursor-grab',
  'cursor-grabbing',
  'cursor-all-scroll',
  'cursor-col-resize',
  'cursor-row-resize',
  'cursor-n-resize',
  'cursor-e-resize',
  'cursor-s-resize',
  'cursor-w-resize',
  'cursor-ne-resize',
  'cursor-nw-resize',
  'cursor-se-resize',
  'cursor-sw-resize',
  'cursor-ew-resize',
  'cursor-ns-resize',
  'cursor-nesw-resize',
  'cursor-nwse-resize',
  'cursor-zoom-in',
  'cursor-zoom-out',
  'caret-inherit',
  'caret-current',
  'caret-transparent',
  'caret-black',
  'caret-white',
  'pointer-events-none',
  'pointer-events-auto',
  'resize',
  'resize-none',
  'resize-x',
  'resize-y',
  'scroll-auto',
  'scroll-smooth',
  'scroll-m-0',
  'scroll-m-px',
  'scroll-p-0',
  'scroll-p-px',
  'snap-start',
  'snap-end',
  'snap-center',
  'snap-align-none',
  'snap-normal',
  'snap-always',
  'snap-none',
  'snap-x',
  'snap-y',
  'snap-both',
  'snap-mandatory',
  'snap-proximity',
  'touch-auto',
  'touch-none',
  'touch-pan-x',
  'touch-pan-left',
  'touch-pan-right',
  'touch-pan-y',
  'touch-pan-up',
  'touch-pan-down',
  'touch-pinch-zoom',
  'touch-manipulation',
  'select-none',
  'select-text',
  'select-all',
  'select-auto',
  'will-change-auto',
  'will-change-scroll',
  'will-change-contents',
  'will-change-transform',
  // SVG
  'fill-none',
  'fill-inherit',
  'fill-current',
  'fill-transparent',
  'fill-black',
  'fill-white',
  'stroke-none',
  'stroke-inherit',
  'stroke-current',
  'stroke-transparent',
  'stroke-black',
  'stroke-white',
  'stroke-0',
  'stroke-1',
  'stroke-2',
  // Tables
  'border-collapse',
  'border-separate',
  'border-spacing-0',
  'border-spacing-px',
  'caption-top',
  'caption-bottom',
  'table-auto',
  'table-fixed',
  // Accessibility
  'sr-only',
  'not-sr-only',
  'forced-color-adjust-auto',
  'forced-color-adjust-none',
  // Overflow
  'overflow-auto',
  'overflow-hidden',
  'overflow-clip',
  'overflow-visible',
  'overflow-scroll',
  'overflow-x-auto',
  'overflow-x-hidden',
  'overflow-x-clip',
  'overflow-x-visible',
  'overflow-x-scroll',
  'overflow-y-auto',
  'overflow-y-hidden',
  'overflow-y-clip',
  'overflow-y-visible',
  'overflow-y-scroll',
  'overscroll-auto',
  'overscroll-contain',
  'overscroll-none',
  'overscroll-x-auto',
  'overscroll-x-contain',
  'overscroll-x-none',
  'overscroll-y-auto',
  'overscroll-y-contain',
  'overscroll-y-none',
  // Aspect ratio
  'aspect-auto',
  'aspect-square',
  'aspect-video',
  // Columns
  'columns-1',
  'columns-2',
  'columns-3',
  'columns-4',
  'columns-5',
  'columns-6',
  'columns-7',
  'columns-8',
  'columns-9',
  'columns-10',
  'columns-11',
  'columns-12',
  'columns-auto',
  'columns-3xs',
  'columns-2xs',
  'columns-xs',
  'columns-sm',
  'columns-md',
  'columns-lg',
  'columns-xl',
  'columns-2xl',
  'columns-3xl',
  'columns-4xl',
  'columns-5xl',
  'columns-6xl',
  'columns-7xl',
  'break-after-auto',
  'break-after-avoid',
  'break-after-all',
  'break-after-avoid-page',
  'break-after-page',
  'break-after-left',
  'break-after-right',
  'break-after-column',
  'break-before-auto',
  'break-before-avoid',
  'break-before-all',
  'break-before-avoid-page',
  'break-before-page',
  'break-before-left',
  'break-before-right',
  'break-before-column',
  'break-inside-auto',
  'break-inside-avoid',
  'break-inside-avoid-page',
  'break-inside-avoid-column',
  // Box sizing/decoration
  'box-border',
  'box-content',
  'box-decoration-clone',
  'box-decoration-slice',
  // Float/clear
  'float-right',
  'float-left',
  'float-none',
  'float-start',
  'float-end',
  'clear-left',
  'clear-right',
  'clear-both',
  'clear-none',
  'clear-start',
  'clear-end',
  // Isolation
  'isolate',
  'isolation-auto',
  // Object fit/position
  'object-contain',
  'object-cover',
  'object-fill',
  'object-none',
  'object-scale-down',
  'object-bottom',
  'object-center',
  'object-left',
  'object-left-bottom',
  'object-left-top',
  'object-right',
  'object-right-bottom',
  'object-right-top',
  'object-top',
]

/**
 * Color utility prefixes that can be combined with color names
 */
const COLOR_UTILITY_PREFIXES = [
  'bg',
  'text',
  'border',
  'border-t',
  'border-r',
  'border-b',
  'border-l',
  'border-x',
  'border-y',
  'ring',
  'ring-offset',
  'outline',
  'shadow',
  'accent',
  'caret',
  'fill',
  'stroke',
  'divide',
  'decoration',
  'from',
  'via',
  'to',
]

/**
 * Spacing utility prefixes that can be combined with spacing values
 */
const SPACING_UTILITY_PREFIXES = [
  'p',
  'px',
  'py',
  'pt',
  'pr',
  'pb',
  'pl',
  'ps',
  'pe',
  'm',
  'mx',
  'my',
  'mt',
  'mr',
  'mb',
  'ml',
  'ms',
  'me',
  '-m',
  '-mx',
  '-my',
  '-mt',
  '-mr',
  '-mb',
  '-ml',
  '-ms',
  '-me',
  'gap',
  'gap-x',
  'gap-y',
  'space-x',
  'space-y',
  '-space-x',
  '-space-y',
  'inset',
  'inset-x',
  'inset-y',
  'top',
  'right',
  'bottom',
  'left',
  'start',
  'end',
  '-top',
  '-right',
  '-bottom',
  '-left',
  '-start',
  '-end',
  '-inset',
  '-inset-x',
  '-inset-y',
  'scroll-m',
  'scroll-mx',
  'scroll-my',
  'scroll-mt',
  'scroll-mr',
  'scroll-mb',
  'scroll-ml',
  'scroll-ms',
  'scroll-me',
  'scroll-p',
  'scroll-px',
  'scroll-py',
  'scroll-pt',
  'scroll-pr',
  'scroll-pb',
  'scroll-pl',
  'scroll-ps',
  'scroll-pe',
]

/**
 * Size utility prefixes
 */
const SIZE_UTILITY_PREFIXES = [
  'w',
  'min-w',
  'max-w',
  'h',
  'min-h',
  'max-h',
  'size',
]

/**
 * Extract color names from theme.extend.colors
 * @param colors - The colors object from tailwind config
 * @returns Array of color names
 */
function extractColorNames(colors: Record<string, unknown>): string[] {
  const names: string[] = []

  for (const [key, value] of Object.entries(colors)) {
    if (typeof value === 'string') {
      names.push(key)
    } else if (typeof value === 'object' && value !== null) {
      // Handle nested colors like gray-100, gray-200, etc.
      for (const shade of Object.keys(value as object)) {
        names.push(`${key}-${shade}`)
      }
    }
  }

  return names
}

/**
 * Generate all valid color utility classes from color names
 * @param colorNames - Array of color names from config
 * @returns Array of valid color utility classes
 */
function generateColorUtilities(colorNames: string[]): string[] {
  const utilities: string[] = []

  for (const prefix of COLOR_UTILITY_PREFIXES) {
    for (const color of colorNames) {
      utilities.push(`${prefix}-${color}`)
      // Add opacity modifiers
      for (const opacity of [
        '0',
        '5',
        '10',
        '20',
        '25',
        '30',
        '40',
        '50',
        '60',
        '70',
        '75',
        '80',
        '90',
        '95',
        '100',
      ]) {
        utilities.push(`${prefix}-${color}/${opacity}`)
      }
    }
  }

  return utilities
}

/**
 * Generate all valid spacing utility classes
 * @param spacingValues - Array of spacing scale values
 * @returns Array of valid spacing utility classes
 */
function generateSpacingUtilities(spacingValues: string[]): string[] {
  const utilities: string[] = []

  for (const prefix of SPACING_UTILITY_PREFIXES) {
    for (const value of spacingValues) {
      utilities.push(`${prefix}-${value}`)
    }
  }

  // Add fractional values
  const fractions = [
    '1/2',
    '1/3',
    '2/3',
    '1/4',
    '2/4',
    '3/4',
    '1/5',
    '2/5',
    '3/5',
    '4/5',
    '1/6',
    '5/6',
  ]
  for (const prefix of SPACING_UTILITY_PREFIXES) {
    for (const frac of fractions) {
      utilities.push(`${prefix}-${frac}`)
    }
  }

  return utilities
}

/**
 * Generate size utility classes
 * @param spacingValues - Array of spacing scale values
 * @returns Array of valid size utility classes
 */
function generateSizeUtilities(spacingValues: string[]): string[] {
  const utilities: string[] = []

  for (const prefix of SIZE_UTILITY_PREFIXES) {
    for (const value of spacingValues) {
      utilities.push(`${prefix}-${value}`)
    }
  }

  // Add fractional values for width/height
  const fractions = [
    '1/2',
    '1/3',
    '2/3',
    '1/4',
    '2/4',
    '3/4',
    '1/5',
    '2/5',
    '3/5',
    '4/5',
    '1/6',
    '5/6',
    '1/12',
    '2/12',
    '3/12',
    '4/12',
    '5/12',
    '6/12',
    '7/12',
    '8/12',
    '9/12',
    '10/12',
    '11/12',
  ]
  for (const prefix of SIZE_UTILITY_PREFIXES) {
    for (const frac of fractions) {
      utilities.push(`${prefix}-${frac}`)
    }
  }

  return utilities
}

/**
 * Parse tailwind.config.ts file and extract configuration
 * Note: This is a simplified parser that reads the file as text
 * and extracts the theme.extend.colors object
 */
function parseConfigFile(configPath: string): Record<string, unknown> | null {
  if (!existsSync(configPath)) {
    return null
  }

  const content = readFileSync(configPath, 'utf-8')

  // Extract colors object using regex (simplified approach)
  const colorsMatch = content.match(/colors:\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/s)
  if (!colorsMatch) {
    return null
  }

  // Parse the colors object
  const colorsStr = colorsMatch[1]
  const colors: Record<string, string> = {}

  // Match key-value pairs like: background: 'var(--background)'
  const pairRegex = /['"]?([a-zA-Z-]+)['"]?\s*:\s*['"]([^'"]+)['"]/g
  let match
  while ((match = pairRegex.exec(colorsStr ?? '')) !== null) {
    const key = match[1]
    const value = match[2]
    if (key !== undefined && value !== undefined) {
      colors[key] = value
    }
  }

  // Extract borderRadius
  const radiusMatch = content.match(/borderRadius:\s*\{([^}]+)\}/s)
  const borderRadius: Record<string, string> = {}
  if (radiusMatch) {
    const radiusStr = radiusMatch[1] ?? ''
    // Reset regex lastIndex for reuse
    const radiusPairRegex = /['"]?([a-zA-Z-]+)['"]?\s*:\s*['"]([^'"]+)['"]/g
    let radiusMatchItem
    while ((radiusMatchItem = radiusPairRegex.exec(radiusStr)) !== null) {
      const key = radiusMatchItem[1]
      const value = radiusMatchItem[2]
      if (key !== undefined && value !== undefined) {
        borderRadius[key] = value
      }
    }
  }

  return {
    theme: {
      extend: {
        colors,
        borderRadius,
      },
    },
  }
}

/**
 * Resolve design tokens from a tailwind.config.ts file
 * @param options - Token resolver options
 * @returns Design tokens object
 */
export function resolveTokens(options: TokenResolverOptions): DesignTokens {
  const { tokenSource, cwd = process.cwd() } = options
  const configPath = resolve(cwd, tokenSource)

  const config = parseConfigFile(configPath)

  if (!config) {
    // Return only core utilities if config can't be parsed
    return {
      colors: [],
      borderRadius: DEFAULT_BORDER_RADIUS,
      spacing: DEFAULT_SPACING,
      raw: {},
    }
  }

  // Extract custom colors
  const themeColors =
    (config as { theme?: { extend?: { colors?: Record<string, unknown> } } })
      ?.theme?.extend?.colors ?? {}
  const colorNames = extractColorNames(themeColors)

  // Extract custom border radius
  const themeBorderRadius =
    (
      config as {
        theme?: { extend?: { borderRadius?: Record<string, string> } }
      }
    )?.theme?.extend?.borderRadius ?? {}
  const borderRadiusNames = Object.keys(themeBorderRadius)

  return {
    colors: colorNames,
    borderRadius: [...DEFAULT_BORDER_RADIUS, ...borderRadiusNames],
    spacing: DEFAULT_SPACING,
    raw: config,
  }
}

/**
 * Build a complete set of allowed Tailwind classes from tokens
 * @param tokens - Design tokens
 * @returns Set of allowed class names
 */
export function buildAllowedClasses(tokens: DesignTokens): Set<string> {
  const allowed = new Set<string>(TAILWIND_CORE_UTILITIES)

  // Add color utilities
  const colorUtilities = generateColorUtilities(tokens.colors)
  for (const util of colorUtilities) {
    allowed.add(util)
  }

  // Add spacing utilities
  const spacingUtilities = generateSpacingUtilities(tokens.spacing)
  for (const util of spacingUtilities) {
    allowed.add(util)
  }

  // Add size utilities
  const sizeUtilities = generateSizeUtilities(tokens.spacing)
  for (const util of sizeUtilities) {
    allowed.add(util)
  }

  return allowed
}

/**
 * Check if a class is a valid design token class
 * @param className - The class name to check
 * @param allowedClasses - Set of allowed classes
 * @param ignorePatterns - Patterns to ignore
 * @returns True if the class is allowed
 */
export function isAllowedClass(
  className: string,
  allowedClasses: Set<string>,
  ignorePatterns: string[] = [],
): boolean {
  // Remove any modifiers (hover:, dark:, sm:, etc.)
  const baseClass = className.replace(/^([\w-]+:)+/, '')

  // Check ignore patterns
  for (const pattern of ignorePatterns) {
    const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`)
    if (regex.test(baseClass)) {
      return true
    }
  }

  // Check if it's in the allowed set
  if (allowedClasses.has(baseClass)) {
    return true
  }

  // Check for arbitrary CSS variable values (allowed)
  if (/^\[var\(--[^\]]+\)\]$/.test(baseClass)) {
    return true
  }

  // Check for calc expressions (allowed)
  if (/^\[calc\([^\]]+\)\]$/.test(baseClass)) {
    return true
  }

  return false
}
