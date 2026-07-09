[![Build](https://github.com/laststance/corelive/actions/workflows/build.yml/badge.svg)](https://github.com/laststance/corelive/actions/workflows/build.yml)
[![Lint](https://github.com/laststance/corelive/actions/workflows/lint.yml/badge.svg)](https://github.com/laststance/corelive/actions/workflows/lint.yml)
[![Test](https://github.com/laststance/corelive/actions/workflows/test.yml/badge.svg)](https://github.com/laststance/corelive/actions/workflows/test.yml)
[![Typecheck](https://github.com/laststance/corelive/actions/workflows/typecheck.yml/badge.svg)](https://github.com/laststance/corelive/actions/workflows/typecheck.yml)
[![E2E Tests (Web)](https://github.com/laststance/corelive/actions/workflows/e2e.web.yml/badge.svg)](https://github.com/laststance/corelive/actions/workflows/e2e.web.yml)
[![E2E Tests (Electron)](https://github.com/laststance/corelive/actions/workflows/e2e.electron.yml/badge.svg)](https://github.com/laststance/corelive/actions/workflows/e2e.electron.yml)
[![Storybook Testing](https://github.com/laststance/corelive/actions/workflows/storybook-test.yml/badge.svg)](https://github.com/laststance/corelive/actions/workflows/storybook-test.yml)

# 🚧 It is a work in progress 🚧

CoreLive is a personal task tracker and BrainDump archive whose centerpiece is an **Activity Heatmap** — every completed task accumulates as warm density across a year, so you close the app feeling validated, not graded. Built with [Next.js](https://nextjs.org/), available as a web app and a macOS desktop app (Electron).

> **⚠️ Pre-launch — there are no users yet.** Breaking changes are fine, anywhere. Reshape the database, Prisma schema, APIs, or any other element freely and abruptly — there is **no need to write or preserve migrations, keep existing data, or maintain backward compatibility**. When the schema changes, just reset the database (`pnpm db:reset`).

## Documentation

The design system (typography, color, motion, voice) is in **[`DESIGN.md`](DESIGN.md)**.

## Platform Support

This project supports:

- **Web**: Browser-based application accessible via web browsers
- **Desktop (macOS only)**: Electron-based desktop application for macOS

> **Note**: Desktop builds are currently limited to macOS. Windows and Linux support has been removed.

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)
- [Node.js](https://nodejs.org/) (version 24+; CI uses 24.13.0)
- [pnpm](https://pnpm.io/)
- [Clerk](https://clerk.com/)
- [ngrok](https://ngrok.com/) (for local development see [Clerk docs](https://clerk.com/docs/webhooks/sync-data#set-up-ngrok))

### Install dependencies

1. Clone the repository
2. Run `pnpm install` to install the dependencies

### Environment Variables

1. Copy `.env.example` to `.env` in the root of the project
2. Fill in your actual values in the `.env` file

All Next.js environment variables are loaded and validated via `src/env.mjs` using `@t3-oss/env-nextjs`. The app will fail to start if required variables are missing or invalid.

#### Next.js (Required)

| Variable                                       | Side   | Description                              |
| ---------------------------------------------- | ------ | ---------------------------------------- |
| `POSTGRES_PRISMA_URL`                          | Server | PostgreSQL connection string             |
| `WEBHOOK_SECRET`                               | Server | Clerk webhook signing secret             |
| `CLERK_SECRET_KEY`                             | Server | Clerk API secret key                     |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`            | Client | Clerk publishable key                    |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`                | Client | Sign-in page path (e.g., `/login`)       |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL`                | Client | Sign-up page path (e.g., `/sign-up`)     |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL` | Client | Post-login redirect path (e.g., `/home`) |

#### Electron Build (Required for macOS signing)

| Variable                      | Description                                 |
| ----------------------------- | ------------------------------------------- |
| `APPLE_ID`                    | Apple Developer account email               |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for notarization      |
| `APPLE_TEAM_ID`               | Apple Developer Team ID                     |
| `GH_TOKEN`                    | GitHub token for release uploads (optional) |

#### E2E Testing (Required)

| Variable                  | Description                                  |
| ------------------------- | -------------------------------------------- |
| `E2E_CLERK_USER_USERNAME` | Test user username (registered in Clerk Dev) |
| `E2E_CLERK_USER_PASSWORD` | Test user password                           |
| `E2E_CLERK_USER_EMAIL`    | Test user email                              |

> **Note**: E2E tests communicate with the real Clerk Dev instance (not mocked). Test credentials must be registered in Clerk Dashboard.

### Database Setup

This project uses PostgreSQL v17 as the database, managed through Docker Compose for local development.

The Docker Compose service maps **host port `5491`** to the container's default `5432`, so CoreLive does not collide with other local Postgres instances on the standard port.

```bash
# Start the PostgreSQL database
docker compose up -d postgres

# Apply migrations (also generates the Prisma client)
pnpm prisma:migrate

# Seed initial data (optional)
pnpm prisma:seed
```

Set `POSTGRES_PRISMA_URL` in `.env` to use the host port:

```
POSTGRES_PRISMA_URL="postgresql://postgres:password@localhost:5491/corelive?schema=public"
```

#### Database Management

**Basic Commands:**

```bash
# Start database
docker compose up -d postgres

# Stop database
docker compose down

# View database logs
docker compose logs postgres

# Access database directly
docker compose exec postgres psql -U postgres -d corelive
```

### Development Server

After setting up the database, run the development server:

```bash
pnpm dev
# or
npm run dev
# or
yarn dev
# or
bun dev
```

Open [http://localhost:4991](http://localhost:4991) with your browser to see the result.

You can start editing the page by modifying files under `src/app/`. The page auto-updates as you edit.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to optimize and load its three-font stack: **Inter Tight** (body/UI), **Newsreader** (display serif), and **Geist Mono** (data/code).

### Ngrok

Need ngrok to recive create.user event [webhook](https://clerk.com/docs/webhooks/overview) from Clerk in local.  
like `ngrok http --domain=foo.bar-ngrok.app 4991`

## Desktop Application (Electron - macOS only)

This project includes an Electron desktop application that wraps the Next.js web app. **Desktop builds are currently limited to macOS only.**

### Desktop features

Beyond the web app, the macOS build adds native surfaces:

- **Floating Navigator** — a compact, always-available quick-capture window
- **BrainDump** — a distraction-light freeform capture window
- **Settings** — a native preferences window
- **System tray** — menu-bar access and quick toggles
- **Always-on-top** — per-window keep-on-top preference (Floating on by default)
- **Hide dock icon** — run as a menu-bar-only accessory; the choice persists across restarts
- **Global keyboard shortcuts** — optional system-wide hotkeys, including lone-modifier keys (opt-in, off by default)
- **Deep links** — `corelive://` URLs open the app
- **Auto-update** — signed, notarized releases update in place

### Electron Development

```bash
# Run the desktop app in development mode
pnpm electron:dev

# Run Electron directly (requires Next.js dev server to be running)
pnpm electron
```

### Electron Build Commands

| Command                   | Purpose                                             |
| ------------------------- | --------------------------------------------------- |
| `pnpm electron:build:mac` | Production release (DMG + ZIP + signed + notarized) |
| `pnpm electron:build:dir` | Local production testing (unpacked .app only)       |

```bash
# Local production testing (connects to corelive.app)
pnpm electron:build:dir
open dist/mac-arm64/CoreLive.app  # Apple Silicon; dist/mac/ on Intel

# Production release
pnpm electron:build:mac
```

The built macOS applications (DMG and ZIP) will be available in the `dist/` directory.

> **Note**: Only macOS builds are supported. Windows and Linux builds have been removed.
