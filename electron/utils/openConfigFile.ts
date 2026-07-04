import { shell } from 'electron'

import { log } from '../logger'

/**
 * Opens the CoreLive config file in the user's default application for `.json`.
 * Triggered from Settings → Brain Dump → "Open config.json".
 *
 * @param configPath - Absolute path from `ConfigManager.getConfigPaths().config`.
 * @returns `true` when the OS accepts the open request; `false` on failure.
 * @example
 * await openConfigFile('/Users/me/Library/Application Support/CoreLive/config.json')
 */
export async function openConfigFile(configPath: string): Promise<boolean> {
  const error = await shell.openPath(configPath)
  if (error) {
    log.error('Failed to open config file:', error)
    return false
  }
  return true
}
