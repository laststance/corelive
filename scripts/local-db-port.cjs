/**
 * Host port for CoreLive's Docker Compose PostgreSQL service.
 * Maps host :5491 → container :5432 so local dev avoids the default 5432 conflict.
 *
 * Keep in sync with compose.yml `ports` and POSTGRES_PRISMA_URL examples in AGENTS.md / README.md.
 */
const LOCAL_POSTGRES_HOST_PORT = 5491

module.exports = { LOCAL_POSTGRES_HOST_PORT }
