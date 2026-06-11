# Authentication surface reference

A point-to-source index of every authentication surface in CoreLive: route protection, the Clerk webhook, the oRPC auth middleware and client header, the Electron system-browser OAuth bridge, and the Electron auth IPC. This is a map to the code, not a transcription of it — payload shapes are reshaped freely pre-launch ([README.md](../../README.md)), so field-level detail lives in the source.

For the mental model (why the Bearer token is the raw Clerk user id, why there is no server-side token verification, why Electron needs a browser OAuth detour), see [./explanation-authentication.md](./explanation-authentication.md). For the user row this all resolves to, see [./reference-data-model.md](./reference-data-model.md) and `prisma/schema.prisma:57-71`.

## Cross-cutting invariants

These hold across the whole surface; the per-surface tables below assume them.

- **One Clerk identity → one Postgres `User` row, joined on `clerkId`.** Clerk's user id (`user_…`) is the single join key, stored as `User.clerkId` (`@unique`, `prisma/schema.prisma:59`). Web and the Electron renderer authenticate against the same Clerk app and send the same user id, so both resolve to the same row.
- **The `Authorization` Bearer value is the raw Clerk _user id_, not a JWT.** The client sends `Bearer <clerkUserId>` (`src/lib/orpc/create-client.ts:54-60`) and `authMiddleware` strips `Bearer ` and uses the remainder directly as `clerkId` (`src/server/middleware/auth.ts:14-15`). The middleware does **not** verify the value — it upserts on it (`src/server/middleware/auth.ts:41-48`). The doc comment at `src/lib/orpc/create-client.ts:11` says "session ID" but the code sends the user id.
- **Web and Electron share one identical data path.** Both go through `/api/orpc` over HTTP with the same Bearer header (`src/app/api/orpc/[...path]/route.ts`). There is no separate Electron data channel — Electron IPC carries no oRPC data.
- **`proxy.ts` gates pages, not the API.** `isProtectedRoute` (`src/proxy.ts:4-15`) lists only page prefixes; it does **not** include `/api/orpc`. API authentication is enforced _solely_ by `authMiddleware` (missing Bearer → `UNAUTHORIZED`), not by a proxy redirect.
- **Two provisioning paths create the `User` row.** The Clerk `user.created` webhook (`src/app/api/webhooks/route.ts`) and the lazy upsert in `authMiddleware` (`src/server/middleware/auth.ts:41-48`) both create rows for the same `clerkId`. They diverge — see [Provisioning paths](#provisioning-paths-two-ways-to-create-a-user-row).

## Surface map

The authoritative artifact. Each surface, where it lives, what it does, and whether it enforces auth.

| Surface                                            | `file:line`                                            | Role                                                                                                                                                                                                                  | Auth                                                       |
| -------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `proxy` default export + `isProtectedRoute`        | `src/proxy.ts:4-31`                                    | Next.js v16 route gate (`clerkMiddleware`). Unauthenticated requests to protected page prefixes redirect to `/login?redirect_url=…`.                                                                                  | **This is the page auth gate.**                            |
| `proxy` `config.matcher`                           | `src/proxy.ts:33-40`                                   | Request matcher: skips `_next` + static assets, always runs for `/api` and `/trpc`. (Matching `/api` ≠ protecting it — see invariants.)                                                                               | n/a                                                        |
| `POST /api/webhooks`                               | `src/app/api/webhooks/route.ts:21-93`                  | Svix-verified Clerk webhook. On `user.created`, creates a `User` + default `General` `Category` in one `$transaction`. `runtime = 'nodejs'`.                                                                          | Svix HMAC signature (`WEBHOOK_SECRET`), not Clerk session. |
| `authMiddleware`                                   | `src/server/middleware/auth.ts:10-51`                  | oRPC middleware that resolves the calling `User` from the Bearer header and exposes `AuthContext = { user }` to downstream procedures.                                                                                | **Produces the authed user context.**                      |
| `createLink` / `createClient`                      | `src/lib/orpc/create-client.ts:16-77`                  | Browser oRPC link to `${origin}/api/orpc`; attaches `Authorization: Bearer <clerk user id>`, or `{}` when Clerk/user absent. Used identically by web and the Electron renderer.                                       | Supplies the credential.                                   |
| `POST /api/oauth/create-signin-token`              | `src/app/api/oauth/create-signin-token/route.ts:22-54` | Mints a one-time, 60s-TTL Clerk sign-in token scoped to the browser-authed `userId` (`signInTokens.createSignInToken`). 401 if not authed.                                                                            | Requires an authenticated browser Clerk session.           |
| `GET/POST/PUT/PATCH/DELETE /api/orpc/[...path]`    | `src/app/api/orpc/[...path]/route.ts:7-43`             | Single HTTP entry for all oRPC procedures. Forwards `request.headers` into context for `authMiddleware`. Same endpoint for web and Electron.                                                                          | Per-procedure, via `authMiddleware`.                       |
| `/oauth/start` page                                | `src/app/oauth/start/page.tsx:39-114`                  | System-browser entry for Electron OAuth. Runs Clerk `authenticateWithRedirect`; shortcuts straight to the bridge if already signed in.                                                                                | Establishes the browser Clerk session.                     |
| `/oauth/callback` page                             | `src/app/oauth/callback/page.tsx:34-124`               | Browser→Electron bridge. POSTs `create-signin-token`, then redirects to `corelive://oauth/callback?state=…&token=…`.                                                                                                  | Consumes the browser session.                              |
| `ElectronAuthProvider` / `useElectronAuth`         | `src/lib/orpc/electron-auth-provider.tsx:23-351`       | Renderer provider (mounted in layout). Exchanges the OAuth ticket for a session and syncs the Clerk user to the Electron main process. No-ops outside Electron.                                                       | Client-side; only active inside Electron.                  |
| `useClerkQueryReady`                               | `src/hooks/useClerkQueryReady.ts:18-21`                | Returns `isLoaded && Boolean(user)`. Gate so protected oRPC queries wait for Clerk hydration (web + Electron).                                                                                                        | n/a (read-only client hook).                               |
| `OAuthManager` (main process)                      | `electron/OAuthManager.ts:80-521`                      | Main-process OAuth coordinator: generates CSRF `state`, opens the system browser, validates the deep-link callback, ferries the ticket to the renderer.                                                               | Reached only via OAuth IPC.                                |
| Auth IPC handlers                                  | `electron/main.ts:1697-1728`                           | The **live** auth IPC: `auth-get-user`, `auth-set-user`, `auth-logout`, `auth-is-authenticated`, `auth-sync-from-web`. Hold lightweight `activeUser` state for native chrome only — they do **not** gate data access. | Renderer→main IPC; renderer is already Clerk-authed.       |
| OAuth IPC handlers                                 | `electron/main.ts:1884-1931`                           | The **live** OAuth IPC: `oauth-start`, `oauth-get-supported-providers`, `oauth-cancel`, `oauth-get-pending-token`, `oauth-clear-pending-token`.                                                                       | Renderer→main IPC.                                         |
| `open-url` deep-link handler                       | `electron/main.ts:312`                                 | Early macOS `open-url` handler (registered before `app.whenReady()`) that routes `corelive://` links into `DeepLinkManager` (loader at `electron/main.ts:854-877`).                                                   | n/a (transport).                                           |
| `<ClerkProvider>` / `<ElectronAuthProvider>` mount | `src/app/layout.tsx:49,67`                             | `<ClerkProvider>` (no explicit props — keys from env) wraps `<ElectronAuthProvider>`, which wraps the app.                                                                                                            | n/a (provider wiring).                                     |

> **Not a live surface:** `electron/auth-manager.ts:1-18` is **dead code** — its `AuthManager` class is never instantiated and describes an old IPC-data architecture (`ApiBridge.setUserId`). The live handlers are inlined in `main.ts` (rows above). It is kept only as reference for a future manager-class refactor and is exempt from the `no-raw-ipc` ESLint rule. Do not wire against it.

## Provisioning paths (two ways to create a `User` row)

Both create a row for the same `clerkId`; they are not equivalent. Defer field shapes to `src/app/api/webhooks/route.ts:58-89` and `prisma/schema.prisma:57-71`.

| Path        | `file:line`                           | Trigger                    | Creates                                        | Seeds default `General` category?                 |
| ----------- | ------------------------------------- | -------------------------- | ---------------------------------------------- | ------------------------------------------------- |
| Webhook     | `src/app/api/webhooks/route.ts:58-89` | Clerk `user.created` event | `User` with `clerkId` + email + name           | **Yes** — same `$transaction` (`route.ts:81-88`). |
| Lazy upsert | `src/server/middleware/auth.ts:41-48` | First authed oRPC request  | `User` with **only** `clerkId` (no email/name) | **No.**                                           |

Consequences: if an authed request lands before the webhook fires, the row exists with an empty profile. The webhook handler branches **only** on `user.created` (`route.ts:58`) — there is **no** `user.updated` / `user.deleted` handler, so Clerk profile edits and deletions are not propagated to Postgres.

## Electron OAuth bridge

Exists because Google OAuth returns `403 disallowed_useragent` inside WebViews and the browser's Clerk cookie is not shared with the WebView's separate cookie store (`src/app/oauth/callback/page.tsx:21-24`, `src/app/oauth/start/page.tsx:26-29`). OAuth runs in the **system browser**; a one-time Clerk sign-in token is bridged back over a `corelive://` deep link, and the WebView mints its own session. The _why_ lives in [./explanation-authentication.md](./explanation-authentication.md); the deep-link transport detail in [docs/DEEP_LINKING_IMPLEMENTATION_SUMMARY.md](../DEEP_LINKING_IMPLEMENTATION_SUMMARY.md) and [./reference-electron.md](./reference-electron.md).

Hop-by-hop, with the owner of each step:

| Hop                                                                                                                                  | Owner (`file:line`)                                            |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Renderer requests OAuth → `oauth-start` IPC                                                                                          | `electron/main.ts:1887-1905`                                   |
| Generate CSRF `state`, store it, open system browser at `/oauth/start`                                                               | `electron/OAuthManager.ts:200-228`                             |
| Build the start URL from the **live BrowserWindow origin** (dev `localhost:3011` / prod `corelive.app`)                              | `electron/OAuthManager.ts:156-163` (origin resolver `178-192`) |
| Browser runs Clerk `authenticateWithRedirect` (or shortcuts if already signed in)                                                    | `src/app/oauth/start/page.tsx:50-114`                          |
| Browser POSTs `create-signin-token`, then redirects to `corelive://oauth/callback?state&token`                                       | `src/app/oauth/callback/page.tsx:62-103`                       |
| macOS `open-url` routes the deep link into `DeepLinkManager`                                                                         | `electron/main.ts:312`                                         |
| Main process validates `state` + TTL, shows/focuses the window, sends the ticket to the renderer (IPC channel `clerk-sign-in-token`) | `electron/OAuthManager.ts:252-381`                             |
| Renderer exchanges the ticket: `client.signIn.create({ strategy: 'ticket', ticket })` → `setActive` → navigate `/home`               | `src/lib/orpc/electron-auth-provider.tsx:163-251`              |
| Renderer syncs the resolved Clerk user to the main process (`auth.setUser`) or logs out                                              | `src/lib/orpc/electron-auth-provider.tsx:280-313`              |

### Token & state lifetimes

| Item                                        | TTL / lifecycle                                         | `file:line`                                                   |
| ------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| OAuth `state` (CSRF)                        | 10 min, single pending Map entry                        | `electron/OAuthManager.ts:113` (TTL), `292-299` (enforcement) |
| Sign-in token (server-minted)               | 60 s, single-use                                        | `src/app/api/oauth/create-signin-token/route.ts:36-46`        |
| Pending sign-in token (main-process buffer) | 60 s                                                    | `electron/OAuthManager.ts:360-381`                            |
| Token cleared **before** consume            | A failed exchange cannot retry the same one-time ticket | `src/lib/orpc/electron-auth-provider.tsx:186-188`             |

### Race recovery & failure handling

- **Ticket-before-`signIn`-ready race.** The ticket may arrive over IPC before Clerk's `signIn` is ready, so a temporary buffering listener stores it (`pendingToken` ref, `src/lib/orpc/electron-auth-provider.tsx:254-277`), and the main process is polled as a fallback (`oauth.getPendingToken`, `src/lib/orpc/electron-auth-provider.tsx:126-145`).
- **MFA / device-trust statuses.** If the ticket exchange returns `needs_second_factor` / `needs_client_trust`, Electron cannot complete in-WebView and tells the user to finish in the browser. Mapping at `src/lib/orpc/electron-auth-provider.tsx:365-376`; spec at `src/lib/orpc/electron-auth-provider.test.tsx:144-171`. Happy path (`ticket` → `sess_123` → `setActive`) at `electron-auth-provider.test.tsx:112-142`.
- **Extra sign-in steps.** `setActive`'s `navigate` aborts to an error instead of redirecting to `/home` when `session.currentTask` is present (`src/lib/orpc/electron-auth-provider.tsx:84-94`).
- **`/floating-navigator` is protected on purpose** (`src/proxy.ts:11-14`) so an unauthenticated Electron cold boot redirects to `/login`, letting the main-process nav-watch surface the main window instead of an empty panel.

### Provider asymmetry

`OAuthManager.getSupportedProviders()` returns `['google', 'github', 'apple']` (`electron/OAuthManager.ts:484-486`), but the browser `/oauth/start` page only accepts and validates `google` / `github` (`src/app/oauth/start/page.tsx:47,57`). Treat `apple` as not wired end-to-end.

### PKCE is not part of this flow

`OAuthManager` defines `generatePKCE` (`electron/OAuthManager.ts:124-133`) and `exchangeCodeForSession` (`electron/OAuthManager.ts:401-422`), but the **live** `startOAuthFlow` stores only `{ provider, createdAt }` with no verifier (`electron/OAuthManager.ts:206-209`). The sign-in-token bridge does **not** use PKCE or an authorization-code exchange — those methods are unused by the current path.

## Development backdoor

In `NODE_ENV === 'development'`, a Bearer value of `user_mock_user_id` upserts a fixed test user (`test@example.com`, name `Test User`) and bypasses the unauthorized check (`src/server/middleware/auth.ts:18-32`). This branch is gated on `NODE_ENV` and is never reachable in production builds. E2E tests instead talk to the real Clerk Dev instance — see the E2E credentials note and command list in [README.md](../../README.md) and the project's local `CLAUDE.md`.

## Environment variables

Auth depends on `WEBHOOK_SECRET`, `CLERK_SECRET_KEY`, and the `NEXT_PUBLIC_CLERK_*` keys, validated at startup via `src/env.mjs`. Do not transcribe them here — the canonical table (variable, side, description) is in [README.md](../../README.md).

## Related

- [./explanation-authentication.md](./explanation-authentication.md) — the mental model and trust boundary.
- [./reference-orpc-api.md](./reference-orpc-api.md) — how `authMiddleware` composes into procedures.
- [./reference-data-model.md](./reference-data-model.md) — the `User` / `Category` rows this resolves to.
- [./reference-electron.md](./reference-electron.md) — Electron windows, IPC, preload `window.electronAPI`.
- [docs/DEEP_LINKING_IMPLEMENTATION_SUMMARY.md](../DEEP_LINKING_IMPLEMENTATION_SUMMARY.md) — `corelive://` deep-link mechanics.
- [./README.md](./README.md) — developer docs hub.
