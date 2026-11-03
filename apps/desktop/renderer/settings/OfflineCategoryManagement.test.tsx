// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'

import { OfflineCategoryManagement } from './OfflineCategoryManagement'
import { GENERAL_CATEGORY, renderWithSettings } from './settingsTestkit'

const WORK = {
  ...GENERAL_CATEGORY,
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Work',
  color: 'green',
  isDefault: false,
} as const

test('lists categories with children under their parent so the tree is readable offline', async () => {
  // Arrange
  const child = {
    ...WORK,
    id: '00000000-0000-4000-8000-000000000003',
    name: 'Deep work',
    parentId: WORK.id,
  }

  // Act
  await renderWithSettings(<OfflineCategoryManagement />, {
    categories: [GENERAL_CATEGORY, WORK, child],
  })

  // Assert
  const items = screen.getAllByRole('listitem').map((item) => item.textContent)
  expect(items.map((text) => text?.replace(/(blue|green)Edit$/, ''))).toEqual([
    'General',
    'Work',
    'Deep work',
  ])
})

test('creates a category through a worker command without any network', async () => {
  // Arrange
  const user = userEvent.setup()
  const { fake } = await renderWithSettings(<OfflineCategoryManagement />)

  // Act
  await user.click(screen.getByRole('button', { name: 'New category' }))
  await user.type(screen.getByLabelText('Name'), 'Reading')
  await user.click(screen.getByRole('button', { name: 'Create' }))

  // Assert
  await waitFor(() =>
    expect(fake.api.categories.command).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ type: 'categoryCreate', name: 'Reading' }),
    ),
  )
})

test('keeps the form open and shows the duplicate-name copy inline when main refuses', async () => {
  // Arrange
  const user = userEvent.setup()
  const { fake } = await renderWithSettings(<OfflineCategoryManagement />, {
    categories: [GENERAL_CATEGORY, WORK],
  })
  fake.api.categories.command.mockResolvedValueOnce({
    ok: false,
    reason: 'name-taken-local',
  } as never)

  // Act
  await user.click(screen.getByRole('button', { name: 'New category' }))
  await user.type(screen.getByLabelText('Name'), 'Work')
  await user.click(screen.getByRole('button', { name: 'Create' }))

  // Assert
  expect(await screen.findByRole('alert')).toHaveTextContent(
    `There's already a category called "Work" here.`,
  )
  expect(screen.getByLabelText('Name')).toHaveValue('Work')
})

test('hides rename, move and delete for the default category and explains why', async () => {
  // Arrange
  const user = userEvent.setup()
  await renderWithSettings(<OfflineCategoryManagement />)

  // Act
  await user.click(screen.getByRole('button', { name: 'Edit General' }))

  // Assert
  const form = screen.getByRole('form', { name: 'Edit category' })
  expect(
    within(form).getByText(
      'General is your default category. You can change its color.',
    ),
  ).toBeVisible()
  expect(within(form).queryByLabelText('Name')).not.toBeInTheDocument()
})

test('explains that categories wait for LiveEditor while the workspace is still opening', async () => {
  // Arrange / Act
  await renderWithSettings(<OfflineCategoryManagement />, { phase: 'opening' })

  // Assert
  expect(
    screen.getByText('Categories are available once LiveEditor has opened.'),
  ).toBeVisible()
})
