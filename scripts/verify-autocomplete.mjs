/**
 * Interactive check: wikilink autocomplete.
 *
 * Uses real CDP key events so CodeMirror sees genuine `input.type`
 * transactions, then inspects the DOM for the completion tooltip.
 *
 * Usage: node scripts/verify-autocomplete.mjs <ws-url>
 */
const wsUrl = process.argv[2]
const typed = process.argv[3] ?? '[[Get'

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

async function typeString(str) {
  for (const char of str) {
    if (char === '\n') {
      await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13,
        text: '\r',
      })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' })
    } else {
      await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: char,
        text: char,
        unmodifiedText: char,
      })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: char })
    }
    await sleep(120)
  }
}

const results = []
const check = (name, pass, detail) => {
  results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${!pass && detail ? '  → ' + detail : ''}`)
}

ws.onopen = async () => {
  try {
    // Open the vault, then work in a scratch note so the test is repeatable.
    const setup = await evaluate(`
      (async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms))
        await window.spindle.vault.open('/Users/yogesh/Documents/Spindle Sample Vault')
        await wait(2000)
        // Start from a clean scratch note every run. createNote is used
        // rather than write because the note has to be new for the app to
        // show it in the tree.
        await window.spindle.file.remove('Scratch Autocomplete.md').catch(() => {})
        await wait(800)
        await window.spindle.file.createNote('Scratch Autocomplete.md', '')
        await wait(1200)
        const item = [...document.querySelectorAll('.tree__name')].find((e) => e.textContent === 'Scratch Autocomplete.md')
        if (item) { item.click(); await wait(1400) }
        return document.querySelector('.cm-content')?.textContent ?? 'NO_EDITOR'
      })()
    `)
    check('scratch note opens', setup !== 'NO_EDITOR', String(setup).slice(0, 60))

    // Put the caret at the end of the (empty) note.
    await evaluate(`
      (() => {
        const cm = document.querySelector('.cm-content')
        cm.focus()
        const sel = window.getSelection()
        const range = document.createRange()
        range.selectNodeContents(cm)
        range.collapse(false)
        sel.removeAllRanges()
        sel.addRange(range)
        return 'ok'
      })()
    `)
    await sleep(300)

    await typeString(typed)
    await sleep(1400)

    const state = await evaluate(`
      (() => {
        const items = [...document.querySelectorAll('.cm-tooltip-autocomplete li[role=option]')]
        return {
          doc: document.querySelector('.cm-content')?.textContent ?? '',
          tooltips: document.querySelectorAll('.cm-tooltip').length,
          items: items.length,
          labels: items.map((e) => e.textContent),
        }
      })()
    `)

    // The live preview hides "[[" from textContent, so read the buffer itself.
    const raw = await evaluate(
      `window.spindle.file.read('Scratch Autocomplete.md').catch(() => 'ERR')`
    )
    check('typing reaches the editor', String(raw).includes(typed), JSON.stringify(raw))
    check('autocomplete tooltip opens', state.tooltips > 0, `${state.tooltips} tooltips`)
    check('autocomplete lists notes', state.items > 0, `${state.items} items`)
    check(
      'autocomplete suggests the matching note',
      state.labels.some((l) => /Getting/i.test(l)),
      state.labels.join('|')
    )

    // Accept the first completion with Enter.
    if (state.items > 0) {
      await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13,
        text: '\r',
      })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' })
      await sleep(900)

      const after = await evaluate(
        `window.spindle.file.read('Scratch Autocomplete.md').catch(() => 'ERR')`
      )
      check('accepting a completion inserts a wikilink', /\[\[[^\]]+\]\]/.test(String(after)), JSON.stringify(after))
    }

    // Remove the scratch note, so the sample vault is left as it was found.
    await evaluate(`window.spindle.file.remove('Scratch Autocomplete.md').catch(() => {})`)
    await sleep(600)

    console.log(results.join('\n'))
    process.exit(0)
  } catch (err) {
    console.error(String(err))
    console.log(results.join('\n'))
    process.exit(1)
  }
}
