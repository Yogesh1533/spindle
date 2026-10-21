/**
 * Filesystem-watching checks.
 *
 * The point of this test is that a file changed *outside* the app shows up
 * live. That cannot be done through the app's own IPC — writes that go
 * through Slate are deliberately marked as self-writes so the watcher can
 * ignore its own echo. So this script writes straight to the disk and then
 * asks the running app what it can see.
 *
 * Usage: node scripts/verify-watch.mjs <ws-url> [vault-path]
 */
import { writeFile, rm } from 'node:fs/promises'
import path from 'node:path'

const wsUrl = process.argv[2]
const VAULT = process.argv[3] ?? '/Users/yogesh/Documents/Slate Sample Vault'

if (!wsUrl) {
  console.error('Usage: node scripts/verify-watch.mjs <ws-url> [vault-path]')
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

/** Ask the page for the tree as the vault API sees it, and as the DOM shows it. */
const readTrees = `(() => {
  const flat = (nodes, prefix) =>
    nodes.flatMap((n) =>
      n.isFolder ? flat(n.children ?? [], prefix + n.name + '/') : [prefix + n.name]
    )
  return (async () => {
    const api = flat(await window.slate.vault.tree(), '')
    const dom = [...document.querySelectorAll('.tree__name')].map((e) => e.textContent)
    return { api, dom }
  })()
})()`

const results = []
const check = (name, pass, detail) => {
  results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${!pass && detail ? '  → ' + detail : ''}`)
}

ws.onopen = async () => {
  try {
    await evaluate(`window.slate.vault.open(${JSON.stringify(VAULT)})`)
    await sleep(2500)

    // ---- 1. A file created outside the app shows up ----
    const outsidePath = path.join(VAULT, 'Watched Outside.md')
    await rm(outsidePath, { force: true })
    await sleep(1500)

    const before = await evaluate(readTrees)
    await writeFile(outsidePath, 'Written by the watcher test.\n', 'utf8')
    await sleep(3000)

    const after = await evaluate(readTrees)
    check(
      'a file created outside the app shows up in the tree',
      after.api.length > before.api.length,
      `${before.api.length} → ${after.api.length}`
    )
    check('the new file is in the tree', after.api.includes('Watched Outside.md'), after.api.join('|'))
    check('the new file is rendered in the sidebar', after.dom.includes('Watched Outside.md'), after.dom.join('|'))

    // ---- 2. Opening it shows the content ----
    await evaluate(`
      (() => {
        const item = [...document.querySelectorAll('.tree__name')]
          .find((e) => e.textContent === 'Watched Outside.md')
        if (item) item.click()
        return !!item
      })()
    `)
    await sleep(1500)
    const editorText = await evaluate(`document.querySelector('.cm-content')?.textContent ?? ''`)
    check(
      'the new note opens in the editor',
      editorText.includes('watcher test'),
      JSON.stringify(editorText.slice(0, 60))
    )

    // ---- 3. A note edited outside the app updates the open editor ----
    await writeFile(outsidePath, 'Edited from outside the app.\n', 'utf8')
    await sleep(3000)
    const editedText = await evaluate(`document.querySelector('.cm-content')?.textContent ?? ''`)
    check(
      'an outside edit updates the open editor',
      editedText.includes('Edited from outside'),
      JSON.stringify(editedText.slice(0, 60))
    )

    // ---- 4. A file deleted outside the app disappears ----
    await rm(outsidePath, { force: true })
    await sleep(3000)
    const afterDelete = await evaluate(readTrees)
    check(
      'a file deleted outside the app disappears',
      !afterDelete.api.includes('Watched Outside.md'),
      afterDelete.api.join('|')
    )

    console.log(results.join('\n'))
    process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0)
  } catch (err) {
    console.error(String(err))
    console.log(results.join('\n'))
    process.exit(1)
  }
}
