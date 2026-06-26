# #128 — Braindump hides spellcheck red underlines

## Context

Braindump is the quick, messy-capture surface. The native browser spellchecker draws
red squiggly underlines under misspelled / unfinished / mixed-language words, which makes
half-formed thoughts feel "corrected" and noisy — the opposite of the calm, self-affirming
writing surface the product wants (DESIGN.md north star: capture without judgement).

## Root cause

`src/components/braindump/BrainDumpEditor.tsx` renders its writing area as a raw
`<textarea>` with a **bare `spellCheck` attribute** (line 1449). In JSX a bare attribute is
`spellCheck={true}`, so the browser spellchecker is explicitly enabled and red underlines show.

## Design

Single-character-of-intent change: set the textarea's `spellCheck={false}`.

```diff
- spellCheck
+ spellCheck={false}
```

`spellCheck` is the standard React DOM attribute; `spellCheck={false}` renders the HTML
`spellcheck="false"`, which disables the native spellchecker (no red underlines) on that
element across Chromium/WebKit. Typing, editing, IME composition, and saving are untouched —
`spellcheck` only governs the correction overlay, not input or `value`.

### Why only `spellCheck` (scope discipline)

The issue is specifically about **red spellcheck underlines**. `autoCorrect` /
`autoCapitalize` / `autoComplete` govern auto-substitution and suggestions (mostly mobile),
not the red underline, and changing them would alter typing behavior beyond the ask. They are
intentionally **out of scope** — minimal change, no behavior creep.

## Surface coverage ("consistent wherever Braindump is available")

The braindump writing area is a **single shared component** rendered in exactly one place:

- `BrainDumpEditor` (the only braindump text input — one raw `<textarea>`, line 1436) is
  rendered solely by `src/app/braindump/page.tsx` (`<BrainDumpEditor categories={…} />`).
- Every Electron braindump surface (the Floating / BrainDump windows) loads the **remote web
  `/braindump` route** (Electron is a full WebView of `corelive.app`), so they render the same
  component. There is no separate native or duplicate braindump editor.
- The only other `<textarea>` in the app is the generic shadcn primitive
  `src/components/ui/textarea.tsx`, which braindump does **not** use and which must stay
  untouched (it backs unrelated inputs).

⇒ Changing the one `BrainDumpEditor` textarea satisfies the "consistent across all surfaces"
acceptance criterion by construction.

## Testing

- **Unit (regression):** extend `BrainDumpEditor.test.tsx` to assert the writing textarea
  renders with spellcheck disabled (`spellcheck="false"` in the DOM), so a future refactor
  can't silently re-enable the red underlines. Hard-coded expected value, AAA, behavior-named.
- **Renderer E2E:** existing braindump specs continue to prove typing / completing / saving
  still work (no behavior change to input). The spellcheck overlay itself is a browser-native
  rendering with no DOM hook for E2E — the unit DOM-attribute assertion is the right gate.

## Local QA

Web renderer (`/braindump`): type a deliberately misspelled word and confirm no red underline
appears, and that typing / line-complete (Cmd/Ctrl+Enter) / save still work. Renderer-only
change → no native-Cocoa QA owed; the Electron windows show the identical remote route.

## Files touched

- `src/components/braindump/BrainDumpEditor.tsx` — `spellCheck` → `spellCheck={false}`.
- `src/components/braindump/BrainDumpEditor.test.tsx` — spellcheck-disabled regression assertion.
- `docs/design/128-braindump-disable-spellcheck.md` — this doc.

## Scope

Renderer-only. No Electron main-process / native code, no DB, no API. Already live via Vercel
on merge; no signed release needed.
