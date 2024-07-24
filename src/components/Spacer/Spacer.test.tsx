import { render } from '@testing-library/react'
import React from 'react'

import { Spacer } from './Spacer'

// Test for small size
test('renders with small size', () => {
  const { container } = render(<Spacer size="h-sm" />)
  expect(container.firstChild).toHaveClass('h-20')
})

// Test for medium size
test('renders with medium size', () => {
  const { container } = render(<Spacer size="h-md" />)
  expect(container.firstChild).toHaveClass('h-24')
})

// Test for large size
test('renders with large size', () => {
  const { container } = render(<Spacer size="h-lg" />)
  expect(container.firstChild).toHaveClass('h-28')
})

// Test for extra large size
test('renders with extra large size', () => {
  const { container } = render(<Spacer size="h-xl" />)
  expect(container.firstChild).toHaveClass('h-32')
})

// Test for medium size
test('width: renders with medium size', () => {
  const { container } = render(<Spacer size="w-md" />)
  expect(container.firstChild).toHaveClass('w-24')
})

// Test for large size
test('width: renders with large size', () => {
  const { container } = render(<Spacer size="w-lg" />)
  expect(container.firstChild).toHaveClass('w-28')
})

// Test for extra large size
test('width: renders with extra large size', () => {
  const { container } = render(<Spacer size="w-xl" />)
  expect(container.firstChild).toHaveClass('w-32')
})
