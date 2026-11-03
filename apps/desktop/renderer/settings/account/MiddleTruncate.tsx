import { cn } from '@corelive/live-editor/cn'

import { middleTruncate } from './accountCopy'

/**
 * Shows long text shortened in the middle, with the full text in `title` and in the
 * accessible name (DA13). Short text renders unchanged.
 *
 * Used for emails and category paths in {@link AccountSection} and the Sync details page,
 * where a 320px window cannot hold them whole.
 *
 * @param text - Full text.
 * @param max - Length above which the middle is cut.
 * @param className - Extra classes for the wrapper.
 * @example <MiddleTruncate text={email} />
 */
export function MiddleTruncate({
  text,
  max = 32,
  className,
}: {
  text: string
  max?: number
  className?: string
}) {
  const shown = middleTruncate(text, max)
  if (shown === text) return <span className={className}>{text}</span>
  return (
    <span className={cn('break-all', className)} title={text}>
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{text}</span>
    </span>
  )
}
