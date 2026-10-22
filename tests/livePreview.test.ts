import { describe, expect, it } from 'vitest'
import { scanLines } from '../src/renderer/editor/livePreview.js'

/**
 * The live preview hides the Markdown markers it renders. For a fenced code
 * block that means both the opening and the closing fence have to be part of
 * the block — otherwise the closing ``` is left on screen under the code.
 */
describe('scanning fenced code blocks', () => {
  it('treats the opening fence as part of the block', () => {
    const lines = scanLines('```js\nconst a = 1\n```\n')
    expect(lines[0].inCode).toBe(true)
  })

  it('treats the closing fence as part of the block', () => {
    const lines = scanLines('```js\nconst a = 1\n```\n')
    expect(lines[2].inCode).toBe(true)
  })

  it('leaves the line after the block alone', () => {
    const lines = scanLines('```js\nconst a = 1\n```\n\nAfter\n')
    expect(lines[3].inCode).toBe(false)
    expect(lines[4].inCode).toBe(false)
  })

  it('handles tilde fences', () => {
    const lines = scanLines('~~~\nplain\n~~~\n')
    expect(lines[0].inCode).toBe(true)
    expect(lines[1].inCode).toBe(true)
    expect(lines[2].inCode).toBe(true)
    expect(lines[3].inCode).toBe(false)
  })

  it('does not close a backtick fence with a tilde fence', () => {
    const lines = scanLines('```js\n~~~\nstill code\n```\n')
    expect(lines[1].inCode).toBe(true)
    expect(lines[2].inCode).toBe(true)
    expect(lines[3].inCode).toBe(true)
    expect(lines[4].inCode).toBe(false)
  })
})
