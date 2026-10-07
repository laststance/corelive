/**
 * Types the one `meta` key the app uses, so `meta: { persist: false }` is
 * checked instead of being an untyped bag — a typo there silently re-enables
 * persistence for a query that must never be replayed from an older day
 * (see `src/lib/query/todayHeatmapQuery.ts`).
 */
declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: {
      /** `false` keeps this query out of the persisted cache and SSR dehydration. */
      persist?: boolean
    }
  }
}

export {}
