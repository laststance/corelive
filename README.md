[![Build](https://github.com/laststance/unfarely/actions/workflows/build.yml/badge.svg)](https://github.com/laststance/unfarely/actions/workflows/build.yml)
[![Lint](https://github.com/laststance/unfarely/actions/workflows/lint.yml/badge.svg)](https://github.com/laststance/unfarely/actions/workflows/lint.yml)
[![Test](https://github.com/laststance/unfarely/actions/workflows/test.yml/badge.svg)](https://github.com/laststance/unfarely/actions/workflows/test.yml)
[![Typecheck](https://github.com/laststance/unfarely/actions/workflows/typecheck.yml/badge.svg)](https://github.com/laststance/unfarely/actions/workflows/typecheck.yml)
[![E2E Tests (Electron)](https://github.com/laststance/corelive/actions/workflows/e2e.electron.yml/badge.svg)](https://github.com/laststance/corelive/actions/workflows/e2e.electron.yml)
[![E2E Tests (Web)](https://github.com/laststance/corelive/actions/workflows/e2e.web.yml/badge.svg)](https://github.com/laststance/corelive/actions/workflows/e2e.web.yml)
[![Storybook Testing](https://github.com/laststance/corelive/actions/workflows/storybook-test.yml/badge.svg)](https://github.com/laststance/corelive/actions/workflows/storybook-test.yml)
[![Covered by Argos Visual Testing](https://argos-ci.com/badge-large.svg)](https://app.argos-ci.com/ryota-murakami/corelive/reference)

# 🚧 It is a work in progress 🚧

This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Platform Support

This project supports:

- **Web**: Browser-based application accessible via web browsers
- **Desktop (macOS only)**: Electron-based desktop application for macOS

> **Note**: Desktop builds are currently limited to macOS. Windows and Linux support has been removed.

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)
- [Node.js](https://nodejs.org/) (recommended version 22+)
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

```bash
# Start the PostgreSQL database
docker compose up -d postgres

# Push the database schema
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=1 pnpm prisma:reset

# Generate Prisma client
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=1 pnpm prisma generate
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

Open [http://localhost:3011](http://localhost:3011) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.

### Ngrok

Need ngrok to recive create.user event [webhook](https://clerk.com/docs/webhooks/overview) from Clerk in local.  
like `ngrok http --domain=foo.bar-ngrok.app 3011`

## Desktop Application (Electron - macOS only)

This project includes an Electron desktop application that wraps the Next.js web app. **Desktop builds are currently limited to macOS only.**

### Electron Development

```bash
# Run the desktop app in development mode
pnpm electron:dev

# Run Electron directly (requires Next.js dev server to be running)
pnpm electron
```

### Electron Build Commands

Each Electron build command sets `APP_URL` to determine which web app URL the Electron app loads:

| Command                   | APP_URL                 | Purpose                                             |
| ------------------------- | ----------------------- | --------------------------------------------------- |
| `pnpm electron:build:mac` | `https://corelive.app`  | Production release (DMG + ZIP + signed + notarized) |
| `pnpm electron:build:dir` | `https://corelive.app`  | Local production testing (unpacked .app only)       |
| `pnpm electron:build:e2e` | `http://localhost:3011` | E2E testing with local Next.js server               |

```bash
# Local production testing (connects to corelive.app)
pnpm electron:build:dir
open dist-electron/mac/CoreLive.app

# E2E testing (connects to localhost:3011)
pnpm build && pnpm electron:build:e2e && pnpm e2e:electron

# Production release
pnpm electron:build:mac
```

The built macOS applications (DMG and ZIP) will be available in the `dist-electron/` directory.

> **Note**: Only macOS builds are supported. Windows and Linux builds have been removed.
