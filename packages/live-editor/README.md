# @corelive/live-editor

Shared UI primitives, the theme system and local-day utilities used by CoreLive Dashboard and the desktop renderer.

- `./ui/*` shadcn primitives and the host-agnostic `./ui/ThemeSelector`. Its adapter saves signed-in Dashboard choices to the account, uses next-themes for signed-out browsers and saves desktop choices through the preload.
- `./themes`, `./themes/preview`, `./themes/axis`, `./theme-transition`, `./styles/*` the theme registry and generated CSS
- `./activity-card` prepares and renders the 960 × 1200 PNG used by Dashboard downloads and Mac activity exports.
- `./day`, `./cn`, `./categoryHierarchy`, `./heatmap-intensity` small shared helpers

The editor itself (store, surface, ember, category picker, input handling) is desktop-only and lives in `apps/desktop/renderer/editor/`. The package has no account, workspace or sync code. `scripts/live-editor-boundary.test.ts` fails if `apps/web` imports a moved module.
