# Build and Deployment Guide

This guide covers building and deploying the CoreLive TODO Electron application.

## Prerequisites

### Development Environment

- Node.js 22.17.1 (managed by Volta)
- pnpm 10.14.0
- Git

### Platform-Specific Requirements

#### macOS (for macOS builds)

- Xcode Command Line Tools
- Apple Developer Account (for code signing and notarization)
- Valid Apple certificates

> **Note**: This project currently supports macOS only for desktop builds. Windows and Linux support has been removed.

## Environment Variables

### Required for Production Builds

```bash
# GitHub (for auto-updater and releases)
GH_TOKEN=your_github_token

# macOS Code Signing and Notarization
APPLE_ID=your_apple_id@example.com
APPLE_ID_PASSWORD=your_app_specific_password
APPLE_TEAM_ID=YOUR_TEAM_ID
APPLE_CERTIFICATES_P12=base64_encoded_certificate
APPLE_CERTIFICATES_PASSWORD=certificate_password
```

### Setting Up Environment Variables

1. Copy `.env.example` to `.env` in the root of the project
2. Fill in your actual values in the `.env` file (see `.env.example` for all required variables)
3. For CI/CD, set these as GitHub Secrets

## Development

### Starting Development Environment

```bash
# Start both Next.js and Electron in development mode
pnpm electron:dev
```

The development script will:

1. Start Next.js development server
2. Wait for it to be ready
3. Launch Electron in development mode
4. Handle graceful shutdown

### Development Features

- Hot reload for Next.js changes
- Electron restart on main process changes
- Integrated error handling
- Automatic port detection

## Building

### Quick Build Commands

```bash
# Build for macOS
pnpm electron:build:mac

# Build directory only (for testing)
pnpm electron:build:dir
```

> **Note**: Only macOS builds are supported. Windows and Linux builds have been removed.

### Advanced Build Options

```bash
# Build for macOS (default)
node scripts/build.js mac

# Skip pre-build checks (faster, but not recommended)
node scripts/build.js mac --skip-checks

# Skip Next.js build (use existing build)
node scripts/build.js mac --skip-nextjs
```

### Build Process

The build script performs:

1. **Pre-build checks**
   - TypeScript type checking
   - ESLint linting
   - Unit tests
   - Electron tests

2. **Next.js build**
   - Production optimization
   - Static export for Electron

3. **Electron build**
   - Platform-specific packaging
   - Code signing (if configured)
   - Auto-updater setup

4. **Post-build**
   - Checksum generation
   - Build report creation

## Releases

### Automated Releases

```bash
# Patch release (1.0.0 -> 1.0.1)
pnpm electron:release

# Minor release (1.0.0 -> 1.1.0)
pnpm electron:release:minor

# Major release (1.0.0 -> 2.0.0)
pnpm electron:release:major
```

### Manual Release Process

1. **Prepare release**

   ```bash
   # Test the release process
   node scripts/release.js patch --dry-run
   ```

2. **Create release**

   ```bash
   # This will:
   # - Update version in package.json
   # - Build the application
   # - Create git tag
   # - Push to GitHub (triggers CI/CD)
   node scripts/release.js patch
   ```

3. **Monitor CI/CD**
   - Check GitHub Actions for build progress
   - Verify artifacts are created
   - Test the release

### Release Process

The release script:

1. Validates environment (git status, env vars)
2. Updates version numbers
3. Builds application for macOS
4. Creates git tag and commits
5. Pushes to GitHub (triggers automated release)

## CI/CD Pipeline

### Continuous Integration (`.github/workflows/ci.yml`)

Runs on every push and PR:

- Linting and formatting checks
- Type checking
- Unit and integration tests
- Build verification for all platforms
- E2E tests
- Storybook tests

### Build and Release (`.github/workflows/build-and-release.yml`)

Runs on version tags:

- Builds for macOS only
- Code signing and notarization
- Creates GitHub releases
- Uploads artifacts (DMG and ZIP)
- Security scanning

### GitHub Secrets Required

```
APPLE_ID
APPLE_ID_PASSWORD
APPLE_TEAM_ID
APPLE_CERTIFICATES_P12
APPLE_CERTIFICATES_PASSWORD
CODECOV_TOKEN (optional)
```

## Code Signing

### macOS

1. **Get Apple Developer Account**
2. **Create certificates in Xcode or Apple Developer Portal**
3. **Export certificate as .p12 file**
4. **Convert to base64 for GitHub Secrets**
   ```bash
   base64 -i certificate.p12 | pbcopy
   ```

> **Note**: Only macOS code signing is supported. Windows code signing has been removed.

## Auto-Updater

### Configuration

The auto-updater is configured in `electron-builder.json`:

- Uses GitHub Releases as update server
- Checks for updates every 4 hours
- Supports delta updates
- Handles update notifications

### Testing Updates

1. **Create test release**

   ```bash
   node scripts/release.js patch --dry-run
   ```

2. **Build and install locally**
3. **Create new version and test update flow**

## Troubleshooting

### Common Issues

#### Build Failures

```bash
# Clear caches and reinstall
pnpm clean
rm -rf node_modules pnpm-lock.yaml
pnpm install

# Check for missing dependencies
pnpm audit
```

#### Code Signing Issues

```bash
# Verify certificates (macOS)
security find-identity -v -p codesigning

# Check certificate validity
openssl pkcs12 -info -in certificate.p12
```

#### Auto-updater Issues

- Verify GitHub token permissions
- Check release artifacts are uploaded
- Ensure version numbers are correct
- Test with development builds first

### Debug Mode

```bash
# Enable debug logging
DEBUG=electron-builder pnpm electron:build:mac

# Verbose Electron logging
ELECTRON_ENABLE_LOGGING=1 pnpm electron:dev
```

## Performance Optimization

### Build Optimization

- Use `--skip-checks` for faster iteration
- Use `electron:build:dir` for quick testing

### Bundle Size

- Monitor build artifacts size
- Use webpack-bundle-analyzer for Next.js
- Optimize dependencies and assets

## Security

### Build Security

- All builds are scanned with Trivy
- Dependencies are audited
- Code signing prevents tampering
- Auto-updater uses HTTPS and signatures

### Best Practices

- Keep dependencies updated
- Use security-focused ESLint rules
- Regular security audits
- Proper environment variable handling

## Monitoring

### Build Metrics

- Build times and sizes are tracked
- Artifacts are checksummed
- Build reports are generated
- CI/CD metrics in GitHub Actions

### Release Monitoring

- GitHub Releases for distribution
- Download statistics
- Update adoption rates
- Error reporting integration
