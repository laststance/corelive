/**
 * @fileoverview Authentication Manager for Electron
 *
 * Manages authentication state in the main process, coordinating
 * between Clerk (web-based auth) and the Electron app.
 *
 * Authentication flow:
 * 1. User signs in via Clerk in renderer (web page)
 * 2. Renderer sends auth data to main process via IPC
 * 3. This manager updates the auth state
 * 4. API bridge is notified of user context
 *
 * Why separate auth management?
 * - Main process needs to track authenticated user
 * - Security: Validate auth state in trusted process
 * - Coordinate between multiple windows
 * - Single source of truth for auth state
 *
 * Note: This is a simplified auth manager. In production,
 * consider token validation, refresh, and expiration.
 *
 * @module electron/auth-manager
 */

const { ipcMain } = require('electron')

/**
 * Manages authentication state and IPC handlers.
 *
 * This class provides:
 * - IPC endpoints for auth operations
 * - User state management
 * - Coordination with API bridge
 * - Login/logout functionality
 *
 * Security note: This manager trusts the renderer's auth data.
 * In a high-security app, validate tokens in main process.
 */
class AuthManager {
  constructor(apiBridge) {
    this.apiBridge = apiBridge // For setting user context
    this.currentUser = null // Current user object
    this.isAuthenticated = false // Auth state flag

    // Register IPC handlers for auth operations
    this.setupIpcHandlers()
  }

  /**
   * Sets up IPC handlers for authentication operations.
   *
   * Provides these IPC channels:
   * - auth-get-user: Get current user object
   * - auth-set-user: Update user (login)
   * - auth-logout: Clear auth state
   * - auth-is-authenticated: Check auth status
   * - auth-sync-from-web: Sync from Clerk
   *
   * All handlers are synchronous for simplicity.
   */
  setupIpcHandlers() {
    /**
     * Get current user - returns user object or null
     */
    ipcMain.handle('auth-get-user', () => {
      return this.currentUser
    })

    ipcMain.handle('auth-set-user', (_event, user) => {
      this.setUser(user)
      return this.currentUser
    })

    ipcMain.handle('auth-logout', () => {
      this.logout()
      return { success: true }
    })

    ipcMain.handle('auth-is-authenticated', () => {
      return this.isAuthenticated
    })

    // Sync authentication state from web version
    ipcMain.handle('auth-sync-from-web', (_event, authData) => {
      if (authData && authData.userId) {
        this.setUser({
          id: authData.userId,
          ...authData,
        })
        return { success: true }
      }
      return { success: false }
    })
  }

  /**
   * Sets the current authenticated user.
   *
   * This method:
   * 1. Updates internal auth state
   * 2. Notifies API bridge of user context
   * 3. Enables user-scoped database operations
   *
   * @param {Object} user - User object with at least an 'id' field
   */
  setUser(user) {
    if (user && user.id) {
      // Store user and mark as authenticated
      this.currentUser = user
      this.isAuthenticated = true

      // Critical: Tell API bridge about user context
      // This ensures all DB operations are user-scoped
      if (this.apiBridge) {
        this.apiBridge.setUserId(user.id)
      }
    } else {
      // Invalid user data - logout for safety
      this.logout()
    }
  }

  /**
   * Logs out the current user.
   *
   * Clears all authentication state and resets the API bridge.
   * After logout, database operations will fail until new login.
   *
   * Note: This doesn't clear Clerk's web session - that must
   * be done separately in the renderer process.
   */
  logout() {
    // Clear auth state
    this.currentUser = null
    this.isAuthenticated = false

    // Reset API bridge (operations will fail without user)
    if (this.apiBridge) {
      this.apiBridge.setUserId('electron-user') // Placeholder
    }
  }

  getCurrentUser() {
    return this.currentUser
  }

  isUserAuthenticated() {
    return this.isAuthenticated
  }
}

module.exports = { AuthManager }
