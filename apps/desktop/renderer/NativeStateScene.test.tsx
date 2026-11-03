// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import type { OfflineEditorAPI } from '@corelive/desktop-contract/offline-editor-api'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'

import { NativeStateScene } from './NativeStateScene'

afterEach(() => cleanup())

// The scene only calls host members on click, so an empty host is enough for rendering checks.
const host = {} as OfflineEditorAPI

test('recovery still offers Retry, Export files and Preview recovery copy', () => {
  // Arrange
  const snapshot = {
    phase: 'recovery',
    generation: 1,
    canRecover: true,
  } as const

  // Act
  render(
    <NativeStateScene
      snapshot={snapshot}
      host={host}
      close={async () => undefined}
    />,
  )

  // Assert
  expect(
    screen.getByRole('heading', { name: 'Your writing needs recovery' }),
  ).toBeVisible()
  expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Export files' })).toBeVisible()
  expect(
    screen.getByRole('button', { name: 'Preview recovery copy' }),
  ).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull()
})

test('opening is a plain loading state without a Sign in button', () => {
  // Arrange
  const snapshot = { phase: 'opening', generation: 1 } as const

  // Act
  render(
    <NativeStateScene
      snapshot={snapshot}
      host={host}
      close={async () => undefined}
    />,
  )

  // Assert
  expect(
    screen.getByRole('heading', { name: 'Opening your writing…' }),
  ).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull()
})
