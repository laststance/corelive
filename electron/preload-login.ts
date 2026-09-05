/**
 * @fileoverview Preload script for the login window.
 *
 * The login window loads `https://corelive.app/login-shell` and exists only to
 * sign the user in: it exposes the auth + OAuth slice of `electronAPI` so the
 * renderer's `ElectronAuthProvider` can start a native OAuth flow and receive
 * its sign-in ticket. Window chrome is native (title-bar traffic lights) and
 * data goes through oRPC, so nothing else is bridged.
 *
 * @module electron/preload-login
 */

import { contextBridge } from 'electron'

import {
  createAuthBridge,
  createOAuthBridge,
} from './preload-shared/auth-oauth-bridge'

/** Sanitized data type */
type SanitizedValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | SanitizedValue[]
  | { [key: string]: SanitizedValue }

/**
 * Sanitize data to prevent injection attacks.
 *
 * @param data - Data to sanitize
 * @returns Sanitized data
 */
export function sanitizeData<T>(data: T): T {
  // Keys that could be used for prototype pollution attacks. Mirrors the main
  // preload's hardening so the login bridge is not the weaker IPC boundary: it
  // forwards renderer-controlled auth/OAuth payloads.
  const FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype']

  if (typeof data === 'string') {
    return data.trim() as T
  }
  if (typeof data === 'object' && data !== null) {
    if (Array.isArray(data)) {
      return data.map((item) => sanitizeData(item)) as T
    }
    // Deep clone and sanitize object properties
    // Use null prototype to prevent prototype pollution attacks
    const sanitized = Object.create(null) as Record<string, SanitizedValue>
    for (const [key, value] of Object.entries(data)) {
      // Block prototype pollution attacks
      if (FORBIDDEN_KEYS.includes(key)) {
        continue
      }

      if (typeof value === 'string') {
        sanitized[key] = value.trim()
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value
      } else if (value === null || value === undefined) {
        sanitized[key] = value
      } else if (Array.isArray(value)) {
        sanitized[key] = value.map((item) => sanitizeData(item))
      } else if (typeof value === 'object') {
        sanitized[key] = sanitizeData(value)
      }
    }
    return sanitized as T
  }
  return data
}

/**
 * Expose the auth + OAuth slice of `electronAPI` so the signed-out login window
 * is a self-contained native-OAuth front door.
 *
 * `ElectronAuthProvider` (root layout, runs in every panel) gates on
 * `window.electronAPI` via `isElectronEnvironment()`, so exposing it HERE is
 * what activates the provider in this window — and the full `oauth` surface lets
 * the window both START a browser flow and RECEIVE its sign-in ticket. The
 * provider's `auth-set-user` is what triggers the main-process handoff that
 * closes this window and shows LiveEditor.
 *
 * Deliberately SCOPED to { auth, oauth }: omitting `settings`/`menu`/etc. keeps
 * `ElectronStartupSync`'s method guards a clean no-op here (it only touches
 * `electronAPI.settings`), so activating the provider has zero native side
 * effects in the login window.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  auth: createAuthBridge(sanitizeData),
  oauth: createOAuthBridge(sanitizeData),
})
