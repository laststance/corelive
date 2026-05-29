import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'

import type { CategoryWithCount } from '@/server/schemas/category'

import type { PasteImportItem } from './paste-import-types'
import { PasteImportDialog } from './PasteImportDialog'

/**
 * Stories target the PRESENTATIONAL dialog (no oRPC / react-query / Toaster),
 * so they render in Storybook + storybook-test with zero providers. The parse
 * is pure/synchronous, so every interaction state is reachable from `zone` +
 * `initialText` args alone. This doubles as the design-review / QA surface.
 */
const SAMPLE_CATEGORIES: CategoryWithCount[] = [
  {
    id: 1,
    name: 'General',
    color: 'blue',
    isDefault: true,
    userId: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    _count: { todos: 4 },
  },
  {
    id: 2,
    name: 'Writing',
    color: 'amber',
    isDefault: false,
    userId: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    _count: { todos: 2 },
  },
  {
    id: 3,
    name: 'Health',
    color: 'green',
    isDefault: false,
    userId: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    _count: { todos: 7 },
  },
]

// A paste with a couple of droppable (blank / prefix-only) lines → "skipped".
const PREVIEW_WITH_SKIPS_TEXT = [
  '- shipped the 0.7.0 release',
  '',
  '- [x] reviewed three PRs',
  '   ',
  'wrote the weekly digest',
  '- ',
  'https://corelive.app/changelog',
].join('\n')

// 1,200 non-blank lines → over the 1,000 cap.
const OVER_CAP_TEXT = Array.from(
  { length: 1200 },
  (_, index) => `task number ${index + 1}`,
).join('\n')

const noop = (_items: PasteImportItem[]) => {}

const meta: Meta<typeof PasteImportDialog> = {
  title: 'Import/PasteImport',
  component: PasteImportDialog,
  parameters: { layout: 'fullscreen' },
}

export default meta
type Story = StoryObj<typeof PasteImportDialog>

/**
 * Renders the dialog open + controllable so the modal content is visible in the
 * canvas (Radix portals the content; controlled `open` keeps it mounted).
 */
function Template(args: React.ComponentProps<typeof PasteImportDialog>) {
  const [open, setOpen] = useState(true)
  return (
    <div style={{ minHeight: 600 }}>
      <PasteImportDialog {...args} open={open} onOpenChange={setOpen} />
    </div>
  )
}

/** Idle / empty: confirm disabled, warm empty hint below. */
export const Empty: Story = {
  render: (args) => <Template {...args} />,
  args: {
    zone: 'completed',
    categories: SAMPLE_CATEGORIES,
    defaultCategoryId: 1,
    isSubmitting: false,
    error: null,
    onConfirm: noop,
    initialText: '',
  },
}

/** Preview with skipped lines: dense list + `N tasks · M skipped`. */
export const PreviewWithSkips: Story = {
  render: (args) => <Template {...args} />,
  args: {
    zone: 'completed',
    categories: SAMPLE_CATEGORIES,
    defaultCategoryId: 1,
    isSubmitting: false,
    error: null,
    onConfirm: noop,
    initialText: PREVIEW_WITH_SKIPS_TEXT,
  },
}

/** Over-cap: `1,200 lines · importing the first 1,000`; confirm `Add 1,000`. */
export const OverCap: Story = {
  render: (args) => <Template {...args} />,
  args: {
    zone: 'completed',
    categories: SAMPLE_CATEGORIES,
    defaultCategoryId: 1,
    isSubmitting: false,
    error: null,
    onConfirm: noop,
    initialText: OVER_CAP_TEXT,
  },
}

/** Todo zone: shows the pre-confirm "these stay open…" expectation note. */
export const TodoZone: Story = {
  render: (args) => <Template {...args} />,
  args: {
    zone: 'todo',
    categories: SAMPLE_CATEGORIES,
    defaultCategoryId: 1,
    isSubmitting: false,
    error: null,
    onConfirm: noop,
    initialText: ['draft the Q3 plan', 'book the venue', 'email the team'].join(
      '\n',
    ),
  },
}

/** Submitting: inputs locked, confirm shows the spinner + `Adding…`. */
export const Submitting: Story = {
  render: (args) => <Template {...args} />,
  args: {
    zone: 'completed',
    categories: SAMPLE_CATEGORIES,
    defaultCategoryId: 1,
    isSubmitting: true,
    error: null,
    onConfirm: noop,
    initialText: ['shipped the release', 'reviewed PRs'].join('\n'),
  },
}

/** Error / offline: dialog stays open, paste preserved, confirm → `Try again`. */
export const ErrorOffline: Story = {
  render: (args) => <Template {...args} />,
  args: {
    zone: 'completed',
    categories: SAMPLE_CATEGORIES,
    defaultCategoryId: 1,
    isSubmitting: false,
    error: "Couldn't reach the server — your paste is safe",
    onConfirm: noop,
    initialText: ['shipped the release', 'reviewed PRs'].join('\n'),
  },
}
