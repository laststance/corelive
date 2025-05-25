[![Build](https://github.com/laststance/unfarely/actions/workflows/build.yml/badge.svg)](https://github.com/laststance/unfarely/actions/workflows/build.yml)
[![Lint](https://github.com/laststance/unfarely/actions/workflows/lint.yml/badge.svg)](https://github.com/laststance/unfarely/actions/workflows/lint.yml)
[![Test](https://github.com/laststance/unfarely/actions/workflows/test.yml/badge.svg)](https://github.com/laststance/unfarely/actions/workflows/test.yml)
[![Typecheck](https://github.com/laststance/unfarely/actions/workflows/typecheck.yml/badge.svg)](https://github.com/laststance/unfarely/actions/workflows/typecheck.yml)

# 🚧 It is a work in progress 🚧

This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)
- [Node.js](https://nodejs.org/) (recommended version 18+)
- [pnpm](https://pnpm.io/) (recommended) or npm

### Database Setup

This project uses PostgreSQL v17 as the database, managed through Docker Compose for local development.

#### Quick Setup

Run our automated setup script:

```bash
./scripts/dev-setup.sh
```

**What the script does:**

The `dev-setup.sh` script is a comprehensive development database setup tool that automates the entire PostgreSQL configuration process. Here's how it works:

1. **Prerequisites Validation**

   - Checks if Docker is running and exits with a helpful error if not
   - Detects whether to use `docker compose` (modern) or `docker-compose` (legacy)
   - Verifies that necessary tools are available

2. **Database Container Management**

   - Starts the PostgreSQL v17 container in detached mode using Docker Compose
   - Implements a robust health check that waits up to 60 seconds for the database to be ready
   - Shows container logs if startup fails for easier debugging

3. **Prisma Schema Setup**

   - Automatically pushes the Prisma schema to create all necessary tables and relationships
   - Generates the Prisma client for type-safe database operations
   - Supports both pnpm and npm package managers

4. **Developer Guidance**
   - Provides a comprehensive list of useful database management commands
   - Shows optional pgAdmin setup instructions for GUI database access
   - Displays all connection details for manual database access

**Key Benefits:**

- **One-command setup**: Perfect for new team members or setting up on a new machine
- **Robust error handling**: Clear error messages and automatic fallbacks
- **Cross-platform compatibility**: Works with different Docker Compose versions
- **Educational**: Shows all the commands you need for ongoing development

#### Manual Setup

If you prefer to set up manually:

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

**Optional pgAdmin (Database GUI):**

```bash
# Start pgAdmin
docker compose --profile pgadmin up -d

# Access at http://localhost:5050
# Login: admin@corelive.dev / admin
```

**Database Connection Details:**

- Host: `localhost`
- Port: `5432`
- Database: `corelive`
- Username: `postgres`
- Password: `password`

#### Database Initialization

The project includes a PostgreSQL initialization script at `prisma/init.sql` that runs automatically when the database container starts for the first time.

**What the init.sql script does:**

1. **Extension Setup**

   - Enables `uuid-ossp` extension for UUID generation functions
   - Enables `pg_trgm` extension for trigram-based text similarity and indexing
   - These extensions are recommended for PostgreSQL 17 and enhance database functionality

2. **Configuration**

   - Sets the database timezone to UTC for consistent timestamp handling across different environments
   - Ensures all datetime operations use a standardized timezone

3. **Integration with Prisma**
   - Handles only the basic database setup and extensions
   - Leaves schema creation to Prisma migrations for better version control and consistency
   - Works seamlessly with the Prisma workflow used in the `dev-setup.sh` script

**Benefits:**

- **Automatic setup**: Extensions and configurations are applied automatically on first container startup
- **Consistency**: Ensures all development environments have the same database configuration
- **Performance**: Pre-installed extensions improve UUID generation and text search capabilities

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
