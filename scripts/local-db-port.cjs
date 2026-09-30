/**
 * Host port for CoreLive's Docker Compose PostgreSQL service.
 * Maps host :5491 → container :5432 so local dev avoids the default 5432 conflict.
 *
 * Keep in sync with compose.yml `ports` and POSTGRES_PRISMA_URL examples in AGENTS.md / README.md.
 */
const LOCAL_POSTGRES_HOST_PORT = 5491

/**
 * Connection string used when `POSTGRES_PRISMA_URL` is unset, shared by the gate and the reset script so
 * the URL judged by `assert-local-db.cjs` is the URL `reset-local-db.cjs` connects to. `drizzle.config.ts`
 * (TypeScript, loaded by drizzle-kit) spells the same DSN out; keep the two in sync.
 */
const LOCAL_FALLBACK_DATABASE_URL = `postgresql://user:pass@localhost:${LOCAL_POSTGRES_HOST_PORT}/db`

module.exports = { LOCAL_POSTGRES_HOST_PORT, LOCAL_FALLBACK_DATABASE_URL }
