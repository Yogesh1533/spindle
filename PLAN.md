# Slate — Plan

A local-first Markdown note-taking app for plain-text folders ("vaults"). Clean-room
implementation: Obsidian is used only as a **behavioural reference** (layout, shortcuts,
file conventions, link resolution). All code, design, icons and branding are original.

---

## 1. Goals & non-goals

**Goals (v1)**
- Open any folder of plain `.md` files as a vault; read/write without migrating it.
- Live-preview Markdown editor with source-mode toggle, tabs, split panes.
- Wikilinks, backlinks, unresolved-link creation, rename-aware link updating.
- Force-directed graph view (global + local) with zoom/pan/filters.
- Full-text search, quick switcher, tag pane, daily notes, command palette.
- File explorer sidebar, dark/light themes, keyboard shortcuts.
- Live filesystem sync: external edits appear without restart.

**Non-goals (v1)**
- No plugins/Community plugins API, no canvas, no bases, no sync service, no mobile.
- No proprietary-file-format of our own. The vault stays plain Markdown.
- No accounts, no network calls.

---

## 2. Architecture

```
┌────────────────────────── Electron main process ──────────────────────────┐
│  main.ts        window lifecycle, menu, theme, IPC wiring                  │
│  vault.ts       vault open/create, file tree, read/write, atomic saves   │
│  watcher.ts     chokidar watcher → debounce → change events               │
│  indexer.ts     in-memory index: notes, links, tags, headings, wordcount  │
│  settings.ts    per-app settings stored OUTSIDE the vault (userData)     │
│  search.ts      inverted index + ranking for full-text search             │
│  ipc.ts         typed request/response channels                          │
└───────────────────────────────────────────────────────────────────────────┘
                                  │ contextBridge
┌────────────────────────── Renderer (React) ───────────────────────────────┐
│  App.tsx        layout shell: ribbon | left pane | editor area | right pane│
│  store/         zustand stores (vault, editor, ui, search)                │
│  editor/        CodeMirror 6 setup, live-preview markdown extension       │
│  components/    FileExplorer, Backlinks, TagPane, Outline, Graph, ...     │
│  dialogs/       QuickSwitcher, CommandPalette, SearchOverlay, TagPicker   │
└───────────────────────────────────────────────────────────────────────────┘
```

### Process split rationale
The **index lives in the main process**. It must survive renderer reloads, and the
watcher + parser are cheaper to run once per vault rather than per React mount.
The renderer talks to it over a narrow typed IPC surface; it receives a serialized
index snapshot and re-renders from it. Writes go main-side so the watcher and the
index stay consistent (no echo loops: writes are tagged with a token).

### Search: in-memory index, not SQLite — justification
A vault is usually thousands of notes, not millions. The working set for a single
vault is comfortably a few MB of text. SQLite would add a native dependency
(`better-sqlite3` → rebuild pain across Electron versions, electron-builder
rebuild hooks, platform matrix) for no practical gain at this scale.

Instead: an **inverted index in memory**, rebuilt incrementally on file change.
- Tokenised postings: `Map<term, Set<notePath>>`, with a prefix term map so
  incremental search-as-you-type works without a trie.
- Fields: title, path, body text, tags, headings.
- Ranking: title match > heading match > body match, with recency tiebreak.
- Rebuild cost is proportional to changed files only, since we re-tokenize
  per-note and merge postings.

Trade-off accepted: index is not persisted, so a cold start re-tokenizes the
vault (fast — ~100ms for 2k notes; a progress state is shown). If a future vault
outgrows RAM, the in-memory index is the component to swap for SQLite/FTS5, and
`src/main/indexer.ts` is deliberately the only module that knows the storage detail.

### Live preview approach
CodeMirror 6 with **two editing modes** rather than a WYSIWYG overlay:
- `source` — plain CodeMirror Markdown.
- `preview` — a `Decoration`-based extension that *hides* Markdown syntax
  markers and *styles* the text underneath (headings, bold, links, code, tables,
  task lists), i.e. a true WYSIWYG-style source editing experience where the
  raw text remains the document.

This is the same strategy Obsidian's "Live Preview" uses in spirit and is far
more robust than a contenteditable overlay: the document stays plain text, so
every keystroke maps to exact source positions, and link/heading navigation
works on real text offsets.

Implementation: an extension that computes a decoration set from the parsed
Markdown AST (markdown-it token stream) and maps token ranges to CM6 ranges.
Syntax is hidden via `Decoration.replace` on the marker ranges; styles via
`Decoration.mark`.

---

## 3. Folder structure

```
slate/
├── electron/
│   ├── main.ts              # app lifecycle, BrowserWindow
│   ├── preload.ts           # contextBridge → window.slate API
│   ├── ipc.ts               # typed IPC handlers
│   ├── vault.ts             # vault model: tree, read, write, rename, create
│   ├── watcher.ts           # chokidar
│   ├── indexer.ts           # in-memory index (notes/links/tags/headings)
│   ├── search.ts            # query + ranking
│   ├── settings.ts          # app settings (outside vault)
│   └── menu.ts              # application menu + shortcuts
├── src/
│   ├── shared/              # types shared by main & renderer
│   │   ├── types.ts
│   │   └── ipc-contract.ts
│   ├── renderer/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── store/           # zustand
│   │   ├── editor/          # CM6 setup, live-preview extension
│   │   ├── components/
│   │   └── styles/
│   └── preload-api.d.ts
├── tests/
│   ├── links.test.ts        # wikilink parsing/resolution
│   ├── rename.test.ts       # rename → link update
│   └── search.test.ts       # search + ranking
├── docs/observations.md     # Obsidian behaviour notes (traceability)
├── scripts/                 # dev/build helpers
├── PLAN.md
└── README.md
```

---

## 4. Vault compatibility rules

- A vault = a folder. Non-`.md` files are listed but not indexed.
- We **never** write into the vault except our own hidden settings folder
  `.slate/` (one JSON file). No migration, no reformatting.
- Reading is always UTF-8; writes preserve existing content byte-for-byte
  except the edited region. Save is atomic (write temp + rename) to avoid
  truncation on crash.
- YAML frontmatter is parsed but **preserved verbatim** on write.
- Files are identified by their **path relative to the vault root** (posix-style
  separators), which is stable across platforms.
- Hidden files/folders (leading `.`) are hidden from the tree by default but
  still indexed if they contain markdown? — **Decision: exclude dot-folders from
  the tree, but still index their `.md` files** (matches Obsidian's "show hidden
  files" toggle existing without forcing it on).

---

## 5. Milestones

| # | Milestone | Contents | Done when |
|---|-----------|----------|-----------|
| 0 | **Scaffold** | Vite + Electron + TS + build scripts, app shell renders | Window opens, hot reload works |
| 1 | **Vault + file explorer** | Open/create vault, tree, read/write, save, watcher, settings | Notes open & save; external edit appears live |
| 2 | **Editor** | CodeMirror 6, live preview, source toggle, tabs, split panes | Markdown renders inline; tabs & splits work |
| 3 | **Wikilinks + backlinks** | Parser, autocomplete, click-to-open, create-on-unresolved, backlinks pane, rename link update | All link forms work; rename updates other notes |
| 4 | **Search + tags** | Full-text index, quick switcher (Cmd+O), tag pane, tag search | Search finds notes; tags listed & filterable |
| 5 | **Daily notes + command palette** | Daily note button, folder/template settings, palette (Cmd+P) | Daily note created with template; palette runs commands |
| 6 | **Graph view** | Force-directed graph, zoom/pan, click-to-open, local graph, filters | Graph renders & is interactive |
| 7 | **Polish** | Themes (dark/light), outline pane, shortcuts, README, tests green | Feature checklist complete |

Each milestone: implement → run the app → verify → commit.

---

## 6. Testing strategy

Unit tests (vitest, no Electron) for the pure logic:
- `tests/links.test.ts` — parsing `[[a]]`, `[[a|b]]`, `[[a#h]]`, `[[a#h|b]]`,
  `![[embed]]`, `#tags`, resolution by path/filename/basename, ambiguity rules,
  frontmatter preservation, escaping.
- `tests/rename.test.ts` — renaming a note rewrites links in other notes, keeps
  aliases, does not touch unrelated text, handles the `#heading` suffix.
- `tests/search.test.ts` — tokenisation, ranking, tag queries, prefix search.

---

## 7. Key decisions & trade-offs

| Decision | Choice | Why |
|----------|--------|-----|
| Index storage | In-memory inverted index | Vaults are small; avoids native SQLite rebuild pain. Swap-in later behind `indexer.ts`. |
| Editor | CodeMirror 6, source-based live preview | Exact text positions, robust, no contenteditable drift. |
| Live preview | Decorations over source text | Same model as source mode; toggling is instant; no dual state. |
| Graph | `d3-force` + SVG | Small dep, full control, no canvas/React wrapper mismatch. |
| Config storage | `app.getPath('userData')` | Keeps the vault pristine — only `.slate/` is ever written inside it. |
| IPC | Typed `invoke`/`on` contract in `src/shared` | Single source of truth for both sides. |

---

## 8. Observed-behaviour traceability

All Obsidian behaviour used as a reference is recorded in
[`docs/observations.md`](docs/observations.md), with the observation method and
confidence for each item. Implementation decisions cite those notes.
