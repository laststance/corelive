export const QUERY_STALE_TIME_MS = 60_000
export const QUERY_CACHE_RETENTION_MS = 604_800_000
export const PERSISTED_QUERY_MAX_AGE_MS = QUERY_CACHE_RETENTION_MS

/** Stable localStorage key shared by the persister and focused E2E cache resets. */
export const PERSISTED_QUERY_STORAGE_KEY = 'REACT_QUERY_OFFLINE_CACHE'
