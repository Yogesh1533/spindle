/**
 * Deep interaction checks: autocomplete, unresolved-link creation, rename
 * with link rewriting, and live filesystem watching.
 *
 * Usage: node scripts/cdp-probe.mjs <ws-url> scripts/verify-deep.js [timeoutMs]
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
  const activeTabName = () => {
    const t = $('.tab.is-active .tab__name')
    return t ? t.textContent : ''
  }
  const openNote = async (name) => {
    const item = $$('.tree__name').find((e) => e.textContent === name)
    if (!item) return false
    item.click()
    await wait(1200)
    return true
  }
  // Type into the focused CodeMirror editor using a real input event.
  const type = async (text) => {
    const ok = document.execCommand('insertText', false, text)
    await wait(600)
    return ok
  }
  const caretToEnd = () => {
    const cm = $('.cm-content')
    if (!cm) return false
    cm.focus()
    const sel = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(cm)
    range.collapse(false)
    sel.removeAllRanges()
    sel.addRange(range)
    return true
  }

  await window.slate.vault.open('/Users/yogesh/Documents/Slate Sample Vault')
  await wait(1800)

  // ---- 1. Wikilink autocomplete on "[[" ----
  await openNote('Ideas.md')
  const cm = $('.cm-content')
  if (!cm) {
    results.push('FAIL  editor mounts — aborting')
    return results.join('\n')
  }
  const beforeText = cm.textContent
  caretToEnd()
  await wait(200)
  await type('\n[[Get')
  const afterText = cm.textContent
  check('typing reaches the editor', afterText.length > beforeText.length, `${beforeText.length} → ${afterText.length}`)

  // Give the autocomplete source a chance to run.
  await wait(1200)
  let compl = count('.cm-tooltip-autocomplete .cm-completionItem')
  if (compl === 0) {
    // The tooltip may not auto-open in every context; ask for it explicitly.
    const view = window.CMView ? window.CMView.findFromDOM(cm) : null
    check('EditorView.findFromDOM is reachable', !!view, 'no view')
    if (view) {
      // Ctrl-Space opens the completion list explicitly.
      view.dispatch({
        selection: { anchor: view.state.doc.length },
        effects: [],
      })
      view.focus()
      await wait(200)
      const ok = document.execCommand('insertText', false, '')
      await wait(800)
      compl = count('.cm-tooltip-autocomplete .cm-completionItem')
    }
  }
  check('autocomplete lists notes for [[', compl > 0, `${compl} completion items`)
  const labels = $$('.cm-tooltip-autocomplete .cm-completionItem').map((e) => e.textContent)
  check('autocomplete suggests the matching note', labels.some((l) => /Getting/i.test(l)), labels.join('|'))

  // Accept a completion with Enter and check the wikilink was inserted.
  const textBeforeAccept = $('.cm-content')?.textContent || ''
  const item = $('.cm-tooltip-autocomplete .cm-completionItem')
  if (item) {
    item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    await wait(800)
  }
  const textAfterAccept = $('.cm-content')?.textContent || ''
  check('accepting a completion inserts a wikilink', /\[\[[^\]]+\]\]/.test(textAfterAccept), JSON.stringify(textAfterAccept.slice(-30)))

  // Undo the test edit so the vault is left clean.
  const undo = $('.cm-content')
  if (undo) {
    // Select the added text and delete it.
    const view = window.CMView?.findFromDOM(undo)
    if (view) {
      const len = textAfterAccept.length - beforeText.length
      view.dispatch({ changes: { from: view.state.doc.length - len, to: view.state.doc.length, insert: '' } })
      await wait(400)
    }
  }

  // ---- 2. Clicking an unresolved link creates the note ----
  const namesBefore = (await window.slate.vault.tree()).map((n) => n.name)
  await openNote('Welcome.md')
  const unresolved = $$('.cm-md-link--unresolved')
  check('there is an unresolved link to test', unresolved.length > 0, String(unresolved.length))
  if (unresolved.length > 0) {
    const label = unresolved[0].textContent.trim()
    unresolved[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }))
    await wait(1800)
    const namesAfter = (await window.slate.vault.tree()).map((n) => n.name)
    check('clicking an unresolved link creates the note', namesAfter.length > namesBefore.length, `${namesBefore.length} → ${namesAfter.length}`)
    check('the created note is the link target', namesAfter.includes(label), `want ${label} in ${namesAfter.join('|')}`)
    check('the created note opens', activeTabName().includes(label), activeTabName())
  }

  // ---- 3. Renaming a note rewrites links to it ----
  const gettingStarted = (await window.slate.vault.tree()).find((n) => n.name === 'Getting Started.md')
  check('the source note exists', !!gettingStarted)
  if (gettingStarted) {
    const welcomeBefore = await window.slate.file.read('Welcome.md')
    check('Welcome.md links to Getting Started', welcomeBefore.includes('[[Getting Started]]'), welcomeBefore.slice(0, 60))

    await window.slate.links.updateOnRename('Getting Started.md', 'Renamed Guide.md')
    await window.slate.file.rename('Getting Started.md', 'Renamed Guide.md')
    await wait(1500)

    const welcomeAfter = await window.slate.file.read('Welcome.md')
    check('rename rewrites the link', welcomeAfter.includes('[[Renamed Guide]]'), welcomeAfter.slice(0, 120))
    check('the old link text is gone', !welcomeAfter.includes('[[Getting Started]]'), welcomeAfter.slice(0, 120))

    // Put it back.
    await window.slate.links.updateOnRename('Renamed Guide.md', 'Getting Started.md')
    await window.slate.file.rename('Renamed Guide.md', 'Getting Started.md')
    await wait(1200)
    const welcomeRestored = await window.slate.file.read('Welcome.md')
    check('rename back restores the link', welcomeRestored.includes('[[Getting Started]]'), welcomeRestored.slice(0, 120))
  }

  // ---- 4. Filesystem watching ----
  const treeBefore = (await window.slate.vault.tree()).length
  await window.slate.file.createNote('Watched Outside.md', 'Written by the watcher test.\n')
  await wait(3000)
  const treeAfter = (await window.slate.vault.tree()).length
  check('a file created outside the app shows up', treeAfter > treeBefore, `${treeBefore} → ${treeAfter}`)
  const treeNames = (await window.slate.vault.tree()).map((n) => n.name)
  check('the new note is in the tree', treeNames.includes('Watched Outside.md'), treeNames.join('|'))

  // ---- 5. Full-text search ----
  const hits = await window.slate.search.query({ text: 'blockquote' })
  check('search finds a match', Array.isArray(hits) && hits.length > 0, JSON.stringify(hits).slice(0, 140))
  const tagHits = await window.slate.search.query({ tag: 'sample' })
  check('search by tag returns results', Array.isArray(tagHits) && tagHits.length > 0, JSON.stringify(tagHits).slice(0, 140))
  const noHits = await window.slate.search.query({ text: 'zzzznotfoundzzzz' })
  check('search with no match returns nothing', Array.isArray(noHits) && noHits.length === 0, JSON.stringify(noHits).slice(0, 100))

  // ---- 6. Tags index ----
  const tags = await window.slate.search.tags()
  check('tag index is populated', Array.isArray(tags) && tags.length > 0, JSON.stringify(tags).slice(0, 160))
  const tagged = await window.slate.search.notesWithTag('sample')
  check('notes-with-tag lookup works', Array.isArray(tagged) && tagged.length > 0, JSON.stringify(tagged).slice(0, 140))

  // ---- 7. Settings round-trip ----
  await window.slate.settings.set({ dailyNotesFolder: 'Daily' })
  const settings = await window.slate.settings.get()
  check('settings persist across the IPC boundary', settings.dailyNotesFolder === 'Daily', JSON.stringify(settings).slice(0, 140))
  await window.slate.settings.set({ dailyNotesFolder: '' })

  // ---- 8. Backlinks for a specific note ----
  const backlinks = await window.slate.links.backlinks('Getting Started.md')
  check('backlinks resolve for a linked note', Array.isArray(backlinks) && backlinks.length > 0, JSON.stringify(backlinks).slice(0, 160))

  // ---- 9. Resolving a link ----
  const resolved = await window.slate.links.resolve('Getting Started', 'Welcome.md')
  check('a link target resolves to a path', resolved === 'Getting Started.md', String(resolved))
  const unresolvedTarget = await window.slate.links.resolve('No Such Note Anywhere', 'Welcome.md')
  check('an unknown target does not resolve', !unresolvedTarget, String(unresolvedTarget))

  return results.join('\n')
})()
