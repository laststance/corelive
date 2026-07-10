import { configureStore } from '@reduxjs/toolkit'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Provider } from 'react-redux'

import userSettingsReducer, {
  initialState,
} from '@/lib/redux/slices/settingsSlice'

import { TodoItem } from './TodoItem'

// A minimal store with 居残りモード ON so the completed-in-place treatment renders
// exactly as it does in retain mode: amber checkbox + taupe strikethrough, no
// status badge (D16), and no per-row trash on the completed row (D14). Spread
// the slice defaults so this story never has to track new setting fields.
const retainStore = configureStore({
  reducer: { settings: userSettingsReducer },
  preloadedState: {
    settings: { ...initialState, retainCompletedInList: true },
  },
})

const noop = (): void => {}

const meta = {
  title: 'Home/TodoItem',
  component: TodoItem,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <Provider store={retainStore}>
        <div className="max-w-md">
          <Story />
        </div>
      </Provider>
    ),
  ],
} satisfies Meta<typeof TodoItem>

export default meta
type Story = StoryObj<typeof meta>

const baseTodo = {
  id: '1',
  text: 'Draft project brief',
  completed: false,
  createdAt: new Date('2026-06-04T09:00:00.000Z'),
}

/** A pending row — full-contrast ink, empty checkbox, trash present. */
export const Pending: Story = {
  args: { todo: baseTodo, onToggleComplete: noop, onDelete: noop },
}

/**
 * The 居残りモード completed-in-place state — checked amber checkbox + taupe
 * strikethrough, staying in the active list. No status badge; no per-row trash
 * (tidy via Clear). This is the state the feature's Success Criteria calls for.
 */
export const CompletedInPlace: Story = {
  args: {
    todo: { ...baseTodo, id: '2', text: '30-minute walk', completed: true },
    onToggleComplete: noop,
    onDelete: noop,
  },
}
