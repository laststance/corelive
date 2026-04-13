import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from './procedures/category'
import { getHeatmap } from './procedures/completed'
import {
  getElectronSettings,
  upsertElectronSettings,
} from './procedures/electronSettings'
import {
  assignTask,
  getMyTree,
  getUnassignedPool,
  unassignTask,
} from './procedures/skillTree'
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
  completed: {
    heatmap: getHeatmap,
  },
  electronSettings: {
    get: getElectronSettings,
    upsert: upsertElectronSettings,
  },
  skillTree: {
    getMyTree,
    getUnassignedPool,
    assignTask,
    unassignTask,
  },
}

export type AppRouter = typeof router
