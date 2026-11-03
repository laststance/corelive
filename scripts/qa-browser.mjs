#!/usr/bin/env node
/**
 * Runs Playwright CLI in an isolated headless session for this checkout.
 * Called by `pnpm qa:browser` so agent-driven renderer QA leaves the Mac's
 * desktop, existing browser profiles, and sibling worktrees alone.
 * @example
 * pnpm qa:browser open
 * pnpm qa:browser snapshot
 * pnpm qa:browser close
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
// Public landing page of the local production build; `open <url>` overrides it.
const DEFAULT_OPEN_URL = 'http://localhost:4991/'
const argumentsToForward = process.argv.slice(2)
const command = argumentsToForward[0] ?? 'open'
const informationalCommands = new Set(['--help', '-h', '--version'])
// Require the command first so upstream option parsing cannot change the operation we checked.
const allowedCommands = new Set([
  'open',
  'close',
  'goto',
  'type',
  'click',
  'dblclick',
  'fill',
  'drag',
  'drop',
  'hover',
  'select',
  'upload',
  'check',
  'uncheck',
  'snapshot',
  'find',
  'eval',
  'console',
  'dialog-accept',
  'dialog-dismiss',
  'resize',
  'run-code',
  'go-back',
  'go-forward',
  'reload',
  'press',
  'keydown',
  'keyup',
  'mousemove',
  'mousedown',
  'mouseup',
  'mousewheel',
  'screenshot',
  'pdf',
  'tab-list',
  'tab-new',
  'tab-close',
  'tab-select',
  'localstorage-list',
  'localstorage-get',
  'localstorage-set',
  'localstorage-delete',
  'localstorage-clear',
  'sessionstorage-list',
  'sessionstorage-get',
  'sessionstorage-set',
  'sessionstorage-delete',
  'sessionstorage-clear',
  'set-color-scheme',
  'set-reduced-motion',
  'set-forced-colors',
  'set-contrast',
  'set-media',
  'clear-color-scheme',
  'clear-reduced-motion',
  'clear-forced-colors',
  'clear-contrast',
  'clear-media',
  'requests',
  'request',
  'request-headers',
  'request-body',
  'response-headers',
  'response-body',
  'route',
  'route-list',
  'unroute',
  'network-state-set',
  'config-print',
  'tracing-start',
  'tracing-stop',
  'video-start',
  'video-stop',
  'video-chapter',
  'video-show-actions',
  'video-hide-actions',
  'highlight',
  'generate-locator',
  '--help',
  '-h',
  '--version',
])
const sessionSuffix = createHash('sha256')
  .update(repositoryRoot)
  .digest('hex')
  .slice(0, 10)
const sessionName = `corelive-headless-${sessionSuffix}`

// These options would attach to or display a browser outside this quiet workflow.
const conflictingArguments = [
  '--headed',
  '--config',
  '--browser',
  '--profile',
  '--persistent',
  '--session',
  '--s',
  '--no-s',
  '--no-session',
  '--extension',
  '--cdp',
  '--endpoint',
  '-s',
]
/**
 * Finds the first argument the wrapper must refuse, or undefined when all are allowed.
 * Called once at startup so the rejection line (DX12) can name the offender.
 * @example firstRejectedArgument(['open', '--headed']) // '--headed'
 */
function firstRejectedArgument(forwarded) {
  if (!allowedCommands.has(command)) return command
  // Help/version must be terminal: negated booleans can expose a later upstream command.
  if (informationalCommands.has(command) && forwarded.length !== 1)
    return forwarded[1]
  // Opening accepts only a URL; launch options belong to the checked-in configuration.
  if (command === 'open') {
    if (forwarded.length > 2) return forwarded[2]
    if (forwarded[1]?.startsWith('-')) return forwarded[1]
  }
  return forwarded.find(
    (argument) =>
      argument.startsWith('-s') ||
      conflictingArguments.some(
        (option) => argument === option || argument.startsWith(`${option}=`),
      ),
  )
}

const rejectedArgument = firstRejectedArgument(argumentsToForward)
if (rejectedArgument !== undefined) {
  console.error(
    `qa:browser: "${rejectedArgument}" is not supported (QA_BROWSER_ARG_REJECTED). qa:browser owns one isolated headless session; use its commands: open [url], snapshot, screenshot, click, run-code, resize, video-start, video-stop, close.`,
  )
  process.exit(2)
}

const cliArguments = argumentsToForward.length ? argumentsToForward : ['open']
// Keep the default entry point public and free of login automation: the
// landing page needs no sign-in now that the web editor (/write) is gone.
if (command === 'open') {
  if (!cliArguments[1] || cliArguments[1].startsWith('--')) {
    cliArguments.splice(1, 0, DEFAULT_OPEN_URL)
  }
  cliArguments.push(
    `--config=${path.join(repositoryRoot, '.playwright/cli.config.json')}`,
    '--idle-timeout=300000',
  )
}

// Inspector mode overrides explicit headless settings; remote/session overrides must stay out too.
const childEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) =>
      !key.startsWith('PLAYWRIGHT_MCP_') &&
      ![
        'PWDEBUG',
        'npm_config_pwdebug',
        'npm_package_config_pwdebug',
        'PLAYWRIGHT_CLI_SESSION',
        'SELENIUM_REMOTE_URL',
      ].includes(key),
  ),
)
const require = createRequire(import.meta.url)
const cliPath = path.join(
  path.dirname(require.resolve('@playwright/cli/package.json')),
  'playwright-cli.js',
)
const result = spawnSync(
  process.execPath,
  [cliPath, `-s=${sessionName}`, ...cliArguments],
  {
    cwd: repositoryRoot,
    env: childEnvironment,
    stdio: 'inherit',
    timeout: 60000,
  },
)
if (result.error) {
  console.error(result.error.message)
}
process.exit(result.status ?? 1)
