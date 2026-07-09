/**
 * Unit coverage for Cursor SSL_CERT_FILE sanitization used by the Next launcher.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { sanitizeTlsEnvForClerkHandshake } from './next-with-system-ca.mjs'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDirectory, '..')

test('drops Cursor exclusive SSL_CERT_FILE and keeps it as NODE_EXTRA_CA_CERTS', () => {
  // Arrange
  const cursorCaPath = '/tmp/sfw-abc/socketFirewallCa.crt'

  // Act
  const sanitized = sanitizeTlsEnvForClerkHandshake({
    SSL_CERT_FILE: cursorCaPath,
    SSL_CERT_DIR: '/tmp/sfw-abc',
  })

  // Assert
  assert.equal(sanitized.SSL_CERT_FILE, undefined)
  assert.equal(sanitized.SSL_CERT_DIR, undefined)
  assert.equal(sanitized.NODE_EXTRA_CA_CERTS, cursorCaPath)
})

test('leaves non-Cursor SSL_CERT_FILE untouched', () => {
  // Arrange
  const systemCaPath = '/etc/ssl/cert.pem'

  // Act
  const sanitized = sanitizeTlsEnvForClerkHandshake({
    SSL_CERT_FILE: systemCaPath,
    SSL_CERT_DIR: '/etc/ssl/certs',
    NODE_EXTRA_CA_CERTS: '/custom/extra.pem',
  })

  // Assert
  assert.equal(sanitized.SSL_CERT_FILE, systemCaPath)
  assert.equal(sanitized.SSL_CERT_DIR, '/etc/ssl/certs')
  assert.equal(sanitized.NODE_EXTRA_CA_CERTS, '/custom/extra.pem')
})

test('launcher script starts Next help under Cursor CA env without crashing', () => {
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
  assert.ok(
    result.status === 0 ||
      (result.stdout + result.stderr).toLowerCase().includes('next'),
    `expected Next help output, got status=${result.status} stderr=${result.stderr}`,
  )
})
