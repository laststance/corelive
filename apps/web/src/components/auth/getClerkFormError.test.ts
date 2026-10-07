import { ClerkAPIResponseError } from '@clerk/nextjs/errors'
import { expect, test } from 'vitest'

import { getClerkFormError } from './getClerkFormError'

test('Electron account errors prefer Clerk detailed verification guidance', () => {
  // Arrange
  const error = new ClerkAPIResponseError('Verification failed', {
    status: 422,
    data: [
      {
        code: 'form_code_incorrect',
        message: 'Invalid code',
        long_message: 'Enter the current verification code.',
      },
    ],
  })

  // Act
  const message = getClerkFormError(error, 'Try again')

  // Assert
  expect(message).toBe('Enter the current verification code.')
})

test('Electron account errors retain Clerk short messages when detailed guidance is absent', () => {
  // Arrange
  const error = new ClerkAPIResponseError('Verification failed', {
    status: 422,
    data: [{ code: 'form_code_incorrect', message: 'Invalid code' }],
  })

  // Act
  const message = getClerkFormError(error, 'Try again')

  // Assert
  expect(message).toBe('Invalid code')
})

test('Electron account errors use the flow fallback for non-Clerk failures', () => {
  // Arrange
  const error = new Error('Network unavailable')

  // Act
  const message = getClerkFormError(error, 'Please retry verification')

  // Assert
  expect(message).toBe('Please retry verification')
})
