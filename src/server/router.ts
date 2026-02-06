import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from './procedures/category'
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
  reorderTodos,
} from './procedures/todo'

export const router = {
  category: {
    list: listCategories,
    create: createCategory,
    update: updateCategory,
    delete: deleteCategory,
  },
  todo: {
    list: listTodos,
    create: createTodo,
    update: updateTodo,
    delete: deleteTodo,
    toggle: toggleTodo,
    clearCompleted: clearCompleted,
    reorder: reorderTodos,
  },
  electronSettings: {
    get: getElectronSettings,
    upsert: upsertElectronSettings,
  },
}

export type AppRouter = typeof router
