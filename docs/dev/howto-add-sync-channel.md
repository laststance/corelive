# How to add a cross-window sync channel

CoreLive runs the same web app in several windows at once — the browser tab, the
Electron main window, the Floating Navigator, and the BrainDump — and **each is a
separate context with its own React Query cache, Redux store, and `localStorage`**.
A mutation in one window is invisible to the others until you explicitly tell them.
This guide shows how to add a channel that bridges that gap, using
[`BroadcastChannel`](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel),
which crosses Electron `BrowserWindow`s in this app with no custom IPC.

For _why_ the system is shaped this way (separate stores per window, ping vs.
snapshot, the intent-channel exception), read
[explanation-state-and-sync.md](./explanation-state-and-sync.md). This is the
recipe; that is the rationale.

There are two variants. Pick by what the receiver needs to do:

| Variant                     | Use when                                                              | Template                                                 |
| --------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------- |
| **Stateless ping** (common) | Receiver just needs "something changed → invalidate / open something" | `src/lib/todo-sync-channel.ts`                           |
| **Stateful snapshot**       | Receiver must apply an _exact copy_ of some client state              | `src/lib/preferences-sync-channel.ts` (Redux middleware) |

---

## Variant A — a stateless "ping" channel (the common case)

The three existing ping channels — `src/lib/todo-sync-channel.ts`,
`src/lib/category-sync-channel.ts`, and `src/lib/paste-import-channel.ts` — are
near-identical copies of one shape. Adding a fourth is a copy-and-rename job plus
two wiring points. Do not hand-roll a new shape; copy the canonical one so the SSR
guard and `close()` come along for free.

### 1. Copy the canonical channel and rename three things

Copy `src/lib/todo-sync-channel.ts` to a new file (e.g.
`src/lib/<thing>-sync-channel.ts`) and rename:

- the **channel name** constant — a globally-unique string, prefixed `corelive-`
  (`TODO_SYNC_CHANNEL_NAME = 'corelive-todo-sync'`, `src/lib/todo-sync-channel.ts:1`).
  Every window that opens a channel with the same name joins the same bus, so the
  name _is_ the namespace — a collision silently cross-wires two features.
- the **event type** constant + its message type
  (`TODO_SYNC_EVENT_TYPE = 'todo-sync'` and `type TodoSyncMessage`,
  `src/lib/todo-sync-channel.ts:2-4`). The message is a single `{ type }` object —
  a ping carries no payload.
- the **exported function names** — keep the `broadcastX` / `subscribeToX` verb
  pair so call sites read clearly.

Leave the three private helpers structurally intact:
`isXSupported()` (the SSR guard), `createXChannel()` (returns the channel or
`null`), and `isXMessage()` (the `event.data` type narrow).

### 2. Keep the SSR guard

`isTodoSyncSupported()` gates **every** entry point
(`src/lib/todo-sync-channel.ts:14-18`):

```typescript
const isTodoSyncSupported = (): boolean => {
  return (
    typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'
  )
}
```

The load-bearing clause for SSR safety is `typeof window !== 'undefined'`: there
is no DOM `window` while Node renders these pages, so this short-circuits before a
channel is ever opened server-side. (`BroadcastChannel` itself _is_ a Node global
since v18, so it would construct fine on the server — the `typeof window` check is
what keeps SSR from opening a stray channel; the `typeof BroadcastChannel` check
covers any runtime that genuinely lacks the API.) Because of the guard,
`broadcastX()` returns `false` and `subscribeToX()` returns a no-op cleanup on the
server — both are safe to call unconditionally from client components that also
render on the server.

### 3. Broadcast at the mutation site (post, then `close()`)

The broadcaster is fire-and-forget: open a fresh channel, post one message, **close
it immediately** (`src/lib/todo-sync-channel.ts:62-71`):

```typescript
export const broadcastTodoSync = (): boolean => {
  const channel = createTodoSyncChannel()
  if (!channel) {
    return false
  }

  channel.postMessage({ type: TODO_SYNC_EVENT_TYPE } satisfies TodoSyncMessage)
  channel.close()
  return true
}
```

> **Why `close()` matters.** A `BroadcastChannel` you open but never close stays
> bound to the window and keeps it pinned in memory; open one per broadcast without
> closing and you leak a channel on every mutation. The broadcaster has no listener,
> so there is nothing to lose by closing right after `postMessage` — the message is
> already on the bus.

Call `broadcastX()` from wherever the underlying data actually changes. The
existing producers fire right after a mutation settles — for example
`useTodoMutations` calls `broadcastTodoSync()` (and `broadcastCategorySync()`) in
its `onSettled` paths (`src/hooks/useTodoMutations.ts:130-131`). That is
deliberately `onSettled`, not `onSuccess`: `onSettled` runs after the mutation
settles on _either_ success or error, so the other windows re-sync even when a
mutation settles after a failure. The BrainDump editor broadcasts after it
persists completions (`src/components/braindump/BrainDumpEditor.tsx:408`). A
broadcaster does **not**
need to also act locally — the window that mutated already updated its own cache;
the broadcast is purely for the _other_ windows.

### 4. Subscribe and return the cleanup from a `useCycleEffect`

The receiver subscribes once and must tear the subscription down on unmount.
`subscribeToTodoSync()` already returns a cleanup that removes the listener **and**
closes the channel (`src/lib/todo-sync-channel.ts:82-100`):

```typescript
export const subscribeToTodoSync = (onSync: () => void): (() => void) => {
  const channel = createTodoSyncChannel()
  if (!channel) {
    return () => {}
  }

  const handleMessage = (event: MessageEvent) => {
    if (isTodoSyncMessage(event.data)) {
      onSync()
    }
  }

  channel.addEventListener('message', handleMessage)

  return () => {
    channel.removeEventListener('message', handleMessage)
    channel.close()
  }
}
```

Your only job at the call site is to **return that cleanup** so the effect runs it.
Use [`useCycleEffect`](../../src/hooks/use-cycle-effect.ts) — the 1:1 named alias of
`useEffect`, and the only lifecycle wrapper in
[`src/hooks`](./reference-frontend.md) that accepts an empty `[]` deps array
(`src/hooks/use-cycle-effect.ts:30-33`). The receiving component must be a client
component (`'use client'`), since `useEffect` only runs in a browser DOM context,
never during SSR.

> **Why return the cleanup.** If you call `subscribeToX()` and drop its return
> value, the channel and its `message` listener live forever — every remount stacks
> another listener and `onSync` fires N times. Returning the cleanup from the effect
> is what closes the channel and removes the listener when the component unmounts.

### Worked example (real code)

`TodoList` invalidates the relevant React Query caches whenever any other window
broadcasts a todo change (`src/app/(main)/home/_components/TodoList.tsx:358-371`):

```typescript
useCycleEffect(() => {
  // Cross-window sync: BrainDump / Floating Navigator completions broadcast
  // via the BroadcastChannel and also write to the Completed table, so the
  // Home heatmap + day-detail caches need invalidation alongside the todo
  // list. Without these two extra keys, completing a task in BrainDump
  // leaves the main heatmap stale until reload (Codex review HIGH).
  return subscribeToTodoSync(() => {
    queryClient.invalidateQueries({ queryKey: orpc.todo.key() })
    queryClient.invalidateQueries({ queryKey: orpc.completed.heatmap.key() })
    queryClient.invalidateQueries({
      queryKey: orpc.completed.dayDetail.key(),
    })
  })
}, [queryClient])
```

Note the shape every ping receiver follows: `useCycleEffect(() =>
subscribeToX(handler), [deps])`. The `subscribeToX(...)` call's return value is
returned straight out of the effect callback — that is the cleanup. The Floating
Navigator subscribes the same way in
`src/components/floating-navigator/FloatingNavigatorContainer.tsx:311`.

> **Receivers respond, they don't replay.** The ping carries no data, so the
> handler re-derives state from a fresh source — almost always
> `queryClient.invalidateQueries(...)` (which refetches from the server), as above
> and in `src/app/(main)/home/_components/Category.tsx:91`. Don't try to mutate
> local state from the ping; invalidate and let the query refetch.

---

## Variant B — a stateful channel that carries a snapshot

Sometimes a ping is not enough: the receiver must apply an _exact copy_ of some
state (not just refetch from the server). That is what `preferences-sync-channel.ts`
does — it is **Redux middleware**, not a free function pair, and it carries a full
`PreferencesState` snapshot. Use this variant only when the data lives client-side
in Redux + `localStorage` (so there is no server to refetch from), as user
preferences do.

Two things make the stateful variant tricky that the ping variant never has to
worry about: **echo loops** and **untrusted payloads**. Both are handled in
`src/lib/preferences-sync-channel.ts`.

### 1. Add a loop guard — exclude the apply action from the broadcastable set

The middleware broadcasts only on the user-initiated `set*` actions, and applies an
inbound snapshot through a **different** action (`hydratePreferences`) that is
deliberately _not_ in the broadcastable set
(`src/lib/preferences-sync-channel.ts:19-22`):

```typescript
// The local, user-initiated toggles that should propagate to other windows.
// hydratePreferences is deliberately excluded so an applied broadcast never
// re-broadcasts (the loop guard).
const BROADCASTABLE_ACTION_TYPES = new Set<string>([
  'preferences/setCompletionSound',
  'preferences/setRetainCompletedInList',
])
```

Inbound snapshots are applied with `dispatch(hydratePreferences(...))`
(`src/lib/preferences-sync-channel.ts:87-91`), and the outgoing broadcast only fires
when `action.type` is in `BROADCASTABLE_ACTION_TYPES`
(`src/lib/preferences-sync-channel.ts:97-111`).

> **Why the loop guard matters.** Window A toggles a preference → broadcasts →
> window B receives and dispatches `hydratePreferences`. If `hydratePreferences`
> were _also_ broadcastable, B's apply would broadcast back to A, A would re-apply
> and re-broadcast, and the two windows would ping-pong forever. Splitting "user
> changed it" (broadcastable `set*`) from "a peer pushed it" (non-broadcastable
> `hydratePreferences`) breaks the cycle by construction.

### 2. Validate the inner fields on receive

A ping payload is trusted because it carries nothing. A snapshot payload gets
**hydrated into Redux and persisted**, so it must be validated field-by-field —
not merely "is `state` an object" (`src/lib/preferences-sync-channel.ts:38-55`):

```typescript
const isPreferencesSyncMessage = (
  data: unknown,
): data is PreferencesSyncMessage => {
  if (typeof data !== 'object' || data === null) return false
  const message = data as Partial<PreferencesSyncMessage>
  if (message.type !== PREFERENCES_SYNC_EVENT_TYPE) return false
  // Validate the inner preference fields, not just that `state` is an object: a
  // malformed channel payload (e.g. `completionSound: 'yes'`) would otherwise be
  // hydrated into Redux and persisted, since the selectors only coalesce
  // null/undefined and would let non-boolean junk through unchanged.
  const state = message.state as Partial<PreferencesState> | undefined
  return (
    typeof state === 'object' &&
    state !== null &&
    typeof state.completionSound === 'boolean' &&
    typeof state.retainCompletedInList === 'boolean'
  )
}
```

> **Why deep validation matters.** The preference selectors only coalesce
> `null`/`undefined`, so a junk value like `completionSound: 'yes'` would survive
> into the store and `localStorage` and corrupt every future read. Validate each
> field's type before hydrating.

### 3. Keep the SSR pass-through, and wire it into the store

Like the ping channels, the middleware no-ops when `BroadcastChannel` is
unavailable — it returns a transparent pass-through
(`src/lib/preferences-sync-channel.ts:78-80`):

```typescript
if (!isBrowserWithChannel()) {
  return () => (next) => (action) => next(action)
}
```

Unlike a ping channel, the stateful middleware opens **one long-lived channel** for
the store's lifetime (`src/lib/preferences-sync-channel.ts:82`) rather than
post-then-close per message, because it must keep listening. Wire it into the
middleware chain in `src/lib/redux/store.ts:76`:

```typescript
.concat(createPreferencesSyncMiddleware()),
```

---

## A note on intent channels (paste-import)

`src/lib/paste-import-channel.ts` is a ping channel by shape, but its _meaning_ is
different: it carries an **intent to open a dialog**, not a "data changed" signal —
so its verbs are `requestOpenCompletedImport` / `subscribeToOpenCompletedImport`.
It exists because the Floating Navigator lives in its own narrow `BrowserWindow` and
cannot toggle the main window's dialog state directly
(`src/lib/paste-import-channel.ts:1-11`).

The catch: a `BroadcastChannel` ping alone won't _show_ the main window. So the
producer pairs the broadcast with a `focusMainWindow()` preload IPC call
(`src/components/floating-navigator/FloatingNavigator.tsx:535-543`):

```typescript
const handleOpenImport = useCallback(async () => {
  requestOpenCompletedImport()
  if (isFloatingNavigatorEnvironment()) {
    try {
      await window.floatingNavigatorAPI!.window.focusMainWindow()
    } catch (error) {
      log.error('Failed to focus main window for import:', error)
    }
  }
```

The main window's `CompletedImportEntry` subscribes and opens the dialog
(`src/app/(main)/home/_components/CompletedImportEntry.tsx:60-62`):

```typescript
useCycleEffect(() => {
  return subscribeToOpenCompletedImport(() => setOpen(true))
}, [])
```

> **Takeaway.** Use a `BroadcastChannel` intent only to flip in-app state across
> windows. If the action must also surface, focus, or otherwise touch the **native
> window** itself, you need an Electron IPC call too — see
> [howto-add-ipc-channel.md](./howto-add-ipc-channel.md) for adding one.

---

## Checklist

Stateless ping (Variant A):

- [ ] Copied `src/lib/todo-sync-channel.ts`; renamed channel name (unique,
      `corelive-`-prefixed), event type, and exported `broadcastX` / `subscribeToX`.
- [ ] Kept the SSR guard (`typeof window` + `typeof BroadcastChannel`).
- [ ] `broadcastX()` posts then **`close()`s**; called at the mutation site.
- [ ] Subscribed in a `useCycleEffect` in a `'use client'` component and
      **returned the cleanup**.
- [ ] Receiver invalidates queries (re-derives) — it does not replay payload data.

Stateful snapshot (Variant B), additionally:

- [ ] Apply action (`hydratePreferences`) is **excluded** from the broadcastable
      action set (loop guard).
- [ ] Inbound payload is **deep-validated** field-by-field before dispatching.
- [ ] Middleware `.concat`-ed into `src/lib/redux/store.ts`.

## See also

- [explanation-state-and-sync.md](./explanation-state-and-sync.md) — why each
  window owns its own cache/store, and why ping vs. snapshot vs. intent.
- [howto-add-ipc-channel.md](./howto-add-ipc-channel.md) — when the cross-window
  action must touch the native Electron window.
- [reference-frontend.md](./reference-frontend.md) — the `src/hooks` lifecycle-effect
  family (`useCycleEffect` and friends) and the Redux store.
- [reference-electron.md](./reference-electron.md) — the Floating Navigator window
  and preload API.
