import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Regression guard for the v0.8.0/v0.8.1 packaging bug: electron-builder + pnpm
 * (nodeLinker: hoisted) silently drops LEAF transitive packages from the
 * production app.asar even though they are installed locally. The fix is to
 * promote each needed leaf to a DIRECT dependency in package.json, which forces
 * electron-builder's dependency walk to bundle it.
 *
 * This is a TEST, not just a comment, because `ms`/`wrappy` are never imported
 * directly in our source — a routine `depcheck`/`knip`/manual cleanup would flag
 * them as "unused" and remove them, silently reintroducing the bug. Removing
 * either must fail loudly in CI (test.yml runs `pnpm test:electron`) instead of
 * shipping a broken desktop build that only fails at runtime on a user's Mac.
 */

// Arrange (shared): read the real package.json from the repo root. vitest runs
// with cwd = project root, so this resolves the same file electron-builder reads.
const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
) as { dependencies?: Record<string, string> }
const dependencies = packageJson.dependencies ?? {}

describe('packaged Electron bundles the leaf deps electron-builder+pnpm would drop', () => {
  // `ms` is REQUIRED at runtime: debug/src/common.js calls require('ms'), and
  // the chain is debug <- builder-util-runtime <- electron-updater. With `ms`
  // absent from the asar, electron-updater throws MODULE_NOT_FOUND at load time,
  // so the WHOLE auto-update mechanism dies — silently, because the failure is
  // caught and the app keeps running but can never update itself again.
  it('keeps "ms" as a direct dependency so packaged electron-updater can load and auto-update stays alive', () => {
    // Act
    const declaredMsRange = dependencies.ms

    // Assert: present as a non-empty semver range (version is free to bump; the
    // invariant is only that ms remains a declared direct dependency).
    expect(typeof declaredMsRange).toBe('string')
    expect(declaredMsRange).toBeTruthy()
  })

  // `wrappy` is DEFENSIVE only — it is NOT in electron-updater's require closure.
  // It was reachable solely via the pino-pretty crash path (pino-pretty -> pump
  // -> once -> wrappy), which the logger gate (computeShouldUsePrettyTransport)
  // already neutralizes in packaged builds. It is pinned as belt-and-suspenders
  // so that path can never crash on a missing leaf if the gate ever regresses.
  it('keeps "wrappy" as a direct dependency to harden the pino-pretty crash path against the leaf drop', () => {
    // Act
    const declaredWrappyRange = dependencies.wrappy

    // Assert
    expect(typeof declaredWrappyRange).toBe('string')
    expect(declaredWrappyRange).toBeTruthy()
  })
})
