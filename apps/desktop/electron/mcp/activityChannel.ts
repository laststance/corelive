import type { ExportDayInput } from '@corelive/live-editor/activity-card'

export const ACTIVITY_INPUT_CHANNEL = 'activity-card-input'
export const ACTIVITY_OUTPUT_CHANNEL = 'activity-card-output'

/** Capabilities available only in the bundled activity-card document. */
export interface ActivityCardAPI {
  input(): Promise<ExportDayInput>
  finish(dataUrl: string | null): void
}
