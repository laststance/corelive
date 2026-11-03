import { whoami } from './procedures/account'
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from './procedures/category'
import { getDayDetail, getHeatmap, getJournal } from './procedures/completed'
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
  account: {
    whoami,
  },
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
    syncApply,
    syncReceipts,
    syncCheckpoint,
    syncBootstrap,
    heatmap: getHeatmap,
    dayDetail: getDayDetail,
    journal: getJournal,
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
