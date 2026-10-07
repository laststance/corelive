/** One local calendar day ahead for exclusive date bounds and midnight scheduling. */
export const NEXT_LOCAL_DAY_OFFSET_DAYS = 1

/** Local noon safely anchors a YYYY-MM-DD key away from DST midnight edges. */
export const LOCAL_DAY_QUERY_ANCHOR_TIME = 'T12:00:00'

/** Fixed 24-hour duration for elapsed-time fixtures, not local calendar arithmetic. */
export const DAY_MS = 86_400_000
