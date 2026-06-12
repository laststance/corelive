import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CategoryWithCount } from '@/server/schemas/category'

import { BrainDumpEditor } from './BrainDumpEditor'

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({
    mutateAsync: vi.fn(),
  }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    dismiss: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('@/hooks/use-mounted', () => ({
  useMounted: () => true,
}))

vi.mock('@/hooks/useClerkQueryReady', () => ({
  useClerkQueryReady: () => true,
}))

vi.mock('@/hooks/useSelectedCategory', () => ({
  useSelectedCategory: () => [1],
}))

vi.mock('@/lib/orpc/client-query', () => ({
  orpc: {
    completed: {
      create: {
        mutationOptions: vi.fn(() => ({})),
      },
      delete: {
        mutationOptions: vi.fn(() => ({})),
      },
      heatmap: {
        key: vi.fn(() => ['completed', 'heatmap']),
      },
    },
  },
}))

vi.mock('@/lib/todo-sync-channel', () => ({
  broadcastTodoSync: vi.fn(),
}))

vi.mock('../../../electron/utils/electron-client', () => ({
  isBrainDumpEnvironment: () => true,
}))

const categories: CategoryWithCount[] = [
  {
    id: 1,
    name: 'Today',
    color: 'amber',
    isDefault: true,
    userId: 1,
    createdAt: new Date('2026-06-12T00:00:00.000Z'),
    updatedAt: new Date('2026-06-12T00:00:00.000Z'),
    _count: { todos: 0 },
  },
]

type BrainDumpSpacesBridge = {
  getVisibleOnAllWorkspaces: ReturnType<typeof vi.fn>
  setVisibleOnAllWorkspaces: ReturnType<typeof vi.fn>
}

/**
 * Installs the BrainDump preload bridge used by the editor in renderer tests.
 * @param spaces - Fake Spaces bridge methods for this scenario.
 * @returns Nothing; mutates the happy-dom window object.
 * @example
 * installBrainDumpAPI({ getVisibleOnAllWorkspaces, setVisibleOnAllWorkspaces })
 */
function installBrainDumpAPI(spaces: BrainDumpSpacesBridge): void {
  Object.defineProperty(window, 'brainDumpAPI', {
    configurable: true,
    writable: true,
    value: {
      window: {
        close: vi.fn().mockResolvedValue(undefined),
        getBounds: vi.fn().mockResolvedValue(null),
        getOpacity: vi.fn().mockResolvedValue(1),
        setBounds: vi.fn().mockResolvedValue(undefined),
        setOpacity: vi.fn().mockResolvedValue(undefined),
        toggle: vi.fn().mockResolvedValue(undefined),
      },
      note: {
        get: vi.fn().mockResolvedValue(''),
        set: vi.fn().mockResolvedValue(undefined),
      },
      sync: {
        getEnabled: vi.fn().mockResolvedValue(true),
        setEnabled: vi.fn().mockResolvedValue(undefined),
      },
      category: {
        getLast: vi.fn().mockResolvedValue(1),
        setLast: vi.fn().mockResolvedValue(undefined),
      },
      spaces,
      on: vi.fn(() => vi.fn()),
    },
  })
}

describe('BrainDumpEditor Spaces tracking switch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reflects the saved Mac desktop tracking preference in the header switch', async () => {
    // Arrange
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installBrainDumpAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })

    // Act
    render(<BrainDumpEditor categories={categories} />)
    const spacesSwitch = screen.getByRole('switch', {
      name: 'Show BrainDump on all Mac desktops',
    })

    // Assert
    await waitFor(() => {
      expect(spacesSwitch).toBeChecked()
    })
  })

  it('persists the header switch change through the BrainDump preload bridge', async () => {
    // Arrange
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    installBrainDumpAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    const user = userEvent.setup()
    render(<BrainDumpEditor categories={categories} />)
    const spacesSwitch = screen.getByRole('switch', {
      name: 'Show BrainDump on all Mac desktops',
    })
    await waitFor(() => {
      expect(spacesSwitch).toBeChecked()
    })

    // Act
    await user.click(spacesSwitch)

    // Assert
    expect(setVisibleOnAllWorkspaces).toHaveBeenCalledWith(false)
    await waitFor(() => {
      expect(spacesSwitch).not.toBeChecked()
    })
  })

  it('rolls the header switch back when the main process rejects the change', async () => {
    // Arrange
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi
      .fn()
      .mockRejectedValue(new Error('main process unavailable'))
    installBrainDumpAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    const user = userEvent.setup()
    render(<BrainDumpEditor categories={categories} />)
    const spacesSwitch = screen.getByRole('switch', {
      name: 'Show BrainDump on all Mac desktops',
    })
    await waitFor(() => {
      expect(spacesSwitch).not.toBeChecked()
    })

    // Act
    await user.click(spacesSwitch)

    // Assert
    await waitFor(() => {
      expect(spacesSwitch).not.toBeChecked()
    })
    expect(toast.error).toHaveBeenCalledWith(
      'Failed to update desktop tracking',
    )
  })
})
