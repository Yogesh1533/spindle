/**
 * Draws Spindle's logo.
 *
 * The mark is a drop spindle — the tapered tool that twists thread — with a
 * single thread wound around it. It reads two ways: a spindle is what holds
 * the thread together, and a spindle is also the hub of a wheel, which is
 * what a note's links make it.
 *
 * Everything here is drawn from scratch, as vector paths, so the logo can be
 * re-rendered at any size without a single loss.
 *
 * Usage: node scripts/make-icon.mjs [light|dark|both] [outDir]
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const CANVAS = 1024

/** The rounded-rectangle body of a macOS icon, as a superellipse. */
const BODY_HALF = 412
const BODY_EXPONENT = 5

const THEMES = {
  light: {
    bodyTop: '#fbf6ee',
    bodyBottom: '#ecdfcb',
    bodyEdge: 'rgba(60, 40, 20, 0.10)',
    markTop: '#3a2c20',
    markBottom: '#1d1510',
    thread: '#b45309',
    threadBack: 'rgba(180, 83, 9, 0.45)',
  },
  dark: {
    bodyTop: '#2b211a',
    bodyBottom: '#100c09',
    bodyEdge: 'rgba(255, 255, 255, 0.10)',
    markTop: '#f6ecdd',
    markBottom: '#d9c7ae',
    thread: '#e08a4b',
    threadBack: 'rgba(224, 138, 75, 0.42)',
  },
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const round = (n) => Number(n.toFixed(2))

/** The macOS-style body: a superellipse, sampled into a path. */
function bodyPath(cx, cy, half, exponent, points = 240) {
  const k = 2 / exponent
  const parts = []
  for (let i = 0; i <= points; i++) {
    const theta = (i / points) * Math.PI * 2
    const c = Math.cos(theta)
    const s = Math.sin(theta)
    const x = cx + half * Math.sign(c) * Math.abs(c) ** k
    const y = cy + half * Math.sign(s) * Math.abs(s) ** k
    parts.push(`${i === 0 ? 'M' : 'L'}${round(x)} ${round(y)}`)
  }
  parts.push('Z')
  return parts.join(' ')
}

// The spindle, in canvas coordinates.
const MARK = {
  cx: 512,
  tipTop: 268,
  lensTop: 372,
  lensBottom: 652,
  tipBottom: 756,
  lensHalfWidth: 118,
  rodHalfWidth: 12,
  lensExponent: 0.86,
}

/**
 * Half the width of the spindle at a given height.
 *
 * The middle is a lens-shaped whorl, and a thin rod runs out of each end to
 * a point. The rod is narrower than the whorl, so the two are combined by
 * taking whichever is wider.
 */
function spindleHalfWidth(y) {
  const { cx, tipTop, lensTop, lensBottom, tipBottom, lensHalfWidth, rodHalfWidth, lensExponent } =
    MARK
  void cx
  if (y < tipTop || y > tipBottom) return 0

  let width = 0

  if (y >= lensTop && y <= lensBottom) {
    const t = (y - (lensTop + lensBottom) / 2) / ((lensBottom - lensTop) / 2)
    width = Math.max(width, lensHalfWidth * Math.max(0, 1 - t * t) ** lensExponent)
  }

  if (y <= lensTop) {
    const t = (y - tipTop) / (lensTop - tipTop)
    width = Math.max(width, rodHalfWidth * t ** 0.75)
  } else if (y >= lensBottom) {
    const t = (tipBottom - y) / (tipBottom - lensBottom)
    width = Math.max(width, rodHalfWidth * t ** 0.75)
  }

  return width
}

/** The spindle's outline, sampled from the width function. */
function spindlePath(samples = 320) {
  const { cx, tipTop, tipBottom } = MARK
  const right = []
  const left = []
  for (let i = 0; i <= samples; i++) {
    const y = tipTop + (i / samples) * (tipBottom - tipTop)
    const w = spindleHalfWidth(y)
    right.push([cx + w, y])
    left.push([cx - w, y])
  }
  const path = [`M${round(right[0][0])} ${round(right[0][1])}`]
  for (const [x, y] of right) path.push(`L${round(x)} ${round(y)}`)
  for (let i = left.length - 1; i >= 0; i--) {
    path.push(`L${round(left[i][0])} ${round(left[i][1])}`)
  }
  path.push('Z')
  return path.join(' ')
}

/**
 * The thread, wound around the spindle.
 *
 * A helix seen from the side is a sine wave, so the thread is drawn as one,
 * with its width following the spindle it wraps. The half of the wave that
 * passes behind the spindle is drawn first and dimmed; the half that passes
 * in front is drawn on top. That is what makes it read as a thread rather
 * than a squiggle.
 */
function threadPaths(turns = 2.4, samples = 900) {
  const { cx } = MARK
  const y0 = MARK.lensTop + 14
  const y1 = MARK.lensBottom - 14
  const front = []
  const back = []

  let current = null
  let bucket = null

  const flush = () => {
    if (current && current.length > 1) bucket.push(current.join(' '))
    current = null
  }

  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const u = t * turns * Math.PI * 2
    const y = y0 + t * (y1 - y0)
    const radius = spindleHalfWidth(y) + 15
    const x = cx + radius * Math.sin(u)
    const isFront = Math.cos(u) >= 0
    const target = isFront ? front : back

    if (bucket !== target) {
      flush()
      bucket = target
    }
    current = current ?? []
    current.push(`${current.length === 0 ? 'M' : 'L'}${round(x)} ${round(y)}`)
  }
  flush()

  const toPath = (groups) => groups.map((g) => g).join(' ')
  return { front: toPath(front), back: toPath(back) }
}

// ---------------------------------------------------------------------------
// The icon
// ---------------------------------------------------------------------------

/**
 * The full icon: the body, the thread behind the spindle, the spindle, and
 * the thread in front of it.
 */
export function buildIcon(theme) {
  const t = THEMES[theme]
  const thread = threadPaths()

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <defs>
    <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${t.bodyTop}"/>
      <stop offset="1" stop-color="${t.bodyBottom}"/>
    </linearGradient>
    <linearGradient id="mark" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="${t.markTop}"/>
      <stop offset="1" stop-color="${t.markBottom}"/>
    </linearGradient>
    <clipPath id="body-clip">
      <path d="${bodyPath(512, 512, BODY_HALF, BODY_EXPONENT)}"/>
    </clipPath>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="9" flood-color="#000000" flood-opacity="0.18"/>
    </filter>
  </defs>

  <path d="${bodyPath(512, 512, BODY_HALF, BODY_EXPONENT)}" fill="url(#body)"/>

  <g clip-path="url(#body-clip)">
    <path d="${bodyPath(512, 512, BODY_HALF, BODY_EXPONENT)}" fill="none" stroke="${t.bodyEdge}" stroke-width="3"/>
  </g>

  <g filter="url(#soft)">
    <path d="${thread.back}" fill="none" stroke="${t.threadBack}" stroke-width="23" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${spindlePath()}" fill="url(#mark)"/>
    <path d="${thread.front}" fill="none" stroke="${t.thread}" stroke-width="23" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>
`
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const themeArg = process.argv[2] ?? 'both'
const outDir = path.resolve(process.argv[3] ?? 'build')
mkdirSync(outDir, { recursive: true })

const themes = themeArg === 'both' ? Object.keys(THEMES) : [themeArg]
for (const theme of themes) {
  const iconPath = path.join(outDir, `icon-${theme}.svg`)
  writeFileSync(iconPath, buildIcon(theme))
  console.log('wrote', iconPath)
}
