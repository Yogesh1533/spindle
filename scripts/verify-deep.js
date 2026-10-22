/**
 * Deep interaction checks: unresolved-link creation, rename with link
 * rewriting, live filesystem watching, search, tags and settings.
 *
 * Autocomplete has its own script (verify-autocomplete.mjs) because it
 * needs real key events rather than synthetic ones.
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
  // Flatten the file tree into a list of "path — name" strings.
  const flatTree = async () => {
    const walk = (nodes, prefix) =>
      nodes.flatMap((n) =>
        n.isFolder
          ? walk(n.children ?? [], `${prefix}${n.name}/`)
          : [`${prefix}${n.name}`]
      )
    return walk(await window.spindle.vault.tree(), '')
  }

  await window.spindle.vault.open('/Users/yogesh/Documents/Spindle Sample Vault')
  await wait(2000)

  // ---- 1. An unresolved link is styled differently ----
  // "Unresolved Links.md" points at notes that never exist, so the check
  // does not depend on what earlier runs happened to create.
  await openNote('Unresolved Links.md')
  const cm = $('.cm-content')
  if (!cm) {
    results.push('FAIL  editor mounts — aborting')
    return results.join('\n')
  }
  const unresolved = $$('.cm-md-link--unresolved')
  check('an unresolved link is marked as such', unresolved.length > 0, String(unresolved.length))
  const resolved = $$('.cm-md-link:not(.cm-md-link--unresolved)')
  check('a resolved link is styled as resolved', resolved.length > 0, String(resolved.length))

  // ---- 2. Clicking an unresolved link creates the note ----
  const namesBefore = await flatTree()
  if (unresolved.length > 0) {
    const label = unresolved[0].textContent.trim()
    unresolved[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }))
    await wait(2000)
    const namesAfter = await flatTree()
    check('clicking an unresolved link creates the note', namesAfter.length > namesBefore.length, `${namesBefore.length} → ${namesAfter.length}`)
    check('the created note is the link target', namesAfter.includes(`${label}.md`), `want ${label}.md in ${namesAfter.join('|')}`)
    check('the created note opens', activeTabName().includes(label), activeTabName())
  }

  // ---- 3. Renaming a note rewrites links to it ----
  const gettingStarted = (await flatTree()).find((n) => n === 'Getting Started.md')
  check('the source note exists', !!gettingStarted)
  if (gettingStarted) {
    const welcomeBefore = await window.spindle.file.read('Welcome.md')
    check('Welcome.md links to Getting Started', welcomeBefore.includes('[[Getting Started]]'), welcomeBefore.slice(0, 60))

    await window.spindle.links.updateOnRename('Getting Started.md', 'Renamed Guide.md')
    await window.spindle.file.rename('Getting Started.md', 'Renamed Guide.md')
    await wait(1500)

    const welcomeAfter = await window.spindle.file.read('Welcome.md')
    check('rename rewrites the link', welcomeAfter.includes('[[Renamed Guide]]'), welcomeAfter.slice(0, 120))
    check('the old link text is gone', !welcomeAfter.includes('[[Getting Started]]'), welcomeAfter.slice(0, 120))

    // Put it back.
    await window.spindle.links.updateOnRename('Renamed Guide.md', 'Getting Started.md')
    await window.spindle.file.rename('Renamed Guide.md', 'Getting Started.md')
    await wait(1500)
    const welcomeRestored = await window.spindle.file.read('Welcome.md')
    check('rename back restores the link', welcomeRestored.includes('[[Getting Started]]'), welcomeRestored.slice(0, 120))
  }

  // ---- 4. Full-text search ----
  // Filesystem watching is checked separately by scripts/verify-watch.mjs,
  // because a genuine outside edit cannot be made through the app's own IPC.
  const hits = await window.spindle.search.query({ text: 'blockquote' })
  check('search finds a match', Array.isArray(hits) && hits.length > 0, JSON.stringify(hits).slice(0, 140))
  const tagHits = await window.spindle.search.query({ tag: 'sample' })
  check('search by tag returns results', Array.isArray(tagHits) && tagHits.length > 0, JSON.stringify(tagHits).slice(0, 140))
  const noHits = await window.spindle.search.query({ text: 'zzzznotfoundzzzz' })
  check('search with no match returns nothing', Array.isArray(noHits) && noHits.length === 0, JSON.stringify(noHits).slice(0, 100))
  const folderHits = await window.spindle.search.query({ folder: 'Daily' })
  check('search can be restricted to a folder', Array.isArray(folderHits) && folderHits.length > 0, JSON.stringify(folderHits).slice(0, 140))

  // ---- 5. Tags index ----
  const tags = await window.spindle.search.tags()
  check('tag index is populated', Array.isArray(tags) && tags.length > 0, JSON.stringify(tags).slice(0, 160))
  const tagged = await window.spindle.search.notesWithTag('sample')
  check('notes-with-tag lookup works', Array.isArray(tagged) && tagged.length > 0, JSON.stringify(tagged).slice(0, 140))

  // ---- 6. Settings round-trip ----
  await window.spindle.settings.set({ dailyNotesFolder: 'Daily' })
  const settings = await window.spindle.settings.get()
  check('settings persist across the IPC boundary', settings.dailyNotesFolder === 'Daily', JSON.stringify(settings).slice(0, 140))
  await window.spindle.settings.set({ dailyNotesFolder: '' })

  // ---- 7. Backlinks for a specific note ----
  const backlinks = await window.spindle.links.backlinks('Getting Started.md')
  check('backlinks resolve for a linked note', Array.isArray(backlinks) && backlinks.length > 0, JSON.stringify(backlinks).slice(0, 160))

  // ---- 8. Resolving a link ----
  const resolvedTarget = await window.spindle.links.resolve('Getting Started', 'Welcome.md')
  check('a link target resolves to a path', resolvedTarget === 'Getting Started.md', String(resolvedTarget))
  const unknownTarget = await window.spindle.links.resolve('No Such Note Anywhere', 'Welcome.md')
  check('an unknown target does not resolve', !unknownTarget, String(unknownTarget))

  // ---- 9. Clean up after ourselves ----
  // Step 2 created a note; leaving it behind would make the next run's
  // "unresolved link" check pass for the wrong reason.
  for (const name of ['Nowhere Note.md', 'Also Missing.md']) {
    if ((await flatTree()).includes(name)) {
      await window.spindle.file.remove(name).catch(() => {})
      await wait(800)
    }
  }

  return results.join('\n')
})()
