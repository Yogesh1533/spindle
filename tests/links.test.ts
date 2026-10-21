import { describe, expect, it } from 'vitest'
import {
  findHeadings,
  findLinks,
  findTags,
  parseFrontmatter,
  parseLinkTarget,
  parseSimpleYaml,
} from '../src/shared/markdown.js'
import { createResolver, findCandidates, pickBest } from '../src/shared/links.js'

describe('parseLinkTarget', () => {
  it('parses a plain target', () => {
    expect(parseLinkTarget('Some Note')).toEqual({
      target: 'Some Note',
      subpath: null,
      alias: null,
    })
  })

  it('parses an alias', () => {
    expect(parseLinkTarget('Some Note|Alias')).toEqual({
      target: 'Some Note',
      subpath: null,
      alias: 'Alias',
    })
  })

  it('parses a heading', () => {
    expect(parseLinkTarget('Some Note#Section')).toEqual({
      target: 'Some Note',
      subpath: 'Section',
      alias: null,
    })
  })

  it('parses a heading with an alias', () => {
    expect(parseLinkTarget('Some Note#Section|Alias')).toEqual({
      target: 'Some Note',
      subpath: 'Section',
      alias: 'Alias',
    })
  })

  it('parses a block reference', () => {
    expect(parseLinkTarget('Some Note#^block')).toEqual({
      target: 'Some Note',
      subpath: '^block',
      alias: null,
    })
  })

  it('keeps inner hashes in the subpath', () => {
    expect(parseLinkTarget('Note#A#B')).toEqual({
      target: 'Note',
      subpath: 'A#B',
      alias: null,
    })
  })

  it('trims surrounding whitespace', () => {
    expect(parseLinkTarget('  Note  |  Alias  ')).toEqual({
      target: 'Note',
      subpath: null,
      alias: 'Alias',
    })
  })
})

describe('findLinks', () => {
  it('finds a plain wikilink', () => {
    const links = findLinks('See [[Target]] here.')
    expect(links).toHaveLength(1)
    expect(links[0].target).toBe('Target')
    expect(links[0].isEmbed).toBe(false)
    expect(links[0].rawText).toBe('[[Target]]')
  })

  it('finds an embed', () => {
    const links = findLinks('![[image.png]]')
    expect(links[0].isEmbed).toBe(true)
    expect(links[0].target).toBe('image.png')
  })

  it('finds links with aliases and headings', () => {
    const links = findLinks('[[Note#Head|Alias]]')
    expect(links[0].target).toBe('Note')
    expect(links[0].subpath).toBe('Head')
    expect(links[0].alias).toBe('Alias')
  })

  it('records the line number', () => {
    const links = findLinks('line one\nline two [[Target]]\nline three')
    expect(links[0].line).toBe(2)
  })

  it('ignores empty links', () => {
    expect(findLinks('[[]]')).toHaveLength(0)
  })

  it('finds multiple links', () => {
    const links = findLinks('[[One]] and [[Two]] and ![[Three]]')
    expect(links.map((l) => l.target)).toEqual(['One', 'Two', 'Three'])
    expect(links[2].isEmbed).toBe(true)
  })

  it('does not match across nested brackets', () => {
    expect(findLinks('[[a [b] c]]')).toHaveLength(0)
  })

  it('marks links resolved when the resolver finds them', () => {
    const links = findLinks('[[Known]] [[Unknown]]', (target) =>
      target === 'Known' ? 'known.md' : null
    )
    expect(links[0].resolved).toBe(true)
    expect(links[0].resolvedPath).toBe('known.md')
    expect(links[1].resolved).toBe(false)
    expect(links[1].resolvedPath).toBeNull()
  })
})

describe('createResolver', () => {
  const paths = [
    'root.md',
    'folder/note.md',
    'folder/other.md',
    'deep/nested/note.md',
  ]

  it('resolves by exact path', () => {
    const resolve = createResolver(paths)
    expect(resolve('folder/note.md')).toBe('folder/note.md')
  })

  it('resolves by path without the extension', () => {
    const resolve = createResolver(paths)
    expect(resolve('folder/note')).toBe('folder/note.md')
  })

  it('resolves by filename', () => {
    const resolve = createResolver(paths)
    expect(resolve('other.md')).toBe('folder/other.md')
  })

  it('resolves by title', () => {
    const resolve = createResolver(paths)
    expect(resolve('other')).toBe('folder/other.md')
  })

  it('resolves relative to the linking note folder', () => {
    const resolve = createResolver(paths)
    expect(resolve('other.md', { fromPath: 'folder/thing.md' })).toBe('folder/other.md')
  })

  it('returns null for an unknown target', () => {
    const resolve = createResolver(paths)
    expect(resolve('nothing-here')).toBeNull()
  })

  it('is case insensitive', () => {
    const resolve = createResolver(paths)
    expect(resolve('ROOT')).toBe('root.md')
  })

  it('prefers the shallowest path when a name is ambiguous', () => {
    const resolve = createResolver(['a/deep/note.md', 'note.md'])
    expect(resolve('note')).toBe('note.md')
  })

  it('picks the shortest path deterministically', () => {
    expect(pickBest(['x/y/z/note.md', 'note.md', 'a/note.md'])).toBe('note.md')
  })
})

describe('findCandidates', () => {
  it('finds all notes with a matching name', () => {
    const candidates = findCandidates('note', ['a/note.md', 'b/note.md', 'c/other.md'])
    expect(candidates).toEqual(['a/note.md', 'b/note.md'])
  })
})

describe('findTags', () => {
  it('finds inline tags', () => {
    const tags = findTags('Some text #project and #area/sub more')
    expect(tags).toContain('project')
    expect(tags).toContain('area/sub')
  })

  it('ignores tags inside code spans', () => {
    expect(findTags('`#notatag`')).toHaveLength(0)
  })

  it('ignores tags inside fenced code', () => {
    expect(findTags('```\n#notatag\n```')).toHaveLength(0)
  })

  it('ignores URL fragments', () => {
    expect(findTags('see http://example.com/page#section')).toHaveLength(0)
  })

  it('does not treat a mid-word hash as a tag', () => {
    expect(findTags('a#b')).toHaveLength(0)
  })
})

describe('findHeadings', () => {
  it('finds headings with their level', () => {
    const headings = findHeadings('# One\ntext\n## Two\n### Three', 'note.md')
    expect(headings).toHaveLength(3)
    expect(headings[0]).toMatchObject({ level: 1, text: 'One', line: 1 })
    expect(headings[2]).toMatchObject({ level: 3, text: 'Three' })
  })

  it('builds an anchor from the path and heading text', () => {
    const headings = findHeadings('## Section', 'folder/note.md')
    expect(headings[0].anchor).toBe('folder/note.md#Section')
  })

  it('ignores headings inside code fences', () => {
    expect(findHeadings('```\n# not a heading\n```')).toHaveLength(0)
  })

  it('strips trailing hashes', () => {
    expect(findHeadings('## Heading ##')[0].text).toBe('Heading')
  })
})

describe('parseFrontmatter', () => {
  it('splits frontmatter from the body', () => {
    const parsed = parseFrontmatter('---\ntitle: Hello\n---\n\nBody text')
    expect(parsed.raw).toBe('---\ntitle: Hello\n---\n')
    expect(parsed.data).toEqual({ title: 'Hello' })
    expect(parsed.body.trim()).toBe('Body text')
  })

  it('returns the whole text when there is no frontmatter', () => {
    const parsed = parseFrontmatter('Just a body')
    expect(parsed.raw).toBeNull()
    expect(parsed.data).toBeNull()
    expect(parsed.body).toBe('Just a body')
  })

  it('preserves the raw text exactly', () => {
    const raw = '---\na: 1\nb: two\n---\nbody'
    expect(parseFrontmatter(raw).raw).toBe('---\na: 1\nb: two\n---\n')
  })

  it('handles an unterminated frontmatter block as plain text', () => {
    const parsed = parseFrontmatter('---\ntitle: x\nno end')
    expect(parsed.raw).toBeNull()
  })
})

describe('parseSimpleYaml', () => {
  it('parses scalar values', () => {
    expect(parseSimpleYaml('title: Hello\ncount: 3')).toEqual({ title: 'Hello', count: 3 })
  })

  it('strips quotes', () => {
    expect(parseSimpleYaml('title: "Hello"')).toEqual({ title: 'Hello' })
  })

  it('parses list values', () => {
    expect(parseSimpleYaml('tags:\n  - one\n  - two')).toEqual({ tags: ['one', 'two'] })
  })

  it('ignores comments and blank lines', () => {
    expect(parseSimpleYaml('# a comment\n\ntitle: x')).toEqual({ title: 'x' })
  })
})
