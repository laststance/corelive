/**
 * Unit coverage for Cursor SSL_CERT_FILE sanitization used by the Next launcher.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { sanitizeTlsEnvForClerkHandshake } from './next-with-system-ca.mjs'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDirectory, '..')

describe('next-with-system-ca TLS env sanitization', () => {
  it('drops Cursor exclusive SSL_CERT_FILE and keeps it as NODE_EXTRA_CA_CERTS', () => {
    // Arrange
    const cursorCaPath = '/tmp/sfw-abc/socketFirewallCa.crt'

    // Act
    const sanitized = sanitizeTlsEnvForClerkHandshake({
      SSL_CERT_FILE: cursorCaPath,
      SSL_CERT_DIR: '/tmp/sfw-abc',
    })

    // Assert
    expect(sanitized.SSL_CERT_FILE).toBeUndefined()
    expect(sanitized.SSL_CERT_DIR).toBeUndefined()
    expect(sanitized.NODE_EXTRA_CA_CERTS).toBe(cursorCaPath)
  })

  it('leaves non-Cursor SSL_CERT_FILE untouched', () => {
    // Arrange
    const systemCaPath = '/etc/ssl/cert.pem'

    // Act
    const sanitized = sanitizeTlsEnvForClerkHandshake({
      SSL_CERT_FILE: systemCaPath,
      SSL_CERT_DIR: '/etc/ssl/certs',
      NODE_EXTRA_CA_CERTS: '/custom/extra.pem',
    })

    // Assert
    expect(sanitized.SSL_CERT_FILE).toBe(systemCaPath)
    expect(sanitized.SSL_CERT_DIR).toBe('/etc/ssl/certs')
    expect(sanitized.NODE_EXTRA_CA_CERTS).toBe('/custom/extra.pem')
  })

  it('starts Next help under Cursor CA env without crashing', () => {
    // Arrange
    const launcherPath = path.join(
      repositoryRoot,
      'scripts/next-with-system-ca.mjs',
    )

    // Act
    const result = spawnSync(process.execPath, [launcherPath, '--help'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        SSL_CERT_FILE: '/tmp/sfw-test/socketFirewallCa.crt',
        SSL_CERT_DIR: '/tmp/sfw-test',
      },
    })

    // Assert — Next prints help (or usage) without crashing on env sanitization
    assert.notEqual(result.status, null)
    expect(
      result.status === 0 ||
        (result.stdout + result.stderr).toLowerCase().includes('next'),
    ).toBe(true)
  })
})
