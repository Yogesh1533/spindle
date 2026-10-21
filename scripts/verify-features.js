/**
 * End-to-end feature check, run against the live app over CDP.
 *
 * Usage: node scripts/cdp-probe.mjs <ws-url> scripts/verify-features.js
 */
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const results = {}
  const check = (name, pass, detail) => {
    results[name] = pass ? 'PASS' : `FAIL${detail ? ' — ' + detail : ''}`
  }

  // ---- Open the vault ----
  await window.slate.vault.open('/Users/yogesh/Documents/Slate Sample Vault')
  await wait(1500)
  check('vault opens', !!document.querySelector('.tree'), 'no file tree')

  const treeNames = [...document.querySelectorAll('.tree__name')].map((e) => e.textContent)
  check('tree lists notes', treeNames.includes('Welcome.md'), treeNames.join('|'))

  // ---- Open a note ----
  const openNote = async (name) => {
    const item = [...document.querySelectorAll('.tree__name')].find((e) => e.textContent === name)
    if (!item) return false
    item.click()
    await wait(900)
    return true
  }

  await openNote('Welcome.md')
  const cm = document.querySelector('.cm-content')
  check('editor mounts', !!cm, 'no .cm-content')
  if (!cm) return JSON.stringify(results, null, 1)

  // ---- Live preview decorations ----
  const count = (sel) => document.querySelectorAll(sel).length
  check('headings styled', count('.cm-md-heading') > 0, String(count('.cm-md-heading')))
  check('wikilinks styled', count('.cm-md-link') > 0, String(count('.cm-md-link')))
  check('tags styled', count('.cm-md-tag') > 0, String(count('.cm-md-tag')))
  check('bold styled', count('.cm-md-bold') > 0, String(count('.cm-md-bold')))
  check('list markers styled', count('.cm-md-list-marker') > 0, String(count('.cm-md-list-marker')))
  check('task checkboxes', count('.cm-md-checkbox') > 0, String(count('.cm-md-checkbox')))
  check('tables styled', count('.cm-md-table-line') > 0, String(count('.cm-md-table-line')))
  check('code fences styled', count('.cm-md-codeblock-line') > 0, String(count('.cm-md-codeblock-line')))
  check('blockquotes styled', count('.cm-md-quote-line') > 0, String(count('.cm-md-quote-line')))

  // The raw markers must be hidden.
  const text = cm.textContent || ''
  check('wikilink brackets hidden', !text.includes('[['), 'brackets still visible')
  check('heading markers hidden', !/^#{1,6} /m.test(text), 'hashes still visible')
  check('bold markers hidden', !text.includes('**'), 'asterisks still visible')

  // ---- Backlinks ----
  const paneText = document.querySelector('.sidebar--right')?.textContent || ''
  check('backlinks pane populated', /Linked mentions \(\d+\)/.test(paneText), paneText.slice(0, 80))

  // ---- Click a wikilink to navigate ----
  const link = document.querySelector('.cm-md-link')
  if (link) {
    const linkText = link.textContent
    link.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    await wait(900)
    const tab = document.querySelector('.tab')?.textContent || ''
    check('clicking a wikilink opens the target', tab.includes(linkText.trim()), `tab=${tab} want=${linkText}`)
  } else {
    check('clicking a wikilink opens the target', false, 'no link found')
  }

  // ---- Quick switcher (Cmd+O) ----
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', metaKey: true, bubbles: true }))
  await wait(500)
  check('quick switcher opens', !!document.querySelector('.quick-switcher, [class*=switcher]'))
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await wait(300)

  // ---- Command palette (Cmd+P) ----
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', metaKey: true, bubbles: true }))
  await wait(500)
  check('command palette opens', !!document.querySelector('[class*=palette]'))
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await wait(300)

  // ---- Search (Cmd+Shift+F) ----
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true, shiftKey: true, bubbles: true }))
  await wait(500)
  check('search overlay opens', !!document.querySelector('[class*=search]'))
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await wait(300)

  // ---- Graph view (Cmd+G) ----
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', metaKey: true, bubbles: true }))
  await wait(1200)
  const graph = document.querySelector('[class*=graph]')
  check('graph view opens', !!graph)
  if (graph) {
    const nodes = graph.querySelectorAll('circle, [class*=node]').length
    check('graph draws nodes', nodes > 0, String(nodes))
  }
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', metaKey: true, bubbles: true }))
  await wait(500)

  // ---- Daily note (Cmd+D) ----
  const before = (await window.slate.vault.tree()).length
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', metaKey: true, bubbles: true }))
  await wait(1200)
  const tabText = document.querySelector('.tab')?.textContent || ''
  check('daily note opens', /\d{4}-\d{2}-\d{2}/.test(tabText), `tab=${tabText}`)

  // ---- Source / preview toggle (Cmd+E) ----
  await openNote('Welcome.md')
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', metaKey: true, bubbles: true }))
  await wait(600)
  const sourceText = document.querySelector('.cm-content')?.textContent || ''
  check('source mode shows raw markdown', sourceText.includes('[['), 'markers still hidden in source mode')
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', metaKey: true, bubbles: true }))
  await wait(600)
  const previewText = document.querySelector('.cm-content')?.textContent || ''
  check('preview mode hides markers', !previewText.includes('[['), 'markers visible in preview mode')

  // ---- New note (Cmd+N) ----
  const tabCountBefore = document.querySelectorAll('.tab').length
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', metaKey: true, bubbles: true }))
  await wait(1000)
  check('new note opens a tab', document.querySelectorAll('.tab').length > tabCountBefore)

  // ---- Status bar ----
  const status = document.querySelector('.statusbar')?.textContent || ''
  check('status bar shows word count', /\d+ words/.test(status), status.slice(0, 60))

  return JSON.stringify(results, null, 1)
})()
