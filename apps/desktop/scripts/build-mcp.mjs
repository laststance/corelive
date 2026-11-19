import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'vite'

const desktop = fileURLToPath(new URL('../', import.meta.url))
const output = join(desktop, 'dist-electron/mcp-runtime')
mkdirSync(output, { recursive: true })

if (process.platform === 'darwin') {
  // Official Node distributions include the stable Node-API and libuv headers.
  const headers = resolve(dirname(process.execPath), '../include/node')
  if (!existsSync(join(headers, 'node_api.h'))) {
    throw new Error(
      'The Mac build needs the Node.js distribution with its development headers.',
    )
  }
  const flags = [
    'clang',
    '-arch',
    'arm64',
    '-mmacosx-version-min=13.0',
    '-Os',
    '-Wall',
    '-Wextra',
    '-Werror',
  ]
  // A concurrent build or test may have the previous binary mapped. Publish by rename, never truncate it.
  const staging = mkdtempSync(join(output, '.native-'))
  try {
    execFileSync(
      '/usr/bin/xcrun',
      [
        ...flags,
        join(desktop, 'native/mcp/launcher.c'),
        '-o',
        join(staging, 'corelive-mcp'),
      ],
      { stdio: 'inherit' },
    )
    execFileSync(
      '/usr/bin/xcrun',
      [
        ...flags,
        '-bundle',
        '-undefined',
        'dynamic_lookup',
        '-DNAPI_VERSION=8',
        '-I',
        headers,
        join(desktop, 'native/mcp/peer.c'),
        '-o',
        join(staging, 'peer.node'),
      ],
      { stdio: 'inherit' },
    )
    for (const file of ['peer.node', 'corelive-mcp'])
      renameSync(join(staging, file), join(output, file))
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

// Keep the self-contained helper outside ASAR alongside its signed native component.
if (!process.argv.includes('--native-only')) {
  const staging = mkdtempSync(join(output, '.stdio-'))
  try {
    await build({
      configFile: false,
      envDir: false,
      publicDir: false,
      root: desktop,
      ssr: { noExternal: true },
      build: {
        ssr: resolve(desktop, 'electron/mcp/stdio.ts'),
        outDir: staging,
        emptyOutDir: false,
        target: 'node24',
        rolldownOptions: {
          output: {
            format: 'cjs',
            entryFileNames: 'stdio.cjs',
            codeSplitting: false,
          },
        },
      },
    })
    renameSync(join(staging, 'stdio.cjs'), join(output, 'stdio.cjs'))
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}
