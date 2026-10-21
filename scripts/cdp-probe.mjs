/**
 * Evaluate a JavaScript file in a CDP page target.
 *
 * Usage: node scripts/cdp-probe.mjs <ws-url> <script-file>
 *
 * The file is read as UTF-8 and evaluated as an expression, so it must end
 * with a value. This avoids shell/JSON escaping problems for complex probes.
 */
import { readFileSync } from 'node:fs'

const wsUrl = process.argv[2]
const file = process.argv[3]

if (!wsUrl || !file) {
  console.error('Usage: node scripts/cdp-probe.mjs <ws-url> <script-file>')
  process.exit(1)
}

const expression = readFileSync(file, 'utf8')
const ws = new WebSocket(wsUrl)
let id = 0
let done = false

ws.onopen = () => {
  ws.send(
    JSON.stringify({
      id: ++id,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, returnByValue: true },
    })
  )
}

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id !== id) return
  done = true
  if (msg.result?.exceptionDetails) {
    console.log('EXCEPTION:', JSON.stringify(msg.result.exceptionDetails, null, 2))
  } else {
    const value = msg.result?.result?.value
    console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2))
  }
  ws.close()
  process.exit(0)
}

// Long enough for probes that drive the UI and wait on timers.
const timeoutMs = Number(process.argv[4] ?? 60_000)

setTimeout(() => {
  if (!done) {
    console.error('timed out')
    process.exit(1)
  }
}, timeoutMs)
