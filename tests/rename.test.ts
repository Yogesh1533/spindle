import { describe, expect, it } from 'vitest'
import { rewriteLinkTargets } from '../src/shared/links.js'

/**
 * Renaming a note must update every link that points at it, in every other
 * note, while leaving unrelated content and user-chosen aliases alone.
 */
describe('rewriteLinkTargets', () => {
  it('updates a plain wikilink', () => {
    const { content, changed } = rewriteLinkTargets('See [[Old Name]] here.', 'Old Name', 'New Name')
    expect(content).toBe('See [[New Name]] here.')
    expect(changed).toBe(1)
  })

  it('keeps the alias', () => {
    const { content } = rewriteLinkTargets('[[Old Name|My alias]]', 'Old Name', 'New Name')
    expect(content).toBe('[[New Name|My alias]]')
  })

  it('keeps the heading reference', () => {
    const { content } = rewriteLinkTargets('[[Old Name#Section]]', 'Old Name', 'New Name')
    expect(content).toBe('[[New Name#Section]]')
  })

  it('keeps the heading reference and the alias together', () => {
    const { content } = rewriteLinkTargets('[[Old Name#Section|Alias]]', 'Old Name', 'New Name')
    expect(content).toBe('[[New Name#Section|Alias]]')
  })

  it('updates embeds', () => {
    const { content } = rewriteLinkTargets('![[Old Name]]', 'Old Name', 'New Name')
    expect(content).toBe('![[New Name]]')
  })

  it('updates every occurrence', () => {
    const { content, changed } = rewriteLinkTargets(
      '[[Old]] and again [[Old]] and [[Old|alias]]',
      'Old',
      'New'
    )
    expect(content).toBe('[[New]] and again [[New]] and [[New|alias]]')
    expect(changed).toBe(3)
  })

  it('leaves unrelated links alone', () => {
    const { content, changed } = rewriteLinkTargets(
      '[[Old Name]] and [[Something Else]]',
      'Old Name',
      'New Name'
    )
    expect(content).toBe('[[New Name]] and [[Something Else]]')
    expect(changed).toBe(1)
  })

  it('does not touch a link that merely contains the old name', () => {
    const { content, changed } = rewriteLinkTargets('[[Old Name Extended]]', 'Old Name', 'New Name')
    expect(content).toBe('[[Old Name Extended]]')
    expect(changed).toBe(0)
  })

  it('matches on the file name when the link used a path', () => {
    const { content } = rewriteLinkTargets('[[folder/Old Name]]', 'Old Name', 'New Name')
    expect(content).toBe('[[New Name]]')
  })

  it('matches when the link used the .md extension', () => {
    const { content } = rewriteLinkTargets('[[Old Name.md]]', 'Old Name', 'New Name')
    expect(content).toBe('[[New Name]]')
  })

  it('is case insensitive', () => {
    const { content, changed } = rewriteLinkTargets('[[old name]]', 'Old Name', 'New Name')
    expect(changed).toBe(1)
    expect(content).toBe('[[New Name]]')
  })

  it('leaves ordinary markdown links alone', () => {
    const { content, changed } = rewriteLinkTargets('[Old Name](old-name.md)', 'Old Name', 'New Name')
    expect(content).toBe('[Old Name](old-name.md)')
    expect(changed).toBe(0)
  })

  it('leaves frontmatter and prose alone', () => {
    const original = '---\ntitle: Old Name\n---\n\nThe Old Name project.'
    const { content, changed } = rewriteLinkTargets(original, 'Old Name', 'New Name')
    expect(content).toBe(original)
    expect(changed).toBe(0)
  })

  it('preserves surrounding text exactly', () => {
    const { content } = rewriteLinkTargets(
      'Intro.\n\n- [[Old Name]]\n- item two\n\nOutro.',
      'Old Name',
      'New Name'
    )
    expect(content).toBe('Intro.\n\n- [[New Name]]\n- item two\n\nOutro.')
  })

  it('handles a rename where only the case changed', () => {
    const { content, changed } = rewriteLinkTargets('[[note]]', 'Note', 'NOTE')
    expect(changed).toBe(1)
    expect(content).toBe('[[NOTE]]')
  })

  it('handles an empty document', () => {
    const { content, changed } = rewriteLinkTargets('', 'Old', 'New')
    expect(content).toBe('')
    expect(changed).toBe(0)
  })
})
