/**
 * Per-timezone `Intl.DateTimeFormat` cache. Bucketing a 365-day heatmap can
 * call {@link toLocalDayKey} thousands of times with the *same* zone, and
 * constructing a formatter is the expensive part — so build it once per
 * distinct IANA zone and reuse. Formatters are stateless/immutable, so a
 * module-global cache is safe across requests.
 */
const dayKeyFormatterCache = new Map<string, Intl.DateTimeFormat>()

/**
 * Returns a cached YYYY-MM-DD formatter for `timeZone`. Throws `RangeError`
 * (propagated to {@link toLocalDayKey}'s catch) when the zone is unknown, so
 * a failed lookup is never cached.
 *
 * @param timeZone - IANA zone id (e.g. `'Asia/Tokyo'`)
 * @returns A reusable formatter emitting 4-2-2 numeric parts
 */
function getDayKeyFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = dayKeyFormatterCache.get(timeZone)
  if (cached) return cached
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  dayKeyFormatterCache.set(timeZone, formatter)
  return formatter
}

/**
 * Maps a UTC instant to the calendar day (YYYY-MM-DD) it falls on *in a given
 * IANA timezone* — the single source of truth for "which local day is this?".
 * The server buckets each `completedAt` through it for the heatmap/day-detail;
 * the client derives "today" through it (via {@link import('./getLocalTodayIsoDate').getLocalTodayIsoDate}),
 * so both ends agree at the local-midnight boundary instead of splitting a
 * late-night completion onto the next UTC day.
 *
 * A `null`/empty/unrecognized `timeZone` falls back to the UTC day, which is
 * exactly the pre-timezone behavior — so absent-tz callers are byte-for-byte
 * unchanged. An unrecognized zone is caught per call and degrades to UTC
 * *silently* (no signal): callers that must surface a bad zone should
 * pre-validate it rather than infer it from the bucketed output.
 *
 * @param instant - The absolute moment to bucket (e.g. a `completedAt`)
 * @param timeZone - IANA zone (e.g. `'Asia/Tokyo'`); `null` → UTC fallback
 * @returns
 * - YYYY-MM-DD calendar day in `timeZone`
 * - YYYY-MM-DD UTC day when `timeZone` is null/empty/unrecognized
 * @example
 * toLocalDayKey(new Date('2026-06-11T15:30:00Z'), 'Asia/Tokyo')       // => '2026-06-12'
 * toLocalDayKey(new Date('2026-06-11T05:00:00Z'), 'Pacific/Pago_Pago') // => '2026-06-10'
 * toLocalDayKey(new Date('2026-06-11T23:30:00Z'), null)               // => '2026-06-11'
 * toLocalDayKey(new Date('2026-06-11T23:30:00Z'), 'Not/AZone')        // => '2026-06-11' (UTC fallback)
 */
export function toLocalDayKey(instant: Date, timeZone: string | null): string {
  // Null/empty zone: behave like the original UTC bucketing.
  if (!timeZone) return instant.toISOString().slice(0, 10)
  try {
    const parts = getDayKeyFormatter(timeZone).formatToParts(instant)
    let year = ''
    let month = ''
    let day = ''
    for (const part of parts) {
      if (part.type === 'year') year = part.value
      else if (part.type === 'month') month = part.value
      else if (part.type === 'day') day = part.value
    }
    return `${year}-${month}-${day}`
  } catch {
    // Unknown/garbage IANA zone → fall back to UTC so a bad header degrades
    // gracefully to the legacy behavior instead of crashing aggregation.
    return instant.toISOString().slice(0, 10)
  }
}
