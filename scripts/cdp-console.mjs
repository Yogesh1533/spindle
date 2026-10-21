/**
 * Capture console messages and page errors from a CDP target.
 *
 * Usage: node scripts/cdp-console.mjs <ws-url> [ms]
 */
const wsUrl = process.argv[2]
const duration = Number(process.argv[3] ?? 8000)

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

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    if (msg.error) reject(new Error(msg.error.message))
    else resolve(msg.result)
    return
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const args = (msg.params.args ?? [])
      .map((a) => a.value ?? a.description ?? a.unserializableValue ?? '')
      .join(' ')
    console.log(`[${msg.params.type}] ${args}`)
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    console.log(`[exception] ${msg.params.exceptionDetails.exception?.description ?? ''}`)
  }
}

ws.onopen = async () => {
  await send('Runtime.enable')
  await send('Log.enable')
  console.log(`listening for ${duration}ms…`)
  setTimeout(() => {
    ws.close()
    process.exit(0)
  }, duration)
}
