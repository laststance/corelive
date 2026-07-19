import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from './procedures/category'
import {
  createCompleted,
  createManyCompleted,
  deleteCompleted,
  deleteManyCompleted,
  getDayDetail,
  getHeatmap,
  getJournal,
} from './procedures/completed'
import {
  getElectronSettings,
  upsertElectronSettings,
} from './procedures/electronSettings'
import { bootstrapHome } from './procedures/home'
import {
  assignTask,
  getMyTree,
  getUnassignedPool,
  unassignTask,
} from './procedures/skillTree'
import {
  listTodos,
  createTodo,
  createManyTodo,
  deleteManyTodo,
  updateTodo,
  deleteTodo,
  toggleTodo,
  clearCompleted,
  reorderTodos,
} from './procedures/todo'

export const router = {
  home: {
    bootstrap: bootstrapHome,
  },
  category: {
    list: listCategories,
    create: createCategory,
    update: updateCategory,
    delete: deleteCategory,
  },
  todo: {
    list: listTodos,
    create: createTodo,
    createMany: createManyTodo,
    update: updateTodo,
    delete: deleteTodo,
    deleteMany: deleteManyTodo,
    toggle: toggleTodo,
    clearCompleted: clearCompleted,
    reorder: reorderTodos,
  },
  completed: {
    heatmap: getHeatmap,
    dayDetail: getDayDetail,
    journal: getJournal,
    create: createCompleted,
    createMany: createManyCompleted,
    delete: deleteCompleted,
    deleteMany: deleteManyCompleted,
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
