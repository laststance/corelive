export const HOME_HEATMAP_DAYS = 365

/** Cookie carrying the browser IANA zone so the Home SSR prefetch can build the exact heatmap query key this client will read. */
export const HOME_TIMEZONE_COOKIE_NAME = 'corelive-tz'

/** Cookie mirroring the localStorage category selection so LiveEditor and the sidebar agree on the active category across a reload. */
export const HOME_SELECTED_CATEGORY_COOKIE_NAME = 'corelive-selected-category'

/** Shared lifetime for the SSR-hint cookies above (one year). */
export const HOME_SSR_HINT_COOKIE_MAX_AGE_SECONDS = 31_536_000
