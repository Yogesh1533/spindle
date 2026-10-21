/**
 * Creates a sample vault for development and testing.
 *
 * Usage: node scripts/make-sample-vault.mjs [target-folder] [--keep]
 *
 * The generated vault exercises every feature Slate supports: frontmatter,
 * wikilinks, aliases, heading links, embeds, tags, tables, task lists and
 * code blocks.
 *
 * The folder is emptied first so repeated runs always produce the same
 * vault. Pass --keep to add the sample notes without removing anything
 * that is already there.
 */

import { mkdir, writeFile, rm, readdir } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const args = process.argv.slice(2)
const keep = args.includes('--keep')
const target = path.resolve(
  args.find((a) => !a.startsWith('--')) ??
    path.join(os.homedir(), 'Documents', 'Slate Sample Vault')
)

const files = {
  'Welcome.md': `---
title: Welcome
tags:
  - index
  - slate
created: 2026-01-15
---

# Welcome to Slate

This is a **sample vault** for testing. Slate reads and writes plain
Markdown files in place — nothing is converted or migrated.

Try these:

- [[Getting Started]] — how to use the app
- [[Projects]] — a hub note that links outward
- [[Meeting Notes#2026-01-20]] — a link straight to a heading
- [[Reference|Slate Reference]] — a link with an alias
- #daily #sample

## What works here

| Feature | Status |
| ------- | ------ |
| Wikilinks | Yes |
| Backlinks | Yes |
| Tags | Yes |
| Graph | Yes |

- [x] Markdown task lists
- [ ] Something still to do

> A blockquote, for good measure.

\`\`\`js
const note = 'hello'
console.log(note)
\`\`\`
`,

  'Getting Started.md': `---
tags:
  - guide
---

# Getting Started

Slate is a local-first Markdown notebook.

## Opening a vault

Pick **Open a vault** and choose any folder. Slate treats a folder of
plain \`.md\` files as a vault.

## Shortcuts

- \`Cmd+O\` — quick switcher
- \`Cmd+P\` — command palette
- \`Cmd+Shift+F\` — search
- \`Cmd+G\` — graph view
- \`Cmd+D\` — today's daily note
- \`Cmd+E\` — toggle source / preview
- \`Cmd+N\` — new note

See [[Welcome]] and [[Projects]] for more.
`,

  Projects: null,

  'Projects.md': `---
tags:
  - work
  - active
status: in-progress
---

# Projects

A hub note — this is what makes the graph interesting.

## Active

- [[Alpha]] — the first project
- [[Beta]] — the second project
- [[Reference]] — shared reference material

## Notes

Everything links back here, so this note has a lot of backlinks.
`,

  'Alpha.md': `---
tags:
  - work
  - active
---

# Alpha

The first project. Depends on [[Reference]] for the shared spec.

## Timeline

- 2026-01-10 — kickoff
- 2026-01-15 — first draft

## Risks

See [[Beta]] — the two overlap in scope.
`,

  'Beta.md': `---
tags:
  - work
---

# Beta

The second project. Builds on [[Alpha]].

## Status

Waiting on the [[Reference]] spec before starting.
`,

  'Reference.md': `---
tags:
  - reference
  - docs
---

# Reference

Shared material. Several notes point here, so it collects backlinks.
See [[Projects]] for the work this belongs to.

## Conventions

We use kebab-case for file names and title-case headings.

## Glossary

- **Vault** — a folder of Markdown files
- **Wikilink** — a \`[[link]]\` to another note
- **Unresolved link** — [[Not Written Yet]], which does not exist yet
`,

  'Unresolved Links.md': `---
tags:
  - sample
---

# Unresolved Links

This note always points at notes that do not exist, so the app can be
checked for how it renders a link that has no target.

- [[Nowhere Note]] — clicking this should offer to create the note
- [[Also Missing#Somewhere]] — a heading link with no target either
- [[Welcome]] — a link that does resolve, for comparison
`,

  'Meeting Notes.md': `---
tags:
  - meetings
---

# Meeting Notes

## 2026-01-20

Discussed [[Alpha]] and [[Beta]]. Agreed to revisit [[Reference]] next week.

## 2026-01-27

Follow-up on [[Alpha]] — good progress.
`,

  'Ideas.md': `# Ideas

Loose thoughts, linked to [[Projects]].

Some of these might become real projects:

- A tool that renames files and fixes links
- Something with #brainstorm
`,

  'Daily/2026-01-20.md': `---
tags:
  - daily
---

# 2026-01-20

Morning notes. Reviewed [[Alpha]] with the team.

#daily
`,

  'Daily/2026-01-21.md': `---
tags:
  - daily
---

# 2026-01-21

Wrapped up [[Beta]] planning. #daily
`,

  'Archive/Old Idea.md': `# Old Idea

This note lives in a subfolder. Links to [[Alpha]] still resolve.
`,

  'Templates/Daily.md': `---
tags:
  - daily
---

# {{date}}

## Notes

- {{time:HH:mm}} — started writing

## Tasks

- [ ] Plan the day
`,
}

async function main() {
  await mkdir(target, { recursive: true })

  if (!keep) {
    // Start from a clean folder so the vault is always the same. Only
    // Markdown files and folders are removed; anything else is left alone.
    for (const entry of await readdir(target, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      if (entry.isFile() && !entry.name.toLowerCase().endsWith('.md')) continue
      await rm(path.join(target, entry.name), { recursive: true, force: true })
    }
  }

  for (const [relative, content] of Object.entries(files)) {
    if (content === null) continue
    const file = path.join(target, relative)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, content, 'utf8')
  }

  console.log(`Sample vault created at: ${target}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
