# @corelive/live-editor

Shared UI primitives, the theme system and local-day utilities used by both the web app and the desktop renderer.

- `./ui/*` shadcn primitives, plus the host-agnostic `./ui/ThemeSelector` (takes a `persistence` adapter: next-themes on the web, the preload on the desktop)
- `./themes`, `./themes/preview`, `./themes/axis`, `./theme-transition`, `./styles/*` the theme registry and generated CSS
- `./day`, `./cn`, `./categoryHierarchy`, `./heatmap-intensity` small shared helpers

The editor itself (store, surface, ember, category picker, input handling) is desktop-only and lives in `apps/desktop/renderer/editor/`. The package has no account, workspace or sync code. `scripts/live-editor-boundary.test.ts` fails if `apps/web` imports a moved module.
