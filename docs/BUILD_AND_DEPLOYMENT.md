# Build and Deployment Guide

This guide covers building and deploying the CoreLive Electron application.

## Prerequisites

### Development Environment

- Node.js 22.21.1 (managed by Volta)
- pnpm 10.27.0
- Git

### Platform-Specific Requirements

#### macOS (for macOS builds)

- Xcode Command Line Tools
- Apple Developer Account (for code signing and notarization)
- Valid Apple certificates

> **Note**: This project currently supports macOS only for desktop builds.

## Environment Variables

### Required for Production Builds

```bash
# macOS Code Signing and Notarization
APPLE_ID=your_apple_id@example.com
APPLE_ID_PASSWORD=your_app_specific_password
APPLE_TEAM_ID=YOUR_TEAM_ID
```

### Setting Up Environment Variables

1. Copy `.env.example` to `.env` in the root of the project
2. Fill in your actual values
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

### Build Commands

```bash
# Development/Testing (fast, no packaging)
pnpm electron:build:dir
open dist/mac/CoreLive.app

# Production Release (DMG + ZIP + signing + Notarization)
pnpm electron:build:mac
```

| Option               | Output               | Use Case                           |
| -------------------- | -------------------- | ---------------------------------- |
| `electron:build:dir` | Unpacked `.app` only | Fast iteration, testing, debugging |
| `electron:build:mac` | DMG + ZIP + signed   | Distribution, release              |

### Build Process

1. **Electron build** via electron-builder (no Next.js build needed - Full WebView loads remote URL)
2. **Code signing** (if certificates configured)
3. **Notarization** (via afterSign hook)

### Build Output (`dist/`)

- `CoreLive-{version}-arm64.dmg` - Installer
- `CoreLive-{version}-arm64-mac.zip` - Archive
- `latest-mac.yml` - Auto-update manifest
- `checksums.json` - Build verification

## Releases

### Automated Release (Recommended)

Releases are fully automated via GitHub Actions:

1. **Update version** in `package.json`
2. **Commit and create tag**:
   ```bash
   git add package.json
   git commit -m "chore: release v1.0.0"
   git tag v1.0.0
   git push && git push --tags
   ```
3. **GitHub Actions** automatically:
   - Runs tests (typecheck, lint, unit tests, electron tests)
   - Builds the application
   - Signs and notarizes the app
   - Creates a GitHub Release with artifacts

### CI/CD Pipeline (`.github/workflows/build-and-release.yml`)

Runs on version tags (`v*`):

- Builds for macOS
- Code signing and notarization
- Creates GitHub releases
- Uploads artifacts (DMG and ZIP)
- Security scanning with Trivy

### GitHub Secrets Required

```
APPLE_ID
APPLE_ID_PASSWORD
APPLE_TEAM_ID
APPLE_CERTIFICATES_P12
APPLE_CERTIFICATES_PASSWORD
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
NEXT_PUBLIC_CLERK_SIGN_IN_URL
NEXT_PUBLIC_CLERK_SIGN_UP_URL
NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL
CLERK_SECRET_KEY
WEBHOOK_SECRET
POSTGRES_PRISMA_URL
```

## Code Signing

### macOS

1. **Get Apple Developer Account**
2. **Create certificates** in Xcode or Apple Developer Portal
3. **Export certificate** as .p12 file
4. **Convert to base64** for GitHub Secrets:
   ```bash
   base64 -i certificate.p12 | pbcopy
   ```

## Auto-Updater

### Configuration

The auto-updater is configured in `electron-builder.json`:

- Uses GitHub Releases as update server
- Supports delta updates
- Handles update notifications

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

- Use `electron:build:dir` for quick testing (no DMG/ZIP packaging)
- Pre-run `pnpm typecheck && pnpm lint && pnpm test` before production builds

### Bundle Size

- Monitor build artifacts size
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
