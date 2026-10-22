import {
  listCategories,
  listCategoryChanges,
  createCategory,
  updateCategory,
  deleteCategory,
} from './procedures/category'
import {
  createCompleted,
  importLocalCompleted,
  deleteCompleted,
  getDayDetail,
  getHeatmap,
  getJournal,
} from './procedures/completed'
import {
  syncApply,
  syncBootstrap,
  syncCheckpoint,
  syncReceipts,
} from './procedures/completionSync'
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
    changes: listCategoryChanges,
    create: createCategory,
    update: updateCategory,
    delete: deleteCategory,
  },
  completed: {
    syncApply,
    syncReceipts,
    syncCheckpoint,
    syncBootstrap,
    heatmap: getHeatmap,
    dayDetail: getDayDetail,
    journal: getJournal,
    create: createCompleted,
    importLocal: importLocalCompleted,
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
