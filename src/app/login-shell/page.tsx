import { LoginShell } from '@/components/login-shell/LoginShell'

/**
 * `/login-shell` — the page the Electron login window loads; a plain browser tab
 * only sees {@link LoginShell}'s desktop-only notice.
 * @returns The full-height login shell.
 * @example
 * // https://corelive.app/login-shell (loaded by WindowManager.createLoginWindow)
 */
const LoginShellPage = function LoginShellPage() {
  return (
    <div className="h-screen w-full overflow-hidden">
      <LoginShell />
    </div>
  )
}

export default LoginShellPage
