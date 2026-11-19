import assert from 'node:assert/strict'
import { fork, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir, userInfo } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const script = fileURLToPath(import.meta.url)

/** Runs the packaged workspace, storage worker, history and connection owner with an isolated profile.
 * The QA parent starts this process in Electron's Node mode. No window or account session is created.
 * @example await serveFixture(profile)
 */
async function serveFixture(profile) {
  const fromBundle = createRequire(
    join(process.resourcesPath, 'app.asar', 'dist-electron/main/index.cjs'),
  )
  const { OfflineEditorController } = fromBundle(
    './offline/OfflineEditorController.cjs',
  )
  const { startMcpOwner } = fromBundle('./mcp/bridgeOwner.cjs')
  const { createEditorDispatcher } = fromBundle('./mcp/editorActions.cjs')
  const { createCompletionHistory } = fromBundle('./mcp/history.cjs')
  const { mcpSuccess } = fromBundle('./mcp/result.cjs')
  const { parseMcpCall } = fromBundle('./mcp/tools.cjs')
  const controller = new OfflineEditorController({
    directory: join(profile, 'offline'),
    workerScript: fromBundle.resolve('./workspace-worker.cjs'),
    legacyNotes: () => ({}),
    requestFlush: async () => true,
    onSnapshot: () => {},
    // A device-only fixture must never connect to an account or send workspace data.
    broker: {
      acquire: async () => null,
      reset: () => {},
      revoke: async () => {},
    },
    transport: () => {
      throw new Error('Unexpected account access')
    },
    endLocalSession: async () => {
      throw new Error('Unexpected account operation')
    },
  })
  await controller.initialize()
  const editor = createEditorDispatcher(controller, {
    flush: async () => true,
    shown: () => {},
  })
  const history = createCompletionHistory({ controller })
  const stop = await startMcpOwner(profile, {
    call: async (session, name, args) => {
      const call = parseMcpCall(name, args)
      return mcpSuccess(
        name === 'list_completions'
          ? await history.list(session, call.args)
          : await editor(call),
      )
    },
    closeSession: history.closeSession,
  })
  process.once('disconnect', async () => {
    stop()
    await controller.shutdown()
  })
  process.send('ready')
}

/** Exercises the actual launcher and helper in an installed-format bundle using the public SDK.
 * @example node scripts/qa-mcp-package.mjs dist/mac-arm64/CoreLive.app
 */
async function verifyBundle(bundle, hostedColdStart) {
  const executable = join(bundle, 'Contents/MacOS/CoreLive')
  const command = join(bundle, 'Contents/Helpers/corelive-mcp')
  const profile = mkdtempSync(join(tmpdir(), 'corelive-package-qa-'))
  let fixture
  let client
  // Identify only the background main process launched for this fresh hosted profile.
  const owners = () =>
    execFileSync('/bin/ps', ['-axww', '-o', 'pid=,command='], {
      encoding: 'utf8',
    })
      .split('\n')
      .flatMap((line) => {
        const match = line.trim().match(/^(\d+)\s+(.+)$/)
        return match &&
          match[2].startsWith(executable + ' ') &&
          match[2].includes('--corelive-mcp-background') &&
          match[2].includes('--user-data-dir=' + profile)
          ? [Number(match[1])]
          : []
      })
  const connect = async () => {
    client = new Client({ name: 'CoreLive packaged QA', version: '1' })
    await client.connect(
      new StdioClientTransport({
        // In normal developer QA even an unexpected disconnect cannot invoke Launch Services.
        command: hostedColdStart ? command : '/usr/bin/sandbox-exec',
        args: [
          ...(hostedColdStart
            ? []
            : [
                '-p',
                '(version 1)(allow default)(deny process-exec (literal "/usr/bin/open"))',
                command,
              ]),
          '--user-data-dir=' + profile,
        ],
        stderr: 'pipe',
      }),
    )
  }
  const call = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args })
    assert.equal(
      result.isError,
      false,
      name + ': ' + JSON.stringify(result.structuredContent),
    )
    return result.structuredContent
  }
  try {
    // Discovery must work before the fixture owner exists, without a window or a production profile.
    await connect()
    const list = await client.listTools()
    const names = list.tools.map((tool) => tool.name)
    for (const name of [
      'read_draft',
      'append_unfinished_task',
      'get_task_addition_result',
      'record_completed_task',
      'list_completions',
      'read_dashboard_appearance',
      'set_dashboard_appearance',
    ])
      assert.ok(names.includes(name), name)
    assert.deepEqual(
      readdirSync(profile),
      [],
      'discovery left the profile unopened',
    )
    if (!hostedColdStart) {
      fixture = fork(script, ['--fixture', profile], {
        execPath: executable,
        execArgv: [],
        stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
        env: {
          HOME: userInfo().homedir,
          PATH: '/usr/bin:/bin',
          ELECTRON_RUN_AS_NODE: '1',
        },
      })
      const startup = AbortSignal.timeout(15_000)
      const ready = await Promise.race([
        once(fixture, 'message', { signal: startup }),
        once(fixture, 'exit', { signal: startup }),
      ])
      assert.equal(ready[0], 'ready', 'packaged owner readiness')
    } else {
      assert.deepEqual(owners(), [], 'discovery left the ordinary app closed')
    }
    const draft = await call('read_draft')
    if (hostedColdStart)
      assert.equal(
        owners().length,
        1,
        'first data call started one ordinary background owner',
      )
    const operationId = randomUUID()
    const saved = await call('append_unfinished_task', {
      categoryId: draft.categoryId,
      title: 'QA unfinished line',
      operationId,
    })
    assert.equal(saved.categoryPath, 'General')
    assert.ok((await call('read_draft')).text.includes('QA unfinished line'))
    await call('record_completed_task', {
      categoryId: draft.categoryId,
      title: 'QA completed work',
    })
    const day = await call('list_completions')
    assert.equal(day.scope, 'device')
    assert.deepEqual(
      day.entries.map((entry) => entry.title),
      ['QA completed work'],
    )
    await client.close()
    // A new helper can look up the durable result without adding a second copy.
    await connect()
    const receipt = await call('get_task_addition_result', { operationId })
    assert.equal(receipt.rowId, saved.rowId)
    const repeated = await call('append_unfinished_task', {
      categoryId: draft.categoryId,
      title: 'QA unfinished line',
      operationId,
    })
    assert.equal(repeated.rowId, saved.rowId)
    const visible = await call('read_draft')
    assert.deepEqual(
      visible.rows.map((row) => row.text),
      ['- [ ] QA unfinished line'],
    )
    assert.equal(visible.rows[0].id, saved.rowId)
    process.stdout.write(
      JSON.stringify({
        bundle,
        tools: names.length,
        version: client.getServerVersion().version,
        owner: hostedColdStart
          ? 'ordinary CoreLive cold start'
          : 'isolated packaged storage and bridge',
        scope: day.scope,
        completions: day.total,
        confirmedAfterReconnect: true,
        duplicateRows: 0,
      }) + '\n',
    )
  } finally {
    if (hostedColdStart && owners().length && client) {
      // Prefer the ordinary app's flush and quit. The disposable runner can clean up a failed launch.
      await client
        .callTool({ name: 'quit_corelive', arguments: {} }, undefined, {
          timeout: 5_000,
        })
        .catch(() => {})
      const until = Date.now() + 5_000
      while (owners().length && Date.now() < until) await delay(100)
      for (const pid of owners()) process.kill(pid, 'SIGTERM')
    }
    if (client) await client.close()
    if (fixture?.connected) {
      const exited = once(fixture, 'exit', {
        signal: AbortSignal.timeout(8_000),
      })
      fixture.disconnect()
      try {
        await exited
      } catch {
        fixture.kill()
      }
    }
    rmSync(profile, { recursive: true, force: true })
  }
}

if (process.argv[2] === '--fixture') {
  await serveFixture(process.argv[3])
} else {
  const hostedColdStart = process.argv.includes('--hosted-cold-start')
  if (hostedColdStart) {
    assert.equal(
      process.env.GITHUB_ACTIONS,
      'true',
      'cold launch requires a disposable GitHub-hosted Mac',
    )
    assert.equal(
      process.env.RUNNER_ENVIRONMENT,
      'github-hosted',
      'cold launch requires a disposable GitHub-hosted Mac',
    )
  }
  const app = resolve(
    process.argv[2] ??
      join(
        dirname(script),
        '..',
        'dist',
        process.arch === 'arm64' ? 'mac-arm64' : 'mac',
        'CoreLive.app',
      ),
  )
  // The current host must be able to execute this bundle. Other slices have separate QA results.
  execFileSync('/usr/bin/lipo', [
    join(app, 'Contents/MacOS/CoreLive'),
    '-verify_arch',
    process.arch === 'arm64' ? 'arm64' : 'x86_64',
  ])
  await verifyBundle(app, hostedColdStart)
}
