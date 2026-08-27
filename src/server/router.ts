import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from './procedures/category'
import {
  createCompleted,
  deleteCompleted,
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
  completed: {
    heatmap: getHeatmap,
    dayDetail: getDayDetail,
    journal: getJournal,
    create: createCompleted,
    delete: deleteCompleted,
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
