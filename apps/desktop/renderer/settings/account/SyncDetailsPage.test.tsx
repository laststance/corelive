// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import type { SyncDetailRow } from '@corelive/desktop-contract/category-sync'
import type { OfflineSyncDetails } from '@corelive/desktop-contract/offline-editor-api'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { EMPTY_SYNC_DETAILS, renderWithSettings } from '../settingsTestkit'

import { SyncDetailsPage } from './SyncDetailsPage'

const CONFLICT: SyncDetailRow = {
  id: 'cat-1:color',
  type: 'conflict',
  categoryPath: 'Work',
  field: 'color',
  macValue: 'red',
  dashboardValue: 'blue',
  actions: ['use-mac-value', 'keep-dashboard-value'],
}
const NAME_TAKEN: SyncDetailRow = {
  id: 'cat-2:name',
  type: 'name-taken',
  categoryPath: 'Work / Plans',
  field: 'name',
  macValue: 'Ideas',
  dashboardValue: 'Plans',
  actions: ['choose-another-name', 'keep-dashboard-value'],
}
const DIGEST: SyncDetailRow = {
  id: 'cat-3:color',
  type: 'digest-mismatch',
  categoryPath: 'Home',
  field: 'color',
  macValue: 'green',
  dashboardValue: null,
  actions: ['try-again'],
}
const BLOCKED: SyncDetailRow = {
  id: 'cat-4:delete',
  type: 'delete-blocked',
  categoryPath: 'Old / Archive',
  field: 'delete',
  macValue: null,
  dashboardValue: null,
  childName: 'Plans',
  actions: ['choose-another-name', 'keep-dashboard-value'],
}
const WAITING: SyncDetailRow = {
  id: 'op-1:waiting',
  type: 'waiting-confirm',
  categoryPath: 'Reading',
  field: 'rename',
  macValue: null,
  dashboardValue: null,
  actions: [],
}

/** Builds a Sync details payload around the given rows. */
function withRows(
  rows: SyncDetailRow[],
  extra: Partial<OfflineSyncDetails> = {},
): OfflineSyncDetails {
  return { ...EMPTY_SYNC_DETAILS, rows, ...extra }
}

test('shows "No sync issues" with no sign-in prompt when nothing needs a look', async () => {
  // Arrange / Act
  await renderWithSettings(<SyncDetailsPage onBack={vi.fn()} />)

  // Assert
  expect(
    await screen.findByText('No sync issues. Everything on this Mac is saved.'),
  ).toBeVisible()
  expect(screen.queryByText(/sign in/i)).toBeNull()
})

test('always offers Back to Settings at the top of the page', async () => {
  // Arrange
  const user = userEvent.setup()
  const onBack = vi.fn()
  await renderWithSettings(<SyncDetailsPage onBack={onBack} />)

  // Act
  await user.click(screen.getByRole('button', { name: /Back to Settings/ }))

  // Assert
  expect(onBack).toHaveBeenCalledOnce()
  const first = screen.getAllByRole('button')[0]
  expect(first).toHaveAccessibleName(/Back to Settings/)
})

test('a conflict row shows both values and Use / Keep actions', async () => {
  // Arrange / Act
  await renderWithSettings(<SyncDetailsPage onBack={vi.fn()} />, {
    syncDetails: withRows([CONFLICT]),
  })

  // Assert
  const row = (await screen.findByText('Work')).closest('li')!
  expect(within(row).getByText('Color')).toBeVisible()
  expect(row).toHaveTextContent('On this Mac: red')
  expect(row).toHaveTextContent('On the dashboard: blue')
  expect(within(row).getByRole('button', { name: 'Use "red"' })).toBeVisible()
  expect(within(row).getByRole('button', { name: 'Keep "blue"' })).toBeVisible()
})

test('Use "<Mac value>" sends the use-mac-value action for that row', async () => {
  // Arrange
  const user = userEvent.setup()
  const { fake } = await renderWithSettings(
    <SyncDetailsPage onBack={vi.fn()} />,
    { syncDetails: withRows([CONFLICT]) },
  )

  // Act
  await user.click(await screen.findByRole('button', { name: 'Use "red"' }))

  // Assert
  expect(fake.api.categories.command).toHaveBeenCalledWith(
    1,
    expect.objectContaining({
      type: 'syncDetailAction',
      rowId: 'cat-1:color',
      action: 'use-mac-value',
    }),
  )
})

test('Keep "<dashboard value>" sends keep-dashboard-value and moves the row to History as Resolved', async () => {
  // Arrange
  const user = userEvent.setup()
  const { fake } = await renderWithSettings(
    <SyncDetailsPage onBack={vi.fn()} />,
    { syncDetails: withRows([CONFLICT]) },
  )
  fake.api.categories.command.mockImplementation(async () => {
    fake.setSyncDetails(
      withRows([], {
        history: [
          {
            id: 'h-1',
            at: 1,
            kind: 'resolved',
            categoryPath: 'Work',
            field: 'color',
            macValue: 'red',
            dashboardValue: 'blue',
          },
        ],
      }),
    )
    return { ok: true as const, generation: 1, revision: 2, workspace: null }
  })

  // Act
  await user.click(await screen.findByRole('button', { name: 'Keep "blue"' }))

  // Assert
  expect(fake.api.categories.command).toHaveBeenCalledWith(
    1,
    expect.objectContaining({ action: 'keep-dashboard-value' }),
  )
  expect(await screen.findByText('Resolved')).toBeVisible()
  expect(
    screen.getByText('No sync issues. Everything on this Mac is saved.'),
  ).toBeVisible()
})

test('Choose another name opens an inline form and sends the typed name', async () => {
  // Arrange
  const user = userEvent.setup()
  const { fake } = await renderWithSettings(
    <SyncDetailsPage onBack={vi.fn()} />,
    { syncDetails: withRows([NAME_TAKEN]) },
  )

  // Act
  await user.click(
    await screen.findByRole('button', { name: 'Choose another name' }),
  )
  await user.type(screen.getByLabelText('New name'), 'Ideas 2')
  await user.click(screen.getByRole('button', { name: 'Save name' }))

  // Assert
  expect(fake.api.categories.command).toHaveBeenCalledWith(
    1,
    expect.objectContaining({
      action: 'choose-another-name',
      rowId: 'cat-2:name',
      name: 'Ideas 2',
    }),
  )
})

test('a refused new name shows the inline category message and keeps the form and the typed value', async () => {
  // Arrange
  const user = userEvent.setup()
  const { fake } = await renderWithSettings(
    <SyncDetailsPage onBack={vi.fn()} />,
    { syncDetails: withRows([NAME_TAKEN]) },
  )
  fake.api.categories.command.mockResolvedValue({
    ok: false as const,
    reason: 'name-taken-local',
  } as never)
  await user.click(
    await screen.findByRole('button', { name: 'Choose another name' }),
  )

  // Act
  await user.type(screen.getByLabelText('New name'), 'Work')
  await user.click(screen.getByRole('button', { name: 'Save name' }))

  // Assert
  expect(await screen.findByRole('alert')).toHaveTextContent(
    `There's already a category called "Work" here.`,
  )
  expect(screen.getByLabelText('New name')).toHaveValue('Work')
})

test('Escape closes the rename form without sending anything', async () => {
  // Arrange
  const user = userEvent.setup()
  const { fake } = await renderWithSettings(
    <SyncDetailsPage onBack={vi.fn()} />,
    { syncDetails: withRows([NAME_TAKEN]) },
  )
  await user.click(
    await screen.findByRole('button', { name: 'Choose another name' }),
  )

  // Act
  await user.keyboard('{Escape}')

  // Assert
  expect(screen.queryByLabelText('New name')).toBeNull()
  expect(fake.api.categories.command).not.toHaveBeenCalled()
})

test('a digest-mismatch row says the change was kept on this Mac and Try again re-sends it', async () => {
  // Arrange
  const user = userEvent.setup()
  const { fake } = await renderWithSettings(
    <SyncDetailsPage onBack={vi.fn()} />,
    { syncDetails: withRows([DIGEST]) },
  )

  // Act
  expect(
    await screen.findByText(
      "Couldn't apply a change. It was kept on this Mac.",
    ),
  ).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Try again' }))

  // Assert
  expect(fake.api.categories.command).toHaveBeenCalledWith(
    1,
    expect.objectContaining({ action: 'try-again', rowId: 'cat-3:color' }),
  )
})

test('a blocked delete offers Rename "<child>" and Keep it on the dashboard', async () => {
  // Arrange
  const user = userEvent.setup()
  const { fake } = await renderWithSettings(
    <SyncDetailsPage onBack={vi.fn()} />,
    { syncDetails: withRows([BLOCKED]) },
  )

  // Assert
  expect(
    await screen.findByText(`Couldn't remove "Archive" on the dashboard.`),
  ).toBeVisible()

  // Act
  await user.click(screen.getByRole('button', { name: 'Rename "Plans"' }))
  const input = screen.getByLabelText('New name')
  await user.clear(input)
  await user.type(input, 'Plans old')
  await user.click(screen.getByRole('button', { name: 'Save name' }))

  // Assert
  expect(fake.api.categories.command).toHaveBeenCalledWith(
    1,
    expect.objectContaining({
      action: 'choose-another-name',
      rowId: 'cat-4:delete',
      name: 'Plans old',
    }),
  )
})

test('Keep it on the dashboard sends keep-dashboard-value for a blocked delete', async () => {
  // Arrange
  const user = userEvent.setup()
  const { fake } = await renderWithSettings(
    <SyncDetailsPage onBack={vi.fn()} />,
    { syncDetails: withRows([BLOCKED]) },
  )

  // Act
  await user.click(
    await screen.findByRole('button', { name: 'Keep it on the dashboard' }),
  )

  // Assert
  expect(fake.api.categories.command).toHaveBeenCalledWith(
    1,
    expect.objectContaining({
      action: 'keep-dashboard-value',
      rowId: 'cat-4:delete',
    }),
  )
})

test('a waiting row says the dashboard has not confirmed yet and offers no action', async () => {
  // Arrange / Act
  await renderWithSettings(<SyncDetailsPage onBack={vi.fn()} />, {
    syncDetails: withRows([WAITING]),
  })

  // Assert
  const row = (await screen.findByText('Reading')).closest('li')!
  expect(
    within(row).getByText('Waiting for the dashboard to confirm a change'),
  ).toBeVisible()
  expect(within(row).queryAllByRole('button')).toHaveLength(0)
})

test('an informational row says it was changed back to match the dashboard', async () => {
  // Arrange / Act
  await renderWithSettings(<SyncDetailsPage onBack={vi.fn()} />, {
    syncDetails: withRows([
      {
        id: 'cat-5:parentLocalId',
        type: 'invalid-parent',
        categoryPath: 'Home',
        field: 'parentLocalId',
        macValue: 'Work',
        dashboardValue: 'Top level',
        actions: [],
      },
    ]),
  })

  // Assert
  expect(
    await screen.findByText('Changed back to match the dashboard.'),
  ).toBeVisible()
})

test('shows Applying… and disables the row actions while an action is in flight', async () => {
  // Arrange
  const user = userEvent.setup()
  const { fake } = await renderWithSettings(
    <SyncDetailsPage onBack={vi.fn()} />,
    { syncDetails: withRows([CONFLICT]) },
  )
  fake.api.categories.command.mockImplementation(
    async () => new Promise(() => undefined),
  )

  // Act
  await user.click(await screen.findByRole('button', { name: 'Use "red"' }))

  // Assert
  expect(await screen.findByText('Applying…')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Use "red"' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Keep "blue"' })).toBeDisabled()
})

test('a failed action shows "Couldn\'t apply. Try again." on the row and keeps it', async () => {
  // Arrange
  const user = userEvent.setup()
  const { fake } = await renderWithSettings(
    <SyncDetailsPage onBack={vi.fn()} />,
    { syncDetails: withRows([CONFLICT]) },
  )
  fake.api.categories.command.mockResolvedValue({
    ok: false as const,
    reason: 'record-unavailable',
  } as never)

  // Act
  await user.click(await screen.findByRole('button', { name: 'Use "red"' }))

  // Assert
  expect(await screen.findByText("Couldn't apply. Try again.")).toBeVisible()
  expect(screen.getByRole('button', { name: 'Use "red"' })).toBeEnabled()
})

test('resolving a row moves focus to the next row, and to the Needs a look heading after the last one', async () => {
  // Arrange
  const user = userEvent.setup()
  const { fake } = await renderWithSettings(
    <SyncDetailsPage onBack={vi.fn()} />,
    { syncDetails: withRows([CONFLICT, DIGEST]) },
  )
  const resolve = (remaining: SyncDetailRow[]) =>
    fake.api.categories.command.mockImplementationOnce(async () => {
      fake.setSyncDetails(withRows(remaining))
      return { ok: true as const, generation: 1, revision: 2, workspace: null }
    })
  resolve([DIGEST])

  // Act: resolve the first row
  await user.click(await screen.findByRole('button', { name: 'Keep "blue"' }))

  // Assert: focus lands on the following row
  await waitFor(() =>
    expect(screen.getByText('Home').closest('li')).toHaveFocus(),
  )

  // Act: resolve the last row
  resolve([])
  await user.click(screen.getByRole('button', { name: 'Try again' }))

  // Assert: focus lands on the "Needs a look" heading
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Needs a look' })).toHaveFocus(),
  )
})

test('History lists the migration summary with Open recovery copies, preserved backups and resolved entries', async () => {
  // Arrange
  const user = userEvent.setup()
  const { fake } = await renderWithSettings(
    <SyncDetailsPage onBack={vi.fn()} />,
    {
      syncDetails: withRows([], {
        migrationSummary: {
          sourceAccountId: 'acct-1',
          importedDrafts: 4,
          importedCompletions: 120,
          recoveryCopies: 2,
          v1FilesKept: 3,
          preservedBackups: 1,
        },
        preservedBackups: [{ fileName: 'old-workspace.json', accountId: null }],
        history: [
          {
            id: 'h-1',
            at: 1,
            kind: 'reverted',
            categoryPath: 'Home',
            field: 'parentLocalId',
            macValue: 'Work',
            dashboardValue: 'Top level',
          },
        ],
      }),
    },
  )

  // Act
  const history = (
    await screen.findByRole('heading', { name: 'History' })
  ).closest('section')!
  await user.click(
    within(history).getByRole('button', { name: 'Open recovery copies' }),
  )

  // Assert
  expect(history).toHaveTextContent('4 drafts, 120 keeps, 2 recovery copies')
  expect(history).toHaveTextContent('Kept as a backup: old-workspace.json')
  expect(history).toHaveTextContent('Changed back to match the dashboard.')
  expect(fake.api.liveEditor.show).toHaveBeenCalledOnce()
})

test('History shows only the latest 50 entries', async () => {
  // Arrange
  const history = Array.from({ length: 60 }, (_, index) => ({
    id: `h-${index}`,
    at: index,
    kind: 'resolved' as const,
    categoryPath: `Category ${index}`,
    field: 'name',
    macValue: null,
    dashboardValue: null,
  }))

  // Act
  await renderWithSettings(<SyncDetailsPage onBack={vi.fn()} />, {
    syncDetails: withRows([], { history }),
  })

  // Assert
  expect(await screen.findByText('Category 49')).toBeVisible()
  expect(screen.queryByText('Category 50')).toBeNull()
})
