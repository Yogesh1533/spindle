/**
 * Drive the running app over CDP: click elements and capture screenshots.
 *
 * Usage: node scripts/cdp-drive.mjs <ws-url> <out-dir> [steps.json]
 *
 * Steps are a JSON array of actions:
 *   {"click": "selector"}          click the first match
 *   {"text": "selector", "value": "x"}  set an input's value
 *   {"key": "Enter"}               press a key
 *   {"eval": "expression"}         evaluate JS
 *   {"shot": "name.png"}           capture a screenshot
 *   {"wait": 500}                  wait in ms
 */
import { writeFileSync } from 'node:fs'

const wsUrl = process.argv[2]
const outDir = process.argv[3]
const steps = process.argv[4] ? JSON.parse(process.argv[4]) : []

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
    for (const step of steps) {
      if (step.wait) {
        await sleep(step.wait)
      } else if (step.click) {
        const value = await evaluate(
          `(() => { const el = document.querySelector(${JSON.stringify(step.click)});
             if (!el) return 'NOT_FOUND';
             el.click(); return 'OK'; })()`
        )
        console.log(`click ${step.click}: ${value}`)
        await sleep(step.settle ?? 350)
      } else if (step.text) {
        const value = await evaluate(
          `(() => { const el = document.querySelector(${JSON.stringify(step.text)});
             if (!el) return 'NOT_FOUND';
             const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value')?.set;
             setter?.call(el, ${JSON.stringify(step.value ?? '')});
             el.dispatchEvent(new Event('input', { bubbles: true }));
             return 'OK'; })()`
        )
        console.log(`text ${step.text}: ${value}`)
        await sleep(step.settle ?? 250)
      } else if (step.key) {
        await send('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: step.key,
          text: step.text2 ?? step.key,
        })
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: step.key })
        await sleep(step.settle ?? 250)
      } else if (step.eval) {
        const value = await evaluate(step.eval)
        console.log(`eval: ${JSON.stringify(value)}`)
      } else if (step.shot) {
        const shot = await send('Page.captureScreenshot', { format: 'png' })
        const file = `${outDir}/${step.shot}`
        writeFileSync(file, Buffer.from(shot.data, 'base64'))
        console.log(`shot: ${file}`)
      }
    }
  } catch (err) {
    console.error('ERROR:', err.message)
  }
  ws.close()
  process.exit(0)
}

setTimeout(() => {
  console.error('timed out')
  process.exit(1)
}, 60000)
