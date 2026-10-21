/**
 * End-to-end feature check, run against the live app over CDP.
 *
 * Usage: node scripts/cdp-probe.mjs <ws-url> scripts/verify-features.js [timeoutMs]
 */
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const results = []
  const check = (name, pass, detail) => {
    results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${!pass && detail ? '  → ' + detail : ''}`)
  }
  const $ = (sel) => document.querySelector(sel)
  const $$ = (sel) => [...document.querySelectorAll(sel)]
  const count = (sel) => $$(sel).length
  const key = (k, opts = {}) =>
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts })
    )
  const activeTabName = () => {
    const t = $('.tab.is-active .tab__name')
    return t ? t.textContent : ''
  }

  // ---- Open the vault ----
  await window.slate.vault.open('/Users/yogesh/Documents/Slate Sample Vault')
  await wait(1800)

  // Start from a known state: a previous check may have left the graph
  // open or a right-hand pane selected, and several of the shortcuts
  // below toggle rather than set.
  const ribbon = (title) =>
    $$('.ribbon__button').find((b) => new RegExp(title).test(b.getAttribute('title') || ''))
  const graphBtn = ribbon('^Graph view')
  if (graphBtn && graphBtn.classList.contains('is-active')) graphBtn.click()
  await wait(400)
  for (const title of ['^Backlinks$', '^Tags$', '^Outline$', '^Outgoing links$']) {
    const btn = ribbon(title)
    if (btn) btn.click()
    await wait(250)
  }
  const initialBacklinks = ribbon('^Backlinks$')
  if (initialBacklinks) initialBacklinks.click()
  await wait(500)

  check('vault opens, file tree renders', !!$('.tree'), 'no .tree')

  const treeNames = $$('.tree__name').map((e) => e.textContent)
  check('tree lists the sample notes', treeNames.includes('Welcome.md'), treeNames.join('|'))

  // ---- Open a note ----
  const openNote = async (name) => {
    const item = $$('.tree__name').find((e) => e.textContent === name)
    if (!item) return false
    item.click()
    await wait(1100)
    return true
  }

  await openNote('Welcome.md')
  const cm = $('.cm-content')
  check('editor mounts', !!cm, 'no .cm-content')
  if (!cm) return results.join('\n')
  check('tab reflects the open note', activeTabName() === 'Welcome.md', activeTabName())

  // ---- Live preview decorations ----
  check('headings styled', count('.cm-md-heading') > 0, String(count('.cm-md-heading')))
  check('wikilinks styled', count('.cm-md-link') > 0, String(count('.cm-md-link')))
  check('tags styled', count('.cm-md-tag') > 0, String(count('.cm-md-tag')))
  check('bold styled', count('.cm-md-bold') > 0, String(count('.cm-md-bold')))
  check('list markers styled', count('.cm-md-list-marker') > 0, String(count('.cm-md-list-marker')))
  check('task checkboxes', count('.cm-md-checkbox') > 0, String(count('.cm-md-checkbox')))
  check('tables styled', count('.cm-md-table-line') > 0, String(count('.cm-md-table-line')))
  check('code fences styled', count('.cm-md-codeblock-line') > 0, String(count('.cm-md-codeblock-line')))
  check('blockquotes styled', count('.cm-md-quote-line') > 0, String(count('.cm-md-quote-line')))
  check('frontmatter styled', count('.cm-md-frontmatter-line') > 0, String(count('.cm-md-frontmatter-line')))

  // Raw markers must be hidden in preview mode.
  const text = cm.textContent || ''
  check('wikilink brackets hidden', !text.includes('[['), 'brackets visible')
  check('heading hashes hidden', !/^#{1,6} /m.test(text), 'hashes visible')
  check('bold asterisks hidden', !text.includes('**'), 'asterisks visible')
  // The tag pill keeps its '#', so check the *markup* form is gone instead.
  const raw = await window.slate.file.read('Welcome.md')
  check('source really contains a #tag', raw.includes('#daily'), 'no #daily in source')
  check('tag pill renders the #', $$('.cm-md-tag').some((e) => e.textContent.startsWith('#')), $$('.cm-md-tag').map((e) => e.textContent).join('|'))

  // ---- Backlinks pane ----
  const backlinksBtn = $$('.ribbon__button').find((b) => /backlinks/i.test(b.title || b.textContent || ''))
  if (backlinksBtn) backlinksBtn.click()
  await wait(600)
  const paneText = $('.sidebar--right')?.textContent || ''
  check('backlinks pane populated', /Linked mentions \(\d+\)/.test(paneText), paneText.slice(0, 90))

  // ---- Click a wikilink to navigate ----
  const link = $('.cm-md-link')
  if (link) {
    const wanted = link.textContent.trim()
    link.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }))
    await wait(1200)
    check('clicking a wikilink opens the target', activeTabName().includes(wanted), `tab=${activeTabName()} want=${wanted}`)
  } else {
    check('clicking a wikilink opens the target', false, 'no .cm-md-link found')
  }

  // ---- Quick switcher (Cmd+O) ----
  key('o', { metaKey: true })
  await wait(600)
  check('quick switcher opens', !!$('.palette__input'))
  key('Escape')
  await wait(400)

  // ---- Command palette (Cmd+P) ----
  key('p', { metaKey: true })
  await wait(600)
  check('command palette opens', !!$('.palette__input'))
  const cmdItems = count('.palette__item')
  check('command palette lists commands', cmdItems > 5, String(cmdItems))
  key('Escape')
  await wait(400)

  // ---- Search (Cmd+Shift+F) ----
  key('f', { metaKey: true, shiftKey: true })
  await wait(600)
  check('search overlay opens', !!$('.palette__input'))
  key('Escape')
  await wait(400)

  // ---- Graph view (Cmd+G) ----
  key('g', { metaKey: true })
  await wait(1800)
  const graph = $('.graph-container')
  check('graph view opens', !!graph)
  if (graph) {
    const nodes = count('.graph-node')
    check('graph draws nodes', nodes > 0, String(nodes))
    const edges = count('.graph-edge')
    check('graph draws edges', edges > 0, String(edges))
  }
  key('g', { metaKey: true })
  await wait(700)

  // ---- Daily note (Cmd+D) ----
  key('d', { metaKey: true })
  await wait(1800)
  check('daily note opens', /\d{4}-\d{2}-\d{2}/.test(activeTabName()), `tab=${activeTabName()}`)

  // ---- Source / preview toggle (Cmd+E) ----
  await openNote('Welcome.md')
  key('e', { metaKey: true })
  await wait(800)
  const sourceText = $('.cm-content')?.textContent || ''
  check('source mode shows raw markdown', sourceText.includes('[['), 'markers still hidden')
  key('e', { metaKey: true })
  await wait(800)
  const previewText = $('.cm-content')?.textContent || ''
  check('preview mode hides markers', !previewText.includes('[['), 'markers visible in preview mode')

  // ---- New note (Cmd+N) ----
  const tabCountBefore = count('.tab')
  key('n', { metaKey: true })
  await wait(1300)
  check('new note opens a tab', count('.tab') > tabCountBefore, `${tabCountBefore} → ${count('.tab')}`)

  // Delete the note again, so repeated runs do not litter the sample vault
  // with "Untitled 1.md", "Untitled 2.md" and so on.
  const newTab = $('.tab.is-active .tab__name')?.textContent ?? ''
  if (/^Untitled/.test(newTab)) {
    const paths = await window.slate.links.allPaths()
    const created = paths.find((p) => p.split('/').pop() === newTab)
    if (created) {
      await window.slate.file.remove(created).catch(() => {})
      await wait(600)
    }
  }

  // ---- Status bar ----
  const status = $('.status-bar')?.textContent || ''
  check('status bar shows a word count', /\d+ words/.test(status), status.slice(0, 60))

  // ---- Tag pane ----
  const tagBtn = $$('.ribbon__button').find((b) => /tags/i.test(b.title || b.textContent || ''))
  if (tagBtn) {
    tagBtn.click()
    await wait(700)
    const chips = count('.tag-chip')
    check('tag pane lists tags', chips > 0, String(chips))
  } else {
    check('tag pane lists tags', false, 'no Tags button in ribbon')
  }

  return results.join('\n')
})()
