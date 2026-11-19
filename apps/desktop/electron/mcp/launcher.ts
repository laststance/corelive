import { spawn } from 'node:child_process'
import { userInfo } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

import { MCP_BACKGROUND_SWITCH } from './protocol'

/** Resolves the installed app beside its launcher; an explicit QA profile stays on that same owner.
 * @example const { profile, wake } = helperLaunch(process.argv.slice(2))
 */
export function helperLaunch(args: string[]) {
  const prefix = '--user-data-dir='
  const override = args[0]?.startsWith(prefix)
    ? args[0].slice(prefix.length)
    : undefined
  if (args.length && (args.length !== 1 || !override || !isAbsolute(override)))
    throw new Error('Invalid profile argument')
  const installed = basename(process.execPath) === 'CoreLive'
  const profile =
    override ??
    join(
      userInfo().homedir,
      'Library/Application Support',
      installed ? 'CoreLive' : 'CoreLive Dev',
    )
  const ownerArgs = [
    MCP_BACKGROUND_SWITCH,
    ...(override ? [prefix + resolve(override)] : []),
  ]
  const bundle = resolve(dirname(process.execPath), '../..')
  return {
    profile,
    wake: async (): Promise<void> => {
      // Launch Services keeps the caller active. A race between helpers reaches the existing singleton.
      const executable = installed ? '/usr/bin/open' : process.execPath
      if (!installed && basename(executable) !== 'Electron')
        throw new Error(
          'Use the bundled Electron executable to wake a development owner',
        )
      const launchArgs = installed
        ? ['-g', '-j', '-n', bundle, '--args', ...ownerArgs]
        : [resolve(__dirname, '../..'), ...ownerArgs]
      const child = spawn(executable, launchArgs, {
        detached: true,
        stdio: 'ignore',
        env: { HOME: userInfo().homedir, PATH: '/usr/bin:/bin' },
      })
      // Only wait for spawn. The actual readiness proof is a verified profile/version handshake.
      await new Promise<void>((done, reject) => {
        child.once('error', reject)
        child.once('spawn', done)
      })
      child.unref()
    },
  }
}
