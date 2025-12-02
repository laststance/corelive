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
2. Fill in your actual values in the `.env` file (see `.env.example` for required variables)

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

### Building Desktop App

```bash
# Build for macOS (default)
pnpm electron:build

# Build for macOS explicitly
pnpm electron:build:mac
```

The built macOS applications (DMG and ZIP) will be available in the `dist-electron/` directory.

> **Note**: Only macOS builds are supported. Windows and Linux builds have been removed.
