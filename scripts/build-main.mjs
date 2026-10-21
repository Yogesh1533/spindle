/**
 * Builds the Electron main + preload bundles with esbuild.
 * Output goes to dist/main/.
 */
import { build } from 'esbuild'
import { rm } from 'node:fs/promises'

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  external: ['electron', 'chokidar'],
  logLevel: 'info',
}

await rm('dist/main', { recursive: true, force: true })

await build({
  ...shared,
  entryPoints: ['electron/main.ts'],
  outfile: 'dist/main/main.js',
})

await build({
  ...shared,
  entryPoints: ['electron/preload.ts'],
  // ".cjs" because package.json sets "type": "module"; a ".js" file would be
  // parsed as ESM and the preload would fail to load.
  outfile: 'dist/main/preload.cjs',
  format: 'cjs',
})
