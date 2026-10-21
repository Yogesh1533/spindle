/**
 * Dev launcher: waits for the Vite dev server, then starts Electron pointing at
 * it. Restarts Electron when the main-process sources change.
 */
import { spawn } from 'node:child_process'
import { watch } from 'node:fs'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)))
const projectRoot = path.resolve(root, '..')

const DEV_SERVER_URL = 'http://localhost:5273'
const MAIN_DIR = path.join(projectRoot, 'dist', 'main')

let child = null
let restarting = false

/** Build the main process bundles. */
async function buildMain() {
  const shared = {
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    sourcemap: 'inline',
    external: ['electron', 'chokidar'],
    logLevel: 'error',
  }
  await build({ ...shared, entryPoints: ['electron/main.ts'], outfile: path.join(MAIN_DIR, 'main.js') })
  await build({
    ...shared,
    entryPoints: ['electron/preload.ts'],
    outfile: path.join(MAIN_DIR, 'preload.cjs'),
    format: 'cjs',
  })
}

/** Wait until the Vite dev server answers. */
async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok || res.status === 404) return true
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  return false
}

function startElectron() {
  const electron = require('electron')
  child = spawn(electron, [path.join(projectRoot, 'dist', 'main', 'main.js')], {
    stdio: 'inherit',
    env: { ...process.env, VITE_DEV_SERVER_URL: DEV_SERVER_URL, NODE_ENV: 'development' },
  })
  child.on('close', () => {
    child = null
  })
}

async function restart() {
  if (restarting) return
  restarting = true
  if (child) {
    child.kill()
    child = null
    // Give the process a moment to release its port/handles.
    await new Promise((r) => setTimeout(r, 400))
  }
  await buildMain()
  startElectron()
  restarting = false
}

async function main() {
  await buildMain()
  const ready = await waitForServer(DEV_SERVER_URL)
  if (!ready) {
    console.error(`[slate] Vite dev server did not come up at ${DEV_SERVER_URL}`)
    process.exit(1)
  }
  startElectron()

  // Rebuild + restart Electron when main-process code changes.
  for (const dir of ['electron', 'src/shared']) {
    watch(path.join(projectRoot, dir), { recursive: true }, (_event, filename) => {
      if (filename && !filename.endsWith('.ts')) return
      console.log(`[slate] ${dir} changed, restarting Electron…`)
      void restart()
    })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
