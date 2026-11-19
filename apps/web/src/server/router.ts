import { whoami } from './procedures/account'
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from './procedures/category'
import {
  syncCategoryApply,
  syncCategoryReceipts,
} from './procedures/categorySync'
import { getDayDetail, getHeatmap, getJournal } from './procedures/completed'
import { historyRange } from './procedures/completionHistory'
import {
  syncApply,
  syncBootstrap,
  syncCheckpoint,
  syncReceipts,
} from './procedures/completionSync'
import {
  getDashboardAppearance,
  setDashboardAppearance,
} from './procedures/dashboardAppearance'
import { bootstrapHome } from './procedures/home'
import {
  assignTask,
  getMyTree,
  getUnassignedPool,
  getUnassignedPoolPage,
  unassignTask,
} from './procedures/skillTree'

export const router = {
  account: {
    whoami,
  },
  dashboardAppearance: {
    get: getDashboardAppearance,
    set: setDashboardAppearance,
  },
  home: {
    bootstrap: bootstrapHome,
  },
  category: {
    list: listCategories,
    create: createCategory,
    update: updateCategory,
    delete: deleteCategory,
    syncApply: syncCategoryApply,
    syncReceipts: syncCategoryReceipts,
  },
  completed: {
    syncApply,
    syncReceipts,
    syncCheckpoint,
    syncBootstrap,
    heatmap: getHeatmap,
    dayDetail: getDayDetail,
    historyRange,
    journal: getJournal,
  },
  skillTree: {
    getMyTree,
    getUnassignedPool,
    getUnassignedPoolPage,
    assignTask,
    unassignTask,
  },
}

export type AppRouter = typeof router
