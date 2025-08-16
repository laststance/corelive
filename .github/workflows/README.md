# GitHub Actions E2E Testing Setup

This directory contains the GitHub Actions workflow for running Playwright e2e tests automatically on push and pull requests.

## 🔧 Required Secrets Configuration

To run the e2e tests successfully in GitHub Actions, you need to configure the following secrets in your repository settings:

### Repository Settings → Secrets and variables → Actions

Add these **Repository secrets**:

#### Clerk Authentication (Test Environment)

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY_TEST` - Your Clerk test publishable key
- `CLERK_SECRET_KEY_TEST` - Your Clerk test secret key

#### Database (if required)

- `DATABASE_URL_TEST` - Test database connection string (if using database in tests)

### 📝 How to Add Secrets

1. Go to your GitHub repository
2. Click **Settings** tab
3. Navigate to **Secrets and variables** → **Actions**
4. Click **New repository secret**
5. Add each secret with the exact name shown above

## 🎯 Workflow Features

The `e2e.yml` workflow includes:

- **✅ Node.js 22.17.1** - Matches your Volta configuration
- **📦 pnpm 10.14.0** - Uses exact version from packageManager
- **🗄️ Prisma Generation** - Generates Prisma client before tests
- **🏗️ Next.js Build** - Builds application before testing (required by project rules)
- **🎭 Playwright Browser** - Installs only Chromium browser to save time
- **🧪 Test Execution** - Uses `--reporter=list` as per project requirements
- **📊 Artifact Uploads** - Saves test reports, screenshots, and results

## 🚀 Triggers

The workflow runs on:

- **Push** to `main` and `develop` branches
- **Pull requests** targeting `main` and `develop` branches

## 📸 Test Artifacts

When tests run, the following artifacts are automatically uploaded:

1. **Playwright Report** - HTML test report with detailed results
2. **Screenshots** - Any screenshots taken during test execution
3. **Test Results** - Raw test result files

Artifacts are retained for **30 days** and can be downloaded from the workflow run page.

## 🔍 Troubleshooting

### Common Issues

1. **Build Failures**
   - Ensure all environment variables are properly set
   - Check that Prisma schema is valid

2. **Test Failures**
   - Review uploaded screenshots for visual debugging
   - Check the Playwright report for detailed error information
   - Verify Clerk test credentials are correct

3. **Timeout Issues**
   - Workflow has 60-minute timeout
   - Individual test timeouts are configured in `playwright.config.ts`

### Debug Mode

For local debugging, you can still use:

```bash
pnpm e2e:debug  # Local debug mode
pnpm e2e:ui     # UI mode for test development
```

**Note:** The workflow never uses `--debug` flag as per project rules.

## 🌍 Environment Variables

The workflow sets these environment variables during test execution:

```yaml
CI: true # Enables CI-specific configurations
NODE_ENV: test # Sets test environment
NEXT_PUBLIC_ENABLE_MSW_MOCK: true # Enables MSW mocking for tests
```

## 📋 Maintenance

- Update Node.js version when you update your Volta configuration
- Update pnpm version when you update packageManager in package.json
- Review and update Playwright version regularly for security and features
