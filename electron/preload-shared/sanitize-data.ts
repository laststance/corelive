/**
 * @fileoverview Deep-trim sanitizer every preload runs on renderer-supplied data
 * before it crosses IPC.
 *
 * A preload is the trust boundary between web content and the main process, so
 * all of them share one hardening routine: strings are trimmed and
 * prototype-pollution keys are dropped at every depth. Every window's preload
 * runs in its own isolated world, so sharing the source costs nothing in context
 * isolation and keeps the login bridge exactly as strict as the settings bridge.
 *
 * @module electron/preload-shared/sanitize-data
 */

/** Value shapes {@link sanitizeData} writes into a rebuilt object. */
type SanitizedValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | SanitizedValue[]
  | { [key: string]: SanitizedValue }

/** Property names a renderer payload could use to pollute `Object.prototype`. */
const FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype']

/**
 * Deep-trims strings and strips prototype-pollution keys from renderer data; every preload bridge calls it before `ipcRenderer.invoke`.
 * @param data - Any renderer-supplied value; objects come back rebuilt on a null prototype.
 * @returns
 * - Strings: trimmed
 * - Arrays / objects: a sanitized deep copy with forbidden keys dropped
 * - Everything else: unchanged
 * @example
 * sanitizeData({ name: '  Ada  ', tags: [' a '] }) // => { name: 'Ada', tags: ['a'] }
 */
export function sanitizeData<T>(data: T): T {
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
