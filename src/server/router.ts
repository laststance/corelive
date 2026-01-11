import {
  getElectronSettings,
  upsertElectronSettings,
} from './procedures/electronSettings'
import {
  listTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  toggleTodo,
  clearCompleted,
} from './procedures/todo'

export const router = {
  todo: {
    list: listTodos,
    create: createTodo,
    update: updateTodo,
    delete: deleteTodo,
    toggle: toggleTodo,
    clearCompleted: clearCompleted,
  },
  electronSettings: {
    get: getElectronSettings,
    upsert: upsertElectronSettings,
  },
}

export type AppRouter = typeof router
