// Synthetic identity only. No Clerk client, cookies or authentication requests.
export const useUser = () => ({
  isLoaded: true,
  user: { id: 'synthetic-settings-qa' },
})
export const useAuth = () => ({
  isLoaded: true,
  isSignedIn: true,
  getToken: async () => null,
})
export const useSignIn = () => ({ isLoaded: true, signIn: null })
export const useClerk = () => ({ signOut: async () => undefined })
