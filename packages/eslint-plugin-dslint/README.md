# eslint-plugin-dslint

Design System Lint for Tailwind CSS.

> **デザインシステムのデザイントークンを使ってスタイリングしていたら no warning。**
> **デザイントークンに存在しないスタイリングに warning を出す。**

## Single Source of Truth

`tailwind.config.ts` is the single source of truth for design tokens.

```
globals.css → dslint sync → tailwind.config.ts (SSoT) → token-only rule
```

## Installation

```bash
pnpm add -D eslint-plugin-dslint
```

## Usage

### Strict Mode (Whitelist)

Only allow classes that exist in your `tailwind.config.ts`:

```js
import dslint from 'eslint-plugin-dslint'

export default [
  {
    plugins: { dslint },
    rules: {
      'dslint/token-only': [
        'warn',
        {
          tokenSource: './tailwind.config.ts',
        },
      ],
    },
    ignores: ['src/components/ui/**', '**/*.stories.tsx'],
  },
]
```

### Light Mode (Blacklist)

Only forbid specific hardcoded patterns:

```js
import dslint from 'eslint-plugin-dslint'

export default [
  {
    plugins: { dslint },
    rules: {
      'dslint/ban-stylelist': [
        'warn',
        {
          forbid: { colors: true },
        },
      ],
    },
  },
]
```

## CLI

```bash
# Sync globals.css → tailwind.config.ts
pnpm dslint sync

# Check for inconsistencies
pnpm dslint sync --check

# Preview changes
pnpm dslint sync --dry-run
```

## Rules

| Rule                   | Description                               |
| ---------------------- | ----------------------------------------- |
| `dslint/token-only`    | Only allow tokens from tailwind.config.ts |
| `dslint/ban-stylelist` | Forbid hardcoded values                   |

## Rule Options

### `dslint/token-only`

```js
'dslint/token-only': ['warn', {
  // Path to tailwind.config.ts (required)
  tokenSource: './tailwind.config.ts',

  // Patterns to ignore (optional)
  ignore: ['animate-*', 'group-*'],
}]
```

### `dslint/ban-stylelist`

```js
'dslint/ban-stylelist': ['warn', {
  forbid: {
    colors: true,    // Forbid #hex, rgb(), oklch()
    spacing: true,   // Forbid p-[17px], m-[2rem]
    sizing: true,    // Forbid w-[123px], h-[50vh]
  },
}]
```

## License

MIT
