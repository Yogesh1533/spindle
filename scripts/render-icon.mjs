/**
 * Renders an SVG icon to a PNG, using the browser engine Electron is built
 * on — so the logo is rasterised exactly as it will be drawn on screen.
 *
 * Usage: npx electron scripts/render-icon.mjs <svg> <png> [size]
 */

import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const svg = process.argv[2]
const png = process.argv[3]
const size = Number(process.argv[4] ?? 1024)

if (!svg || !png) {
  console.error('Usage: npx electron scripts/render-icon.mjs <svg> <png> [size]')
  app.exit(1)
}

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: size,
    height: size,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: false },
  })

  // Chromium draws an SVG document at its own size, so it is put in a page
  // that scales it to the window instead.
  const markup = readFileSync(path.resolve(svg), 'utf8')
  const dir = mkdtempSync(path.join(tmpdir(), 'spindle-icon-'))
  const page = path.join(dir, 'icon.html')
  writeFileSync(
    page,
    `<!doctype html><html><head><meta charset="utf-8"><style>
       html,body{margin:0;padding:0;background:transparent;overflow:hidden}
       svg{display:block;width:100vw;height:100vh}
     </style></head><body>${markup}</body></html>`
  )

  await win.loadFile(page)
  // Give the renderer a moment to lay the SVG out before it is captured.
  await new Promise((r) => setTimeout(r, 400))

  const image = await win.webContents.capturePage()
  writeFileSync(png, image.toPNG())
  console.log('wrote', png)

  win.destroy()
  app.exit(0)
})
