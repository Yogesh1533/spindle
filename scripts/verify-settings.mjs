/**
 * Settings modal checks: opening it, changing the daily-note settings, and
 * seeing the change take effect.
 *
 * Usage: node scripts/verify-settings.mjs <ws-url> [vault-path]
 */
const wsUrl = process.argv[2]
const VAULT = process.argv[3] ?? '/Users/yogesh/Documents/Spindle Sample Vault'

if (!wsUrl) {
  console.error('Usage: node scripts/verify-settings.mjs <ws-url> [vault-path]')
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

ws.onopen = async () => {
  try {
    await evaluate(`window.spindle.vault.open(${JSON.stringify(VAULT)})`)
    await sleep(2000)

    // ---- 1. The settings modal opens from the command palette ----
    await evaluate(`useVaultStoreOpen()`).catch(() => {})
    const opened = await evaluate(`
      (() => {
        // The palette is driven through the same command bus the menu uses.
        window.dispatchEvent(new CustomEvent('spindle:command', { detail: 'ui:settings' }))
        return true
      })()
    `)
    await sleep(700)
    const visible = await evaluate(`!!document.querySelector('.settings')`)
    check('the settings modal opens', visible, String(opened))

    // ---- 2. It has the daily-note fields ----
    const fields = await evaluate(`
      (() => {
        const labels = [...document.querySelectorAll('.settings__label')].map((e) => e.textContent)
        return labels
      })()
    `)
    check('the daily-note folder field is present', fields.includes('Folder'), fields.join('|'))
    check('the daily-note template field is present', fields.includes('Template'), fields.join('|'))

    // ---- 3. Changing the folder and saving persists it ----
    await evaluate(`
      (() => {
        const inputs = [...document.querySelectorAll('.settings input.input')]
        const folder = inputs.find((i) => i.placeholder === 'Daily')
        if (!folder) return 'NO_FIELD'
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(folder, 'Journal')
        folder.dispatchEvent(new Event('input', { bubbles: true }))
        return 'OK'
      })()
    `)
    await sleep(400)
    await evaluate(`
      (() => {
        const save = [...document.querySelectorAll('.settings__footer .button')]
          .find((b) => b.textContent.trim() === 'Save')
        if (save) save.click()
        return !!save
      })()
    `)
    await sleep(900)

    const stored = await evaluate(`window.spindle.settings.get()`)
    check('the daily-note folder is saved', stored.dailyNotesFolder === 'Journal', JSON.stringify(stored).slice(0, 140))
    check('the modal closes after saving', !(await evaluate(`!!document.querySelector('.settings')`)))

    // ---- 4. The daily note now lands in that folder ----
    const daily = await evaluate(`window.spindle.daily.open()`)
    await sleep(1200)
    check('the daily note uses the new folder', String(daily?.path ?? '').startsWith('Journal/'), String(daily?.path))
    const onDisk = await evaluate(`window.spindle.file.read(${JSON.stringify(String(daily?.path ?? ''))}).catch(() => 'ERR')`)
    check('the daily note was created', onDisk !== 'ERR' && typeof onDisk === 'string', String(onDisk).slice(0, 60))

    // ---- 5. Put the setting back and clean up ----
    await evaluate(`window.spindle.settings.set({ dailyNotesFolder: 'Daily' })`)
    await sleep(400)
    await evaluate(`window.spindle.file.remove(${JSON.stringify(String(daily?.path ?? ''))}).catch(() => {})`)
    await sleep(600)
    // The check created a "Journal" folder. Remove it too, but only once it
    // is empty, so a folder the user made is never touched.
    await evaluate(`
      (async () => {
        const tree = await window.spindle.vault.tree()
        const journal = tree.find((n) => n.name === 'Journal' && n.isFolder)
        if (journal && (journal.children ?? []).length === 0) {
          await window.spindle.file.remove('Journal').catch(() => {})
        }
        return true
      })()
    `)
    await sleep(400)

    // ---- 6. A template is used for new daily notes ----
    await evaluate(`window.spindle.settings.set({ dailyNotesTemplate: 'Templates/Daily.md' })`)
    await sleep(600)
    // Remove today's note so the next one is created fresh from the template.
    const today = await evaluate(`
      (async () => {
        const d = new Date()
        const pad = (n) => String(n).padStart(2, '0')
        const name = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
        const path = 'Daily/' + name + '.md'
        await window.spindle.file.remove(path).catch(() => {})
        return path
      })()
    `)
    await sleep(800)
    const templated = await evaluate(`window.spindle.daily.open()`)
    await sleep(1200)
    const body = await evaluate(
      `window.spindle.file.read(${JSON.stringify(String(templated?.path ?? ''))}).catch(() => 'ERR')`
    )
    check('the daily note is created from the template', String(body).includes('# '), String(body).slice(0, 80))
    check('the template date token is expanded', /\d{4}-\d{2}-\d{2}/.test(String(body)), String(body).slice(0, 120))
    check('the template time token is expanded', /\d{2}:\d{2}/.test(String(body)), String(body).slice(0, 160))
    check('the template body is kept', String(body).includes('Plan the day'), String(body).slice(0, 200))
    await evaluate(`window.spindle.file.remove(${JSON.stringify(String(templated?.path ?? ''))}).catch(() => {})`)
    await evaluate(`window.spindle.settings.set({ dailyNotesTemplate: '' })`)
    await sleep(500)

    // ---- 6. The theme can be switched ----
    await evaluate(`window.dispatchEvent(new CustomEvent('spindle:command', { detail: 'ui:settings' }))`)
    await sleep(600)
    await evaluate(`
      (() => {
        const dark = [...document.querySelectorAll('.settings .seg__button')]
          .find((b) => b.textContent.trim() === 'Dark')
        if (dark) dark.click()
        return !!dark
      })()
    `)
    await sleep(400)
    await evaluate(`
      (() => {
        const save = [...document.querySelectorAll('.settings__footer .button')]
          .find((b) => b.textContent.trim() === 'Save')
        if (save) save.click()
        return !!save
      })()
    `)
    await sleep(800)
    const theme = await evaluate(`document.documentElement.dataset.theme`)
    check('the dark theme applies immediately', theme === 'dark', String(theme))
    await evaluate(`window.spindle.settings.set({ theme: 'system' })`)
    await sleep(500)

    console.log(results.join('\n'))
    process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0)
  } catch (err) {
    console.error(String(err))
    console.log(results.join('\n'))
    process.exit(1)
  }
}
