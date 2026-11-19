import { exportDayAsImage } from '@corelive/live-editor/activity-card'

import type { ActivityCardAPI } from '../electron/mcp/activityChannel'

declare global {
  interface Window {
    activityCard: ActivityCardAPI
  }
}

// Only the verified owner supplies the day and receives the finished image.
void window.activityCard
  .input()
  .then(exportDayAsImage)
  .then(
    (dataUrl) => window.activityCard.finish(dataUrl),
    () => window.activityCard.finish(null),
  )
