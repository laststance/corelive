const { ipcMain } = require('electron')

class AuthManager {
  constructor(apiBridge) {
    this.apiBridge = apiBridge
    this.currentUser = null
    this.isAuthenticated = false

    this.setupIpcHandlers()
  }

  setupIpcHandlers() {
    // Authentication state management
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

  setUser(user) {
    if (user && user.id) {
      this.currentUser = user
      this.isAuthenticated = true

      // Update API bridge with user ID
      if (this.apiBridge) {
        this.apiBridge.setUserId(user.id)
      }
    } else {
      this.logout()
    }
  }

  logout() {
    this.currentUser = null
    this.isAuthenticated = false

    // Reset API bridge to default user
    if (this.apiBridge) {
      this.apiBridge.setUserId('electron-user')
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
