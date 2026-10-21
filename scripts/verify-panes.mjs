/**
 * Interface checks: split panes, the tag pane and its search, the graph
 * filters, and the theme toggle.
 *
 * Usage: node scripts/verify-panes.mjs <ws-url> [vault-path]
 */
const wsUrl = process.argv[2]
const VAULT = process.argv[3] ?? '/Users/yogesh/Documents/Slate Sample Vault'

if (!wsUrl) {
  console.error('Usage: node scripts/verify-panes.mjs <ws-url> [vault-path]')
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

/** Open a note in the file explorer by name. */
const openNote = (name) => `
  (() => {
    const item = [...document.querySelectorAll('.tree__name')].find((e) => e.textContent === ${JSON.stringify(name)})
    if (item) item.click()
    return !!item
  })()
`

/** Cmd-click a note in the file explorer, to open it in a split. */
const openNoteInSplit = (name) => `
  (() => {
    const item = [...document.querySelectorAll('.tree__name')].find((e) => e.textContent === ${JSON.stringify(name)})
    if (!item) return false
    item.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true }))
    return true
  })()
`

ws.onopen = async () => {
  try {
    await evaluate(`window.slate.vault.open(${JSON.stringify(VAULT)})`)
    await sleep(2000)

    // ---- 1. A split pane opens ----
    await evaluate(openNote('Welcome.md'))
    await sleep(1200)
    const panesBefore = await evaluate(`document.querySelectorAll('.pane').length`)
    await evaluate(openNoteInSplit('Alpha.md'))
    await sleep(1400)
    const panesAfter = await evaluate(`document.querySelectorAll('.pane').length`)
    check('cmd-clicking a note opens a split pane', panesAfter === panesBefore + 1, `${panesBefore} → ${panesAfter}`)

    const editors = await evaluate(`document.querySelectorAll('.cm-content').length`)
    check('both panes have an editor', editors === 2, String(editors))

    const splitName = await evaluate(
      `document.querySelectorAll('.pane')[1]?.querySelector('.tab__name')?.textContent ?? ''`
    )
    check('the split pane shows the note', splitName.includes('Alpha'), splitName)

    // ---- 2. The split pane closes again ----
    await evaluate(`
      (() => {
        const pane = document.querySelectorAll('.pane')[1]
        const close = pane?.querySelector('.tab__close')
        if (close) close.click()
        return !!close
      })()
    `)
    await sleep(900)
    const panesClosed = await evaluate(`document.querySelectorAll('.pane').length`)
    check('the split pane closes', panesClosed === panesBefore, `${panesAfter} → ${panesClosed}`)

    // ---- 3. The tag pane lists tags and can be searched ----
    await evaluate(`
      (() => {
        const btn = [...document.querySelectorAll('.ribbon__button')]
          .find((b) => (b.getAttribute('title') || '') === 'Tags')
        if (btn) btn.click()
        return !!btn
      })()
    `)
    await sleep(700)
    const tags = await evaluate(`[...document.querySelectorAll('.tag-chip')].map((e) => e.textContent)`)
    check('the tag pane lists tags', tags.length > 0, tags.join('|'))
    check('the tag pane shows a count', /\d/.test(tags.join('')), tags.join('|'))

    const filtered = await evaluate(`
      (() => {
        const input = document.querySelector('.sidebar--right input.input')
        if (!input) return 'NO_INPUT'
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(input, 'work')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        return 'OK'
      })()
    `)
    await sleep(600)
    const afterFilter = await evaluate(`[...document.querySelectorAll('.tag-chip')].map((e) => e.textContent)`)
    check('the tag pane can be searched', afterFilter.length > 0, `${filtered} / ${afterFilter.join('|')}`)
    check('the tag search narrows the list', afterFilter.length < tags.length, `${tags.length} → ${afterFilter.length}`)

    // ---- 4. Clicking a tag lists the notes that carry it ----
    const clicked = await evaluate(`
      (() => {
        const chip = [...document.querySelectorAll('.tag-chip')].find((e) => e.textContent.includes('work'))
        if (!chip) return false
        chip.click()
        return true
      })()
    `)
    await sleep(800)
    const tagged = await evaluate(
      `[...document.querySelectorAll('.sidebar--right .outline-item')].map((e) => e.textContent)`
    )
    check('clicking a tag lists the notes that carry it', clicked && tagged.length > 0, `${clicked} / ${tagged.join('|')}`)
    check('the notes listed are the ones with the tag', tagged.includes('Alpha'), tagged.join('|'))

    // ---- 5. The graph filters ----
    await evaluate(`
      (() => {
        const btn = [...document.querySelectorAll('.ribbon__button')]
          .find((b) => /^Graph view/.test(b.getAttribute('title') || ''))
        if (!btn) return false
        // The button toggles, so only click it when the graph is closed.
        if (!btn.classList.contains('is-active')) btn.click()
        return true
      })()
    `)
    await sleep(1600)
    const nodesBefore = await evaluate(`document.querySelectorAll('.graph-node').length`)
    check('the graph draws nodes', nodesBefore > 0, String(nodesBefore))

    const filteredGraph = await evaluate(`
      (() => {
        const select = [...document.querySelectorAll('.graph-toolbar select')]
          .find((s) => [...s.options].some((o) => o.textContent.includes('#')))
        if (!select) return 'NO_SELECT'
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
        const opt = [...select.options].find((o) => o.textContent.includes('#work'))
        if (!opt) return 'NO_OPTION'
        setter.call(select, opt.value)
        select.dispatchEvent(new Event('change', { bubbles: true }))
        return 'OK'
      })()
    `)
    await sleep(1400)
    const nodesAfter = await evaluate(`document.querySelectorAll('.graph-node').length`)
    check('the graph filters by tag', filteredGraph === 'OK' && nodesAfter < nodesBefore, `${filteredGraph} / ${nodesBefore} → ${nodesAfter}`)

    // ---- 6. The local graph ----
    const localGraph = await evaluate(`
      (() => {
        const btn = [...document.querySelectorAll('.graph-toolbar button')]
          .find((b) => /local/i.test(b.textContent))
        if (!btn) return 'NO_BUTTON'
        btn.click()
        return 'OK'
      })()
    `)
    await sleep(1400)
    const localNodes = await evaluate(`document.querySelectorAll('.graph-node').length`)
    check('the local graph shows fewer nodes', localGraph === 'OK' && localNodes <= nodesAfter, `${localGraph} / ${nodesAfter} → ${localNodes}`)

    // ---- 7. The theme toggles ----
    const themeBefore = await evaluate(`document.documentElement.dataset.theme`)
    await evaluate(`
      window.dispatchEvent(new CustomEvent('slate:command', { detail: 'ui:toggle-theme' }))
    `)
    await sleep(900)
    const themeAfter = await evaluate(`document.documentElement.dataset.theme`)
    check('the theme toggles', themeBefore !== themeAfter, `${themeBefore} → ${themeAfter}`)

    // Put everything back the way it was, so the next check starts clean.
    await evaluate(`window.slate.settings.set({ theme: 'system' })`)
    await evaluate(`
      (() => {
        const btn = [...document.querySelectorAll('.ribbon__button')]
          .find((b) => /^Graph view/.test(b.getAttribute('title') || ''))
        if (btn && btn.classList.contains('is-active')) btn.click()
        return true
      })()
    `)
    await sleep(600)

    console.log(results.join('\n'))
    process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0)
  } catch (err) {
    console.error(String(err))
    console.log(results.join('\n'))
    process.exit(1)
  }
}
