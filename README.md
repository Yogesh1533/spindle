# Spindle

A local-first Markdown note-taking app for plain-text folders.

Spindle treats any folder of `.md` files as a **vault** and works on the files in
place. It never converts, migrates or reformats anything: open an existing
Obsidian vault, edit a note, close the app, and the file on disk is exactly the
Markdown you wrote.

---

## Setup

Requires **Node.js 20+** and, for the app itself, a Mac (developed and tested
on macOS; the code is plain cross-platform Electron).

```bash
npm install
```

That's the only install step. There is no native module to compile — the search
index is kept in memory rather than in SQLite, precisely to avoid a
`better-sqlite3` rebuild on every Electron upgrade.

## Running it

### Development (hot reload)

```bash
npm run dev
```

This starts the Vite dev server and Electron side by side. The renderer reloads
when you edit anything under `src/renderer`; editing `electron/` or
`src/shared/` rebuilds the main process and restarts Electron.

### Production build

```bash
npm run build     # bundles the main process and the renderer into dist/
npm start         # builds, then runs Electron against the built output
```

### Packaging

electron-builder is configured, so a macOS `.dmg` can be produced with:

```bash
npm run dist:mac:dmg     # a .dmg in release/
npm run dist:mac          # an unpacked .app in release/ (faster, for testing)
```

The packaged app is `Spindle.app`: the dock, the application menu and the
window title all say **Spindle**, and the dock carries Spindle's own icon.

> A development run (`npm run dev`) is the bare Electron binary, so macOS
> still calls it Electron in the dock — the name and the icon live in the
> application bundle, and only a packaged build has one. Run
> `npm run dist:mac` to get it.

### Other scripts

| Command | What it does |
|---------|--------------|
| `npm test` | Runs the unit tests (vitest) |
| `npm run test:watch` | The same, in watch mode |
| `npm run typecheck` | `tsc --noEmit` over the whole project |
| `npm run icon` | Redraws the logo and rebuilds `build/icon.icns` |
| `node scripts/make-sample-vault.mjs` | Writes a sample vault to `~/Documents/Spindle Sample Vault` |

---

## Using it

Open a folder with **Open a vault…** (or `Cmd+O` when the app menu is focused).
The folder is opened in place — pick any folder of Markdown files.

### Keyboard shortcuts

`Cmd` on macOS, `Ctrl` elsewhere.

| Shortcut | Action |
|----------|--------|
| `Cmd+N` | New note |
| `Cmd+Shift+N` | New folder |
| `Cmd+O` | Quick switcher — jump to a note by name |
| `Cmd+P` | Command palette — run any command by name |
| `Cmd+Shift+F` | Search all notes |
| `Cmd+F` | Find in the current note |
| `Cmd+D` | Today's daily note |
| `Cmd+E` | Toggle reading view / source view |
| `Cmd+G` | Graph view |
| `Cmd+B` | Toggle the file explorer |
| `Cmd+Shift+B` | Toggle the right sidebar |
| `Cmd+S` | Save now (notes also autosave) |
| `Cmd+,` | Settings |

### Layout

- **Ribbon** (far left) — new note, quick switcher, search, daily note, command
  palette, graph, and the right-sidebar panes.
- **File explorer** (left) — the vault as a tree, with a filter box, rename and
  delete actions.
- **Editor** (centre) — tabs across the top, a split pane to the right if you
  ask for one, and the editor below.
- **Right sidebar** — backlinks, outgoing links, tags and the outline.
- **Status bar** (bottom) — word count, active file, cursor position.

### Markdown

Spindle reads and writes standard Markdown, and renders it inline as you type
("reading view"). The source is still plain text underneath, so every keystroke
maps to a real character position.

Supported: YAML frontmatter, `[[wikilinks]]`, `[[note|alias]]`, `[[note#heading]]`,
`![[embeds]]`, `#tags`, headings, **bold**, *italic*, ~~strikethrough~~, `code`,
fenced code blocks, tables, task lists, blockquotes and horizontal rules.

Switch a note between reading view and raw source with `Cmd+E`.

### Links

- Typing `[[` opens a completion list of notes in the vault.
- Clicking a link opens the target note.
- A link to a note that does not exist is drawn differently, and clicking it
  **creates** the note.
- The backlinks pane lists every note that links to the current one, with the
  surrounding text as context.
- Renaming a note rewrites the links pointing at it, in every other note, and
  keeps any `|alias` intact.

### Search

`Cmd+Shift+F` opens full-text search. Results are ranked by where the match
falls — title, then heading, then body. Search can be restricted to a tag or a
folder. The tag pane lists every tag in the vault with a note count, and can
be filtered by typing.

### Daily notes

`Cmd+D` opens today's daily note, creating it if it does not exist. The folder,
the file name format and the template are all configurable in
**Settings** (`Cmd+,`).

A template can contain `{{date}}`, `{{date:YYYY-MM-DD}}`, `{{title}}` and
`{{time:HH:mm}}`.

### Graph view

`Cmd+G` opens a force-directed graph of the vault.

| Action | How |
|--------|-----|
| Pan | Drag the background |
| Zoom | Scroll, or the buttons in the corner |
| Zoom to the pointer | Scrolling keeps the point under the cursor still |
| Open a note | Click a node |
| Inspect a note | Double-click a node — a panel shows its links, backlinks and tags |
| Move a note | Drag it. It stays where you put it, marked as pinned, until you unpin it |
| Fit the graph on screen | `F`, or the ⛶ button |
| Filter the graph | Type in the box at the top; matching notes are highlighted, the rest dimmed |
| Local graph | `L`, or the **Local graph** button — then choose how many hops to include |
| Filter by tag or folder | The two dropdowns; a tag in the inspector filters the graph by it |
| See missing notes | **Unresolved** adds placeholders for links that point at notes that do not exist yet |
| Move between notes | Arrow keys, then `Enter` to open |
| Clear | `Esc` |

Edges carry an arrow, so the direction of a link is visible. When a note is
selected, the edges leaving it are drawn in the accent colour and the edges
arriving at it in blue.

### Coming back to the same place

Spindle remembers which notes were open, in which pane, for each vault — so
reloading the window (`Cmd+R`), or restarting the app, brings back the same
tabs. The session is kept outside the vault, in the app's own settings
folder, one per vault: opening a different vault shows that vault's tabs, not
the ones you left behind.

---

## How it is put together

```
electron/          the main process
  main.ts            window, menu, IPC handlers
  vault.ts           reading, writing, the file tree
  watcher.ts         chokidar, with our own writes filtered out
  indexer.ts         the in-memory index: notes, links, tags, headings
  settings.ts        app settings, stored outside the vault
  session.ts         the open tabs, per vault, also stored outside it
src/shared/         types and helpers used by both processes
  ipc-contract.ts    the channel names, shared so they cannot drift
  dates.ts           daily-note date and template formatting
  links.ts           wikilink parsing, resolution and rewriting
  search.ts          the inverted index and its ranking
src/renderer/      the React app
  editor/            CodeMirror 6, and the live-preview extension
  components/        explorer, editor area, graph, dialogs, settings
  store/             zustand stores
build/              the logo: the SVG it is drawn from, and the .icns
tests/              unit tests for the pure logic
docs/observations.md  what Spindle copied from Obsidian, and how
docs/roadmap.md      what could come next, and why it would be worth it
```

**The index lives in the main process**, so it survives a renderer reload and is
built once per vault rather than once per React mount. The renderer talks to it
over a narrow, typed IPC surface and re-renders from a serialised snapshot.

**The search index is in memory, not SQLite.** A vault is thousands of notes,
not millions — the working set is a few megabytes of text. SQLite would mean a
native dependency that has to be rebuilt for every Electron version and every
platform, for no practical gain at this scale. The in-memory inverted index is
rebuilt incrementally as files change, and `electron/indexer.ts` is the only
module that knows how it is stored, so it can be swapped later without touching
anything else.

**Live preview is a decoration over the source text**, not a rendered document
that is edited in place. The document stays plain Markdown, so link and heading
navigation work on real text offsets and there is no second copy of the content
to keep in sync.

### Vault compatibility

- A vault is a folder of plain `.md` files. Non-Markdown files are shown in the
  tree but not indexed.
- Nothing is written into the vault except the notes you edit. App settings
  live in the OS user-data directory, outside the vault, and dot-folders
  (including another app's `.obsidian/`) are left untouched.
- Frontmatter is parsed but preserved verbatim on write.
- Files are identified by their vault-relative path, with forward slashes on
  every platform.
- Writes are atomic (write to a temporary file, then rename).
- Files changed outside the app appear live, without a restart.

### The logo

Spindle's mark is a **drop spindle** — the tapered tool that twists thread —
with a single thread wound around it. It reads two ways: a spindle holds the
thread together, and a spindle is also the hub of a wheel, which is what a
note's links make it.

The logo is drawn from scratch as vector paths in `scripts/make-icon.mjs`.
That script writes the SVG; the SVG is rasterised with the browser engine
Electron is built on, and the `.icns` is assembled with the macOS tools:

```bash
npm run icon               # redraw, rasterise, and rebuild build/icon.icns
npm run icon -- dark       # the dark-ground version
```

The smaller mark used in the title bar is a hand-drawn reduction of the same
shape, in `src/renderer/components/icons.tsx`.

### Clean-room

Obsidian was used as a **behavioural reference only** — how the layout is put
together, what the shortcuts are, how links resolve, what the file explorer
does. Nothing was decompiled, extracted or copied. Every line of code, every
icon and the whole visual design are original. What was observed, how it was
observed and how confident we are about it are written up in
[`docs/observations.md`](docs/observations.md).

---

## Feature checklist

### Done

**Vault and files**
- [x] Open any folder as a vault; nothing is migrated or reformatted
- [x] Create a vault
- [x] File explorer with folders, a filter box, rename and delete
- [x] New note, new folder
- [x] Live filesystem watching: files added, changed or deleted outside the app appear without a restart
- [x] Autosave, plus `Cmd+S`
- [x] Atomic writes
- [x] Frontmatter preserved verbatim

**Editor**
- [x] Live preview — Markdown renders as you type
- [x] Source-mode toggle (`Cmd+E`)
- [x] Tabs
- [x] Split panes — Cmd/Ctrl-click a note in the sidebar, or a tab, to open it to the right
- [x] Headings, bold, italic, strikethrough, inline code, code blocks, tables, task lists, blockquotes, rules
- [x] Frontmatter rendered as a properties block
- [x] Find in file (`Cmd+F`)
- [x] Adjustable font size

**Links**
- [x] `[[wikilinks]]` rendered as links
- [x] `[[note|alias]]`
- [x] `[[note#heading]]`
- [x] `![[embeds]]`
- [x] Autocomplete on `[[`
- [x] Click a link to open the target
- [x] Unresolved links styled differently
- [x] Clicking an unresolved link creates the note
- [x] Backlinks pane, with context
- [x] Outgoing-links pane
- [x] Unlinked-mention detection
- [x] Renaming a note rewrites the links that point at it
- [x] Heading and list navigation from the outline pane

**Search and tags**
- [x] Full-text search with ranked results (`Cmd+Shift+F`)
- [x] Search restricted to a tag or a folder
- [x] Quick switcher (`Cmd+O`)
- [x] Command palette (`Cmd+P`)
- [x] Tag pane, with a nested tree and counts
- [x] Tag search
- [x] Clicking a tag lists the notes that carry it

**Daily notes**
- [x] Daily note button and `Cmd+D`
- [x] Configurable folder, file name format and template
- [x] Template tokens `{{date}}`, `{{date:FORMAT}}`, `{{title}}`, `{{time:FORMAT}}`

**Graph view**
- [x] Force-directed layout
- [x] Zoom (to the pointer) and pan
- [x] Click a node to open the note
- [x] Double-click a node to inspect it — its links out, its backlinks and its tags
- [x] Drag a node to move it, and pin it where you put it
- [x] Local graph, with a configurable number of hops
- [x] Filter by tag or folder
- [x] Show or hide unresolved links
- [x] Search, which highlights matching notes rather than hiding the rest
- [x] Fit the graph on screen, and keyboard navigation

**Interface**
- [x] Light and dark themes, following the system by default
- [x] Settings modal (`Cmd+,`)
- [x] Status bar with word count, file and cursor position
- [x] Resizable sidebars
- [x] Application menu with the main shortcuts
- [x] Its own name and icon — the dock, the application menu and the window title all say Spindle
- [x] Remembers the open notes, per vault, and restores them after a reload

**Not yet done**
- [ ] Canvas / whiteboard
- [ ] A plugin API
- [ ] Sync or any network feature
- [ ] Mobile
- [ ] Full-text search is not indexed on disk, so a cold start re-reads the vault
- [ ] Multiple windows
- [ ] Drag and drop to reorder files, or to move them between folders

### Deliberately out of scope for v1

No plugin system, no canvas, no sync service, no mobile app, and no format of
our own — the vault stays plain Markdown.

---

## Development

```bash
npm test          # 105 unit tests
npm run typecheck
npm run dev       # hot-reloading development
```

The unit tests cover the parts worth pinning down: wikilink parsing and
resolution, link rewriting on rename, search tokenisation and ranking, and
daily-note date formatting.

Behaviour that needs a real application — the editor, the graph, the file
watcher — is checked by driving the running app over the Chrome DevTools
Protocol. Those scripts live in `scripts/`:

| Script | What it checks |
|--------|----------------|
| `scripts/verify-features.js` | The everyday surface: vault, tree, live preview, links, dialogs, graph |
| `scripts/verify-deep.js` | Unresolved links, rename rewriting, search, tags, settings |
| `scripts/verify-autocomplete.mjs` | Wikilink completion, using real key events |
| `scripts/verify-watch.mjs` | Files changed outside the app |
| `scripts/verify-settings.mjs` | The settings modal and the daily-note template |
| `scripts/verify-headings.mjs` | The outline pane and links that point at a heading |
| `scripts/verify-panes.mjs` | Split panes, the tag pane and its search, the graph filters, the theme |

Run them against a running app:

```bash
scripts/restart-app.sh    # build, launch, and expose a debug port
scripts/verify-all.sh     # run every check and print a summary
```

Or one at a time:

```bash
WS=$(sed 's/^WS=//' /tmp/spindle.ws)
node scripts/cdp-probe.mjs "$WS" scripts/verify-features.js
```

---

## Licence

MIT.
