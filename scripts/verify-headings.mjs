/**
 * Heading navigation checks: the outline pane and links that point at a
 * heading both move the cursor to that heading.
 *
 * Usage: node scripts/verify-headings.mjs <ws-url> [vault-path]
 */
const wsUrl = process.argv[2]
const VAULT = process.argv[3] ?? '/Users/yogesh/Documents/Slate Sample Vault'

if (!wsUrl) {
  console.error('Usage: node scripts/verify-headings.mjs <ws-url> [vault-path]')
  process.exit(1)
}

const ws = new WebSocket(wsUrl)
let id = 0
const pending = new Map()

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const myId = ++id
    pending.set(myId, { resolve, reject })
    ws.send(JSON.stringify({ id: myId, method, params }))
  })
}

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (res.exceptionDetails) {
    throw new Error(
      `eval failed: ${JSON.stringify(res.exceptionDetails.exception?.description ?? res.exceptionDetails)}`
    )
  }
  return res.result?.value
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    if (msg.error) reject(new Error(msg.error.message))
    else resolve(msg.result)
  }
}

const results = []
const check = (name, pass, detail) => {
  results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${!pass && detail ? '  → ' + detail : ''}`)
}

/** The line the caret is on, and the text of that line. */
const caret = `(() => {
  const cm = document.querySelector('.cm-content')
  if (!cm) return null
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const node = sel.getRangeAt(0).startContainer
  const line = node.nodeType === 3 ? node.parentElement : node
  const el = line?.closest?.('.cm-line')
  return { text: el?.textContent ?? '', focused: document.activeElement === cm }
})()`

ws.onopen = async () => {
  try {
    await evaluate(`window.slate.vault.open(${JSON.stringify(VAULT)})`)
    await sleep(2000)

    // A previous check may have left the graph open, which hides the
    // editor and the outline.
    await evaluate(`
      (() => {
        const btn = [...document.querySelectorAll('.ribbon__button')]
          .find((b) => /^Graph view/.test(b.getAttribute('title') || ''))
        if (btn && btn.classList.contains('is-active')) btn.click()
        return true
      })()
    `)
    await sleep(600)

    // ---- 1. The outline pane lists the headings ----
    await evaluate(`
      (() => {
        const item = [...document.querySelectorAll('.tree__name')].find((e) => e.textContent === 'Projects.md')
        if (item) item.click()
        return !!item
      })()
    `)
    await sleep(1500)
    // The outline pane is a ribbon button. Click it only when another pane
    // is showing, so the check does not depend on what ran before.
    await evaluate(`
      (() => {
        const btn = [...document.querySelectorAll('.ribbon__button')]
          .find((b) => (b.getAttribute('title') || '') === 'Outline')
        if (!btn) return false
        if (!btn.classList.contains('is-active')) btn.click()
        return true
      })()
    `)
    await sleep(600)

    const outline = await evaluate(`
      [...document.querySelectorAll('.outline-item')].map((e) => e.textContent)
    `)
    check('the outline pane lists headings', outline.length > 0, outline.join('|'))
    check('the outline includes a nested heading', outline.includes('Active'), outline.join('|'))

    // ---- 2. Clicking an outline item moves the caret to that heading ----
    const target = outline.find((t) => t === 'Notes') ?? outline[outline.length - 1]
    await evaluate(`
      (() => {
        const item = [...document.querySelectorAll('.outline-item')].find((e) => e.textContent === ${JSON.stringify(target)})
        if (item) item.click()
        return !!item
      })()
    `)
    await sleep(800)
    const afterOutline = await evaluate(caret)
    check(
      'clicking an outline item moves the caret to the heading',
      afterOutline?.text?.trim() === target,
      `${afterOutline?.text} (want ${target})`
    )

    // ---- 3. A link that points at a heading opens the note at the heading ----
    // "Meeting Notes.md" links to [[Alpha]]; "Welcome.md" links to
    // [[Meeting Notes#2026-01-20]].
    await evaluate(`
      (() => {
        const item = [...document.querySelectorAll('.tree__name')].find((e) => e.textContent === 'Welcome.md')
        if (item) item.click()
        return !!item
      })()
    `)
    await sleep(1500)
    const linkFound = await evaluate(`
      (() => {
        const link = [...document.querySelectorAll('.cm-md-link')]
          .find((e) => e.textContent.includes('2026-01-20'))
        if (!link) return false
        link.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }))
        return true
      })()
    `)
    check('the heading link is rendered', linkFound === true, String(linkFound))
    await sleep(1600)

    const tab = await evaluate(`document.querySelector('.tab.is-active .tab__name')?.textContent ?? ''`)
    check('the link opens the target note', tab.includes('Meeting Notes'), tab)
    const afterLink = await evaluate(caret)
    check(
      'the link opens the note at the heading',
      afterLink?.text?.trim() === '2026-01-20',
      `${afterLink?.text} (want 2026-01-20)`
    )

    console.log(results.join('\n'))
    process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0)
  } catch (err) {
    console.error(String(err))
    console.log(results.join('\n'))
    process.exit(1)
  }
}
