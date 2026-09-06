import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { CompletedDateRangePicker } from './CompletedDateRangePicker'

afterEach(cleanup)

test('a custom completion filter cannot apply only a start date', () => {
  // Arrange
  const onApply = vi.fn()

  // Act
  render(
    <CompletedDateRangePicker
      visible
      dateRange={{ from: new Date('2026-09-01T12:00:00') }}
      fallbackMonth={new Date('2026-09-01T12:00:00')}
      today={new Date('2026-09-07T12:00:00')}
      onDateRangeChange={vi.fn()}
      onCancel={vi.fn()}
      onApply={onApply}
    />,
  )

  // Assert
  expect(screen.getByRole('button', { name: 'Apply range' })).toBeDisabled()
  expect(onApply).not.toHaveBeenCalled()
})

test('applying a complete custom completion filter preserves both selected dates', async () => {
  // Arrange
  const user = userEvent.setup()
  const onApply = vi.fn()
  render(
    <CompletedDateRangePicker
      visible
      dateRange={{
        from: new Date('2026-09-01T12:00:00'),
        to: new Date('2026-09-05T12:00:00'),
      }}
      fallbackMonth={new Date('2026-09-01T12:00:00')}
      today={new Date('2026-09-07T12:00:00')}
      onDateRangeChange={vi.fn()}
      onCancel={vi.fn()}
      onApply={onApply}
    />,
  )

  // Act
  await user.click(screen.getByRole('button', { name: 'Apply range' }))

  // Assert
  expect(onApply).toHaveBeenCalledExactlyOnceWith({
    from: new Date('2026-09-01T12:00:00'),
    to: new Date('2026-09-05T12:00:00'),
  })
})

test('returning to period choices discards the draft custom completion range', async () => {
  // Arrange
  const user = userEvent.setup()
  const onDateRangeChange = vi.fn()
  render(
    <CompletedDateRangePicker
      visible
      dateRange={{ from: new Date('2026-09-01T12:00:00') }}
      fallbackMonth={new Date('2026-09-01T12:00:00')}
      today={new Date('2026-09-07T12:00:00')}
      onDateRangeChange={onDateRangeChange}
      onCancel={vi.fn()}
      onApply={vi.fn()}
    />,
  )

  // Act
  await user.click(
    screen.getByRole('button', { name: 'Back to period choices' }),
  )

  // Assert
  expect(onDateRangeChange).toHaveBeenCalledExactlyOnceWith(null)
})
