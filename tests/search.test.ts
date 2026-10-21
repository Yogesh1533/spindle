import { describe, expect, it } from 'vitest'
import { VaultSearchIndex, tokenize, type IndexableNote } from '../src/shared/search.js'

function note(
  path: string,
  title: string,
  body: string,
  extra: Partial<IndexableNote> = {}
): IndexableNote {
  return {
    path,
    title,
    filename: path.split('/').pop() ?? path,
    content: body,
    body,
    headings: [],
    tags: [],
    mtime: 1_700_000_000_000,
    ...extra,
  }
}

describe('tokenize', () => {
  it('lowercases and splits on non-word characters', () => {
    expect(tokenize('Hello, World!')).toEqual(['hello', 'world'])
  })

  it('keeps underscores and digits', () => {
    expect(tokenize('note_2 test')).toEqual(['note_2', 'test'])
  })

  it('returns an empty array for punctuation only', () => {
    expect(tokenize('!!! ...')).toEqual([])
  })
})

describe('VaultSearchIndex', () => {
  it('finds a note by body text', () => {
    const index = new VaultSearchIndex()
    index.upsert(note('a.md', 'Alpha', 'the quick brown fox'))
    index.upsert(note('b.md', 'Beta', 'a lazy dog'))

    const results = index.search({ text: 'brown' })
    expect(results).toHaveLength(1)
    expect(results[0].path).toBe('a.md')
  })

  it('finds a note by title', () => {
    const index = new VaultSearchIndex()
    index.upsert(note('a.md', 'Groceries', 'milk and eggs'))
    index.upsert(note('b.md', 'Journal', 'today was fine'))

    const results = index.search({ text: 'groceries' })
    expect(results[0].path).toBe('a.md')
  })

  it('ranks a title match above a body match', () => {
    const index = new VaultSearchIndex()
    index.upsert(note('a.md', 'Meeting', 'some body text'))
    index.upsert(note('b.md', 'Other', 'we talked about the meeting in detail'))

    const results = index.search({ text: 'meeting' })
    expect(results[0].path).toBe('a.md')
  })

  it('requires all terms to match (AND semantics)', () => {
    const index = new VaultSearchIndex()
    index.upsert(note('a.md', 'One', 'alpha beta'))
    index.upsert(note('b.md', 'Two', 'alpha gamma'))

    const results = index.search({ text: 'alpha beta' })
    expect(results).toHaveLength(1)
    expect(results[0].path).toBe('a.md')
  })

  it('matches on a prefix as you type', () => {
    const index = new VaultSearchIndex()
    index.upsert(note('a.md', 'Backlinks', 'how backlinks work'))

    const results = index.search({ text: 'backl' })
    expect(results).toHaveLength(1)
    expect(results[0].path).toBe('a.md')
  })

  it('returns nothing when there is no match', () => {
    const index = new VaultSearchIndex()
    index.upsert(note('a.md', 'Alpha', 'some text'))
    expect(index.search({ text: 'zzzzz' })).toHaveLength(0)
  })

  it('filters by tag', () => {
    const index = new VaultSearchIndex()
    index.upsert(note('a.md', 'Alpha', 'shared text', { tags: ['work'] }))
    index.upsert(note('b.md', 'Beta', 'shared text', { tags: ['home'] }))

    const results = index.search({ text: 'shared', tag: 'work' })
    expect(results).toHaveLength(1)
    expect(results[0].path).toBe('a.md')
  })

  it('filters by folder', () => {
    const index = new VaultSearchIndex()
    index.upsert(note('work/a.md', 'Alpha', 'shared text'))
    index.upsert(note('home/b.md', 'Beta', 'shared text'))

    const results = index.search({ text: 'shared', folder: 'work' })
    expect(results).toHaveLength(1)
    expect(results[0].path).toBe('work/a.md')
  })

  it('returns every note when there is no query', () => {
    const index = new VaultSearchIndex()
    index.upsert(note('a.md', 'Alpha', 'text'))
    index.upsert(note('b.md', 'Beta', 'text'))
    expect(index.search({})).toHaveLength(2)
  })

  it('respects the result limit', () => {
    const index = new VaultSearchIndex()
    for (let i = 0; i < 10; i++) {
      index.upsert(note(`note${i}.md`, `Note ${i}`, 'repeated content'))
    }
    expect(index.search({ text: 'repeated', limit: 3 })).toHaveLength(3)
  })

  it('removes a note from the index', () => {
    const index = new VaultSearchIndex()
    index.upsert(note('a.md', 'Alpha', 'uniqueword here'))
    expect(index.search({ text: 'uniqueword' })).toHaveLength(1)

    index.remove('a.md')
    expect(index.search({ text: 'uniqueword' })).toHaveLength(0)
  })

  it('replaces a note when it is updated', () => {
    const index = new VaultSearchIndex()
    index.upsert(note('a.md', 'Alpha', 'first version'))
    index.upsert(note('a.md', 'Alpha', 'second version'))

    expect(index.search({ text: 'first' })).toHaveLength(0)
    expect(index.search({ text: 'second' })).toHaveLength(1)
  })

  it('reports the number of matches', () => {
    const index = new VaultSearchIndex()
    index.upsert(note('a.md', 'Alpha', 'cat cat cat'))
    const results = index.search({ text: 'cat' })
    expect(results[0].matchCount).toBe(3)
  })

  it('finds text that only appears in the frontmatter body', () => {
    const index = new VaultSearchIndex()
    index.upsert(note('a.md', 'Alpha', 'regular body text', { body: 'title: FrontmatterValue' }))
    const results = index.search({ text: 'frontmattervalue' })
    expect(results.length).toBeGreaterThan(0)
  })

  it('falls back to a substring scan for punctuation-only queries', () => {
    const index = new VaultSearchIndex()
    index.upsert(note('a.md', 'Alpha', 'a C++ tutorial'))
    const results = index.search({ text: 'C++' })
    expect(results).toHaveLength(1)
  })

  it('respects case sensitivity when asked', () => {
    const index = new VaultSearchIndex()
    index.upsert(note('a.md', 'Alpha', 'CamelCase Word'))

    expect(index.search({ text: 'camelcase', caseSensitive: true })).toHaveLength(0)
    expect(index.search({ text: 'camelcase', caseSensitive: false })).toHaveLength(1)
  })

  it('finds notes by heading text', () => {
    const index = new VaultSearchIndex()
    index.upsert(
      note('a.md', 'Alpha', 'body', { headings: ['Introduction', 'Conclusion'] })
    )
    const results = index.search({ text: 'introduction' })
    expect(results).toHaveLength(1)
  })
})
