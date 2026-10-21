/**
 * Evaluate a JavaScript expression in a CDP page target.
 *
 * Usage: node scripts/cdp-eval.mjs <ws-url> <expression>
 *
 * Used during development to check the running app without adding a debug
 * channel to the shipped renderer.
 */
const url = process.argv[2]
const expression = process.argv[3]

if (!url || !expression) {
  console.error('Usage: node scripts/cdp-eval.mjs <ws-url> <expression>')
  process.exit(1)
}

const ws = new WebSocket(url)
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
    console.log(JSON.stringify(msg.result?.result?.value ?? msg.result, null, 2))
  }
  ws.close()
  process.exit(0)
}

ws.onerror = (err) => {
  console.error('WebSocket error:', err.message ?? err)
  process.exit(1)
}

setTimeout(() => {
  if (!done) {
    console.error('timed out')
    process.exit(1)
  }
}, 10000)
