# How authentication works: one identity, two runtimes, one user row

CoreLive runs as two surfaces — the web app in a browser and the Electron macOS app in a WebView — but both authenticate against a single Clerk application and resolve to a single Postgres `User` row. This document explains the durable mental model behind that: where identity lives, what actually stands between a request and a user's data (it is _not_ what you might assume), how a Clerk user becomes a Postgres row, and why Electron sign-in takes a detour through the system browser.

This is understanding-oriented. For step-by-step recipes — protecting a new route, adding an authed oRPC procedure, running auth locally — see [reference-auth.md](./reference-auth.md) and [howto-local-dev-and-tests.md](./howto-local-dev-and-tests.md). Environment variables (Clerk keys, webhook secret) live in the root [README.md](../../README.md); this doc does not restate them.

## The one fact everything else hangs on

**Clerk is the source of truth for identity. The Postgres join key is `User.clerkId`.**

Clerk issues each user a stable id like `user_2abc…`. That string — not an email, not the Postgres autoincrement `id` — is what ties a Clerk identity to its database row. The schema makes `clerkId` unique (`prisma/schema.prisma:57-59`), and every server-side user lookup keys off it.

Because both runtimes authenticate against the **same Clerk app**, they receive the **same** `user_…` id, so they resolve to the **same** Postgres row. There is no "web user" and "desktop user" — there is one user who happens to be looking through two windows. Hold onto this; it is why the Electron OAuth bridge (below) works at all.

## What actually guards the data path (and what does not)

This is the most important — and most counter-intuitive — thing to understand about CoreLive auth. There are **two** request paths with **two different** trust models, and conflating them is the mistake to avoid.

### Page routes are gated by `proxy.ts`

In Next.js 16, `middleware.ts` was renamed to `proxy.ts`; this repo's lives at `src/proxy.ts`. It runs `clerkMiddleware`, and for a protected page it verifies the Clerk **cookie session** server-side via `auth()` and redirects unauthenticated visitors to `/login?redirect_url=…` (`src/proxy.ts:17-29`). The protected prefixes are an explicit allowlist — `/home`, `/skill-tree`, `/braindump`, `/settings`, `/floating-navigator` (`src/proxy.ts:4-15`). This is real enforcement, backed by a verified cookie session.

### The oRPC data path is NOT gated by `proxy.ts`

Here is the subtlety. The matcher _does_ run `clerkMiddleware` on `/api` (`src/proxy.ts:33-39`), but read the body: the very first thing it does is

```ts
if (!isProtectedRoute(req)) {
  return
}
```

(`src/proxy.ts:18-20`). `isProtectedRoute` lists only the page prefixes above — **`/api` is not among them.** So for any `/api/orpc/*` request the middleware returns _before_ it ever calls `auth()` or checks `isAuthenticated`. **`proxy.ts` does not authenticate the data path.** It guards page navigation only.

What does stand in front of the data path is the oRPC `authMiddleware` (`src/server/middleware/auth.ts:10-51`). And what it does is the second half of the surprise:

```ts
const authHeader = context.headers.get('authorization')
const clerkUserId = authHeader?.replace('Bearer ', '')
// …
const user = await prisma.user.upsert({
  where: { clerkId: clerkUserId },
  update: {},
  create: { clerkId: clerkUserId },
})
```

(`src/server/middleware/auth.ts:14-15,41-48`). It strips `Bearer ` off the `Authorization` header and treats the remainder **directly as the `clerkId`**. The Bearer token is the **raw Clerk user id** — _not_ a JWT, _not_ a session token. There is **no callback to Clerk, no signature check, no expiry validation.** Whatever id arrives, the middleware upserts and trusts.

> The doc comment in `src/lib/orpc/create-client.ts:11` calls this "the user's Clerk session ID." That comment is misleading — the code one screen down resolves and sends `clerk.session?.user?.id ?? clerk.user?.id`, i.e. the **user** id (`src/lib/orpc/create-client.ts:37,51,59`). Trust the code, not the comment.

### So what is the real trust model?

State it soberly, because a future engineer _will_ build on whatever they think is true here:

- **Page routes** → genuinely gated by `proxy.ts` (verified Clerk cookie session).
- **`/api/orpc`** → gated only by `authMiddleware`, which trusts an unverified, bare user id.
- Therefore the thing standing between a caller and _another user's_ data is the **secrecy and unguessability of Clerk user ids** — not route protection (it doesn't run for the API), and not "same-origin" (CORS only constrains browsers; any non-browser client can set any `Authorization` header it likes).

Do **not** document this as "proxy.ts plus same-origin protects the API" — the code you can read does not enforce that. The honest invariant is: _there is no server-side token verification on the oRPC path._ If a future change needs the data path hardened (verifying a real Clerk JWT, scoping reachability, signing requests), that work does not exist yet and must be added deliberately — do not assume it is already there because page routes look protected.

Why was it built this stateless way? Because it gives web and Electron an **identical** data path: the same `/api/orpc` endpoint, the same header, the same client code (`src/lib/orpc/create-client.ts` is used verbatim by both). The server only needs one thing to find the row — the user id — and the middleware stays trivial. That simplicity is the benefit; the absence of verification is its cost, and this section is here so the cost is never mistaken for a feature that's already covered.

## Two ways a `User` row is born — for the same row

A Clerk identity becomes a Postgres row through **two independent paths**, and understanding both prevents confusion when a row looks half-populated.

**Path 1 — the webhook (the intended one).** Clerk fires a `user.created` webhook to `src/app/api/webhooks/route.ts`. The handler verifies the Svix HMAC signature against `WEBHOOK_SECRET` (`src/app/api/webhooks/route.ts:42-56`) — that signature _is_ the auth for this endpoint, which is why it needs no Clerk session — then, inside one `$transaction`, it creates the `User` (with `clerkId`, email, and a name derived from username or first/last) **and** seeds a default "General" category (`src/app/api/webhooks/route.ts:58-89`). Provisioning out-of-band keeps Clerk the identity source of truth, decouples row creation from request latency, and lands a new user in a usable workspace with a category already present.

**Path 2 — lazy upsert (the fallback).** The oRPC `authMiddleware` upserts on first authed request, creating a row with **only** `clerkId` and nothing else (`src/server/middleware/auth.ts:41-48`). This guarantees a row exists even if the webhook is slow or never configured (e.g. local dev without a tunnel).

The consequence to internalize: a user provisioned **only** by Path 2 has a **null email, null name, and no "General" category** until the webhook catches up. Both paths write the same row (keyed by the same `clerkId`), so they reconcile — but they are not equivalent, and the difference surfaces as an empty-looking profile or a missing default category. If you ever see that state, this is why.

One more drift to know about: the webhook handles **only** `user.created` (`src/app/api/webhooks/route.ts:58`). There is no `user.updated` or `user.deleted` handler. So profile edits or account deletions made in Clerk do **not** propagate to Postgres — the row can drift from Clerk over time. That is a known gap, not a bug to be surprised by.

## Why Electron sign-in detours through the system browser

This is the single most surprising piece of the subsystem, and it exists because of **hard external constraints**, not preference. If you are tempted to "simplify" it back into an in-WebView OAuth, read this first.

Two walls force the design (both documented at `src/app/oauth/callback/page.tsx:21-24`; the Google-WebView wall is also noted at `src/app/oauth/start/page.tsx:26`):

1. **Google blocks OAuth inside WebViews** — it returns `403: disallowed_useragent`. You cannot complete Google sign-in in the Electron WebView, full stop.
2. **Clerk's browser cookie is not shared with the WebView.** Even if a user is signed in to `corelive.app` in their real browser, the Electron WebView has a **separate cookie store** and sees no session.

So sign-in happens where it's allowed — the **real system browser** — and the resulting session is handed to the WebView as a **one-time ticket**:

1. The Electron main process generates a CSRF `state`, stores it, and opens `…/oauth/start?provider=&state=` in the **system browser** via `shell.openExternal` (`electron/OAuthManager.ts:200-228`).
2. The browser runs Clerk's standard `authenticateWithRedirect` flow (`src/app/oauth/start/page.tsx:97-101`); a browser-side Clerk session is created.
3. The browser asks the backend for a **sign-in token** scoped to that just-authenticated user — `clerkClient().signInTokens.createSignInToken({ userId, expiresInSeconds: 60 })` (`src/app/api/oauth/create-signin-token/route.ts:35-39`), guarded so only an authenticated browser session can mint one (`…/route.ts:25-32`).
4. The browser redirects to a `corelive://oauth/callback?state=&token=` **deep link** (`src/app/oauth/callback/page.tsx:86,95`). Electron's `corelive://` protocol handler receives it.
5. The main process validates the `state` and TTL, then ferries the ticket to the WebView (`electron/OAuthManager.ts:252-309`).
6. The WebView exchanges the ticket for its **own** Clerk session: `client.signIn.create({ strategy: 'ticket', ticket })` then `setActive` (`src/lib/orpc/electron-auth-provider.tsx:190-210`).

The payoff is the "one fact" from the top of this doc: the ticket was minted for a specific Clerk `userId`, so the WebView's brand-new session belongs to the **same Clerk user** → the **same Postgres row**. The browser and the WebView never share a cookie; they share an _identity_, bridged by a short-lived credential.

### Why the two TTLs are deliberately asymmetric

The flow has two clocks, and they differ on purpose:

- **`state` lives ~10 minutes** (`electron/OAuthManager.ts:113`). It spans a human doing a browser dance — choosing an account, entering a password, maybe MFA. People are slow; 10 minutes is forgiving.
- **The sign-in token lives 60 seconds and is single-use** — enforced both server-side at mint time (`src/app/api/oauth/create-signin-token/route.ts:38`) and again in the main process's pending-token cache (`electron/OAuthManager.ts:366-371`). The token is a **bearer credential in transit over a deep link**; a deep link can be observed, so the replay window is squeezed to seconds.

Single-use is reinforced in code: the renderer **clears** the main-process pending token _before_ consuming it, so a failed exchange cannot retry the same one-time ticket (`src/lib/orpc/electron-auth-provider.tsx:186-193`). If you change this ordering, you reintroduce a replay path — don't.

### What can't finish in the WebView

Some Clerk outcomes can't complete inside the WebView session. If the ticket exchange returns `needs_second_factor` or `needs_client_trust`, the WebView gives up and tells the user to finish in the browser instead (`src/lib/orpc/electron-auth-provider.tsx:365-376`). Likewise, if activating the session surfaces an extra `currentTask`, it aborts to an error rather than navigating to `/home` (`…/electron-auth-provider.tsx:84-94`). These are graceful bounce-backs to the only place those steps _can_ happen — the real browser — not failures to paper over.

### Why the OAuth origin is derived, not hardcoded

`buildOAuthURL` reads the origin from the **live `BrowserWindow` URL** rather than a constant (`electron/OAuthManager.ts:156-192`). This keeps the Clerk environment aligned across the browser hop: a dev Electron build (loaded from `localhost:3011`) starts OAuth on the _dev_ origin with _dev_ Clerk keys, and prod (loaded from `corelive.app`) uses prod. Hardcoding the origin would let a dev build create OAuth state on a production page and then fail to consume the returned ticket with development keys. The environment must stay consistent end-to-end, so the origin follows the window.

## Smaller things worth keeping straight

**The dev backdoor.** When `NODE_ENV === 'development'` _and_ the Bearer value is exactly `user_mock_user_id`, `authMiddleware` upserts a fixed `test@example.com` test user (`src/server/middleware/auth.ts:18-32`). The `NODE_ENV` guard means it is unreachable in a production build. This is what lets E2E and local flows operate without a live Clerk round-trip.

**Client query gating.** Protected oRPC queries must not fire before Clerk hydrates the session, or they UNAUTHORIZED-flake (a real problem under Playwright and right after OAuth redirects). `useClerkQueryReady()` returns `isLoaded && Boolean(user)` and gates query enablement (`src/hooks/useClerkQueryReady.ts:18-21`); the `ElectronAuthProvider` similarly waits for Clerk's `signIn`/`client` to be ready before wiring its OAuth listeners (`src/lib/orpc/electron-auth-provider.tsx:43-50`). The provider is mounted inside `<ClerkProvider>` in the root layout (`src/app/layout.tsx:49,67`).

**Main-process `activeUser` does not gate data.** The Electron main process keeps a lightweight `activeUser`, set/cleared via auth IPC handlers (`electron/main.ts:1697-1728`). This state exists only so the **native chrome** (menu bar, tray, notifications) can show user context. It does **not** gate data access — data goes over HTTP + Bearer, identically to the web app, never over IPC. Don't reach for `activeUser` as an authorization check; it isn't one.

**`electron/auth-manager.ts` is dead code — do not revive it casually.** It is never instantiated; the live auth IPC handlers are inlined in `main.ts` via `typedHandle`. The file is kept as a reference sketch for a possible future manager-class refactor and carries a banner saying exactly that (`electron/auth-manager.ts:1-18`). Critically, its `ApiBridge.setUserId(userId)` shape (`electron/auth-manager.ts:32-34`) describes an **old IPC-data architecture** the app has since abandoned in favor of HTTP + Bearer. If you wire it up as-is, you'll be implementing a stale, wrong contract. It's documented precisely to stop that.

## Related

- [reference-auth.md](./reference-auth.md) — the auth surface map: each file and entry point, anchored to source.
- [howto-local-dev-and-tests.md](./howto-local-dev-and-tests.md) — running auth locally, the dev mock user, and delivering the Clerk webhook.
- [howto-add-orpc-procedure.md](./howto-add-orpc-procedure.md) and [howto-add-route-or-setting.md](./howto-add-route-or-setting.md) — composing `authMiddleware` so `ctx.user` is available, and adding a protected route prefix.
- [explanation-architecture.md](./explanation-architecture.md) and [explanation-electron-architecture.md](./explanation-electron-architecture.md) — the one-codebase / two-runtimes / one-data-path story this auth model lives inside.
- Hub: [README.md](./README.md).
