#!/usr/bin/env node
/**
 * Launch Next.js with TLS trust that works under Cursor's network sandbox.
 *
 * Why it exists: Cursor injects SSL_CERT_FILE / SSL_CERT_DIR pointing at a
 * single MITM CA (`socketFirewallCa.crt`). That exclusive trust store makes
 * Edge middleware's Clerk handshake fail with UNABLE_TO_GET_ISSUER_CERT_LOCALLY,
 * so authenticated clients bounce /home → /login and spin forever.
 *
 * What it does: when those Cursor-only CA vars are present, drop the exclusive
 * SSL_CERT_* overrides, keep NODE_EXTRA_CA_CERTS for the sandbox CA, and start
 * Next with --use-system-ca so public CAs (Clerk) still verify.
 *
 * @example
 * node scripts/next-with-system-ca.mjs dev -p 4991
 * node scripts/next-with-system-ca.mjs start -p 4991
 */

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Filename Cursor uses for its sandbox MITM CA. */
export const CURSOR_SOCKET_FIREWALL_CA_FILENAME = 'socketFirewallCa.crt'

/**
 * Returns true when SSL_CERT_FILE is Cursor's exclusive sandbox CA.
 * @param {string | undefined} sslCertFilePath
 * @returns {boolean}
 * @example
 * isCursorSocketFirewallCa('/tmp/sfw-abc/socketFirewallCa.crt') // => true
 * isCursorSocketFirewallCa('/etc/ssl/cert.pem') // => false
 */
export function isCursorSocketFirewallCa(sslCertFilePath) {
  if (!sslCertFilePath) {
    return false
  }

  return path.basename(sslCertFilePath) === CURSOR_SOCKET_FIREWALL_CA_FILENAME
}

/**
 * Builds a child env that can verify both Cursor's MITM CA and public CAs.
 * @param {NodeJS.ProcessEnv} parentEnv
 * @returns {NodeJS.ProcessEnv}
 * @example
 * // Cursor sandbox: drops SSL_CERT_FILE, keeps NODE_EXTRA_CA_CERTS
 * sanitizeTlsEnvForClerkHandshake(process.env)
 */
export function sanitizeTlsEnvForClerkHandshake(parentEnv) {
  const childEnv = { ...parentEnv }

  if (!isCursorSocketFirewallCa(childEnv.SSL_CERT_FILE)) {
    return childEnv
  }

  // Prefer the sandbox CA as an *extra* trust root, not the only one
  if (!childEnv.NODE_EXTRA_CA_CERTS && childEnv.SSL_CERT_FILE) {
    childEnv.NODE_EXTRA_CA_CERTS = childEnv.SSL_CERT_FILE
  }

  // Exclusive SSL_CERT_* overrides break Clerk handshake TLS verification
  delete childEnv.SSL_CERT_FILE
  delete childEnv.SSL_CERT_DIR

  return childEnv
}

const isExecutedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isExecutedDirectly) {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
  const repositoryRoot = path.resolve(scriptDirectory, '..')
  const nextCliPath = path.join(
    repositoryRoot,
    'node_modules',
    'next',
    'dist',
    'bin',
    'next',
  )

  const nextArguments = process.argv.slice(2)
  const childEnv = sanitizeTlsEnvForClerkHandshake(process.env)

  const nextProcess = spawn(
    process.execPath,
    ['--use-system-ca', nextCliPath, ...nextArguments],
    {
      cwd: repositoryRoot,
      env: childEnv,
      stdio: 'inherit',
    },
  )

  // Forward orchestrator stop signals when this wrapper is PID 1 (containers)
  for (const signalToForward of ['SIGINT', 'SIGTERM']) {
    process.on(signalToForward, () => {
      nextProcess.kill(signalToForward)
    })
  }

  nextProcess.on('exit', (exitCode, signalName) => {
    if (signalName) {
      process.kill(process.pid, signalName)
      return
    }

    process.exit(exitCode ?? 1)
  })
}
