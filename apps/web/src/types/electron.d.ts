/**
 * Renderer aliases for the canonical preload contract.
 *
 * The canonical module also owns Window augmentation, so both Electron and
 * Next.js consume the same asynchronous config methods and IPC result shapes.
 */
export type { ElectronAPI } from '@corelive/desktop-contract/electron-api'
export type { AuthUserPayload as ElectronAuthUser } from '@corelive/desktop-contract/ipc'
