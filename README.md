[![Build](https://github.com/laststance/unfarely/actions/workflows/build.yml/badge.svg)](https://github.com/laststance/unfarely/actions/workflows/build.yml)
[![Lint](https://github.com/laststance/unfarely/actions/workflows/lint.yml/badge.svg)](https://github.com/laststance/unfarely/actions/workflows/lint.yml)
[![Test](https://github.com/laststance/unfarely/actions/workflows/test.yml/badge.svg)](https://github.com/laststance/unfarely/actions/workflows/test.yml)
[![Typecheck](https://github.com/laststance/unfarely/actions/workflows/typecheck.yml/badge.svg)](https://github.com/laststance/unfarely/actions/workflows/typecheck.yml)

# 🚧 It is a work in progress 🚧

This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

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

1. Create a `.env.local` file in the root of the project
1. Set variables in `.env.local` following the [src/env.mjs](./src/env.mjs)

### Database Setup

This project uses PostgreSQL v17 as the database, managed through Docker Compose for local development.

```bash
# Start the PostgreSQL database
docker compose up -d postgres

# Push the database schema
pnpm prisma db push

# Generate Prisma client
pnpm prisma generate
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

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.
