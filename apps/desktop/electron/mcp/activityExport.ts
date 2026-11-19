import {
  getActivityCardInput,
  type ExportDayInput,
} from '@corelive/live-editor/activity-card'
import { nativeImage } from 'electron'
import { z } from 'zod'

import { renderActivityCard } from './activityRenderer'
import { publishExportFile } from './publishExportFile'
import { McpActionError } from './result'

const category = z.object({
  id: z.number().int(),
  name: z.string(),
  color: z.string(),
})
const dayDetail = z.object({
  date: z.iso.date(),
  count: z.number().int().nonnegative(),
  tasks: z.array(
    z.object({
      category: category
        .extend({ parent: category.nullable().optional() })
        .nullable(),
    }),
  ),
})

type ActivityExportRequest = {
  day: string
  filename?: string
  overwrite?: boolean
}

interface ActivityExportDependencies {
  profileDirectory: string
  readDay(input: { date: string; timezone: string }): Promise<unknown>
  /** Rechecks the originally authenticated binding before a private image becomes visible. */
  assertAccountCurrent(): void
  render?: (input: ExportDayInput) => Promise<string>
}

/** Uses Chromium's PNG decoder to reject damaged or mislabeled captures before touching the target.
 * @example const bytes = decodeActivityPng(dataUrl)
 */
function decodeActivityPng(dataUrl: string): Buffer {
  const invalid = () =>
    new McpActionError(
      'capture-invalid',
      'Render the activity card again. No image was saved.',
    )
  const prefix = 'data:image/png;base64,'
  // A 960 × 1200 RGBA capture is under 5 MiB before Base64 encoding.
  if (!dataUrl.startsWith(prefix) || dataUrl.length > 8 * 1024 * 1024)
    throw invalid()
  const encoded = dataUrl.slice(prefix.length)
  if (!encoded || encoded.length % 4 !== 0 || /[^a-zA-Z0-9+/=]/.test(encoded))
    throw invalid()
  const bytes = Buffer.from(encoded, 'base64')
  if (
    !bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ||
    bytes.length < 45 ||
    bytes.toString('ascii', 12, 16) !== 'IHDR' ||
    bytes.readUInt32BE(16) !== 960 ||
    bytes.readUInt32BE(20) !== 1200 ||
    !bytes.subarray(-12).equals(Buffer.from('0000000049454e44ae426082', 'hex'))
  )
    throw invalid()
  const decoded = nativeImage.createFromBuffer(bytes)
  const { width, height } = decoded.getSize()
  if (decoded.isEmpty() || width !== 960 || height !== 1200) throw invalid()
  return bytes
}

/**
 * Saves the dashboard's eligible day in the active profile's Exports folder or the supplied directory.
 * The caller supplies its account-scoped day reader. Publication is atomic: competitors can see
 * only a complete file, and exclusive links protect an occupied name until overwrite is requested.
 * @throws {McpActionError} For an ineligible day, failed capture or refused publication.
 * @example await exportActivityPng({ day: '2026-05-12', filename: 'activity.png' }, deps)
 */
export async function exportActivityPng(
  request: ActivityExportRequest,
  deps: ActivityExportDependencies,
): Promise<{ path: string }> {
  if (!z.iso.date().safeParse(request.day).success) {
    throw new McpActionError(
      'invalid-day',
      'Supply a calendar date in YYYY-MM-DD format.',
    )
  }
  const detail = dayDetail.safeParse(
    await deps.readDay({
      date: request.day,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  )
  const input = detail.success
    ? getActivityCardInput(request.day, detail.data)
    : null
  if (!input)
    throw new McpActionError(
      'day-unavailable',
      'Choose a loaded account day with completed activity.',
    )
  deps.assertAccountCurrent()
  const dataUrl = await (deps.render ?? renderActivityCard)(input).catch(() => {
    throw new McpActionError(
      'capture-failed',
      'The activity card could not be rendered. Retry the export.',
    )
  })
  return publishExportFile({
    filename: request.filename ?? `corelive-${request.day}.png`,
    bytes: decodeActivityPng(dataUrl),
    profileDirectory: deps.profileDirectory,
    overwrite: request.overwrite,
    beforePublish: deps.assertAccountCurrent,
  })
}
