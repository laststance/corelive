# 🚀 GitHub Actions CI/CD Setup

This repository uses GitHub Actions for automated CI/CD with multiple workflows for different aspects of code quality and testing.

## 📋 Workflows Overview

| Workflow      | Purpose                             | Trigger           | Status |
| ------------- | ----------------------------------- | ----------------- | ------ |
| **Build**     | Builds the Next.js application      | Push to main, PRs | ✅     |
| **Lint**      | Runs ESLint for code quality        | Push to main, PRs | ✅     |
| **Test**      | Runs unit tests and Storybook tests | Push to main, PRs | ✅     |
| **Typecheck** | Validates TypeScript types          | Push to main, PRs | ✅     |
| **E2E Tests** | Runs Playwright end-to-end tests    | Push to main, PRs | ⚙️     |

## 🔑 Required GitHub Secrets

To run the CI workflows successfully, configure these **Repository Secrets** in GitHub Settings:

### Repository Settings → Secrets and variables → Actions

#### 🔐 Clerk Authentication

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Your Clerk publishable key
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL` - Sign in URL (usually `/login`)
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL` - Sign up URL (usually `/sign-up`)
- `CLERK_SECRET_KEY` - Your Clerk secret key
- `WEBHOOK_SECRET` - Webhook secret for Clerk webhooks

#### 🗄️ Database

- `POSTGRES_PRISMA_URL` - PostgreSQL connection string

## 🛠️ Shared Configuration

### Prepare Action

Located at `.github/actions/prepare/action.yml`, this shared action:

- Installs pnpm `10.14.0` (matches `package.json`)
- Sets up Node.js `22.17.1` (matches Volta config)
- Installs dependencies with caching

### Environment Variables

All workflows that need environment variables (Build, E2E) create a `.env` file with required secrets to ensure proper application functionality.

## 🎭 E2E Testing Specifics

The E2E workflow:

1. **Uses shared prepare action** for consistency
2. **Sets up all environment variables** including MSW mocking
3. **Builds the application** (required per project rules)
4. **Installs only Chromium** browser for efficiency
5. **Uses `--reporter=list`** as per project requirements
6. **Uploads artifacts**: test reports, screenshots, and results

### E2E Environment Setup

- `NEXT_PUBLIC_ENABLE_MSW_MOCK=true` - Enables Mock Service Worker for testing
- All Clerk and database variables are set from secrets
- `CI=true` - Enables CI-specific Playwright configurations

## 🔍 Troubleshooting

### Common Issues

1. **Missing Secrets Error**

   ```
   Error: Required secret not found: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
   ```

   **Solution**: Add all required secrets listed above to GitHub repository settings.

2. **Build Failures**

   ```
   Error: Environment validation failed
   ```

   **Solution**: Ensure all required environment variables are set in secrets.

3. **E2E Test Timeouts**
   - E2E workflow has 60-minute timeout
   - Individual test timeouts configured in `playwright.config.ts`
   - Check uploaded screenshots for visual debugging

### Debug Locally

```bash
# Run individual checks
pnpm lint          # Linting
pnpm typecheck     # Type checking
pnpm test          # Unit & Storybook tests
pnpm build         # Production build
pnpm e2e           # E2E tests
```

## 📦 Maintenance

### Version Updates

When updating versions, ensure consistency across:

- `package.json` `packageManager` field
- `volta.node` version in `package.json`
- `.github/actions/prepare/action.yml` versions
- Any hardcoded versions in workflows

### Adding New Secrets

1. Add to `src/env.mjs` schema
2. Update workflow environment variable setup
3. Add to this documentation
4. Configure in GitHub repository secrets

## 🌍 Environment Variables Schema

The application uses T3 Env for type-safe environment variables. See `src/env.mjs` for the complete schema:

```typescript
// Server-side only
POSTGRES_PRISMA_URL: z.string().trim().min(1)
WEBHOOK_SECRET: z.string().trim().min(1)
CLERK_SECRET_KEY: z.string().trim().min(1)

// Client-side (NEXT_PUBLIC_ prefix)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().trim().min(1)
NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().trim().min(1)
NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().trim().min(1)
NEXT_PUBLIC_ENABLE_MSW_MOCK: z.enum(['true', 'false']).optional()
```

## 📊 Workflow Status

You can check the status of all workflows in the **Actions** tab of your GitHub repository. Each workflow runs automatically on push to main and on pull requests.

All workflows must pass for a successful deployment! 🎉
