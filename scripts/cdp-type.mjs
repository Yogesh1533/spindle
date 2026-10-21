/**
 * Type text into the running app with real key events, so the editor sees
 * genuine user input (CodeMirror only treats `input.type` transactions as
 * typing).
 *
 * Usage: node scripts/cdp-type.mjs <ws-url> <text> [selector]
 *
 * The selector is optional; when given, it is focused first.
 */
const wsUrl = process.argv[2]
const text = process.argv[3] ?? ''
const selector = process.argv[4]

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

ws.onopen = async () => {
  try {
    if (selector) {
      await evaluate(
        `(() => { const el = document.querySelector(${JSON.stringify(selector)});
           if (!el) return 'NOT_FOUND'; el.focus(); return 'OK'; })()`
      )
      await sleep(300)
    }

    for (const char of text) {
      if (char === '\n') {
        await send('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: 'Enter',
          code: 'Enter',
          windowsVirtualKeyCode: 13,
          nativeVirtualKeyCode: 13,
          text: '\r',
        })
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' })
      } else {
        // `text` on a keyDown is what makes Chromium synthesise the
        // `beforeinput`/`input` pair that CodeMirror listens for.
        await send('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: char,
          text: char,
          unmodifiedText: char,
        })
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: char })
      }
      await sleep(90)
    }

    await sleep(700)
    console.log('typed')
    process.exit(0)
  } catch (err) {
    console.error(String(err))
    process.exit(1)
  }
}
