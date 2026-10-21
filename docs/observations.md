# Obsidian 1.14.4 — Behavioural Observations

Clean-room reimplementation reference. Everything here was **observed at runtime** unless
explicitly marked otherwise. No Obsidian source, CSS, icon bytes, or branding are reproduced;
descriptions are in plain behavioural terms.

**Target:** Obsidian 1.14.4 (Electron 43.7.7 / Chromium 150.0.7871.250), macOS, bundle id `md.obsidian`.
**Renderer URL:** `app://obsidian.md/index.html` (a vault-aware page) /
`app://obsidian.md/starter.html` (the vault-picker page).

---

## 0. How these observations were made (method + confidence)

| # | Method | Result |
|---|--------|--------|
| 1 | `mcp__rea__capture_electron_scenario` | **Not usable.** A pre-existing Obsidian instance holds the single-instance lock, and the tool launches a *fresh* process, which exits immediately. The task's own constraint note predicted this. |
| 2 | `mcp__rea__list_browser_targets` against the live CDP endpoint | **Reached the endpoint** (returned the Electron/Chromium banner: `obsidian/1.14.4 Chrome/150.0.7871.250 Electron/43.7.7`), but returned `targets: []` with `excluded: {unsupported_url: 1}` — the `app://` scheme is not an HTTP(S) origin, so the target is filtered out. |
| 3 | `mcp__rea__inspect_web_page` against the same target | **Hard failure:** `target_unavailable` — *"Target … must be an HTTP(S) page in the selected origin scope."* This confirms the task's warning: REA's browser family cannot attach to `app://`. |
| 4 | `mcp__rea__inspect_electron_page` | Not applicable — it requires a `file://` page target, and Obsidian's renderer is `app://`. |
| 5 | **Direct Chrome DevTools Protocol over the WebSocket** (custom ~60-line Node client, no third-party deps) | **This is what worked.** It gave full read access to the live renderer: DOM, computed classes, the live `window.app` object, metadata cache contents, and PNG screenshots. All "observed in renderer DOM" claims below come from this. |

**Two practical notes for anyone repeating this:**

- `Runtime.evaluate` with `awaitPromise: true` and `returnByValue: true` is the workhorse.
  Deep or circular return values blow up with *"Object reference chain is too long"* —
  coerce inside the expression (`String(x)`, `JSON.stringify(x)`) before returning.
- **Do not leave a `Runtime.evaluate` promise pending.** The CDP HTTP endpoint accepted
  the TCP connection but stopped answering entirely after one evaluation hung, and the
  app could not be revived without a restart. Always wrap evaluations in a timeout and
  prefer short, non-blocking expressions.
- Some interactions need **real input events**, not programmatic dispatch: typing `[[`
  into the editor only opened the autocomplete widget when sent as
  `Input.dispatchKeyEvent`, not when dispatched into CodeMirror directly.

### Getting an isolated instance to observe (important operational note)

`--user-data-dir` alone is **not enough isolation**. On the first attempt, a second Obsidian
process was launched with `--user-data-dir=/tmp/slate-obs/odata` and a vault path argument.
It opened the **real** vault `/Users/yogesh/Documents/Obsidian Vault` and rewrote that
vault's `.obsidian/{app,appearance,core-plugins,workspace}.json` (timestamps bumped;
`workspace.json` content changed to the graph/NoteA layout). **Content files
(`Welcome.md`, `create a link.md`, `Untitled.base`) were not modified**, and the *other* real
vault (`/Users/yogesh/Documents/Content`) was untouched.

Cause: Obsidian's vault registry is keyed by a hash of the vault path, and the "open vault"
decision is taken from the app's shared state, not purely from `--user-data-dir`. The
path argument alone did not win over the persisted "open" flag.

**Mitigation that worked:** pre-seed the isolated profile's `obsidian.json` with a registry
that contains *only* the sandbox vault and marks it `open: true`, launch with a distinct
`--user-data-dir` and a distinct `--remote-debugging-port`, and confirm the log line
`Received file path …` is followed by the app loading `app://obsidian.md/index.html`
(a loaded vault) rather than `starter.html` (the picker).

> **Safety note for future runs:** treat the two real vaults as write-protected. Always
> pre-seed the registry before launching, and verify the loaded target URL is
> `index.html` (vault loaded) and not `starter.html`. `sandbox-exec` seatbelt containment
> was attempted but the nested sandbox failed on this machine
> (*"sandbox initialization failed: Operation not permitted"*).
> A backup of the real vault configs was taken to `/tmp/slate-obs/backup/` during the run.

**All write experiments below were performed in the sandbox vault `/tmp/slate-obs/obsvault`.**
The two real vaults were not used as a test target.

---

## 1. Overall layout

**Confidence: high — observed in renderer DOM and in screenshots.**

### Top-level structure

The app shell is a set of horizontally-arranged "splits" inside a single container. Observed
classes (own words: these are structural roles, described here as roles):

- **Left rail / ribbon** — a narrow vertical strip of icon buttons, leftmost.
  Observed ribbon actions, in order, each carrying an `aria-label`:
  `Open quick switcher`, `Open graph view`, `Create new canvas`, `Open today's daily note`,
  `Insert template`, `Open command palette`, `Create new base`.
  The last two in that list are **not** in the older default set — they are additions in
  1.14.x alongside Canvas and Bases. The ribbon's visible-item set is persisted per vault in
  `workspace.json` under `left-ribbon.hiddenItems`, keyed by **command id** (not label).

- **Left sidebar** — a resizable split (`width: 300px` by default) holding a **tab strip**
  with three tabs by default:
  - `Files` (file explorer) — icon `lucide-folder-closed`
  - `Search` — icon `lucide-search`
  - `Bookmarks` — icon `lucide-bookmark`

  Each tab's state is persisted in `workspace.json` as a leaf with `state.type` plus a
  `state.state` object of that pane's own options (e.g. file-explorer has
  `sortOrder`, `autoReveal`, `showSearch`, `searchQuery`).

- **Main area** — a split containing a **tab strip** of note/leaf tabs. Observed live:
  two tabs, `Graph view` and `NoteA`, with `currentTab: 1` persisted. Each leaf persists
  `state.type` (`markdown` | `graph` | `search` | `file-explorer` | `backlink` | …),
  a `state.state` payload, an `icon` name, and a `title`.

- **Right sidebar** — a resizable split (default `width: 300`), also a tab strip, with
  five tabs by default:
  - `Backlinks` — icon `links-coming-in`
  - `Outgoing links` — icon `links-going-out`
  - `Tags` — icon `lucide-tags`
  - `All properties` — icon `lucide-archive`
  - `Outline` — icon `lucide-list`

  The right sidebar can be **collapsed**; when collapsed its split element carries
  `is-sidedock-collapsed` and an inline `width: 0px; display: none;`. When a sidebar is
  empty it renders the placeholder text *"The sidebar is empty, try dragging a tab here."*

- **Status bar** — bottom strip of the main area. In the live run it read:
  `3 backlinks` · `3 properties` · `22 words` · `145 characters`, plus a reading-mode
  toggle at the far right. The `3 backlinks` count matches the three source files that link
  to NoteA (NoteB, NoteC, SubNote). The `3 properties` count matches the three frontmatter
  keys (title, tags, status).

### Tab-strip and pane chrome (accessible names observed)

Each leaf in the main area carries its own set of tab-strip controls, identifiable by
their `aria-label`s:

- `Navigate back` · `Navigate forward` — per-tab history navigation.
- `Bookmark` — bookmark the current tab; the Bookmarks sidebar view lists bookmarks by
  name with a `Close` button each.
- `More options` — the per-tab overflow menu.
- `New tab` — the `+` at the end of the tab strip.
- `New group` — appears in the tab-strip overflow, i.e. a tab group can be created
  (the workspace layout supports groups, not just tabs).
- `Collapse all` — on the file-explorer tab specifically (an alternative label for the
  same "expand/collapse all folders" affordance).
- The **view-mode toggle** in the note tab carries a multi-line accessible name:
  > `Current view: editing`
  > `Click to read`
  > `⌘+Click to open to the right`

  so the same button cycles editing ⇄ reading on click, and opens the note in a split
  to the right on ⌘-click. (Its "current view" state is announced in the label itself.)

**Confidence: high — these are literal `aria-label` strings read from the live DOM.**

### Toggling

- Left/right sidebars have dedicated commands: `app:toggle-left-sidebar`,
  `app:toggle-right-sidebar` (**no default hotkey bound** in the observed install).
- The ribbon has `app:toggle-ribbon`.
- A body class `show-ribbon` / `show-view-header` / `show-inline-title` is present when those
  chrome pieces are on, so visibility is class-driven on `<body>`.
- Body classes observed: `mod-macos is-frameless is-hidden-frameless obsidian-app theme-light
  show-inline-title is-floating-nav auto-full-screen show-ribbon show-view-header`.
  `mod-macos`, `is-frameless`, `is-hidden-frameless` indicate the macOS title bar is hidden.

### Tab model

- A split holds `tabs`; a `tabs` node holds `leaf` children; a leaf holds a `state`.
- `direction` is `"horizontal"` for the side docks and `"vertical"` for the main split.
- Each side-dock split has its own `width`; the right dock also has `collapsed`.
- Workspace-level keys observed: `main`, `left`, `right`, `left-ribbon`, `active` (id of the
  active leaf), and `lastOpenFiles` (an array of file URIs, most-recent-first, mixing
  `file:/…` absolute URIs and bare relative names).

### Vault picker (first-run)

**Confidence: high — observed in renderer DOM of `app://obsidian.md/starter.html`.**

The picker is a page with body classes `theme-dark starter is-frameless is-hidden-frameless
mod-macos is-focused`. Visible headings and buttons, in order:

- `Version 1.14.4`
- **Quick start** (primary CTA button)
- **Create new vault** — "Create a new Obsidian vault under a folder." → button `Create`
- **Open folder as vault** — "Choose an existing folder of Markdown files." → button `Open`
- **Open vault from Obsidian Sync** — "Set up a synced vault with existing remote vault." → button `Sign in`
- A language picker listing ~50 locales (English, English (GB), Deutsch, Español, Français,
  日本語, 简体中文, 繁體中文, …) — so localisation is present, and the installed locale here is
  `en-GB` (from the Electron helper's `--lang=en-GB` flag).
- A `recent-vaults` region that is present in the DOM but `display: none` when empty.

---

## 2. Keyboard shortcuts

**Confidence: high — observed live.** The full registry of **204 commands** with their bound
hotkeys was read out of the running app's command registry. `Mod` in Obsidian's own notation
means Cmd on macOS and Ctrl elsewhere; on this Mac `Mod` resolves to `Meta`.

### Confirmed default hotkeys (macOS, as bound in the live install)

**Global / workspace**

| Command id | Human name | Hotkey |
|---|---|---|
| `command-palette:open` | Open command palette | `Mod+P` |
| `switcher:open` | Open quick switcher | `Mod+O` |
| `file-explorer:new-file` | Create new note | `Mod+N` |
| `file-explorer:new-file-in-new-pane` | Create note to the right | `Mod+Shift+N` |
| `workspace:new-tab` | New tab | `Mod+T` |
| `workspace:new-window` | New window | *(none bound)* |
| `workspace:close` | Close current tab | `Mod+W` |
| `workspace:close-window` | Close window | `Mod+Shift+W` |
| `workspace:undo-close-pane` | Undo close tab | `Mod+Shift+T` |
| `app:open-settings` | Open settings | `Mod+,` |
| `app:go-back` | Navigate back | `Mod+Alt+ArrowLeft` |
| `app:go-forward` | Navigate forward | `Mod+Alt+ArrowRight` |
| `app:open-help` | Open help | `F1` |
| `graph:open` | Open graph view | `Mod+G` |
| `global-search:open` | Search in all files | `Mod+Shift+F` |
| `workspace:copy-url` | Copy Obsidian URL for current file | *(none bound)* |

**Editor**

| Command id | Human name | Hotkey |
|---|---|---|
| `markdown:toggle-preview` | Toggle reading view | `Mod+E` |
| `editor:toggle-source` | Toggle Live Preview/Source mode | *(none bound)* |
| `editor:open-search` | Search current file | `Mod+F` |
| `editor:open-search-replace` | Search & replace in current file | `Mod+Alt+F` |
| `editor:save-file` | Save current file | `Mod+S` |
| `editor:follow-link` | Follow link under cursor | `Alt+Enter` |
| `editor:open-link-in-new-leaf` | Open link under cursor in new tab | `Mod+Enter` |
| `editor:open-link-in-new-window` | Open link under cursor in new window | `Mod+Alt+Shift+Enter` |
| `editor:open-link-in-new-split` | Open link under cursor to the right | `Mod+Alt+Enter` |
| `editor:insert-link` | Insert Markdown link | `Mod+K` |
| `editor:toggle-bold` | Toggle bold | `Mod+B` |
| `editor:toggle-italics` | Toggle italics | `Mod+I` |
| `editor:toggle-checklist-status` | Toggle checkbox status | `Mod+L` |
| `editor:toggle-comments` | Toggle comment | `Mod+/` |
| `editor:delete-paragraph` | Delete paragraph | `Mod+D` |
| `workspace:edit-file-title` | Rename file | `F2` |
| `editor:rename-heading` | Rename this heading… | *(none bound)* |

**Tab navigation** — `Mod+1` … `Mod+9` jump to tab #1–#9; `Mod+9` is bound to
"Go to last tab" and `Mod+1`–`Mod+8` to the numbered tabs.

| Command id | Human name | Hotkey |
|---|---|---|
| `workspace:next-tab` | Go to next tab | `Ctrl+Tab` **or** `Meta+Shift+]` |
| `workspace:previous-tab` | Go to previous tab | `Ctrl+Shift+Tab` **or** `Meta+Shift+[` |
| `workspace:goto-last-tab` | Go to last tab | `Mod+9` |

**Sidebar / layout**

| Command id | Human name | Hotkey |
|---|---|---|
| `app:toggle-left-sidebar` | Toggle left sidebar | *(none bound)* |
| `app:toggle-right-sidebar` | Toggle right sidebar | *(none bound)* |
| `app:toggle-ribbon` | Toggle ribbon | *(none bound)* |
| `workspace:split-vertical` | Split right | *(none bound)* |
| `workspace:split-horizontal` | Split down | *(none bound)* |

**Many important commands have NO default hotkey** (verified by the empty `hotkeys` array in
the live registry), notably: *New window*, *Toggle Live Preview/Source mode*,
*Toggle left/right sidebar*, *Toggle ribbon*, *Split right*, *Split down*,
*Open today's daily note*, *Open graph view* (the local-graph variant), *Insert template*,
*Show backlinks*, *Show outgoing links*, *Show outline*, *Show tags*,
*Show all properties*, *Show file properties*, *Open quick switcher* is bound but
*Open command palette* is bound to `Mod+P` while *Open file from outside the vault* is not.

> Note on the task brief's "known defaults": several listed there are **not** the shipped
> defaults in this 1.14.4 install. Specifically `Cmd+Shift+E` (toggle reading view) and
> `Cmd+Alt+O` (quick switcher) are **not** bound — reading view is `Mod+E` and quick
> switcher is `Mod+O`. `Cmd+Shift+N` in this build is *"Create note to the right"*, not
> "new window". `Cmd+Ctrl+N` (new tab) is **not** bound; new tab is `Mod+T`. New window
> and *toggle reading view* are the two in the brief that are simply absent from the
> bound list. This discrepancy is worth resolving before implementing — the brief may be
> describing a different build or a different platform.

### Hotkey storage

Hotkeys live in a `keymap` object on the app with a **scope tree** (`rootScope`, each scope
having `keys`, `parent`, `win`, `tabFocusContainerEl`) and a `modifiers` field
(`"Meta"` on this Mac). Hotkeys are per-scope, so the same key can mean different things in
the editor vs. the global scope.

### The Hotkeys settings tab — a second, independent source

**Confidence: high — read from the rendered Settings UI.** Settings → Hotkeys lists
**exactly 204 rows** — one per command, matching the 204 commands in the live registry.
Unbound commands show the literal text **`Blank`** as their shortcut.

Only **41 of the 204** commands are bound. Rendered with macOS glyphs, the full bound set
is:

| Shortcut (as shown) | Command |
|---|---|
| `⌘ ;` | Add file property |
| `⌘ W` | Close current tab |
| `⌘ ⇧ W` | Close window |
| `⌘ P` | Command palette: Open command palette |
| `⌘ N` | Create new note |
| `⌘ ⇧ N` | Create note to the right |
| `⌘ D` | Delete paragraph |
| `⌥ Enter` | Follow link under cursor |
| `⌘ 9` | Go to last tab |
| `⌃ Tab` / `⌘ ⇧ ]` | Go to next tab |
| `⌃ ⇧ Tab` / `⌘ ⇧ [` | Go to previous tab |
| `⌘ 1` … `⌘ 8` | Go to tab #1 … #8 |
| `⌘ G` | Graph view: Open graph view |
| `⌘ K` | Insert Markdown link |
| `⌘ ⌥ ←` | Navigate back |
| `⌘ ⌥ →` | Navigate forward |
| `⌘ T` | New tab |
| `F1` | Open help |
| `⌘ Enter` | Open link under cursor in new tab |
| `⌘ ⌥ ⇧ Enter` | Open link under cursor in new window |
| `⌘ ⌥ Enter` | Open link under cursor to the right |
| `⌘ ,` | Open settings |
| `⌘ O` | Quick switcher: Open quick switcher |
| `F2` | Rename file |
| `⌘ S` | Save current file |
| `⌘ ⌥ F` | Search & replace in current file |
| `⌘ F` | Search current file |
| `⌘ ⇧ F` | Search: Search in all files |
| `⌘ B` | Toggle bold |
| `⌘ L` | Toggle checkbox status |
| `⌘ /` | Toggle comment |
| `⌘ I` | Toggle italic |
| `⌘ E` | Toggle reading view |
| `⌘ ⇧ T` | Undo close tab |

This table is the authoritative default set. It **agrees with the live command registry**
in every row, which is a useful cross-check: the two sources did not disagree once.

### Settings UI structure (observed)

**Confidence: high — observed in the live renderer.**

Settings opens as a **side dock** (`.side-dock-settings`), not a modal — the rest of the
workspace stays visible behind it. It has:

- A **tab list** of 9 application tabs:
  `General` · `Appearance` · `Interface` · `Editor` · `Files and links` · `Hotkeys` ·
  `Keychain` · `Core plugins` · `Community plugins`
  (ids: `about`, `appearance`, `interface`, `editor`, `file`, `hotkeys`, `keychain`,
  `plugins`, `community-plugins`).
- A separate list of **core-plugin sub-tabs**, including: `Backlinks`, `Canvas`,
  `Command palette`, `Daily notes`, `File recovery`, `Note composer`, `Page preview`,
  `Quick switcher`, `Sync`, `Templates`.
- Each **setting item** is a row with a **name**, an optional **description**, and a
  **control**. Observed control types: `dropdown` (a custom dropdown button showing all
  the available options inline), `combobox-button mod-file` (a file picker),
  `checkbox-container` (a toggle; `is-enabled` when on), and a plain `input` for
  text values.
- Setting groups are introduced by a **section heading row** with only a name
  (observed headings: `Links`, `Delete`, `Advanced` in Files and links).

### Settings → Files and links (observed, complete)

**Confidence: high — read from the live settings UI.**

| Setting | Description | Observed control / value |
|---|---|---|
| Default file to open | "Choose which file to open when the app starts." | dropdown: `Last opened` / `New note` / `Specific file` / `Daily note` |
| File to open | "Select a specific file to open by default." | file picker (empty) |
| Always focus new tabs | "When you open a link in a new tab, switch to it immediately." | toggle, **on** |
| Default location for new notes | "Where newly created notes are placed." | dropdown: `Vault folder` / `Same folder as current file` / `In the folder specified below` |
| Folder to create new notes in | "Newly created notes will appear under this folder." | text (empty) |
| Default location for new attachments | "Where newly added attachments are placed." | dropdown: `Vault folder` / `Same folder as current file` / `In subfolder under current folder` / `In the folder specified below` |
| Attachment folder path | "Place newly created attachment files … in this folder." | text (empty) |
| Subfolder name | "If your file is under “vault/folder”, and you set subfolder name to “attachments”, attachments will be saved to “vault/folder/attachments”." | text (empty) |
| **Links** | *(section heading)* | |
| New link format | "What links to insert when auto-generating internal links." | dropdown: `Shortest path when possible` / `Relative path to file` / `Absolute path in vault` |
| Automatically update internal links | "Turn off to be prompted to update links after renaming a file." | toggle, **off** (hence the "Update links" prompt appears) |
| Use [[Wikilinks]] | "Auto-generate Wikilinks for [[links]] and ![[images]] instead of Markdown links and images. Disable this option to generate Markdown links instead." | toggle, **on** |
| Detect all file extensions | "Show files with any extension even if Obsidian cannot open them natively, so that you can link to them and see them in File Explorer and Quick switcher." | toggle, **off** |
| **Delete** | *(section heading)* | |
| Confirm before deleting files | "Avoid accidentally deleting files." | toggle, **on** |
| Delete attachments when deleting files | "Automatically remove attachments linked to the deleted file if they're not used elsewhere." | dropdown: `Ask each time` / `Always` / `Never` |
| Deleted files | "What happens to a file after you delete it." | dropdown: `Move to system trash` / `Move to Obsidian trash (.trash folder)` / `Permanently delete` |
| **Advanced** | *(section heading)* | |
| Excluded files | "Excluded files will be hidden in Search, Graph View, and Unlinked Mentions, less noticeable in Quick switcher and link suggestions." | list |
| Override configuration folder | "Use a different configuration folder than the default one. Must start with a dot." | text (empty) |
| Allow URI callbacks | "Enable the use of x-callback-url through x-success or x-error when handling Obsidian URIs." | toggle |
| Rebuild vault cache | "Rebuilding the cache could take a few seconds to a few minutes depending on the size of your vault." | button |

Note the **"Detect all file extensions"** setting is **off** by default, yet the file
explorer and the `[[` autocomplete both listed `Untitled.base` — so at least some
non-Markdown extensions are always surfaced. Worth re-checking the exact boundary
(possibly the Bases plugin registers `.base` natively).

---

## 3. Wikilink behaviour

**Confidence: high for parsing/resolution (observed via the live metadata cache and
rendered DOM); medium for the exact new-file dialog wording (inferred from the app's own
behaviour + command registry, not directly observed).**

### Parsing

From the live metadata cache for a note containing
`[[NoteB]]`, `[[NoteB|aliased B]]`, `[[NoteC#Heading One]]`, `[[Missing Note]]`:

| Source text | `link` | `displayText` |
|---|---|---|
| `[[NoteB]]` | `NoteB` | `NoteB` |
| `[[NoteB|aliased B]]` | `NoteB` | `aliased B` |
| `[[NoteC#Heading One]]` | `NoteC#Heading One` | `NoteC > Heading One` |
| `[[Missing Note]]` | `Missing Note` | `Missing Note` |

Observations:
- The `link` field keeps the **full target including the `#heading` subpath**; the
  heading is *not* split off at parse time.
- The `displayText` for a heading link is rendered with a **space-joined arrow** separator:
  `NoteC > Heading One` — this is the display form used in the link preview/popover.
- Each link records a `position` with `start`/`end` `{line, col, offset}` — 0-based line and
  column, character offset into the file.
- The `original` field keeps the raw source text including the brackets and alias.

### Resolution rules (measured with the live `getFirstLinkpathDest`)

| Linkpath typed | Resolves to |
|---|---|
| `NoteB` | `NoteB.md` |
| `NoteB.md` | `NoteB.md` |
| `notea` | `NoteA.md` |
| `NOTEA` | `NoteA.md` |
| `NoteC` | `NoteC.md` |
| `NoteC#Heading One` | **null** (the heading fragment is not part of path resolution) |
| `NoteC#nonexistent heading` | null |
| `Subfolder/SubNote` | `Subfolder/SubNote.md` |
| `SubNote` | `Subfolder/SubNote.md` |
| `Missing Note` | null |

So, confirmed:
1. **Case-insensitive** — `notea` and `NOTEA` both resolve to `NoteA.md`.
2. **The `.md` extension is optional** in the linkpath, and is accepted when present.
3. **Paths are vault-relative**, using `/` separators, and may omit the folder
   (`SubNote` found `Subfolder/SubNote.md`).
4. **A bare filename resolves across the whole vault** — a link to `SubNote` finds
   `Subfolder/SubNote.md` even though the link lives at the vault root.
5. **Heading fragments are excluded from path resolution.** `NoteC#Heading One` does **not**
   resolve as a file. The heading is resolved separately, at navigation time, against the
   already-resolved file.

### Rendering

- A resolved link renders as clickable text in the note's accent colour, underlined.
  Resolved and unresolved links are **distinguished by class**: an unresolved link carries
  the class `is-unresolved` and renders in a **muted/faded** colour (observed: light purple
  vs. the saturated purple of resolved links).
- `[[NoteB]]` renders as the target's **basename** (`NoteB`).
- `[[NoteB|aliased B]]` renders **only the alias** (`aliased B`) — the target path is not
  shown.
- `[[NoteC#Heading One]]` renders as the **full raw target text including the `#`**
  (`NoteC#Heading One`), not the arrow form used in the link preview. This differs from
  the `displayText` in the metadata cache, so the arrow form belongs to the hover popover,
  not the inline rendering.
- Inline `#tags` render as a pill with a tinted background and monospace-ish styling.

### Clicking an unresolved link

**Confidence: high — directly observed in the live renderer.**

Clicking an unresolved link **silently creates the note — there is NO dialog, NO prompt,
and no confirmation**. Verified by dispatching a real mouse click on the rendered
`Missing Note` link in NoteA:

- Before: the file list had no `Missing Note.md`.
- After the click: the vault contained a **new `Missing Note.md`** at the **vault root**
  (not in a subfolder), it was **opened in the current tab**, and the status bar updated
  to `1 backlink` / `0 words` / `0 characters`.

The exact default filename offered is therefore **`<link target text>.md`** — the raw
link text with `.md` appended, spaces preserved, at the vault root. There is no
"create note" step to confirm; the creation is immediate.

The unresolved link renders as:
`<span class="is-unresolved"><span class="cm-underline" tabindex="-1" draggable="true">Missing Note</span></span>`
— i.e. an inline `<span>` (not an `<a>`), with the target text in a child span that
carries a class marking it as an underline, plus `tabindex="-1"` and `draggable="true"`.
Resolved links render as real `<a>` elements with an `href`.

### Frontmatter `aliases` do NOT resolve wikilinks

**Confidence: high — directly observed.** A note with
`aliases: [MyAlias, Second]` in its frontmatter:

- `getFirstLinkpathDest('MyAlias', …)` → **null** (does not resolve to `Aliased.md`).
- `getLinkpathDest('MyAlias', '')` → **empty array**.
- Opening `[[MyAlias]]` from a note **created a brand-new `MyAlias.md`** rather than
  opening the aliased file. Same for `[[Second]]`.
- The alias *is* parsed and stored: the file cache's `frontmatter` object contains
  `aliases: ["MyAlias","Second"]`, and the property registry lists `aliases` as a
  known property key.

So frontmatter `aliases` are **display metadata** (e.g. shown in the note's title
area / search results) but **not** link targets. The `aliases` key is one of two
**reserved property keys** (see §8).

### Ambiguous basenames

**Confidence: high — directly observed.** With two files both named `Dup.md`
(`FolderA/Dup.md` and `FolderB/Dup.md`):

| Linkpath | Resolves to |
|---|---|
| `Dup` | `FolderA/Dup.md` |
| `dup` | `FolderA/Dup.md` |
| `FolderA/Dup` | `FolderA/Dup.md` |
| `FolderB/Dup` | `FolderB/Dup.md` |
| `FolderB/Dup.md` | `FolderB/Dup.md` |

A **bare basename resolves to the first match in vault order** (alphabetically first
folder) with **no disambiguation prompt**. A path-qualified linkpath always wins.


### Unresolved-link bookkeeping

The live metadata cache exposes `unresolvedLinks` keyed by **source** file path, mapping
target linkpath → occurrence count. In the observed sandbox, `NoteA.md` had exactly one
unresolved target, `Missing Note` (count 1); all other files had none.

### The `[[` autocomplete popup — DIRECTLY OBSERVED

**Confidence: high — observed by driving real key events into the editor.**

Typing `[[` in a note opens a **suggestion popup** below the caret. Observed structure:

- A container with a **list of suggestion rows**, each row carrying a
  **title** (the target name) and an optional **note** (the containing folder path).
- A **footer bar** with three static hints:
  `Type #to link heading` · `Type ^to link blocks` · `Type |to change display text`
  (i.e. while the popup is open, `#`, `^` and `|` have special meanings).
- Rows are **collapsible tree items** — a row for `2026-10-21` had a child container for
  its `#heading` sub-targets.

With an empty query `[[` the popup listed every note in the vault, in this order:

| Title | Folder shown |
|---|---|
| `NoteA` | — |
| `Unlinked` | — |
| `Untitled.base` | — |
| `2026-10-21` | `Daily/` |
| `SubNote` | `Subfolder/` |
| `NoteC` | — |
| `NoteB` | — |
| `Missing Note` | — |

Observations:
- The title is the **basename**; the folder is shown as a **secondary line** only when
  the file is in a subfolder. Files at the vault root show no folder.
- The order is **not alphabetical** and **not the file-explorer order** — it looks like
  a recency/frequency ranking (the most recently opened files came first:
  `NoteA` was the active file, `Unlinked` and `Untitled.base` were in `lastOpenFiles`).
- **Unresolved links are included in the suggestions** (`Missing Note` appeared even
  though no such file existed).
- **Non-Markdown files are included** (`Untitled.base`).
- Typing more characters **filters** the list. Typing `a` narrowed the list to
  `NoteA`, `Untitled.base` and `2026-10-21` — a **substring match on the title**, not a
  prefix match (all three contain "a", but only `NoteA` starts with "a"; `Untitled.base`
  and `2026-10-21` do not).
- `Escape` dismisses the popup without inserting anything.

The suggestion engine is exposed as `metadataCache.getLinkSuggestions(query)`, which
returned an array of `{file, path}` objects (paths **without** the `.md` extension, and
**including** the `Daily/` or `Subfolder/` folder prefix for nested files) plus entries
for frontmatter-derived items.

---

## 4. Backlinks panel

**Confidence: high — observed in the live renderer DOM and via the metadata cache.**

- The pane is titled `Backlinks` and has its own toolbar of small icon buttons
  (collapse-all, sort, copy/export, and a search magnifier) in the header.
- Content is split into two labelled sections:
  - **`Linked mentions`** — with a **count on the right** (observed `3`).
  - **`Unlinked mentions`** — shown in a **muted/greyed** style (observed `0`), and
    **collapsed by default** (the pane state has `unlinkedCollapsed: true`).
- Pane state options (persisted in `workspace.json`): `collapseAll`, `extraContext`,
  `sortOrder` (`alphabetical`), `showSearch`, `searchQuery`, `backlinkCollapsed`,
  `unlinkedCollapsed`.
- **Each linked-mention entry is a group**: a collapsible header showing the **source
  file's name** and a **per-file count** on the right (observed `1` for each), and under it
  one **context card** per occurrence.
- The **context card** shows the source line's text with the link target **highlighted** in
  a yellow/amber background. Observed example from `NoteB.md`:
  `Back to [[NoteA]].` with `[[NoteA]]` highlighted.
  The card shows the **line** containing the link, not a large surrounding context window —
  the `extraContext` option (default off) controls whether extra surrounding lines are
  included.
- The source file name in the header is a **clickable** element that opens that file.

### Linked vs. unlinked mentions

- **Linked mention** — the target appears as an actual `[[wikilink]]` somewhere in the
  source file. Found via the metadata cache's backlink index
  (`getBacklinksForFile(file).data` is a `Map` of source path → array of link records).
- **Unlinked mention** — the target's **plain text** appears in another file without
  being a wikilink. **Directly verified**: a file containing
  `This document talks about NoteA quite often.` produced an unlinked mention for NoteA,
  shown in the pane as a source-file group with the **matched plain-text run
  highlighted** (same amber highlight as the link highlights) inside the context line.
  A second file mentioning "Note B" *with a space* produced **no** match for `NoteB`,
  confirming the matcher requires the **exact contiguous target string** (no
  whitespace/word-splitting tolerance) by default.
  The section is **collapsed by default** (`unlinkedCollapsed: true` in the pane state);
  it must be expanded to reveal the results, which is why an unlinked mention can look
  absent at a glance.
  **Confidence: high for the mechanism; the "Exact match" vs "any occurrence" setting
  was not varied.**
- There is **no** `getUnlinkedMentions` method on this build's metadata cache
  (confirmed absent), so unlinked mentions are computed by the pane itself, not exposed
  as cache data.

### Outgoing links pane

Symmetric pane, titled `Outgoing links`, with state `linksCollapsed` / `unlinkedCollapsed`.
It lists the links **out of** the current note, split into resolved and unresolved.

---

## 5. Graph view

**Confidence: high — observed in renderer DOM, in a screenshot, and in `.obsidian/graph.json`.**

### Observed rendering (screenshot of the sandbox vault)

- The graph is a **node-link diagram** in the main area with a floating **settings panel**
  on the right containing four collapsible sections, in order:
  **`Filters`**, **`Groups`**, **`Display`**, **`Forces`**.
  Each section header has a chevron (collapse), and `Filters` additionally has a
  **reset-to-default** (circular arrow) button and a **close** (X) button.
- Above the canvas is a **view header** bar: a back arrow, a forward arrow, the title
  `Graph view`, and a `…` overflow menu on the right.
- **Nodes** are solid circles with the note's **basename** rendered beneath them
  (e.g. `NoteA`, `NoteB`, `NoteC`, `SubNote`, `2026-10-21`, `Untitled.base`).
  A node's radius encodes its **degree** (number of links) — `NoteA` was visibly the largest.
- **Unresolved links get their own node**, drawn in a **faded/grey** circle
  (`Missing Note` was clearly greyer than the resolved nodes). This confirms the
  `hideUnresolved` setting has visible effect.
- **Edges** are thin straight lines between node centres. With `showArrow: false` (the
  observed default) they are **undirected** — no arrowheads were visible.
- **Orphans** (files with no links either way) are still shown, since
  `showOrphans: true` in the observed config. `2026-10-21` and `Untitled.base` appeared as
  isolated nodes.
- The canvas is **pannable and zoomable**; a zoom control is present at the bottom-left.
- A **"local graph"** toggle is a separate command (`graph:open-local`, "Open local graph")
  with no default hotkey.

### `.obsidian/graph.json` (read from both the real vault and the sandbox)

Keys and their observed meaning:

| Key | Observed value | Behavioural meaning |
|---|---|---|
| `search` | `""` | The graph filter query text |
| `showTags` | `false` | Include tag nodes in the graph |
| `showAttachments` | `false` | Include attachment nodes |
| `hideUnresolved` | `false` | Hide nodes for unresolved links |
| `showOrphans` | `true` | Show files with no links |
| `showArrow` | `false` | Draw arrowheads on edges (edge direction) |
| `colorGroups` | `[]` | User-defined node colour groups (Filters/Groups panel) |
| `collapse-color-groups` | `true` | |
| `collapse-filter` | `true` | Filters section starts collapsed |
| `collapse-display` | `true` | Display section starts collapsed |
| `collapse-forces` | `true` | Forces section starts collapsed |
| `textFadeMultiplier` | `0` | Label opacity multiplier |
| `nodeSizeMultiplier` | `1` | Node scale multiplier |
| `lineSizeMultiplier` | `1` | Edge width multiplier |
| `centerStrength` | `0.5187…` | Force layout: pull toward centre |
| `repelStrength` | `10` | Force layout: node-node repulsion |
| `linkStrength` | `1` | Force layout: attraction along edges |
| `linkDistance` | `250` | Force layout: preferred edge length |
| `scale` | `1` | Zoom scale |
| `close` | `true` in the real vault, `false` in the sandbox | Whether the graph panel starts **closed** (panel hidden) — i.e. the floating settings panel's open/closed state |

> Note the *sandbox* `graph.json` was written by Obsidian itself during this session
> (it created the file on first open), which confirms the **defaults for a brand-new
> vault** — every value above except `close` matched the real vault exactly.

### Other graph commands

`graph:open` (`Mod+G`), `graph:open-local` (no hotkey), `graph:animate` ("Start graph
time-lapse animation" — replays link creation over time; no hotkey).

---

## 6. Daily notes

**Confidence: medium-high for the command set and settings shape (observed live); the
specific default folder/format values were NOT captured in this session — see below.**

### Observed commands

| Command id | Human name | Hotkey |
|---|---|---|
| `daily-notes` | Open today's daily note | *(none bound)* |
| `daily-notes:goto-next` | Open next daily note | *(none bound)* |
| `daily-notes:goto-prev` | Open previous daily note | *(none bound)* |

Note the id is plain `daily-notes` (not `daily-notes:open`), whereas the ribbon's
`aria-label` reads **"Open today's daily note"** and the ribbon's persisted hidden-item key
in `workspace.json` is **`daily-notes:Open today's daily note`**. So the ribbon key is
`commandId + ':' + commandName`, and the underlying command id is `daily-notes`.

### Settings surface

The core plugin `daily-notes` is **enabled** in this install
(`.obsidian/core-plugins.json` → `"daily-notes": true`).

**Settings → Core plugins → Daily notes** — read live from the rendered settings UI.
Four settings, in order:

1. **Date format** — description *"Choose how daily note are named in your vault."*
   A dropdown offering the presets:
   `2026-10-21` · `2026.10.21` · `2026/10/21` · `2026/10/2026-10-21` · `Custom`
   (the first four are the built-in presets, showing what they produce for 2026-10-21;
   the last is a free-form choice).
2. **Custom format** — description *"For more syntax, refer to format reference"* with an
   inline live preview: *"Your current syntax looks like this: 2026-10-21"*. The text
   field's **default value is `YYYY-MM-DD`**. So the **default daily-note filename format
   is `YYYY-MM-DD`**, which for the observed date produced `2026-10-21.md`.
3. **New file location** — description *"New daily notes will be placed here."*
   A free-text path field, **empty by default** → daily notes land in the **vault root**.
4. **Template file location** — description *"Choose the file to use as a template."*
   A file-picker combobox, **empty by default** → no template is applied.

Verified end to end: running the **"Open today's daily note"** command in the sandbox
vault on 2026-10-21 created and opened **`2026-10-21.md`** at the **vault root** (not
in the `Daily/` subfolder, which only existed because I had put a note there manually),
with **empty content** (no template applied). This confirms the `YYYY-MM-DD` default
format and the empty default folder.

Note that the vault also had a hand-made `Daily/2026-10-21.md`; the daily-notes plugin
still created a separate root-level `2026-10-21.md`, because the "New file location"
setting was empty (vault root) and it does not scan subfolders for an existing note.

### The `{{date}}` token

**Confidence: low — inferred, NOT verified.** No `{{date}}` token was exercised in this
session. What *was* observed is the **Templates** plugin's own commands in the live
registry:

- `insert-template` — "Templates: Insert template"
- `insert-current-date` — "Templates: Insert current date"
- `insert-current-time` — "Templates: Insert current time"

These are the Templates plugin's date/time commands and are distinct from any daily-notes
`{{date}}` token. The **Templates** plugin is also enabled (`"templates": true`) and has
its own settings page.

**The `[[date]]` wikilink convention was NOT observed at all.** The daily-note filename
comes from the **date format setting**, not from a wikilink. Do not implement a
`[[date]]` special case based on this document.

---

## 7. File explorer

**Confidence: high for structure/sorting; medium for the rename flow.**

### Structure

- The explorer lists **folders first, then files** (observed order: `Daily`, `Subfolder`,
  `NoteA`, `NoteB`, `NoteC`, `Untitled`).
- Folders are **collapsed by default** and show a **right-pointing chevron**; expanding
  rotates the chevron and indents children.
- A file whose type is not Markdown (the sandbox's `Untitled.base`, a Base file) is shown
  with a **right-aligned type badge** reading `BASE`, and its label is shown without the
  extension.
- The **active file** is highlighted with a **rounded grey pill** background.
- The explorer header has a row of icon buttons. Their exact order and accessible names
  were read from the live DOM (each button's `aria-label`), left to right:
  `New note` · `New folder` · `Change sort order` · `Auto-reveal current file` ·
  `Expand all` · `Show search filter`.
  The last of these only appears once the search filter is enabled; with it enabled two
  extra controls appear in the search row — `Clear search` and `Match case`.
- The explorer pane's persisted state is `sortOrder: "alphabetical"`, `autoReveal: false`,
  `showSearch: false`, `searchQuery: ""`.

### Sorting

The pane state key is `sortOrder` with the observed value **`"alphabetical"`**. The header
also exposes a dedicated **sort-order button** and a separate **collapse-all** button, so
sorting is a user-facing setting in the pane header, not just a config file value.

### Creating

- `file-explorer:new-file` — "Create new note" (`Mod+N`).
- `file-explorer:new-file-in-current-tab` — "Create new note in current tab".
- `file-explorer:new-file-in-new-pane` — "Create note to the right" (`Mod+Shift+N`).
- `file-explorer:new-folder` — "Files: Create new folder".
- `file-explorer:duplicate-file` — "Duplicate current file".
- `file-explorer:move-file` — "Move current file to another folder".
- `file-explorer:reveal-active-file` — "Files: Reveal current file in navigation" (autoReveal
  can be enabled to make the explorer follow the active file automatically).
- `file-explorer:open` — "Files: Show file explorer".

**New-note default location** (Settings → Files and links, observed): the dropdown
`Default location for new notes` defaults to **`Vault folder`**, with the alternatives
`Same folder as current file` and `In the folder specified below`. This is consistent
with the observed behaviour that a note created by clicking an unresolved link landed
at the **vault root** rather than next to the linking note.

#### The new-note flow — DIRECTLY OBSERVED

Clicking the explorer's **New note** button (or running `file-explorer:new-file` — the
two were verified to behave identically) does this:

1. A Markdown file is **created immediately**, before the user types anything, named
   `Untitled.md`.
2. The new note is **opened in the main area** and becomes the active file.
3. The **inline title** is focused with its text pre-selected, so typing replaces it.
4. Pressing **Enter** renames the file to the typed name.

If the default name already exists, the app appends an **auto-incrementing counter**:
observed `Untitled.md` → `Untitled 1.md` → `Untitled 2.md` → `Untitled 3.md`. The same
countering was observed for folders (`Untitled` → `Untitled 1`).

**There is no inline filename input in the tree for notes.** The tree row of the new
note is *not* editable — the only editable surface at that moment is the inline title
in the main pane. (Folders are different: see below.)

#### The new-folder flow — DIRECTLY OBSERVED

Clicking **New folder**:

1. Creates the folder **immediately** named `Untitled` (countered: `Untitled 1`, …).
2. The folder's tree row becomes a **`contenteditable` div** — the row's text element
   (`nav-folder-title-content`) is switched to `contenteditable="true"` and focused.
3. Typing replaces the row text; the folder is not renamed until **Enter** is pressed,
   after which the row reverts to a plain, non-editable element.

So: **new folders are named inline in the tree; new notes are named in the main pane's
inline title.**

### The inline title is a contenteditable rename field

**Confidence: high — directly observed.**

The large title at the top of a note is **not** a static heading. It is a
`<div class="inline-title" contenteditable="true" spellcheck="true"
autocapitalize="on" tabindex="-1" enterkeyhint="done">` holding the file's basename.
(There is a second, separate `view-header-title` element with the same
`contenteditable="true"` in the view header — the two are distinct elements.)

- Clicking it focuses it (`document.activeElement` becomes the div).
- Typing replaces the text **in the DOM only** — the file on disk is untouched
  (verified: after typing `Ren`, the vault still contained `test.md` and not `Ren.md`).
- Pressing **Enter** commits: the file was renamed on disk to `Ren.md`, the active
  file became `Ren.md`, and the tab/title updated.
- The rename therefore goes through the **same** rename path as `F2`, and hence the same
  "Update links" prompt appears when inbound links exist.

This is the primary rename affordance in the reading view; `F2` is the keyboard route
to the same behaviour.

### Renaming

- `workspace:edit-file-title` — **"Rename file"**, hotkey **`F2`** (confirmed in the
  command registry: `hotkeys: [{ modifiers: [], key: "F2" }]`). The command is in the
  `workspace:` namespace (not `file-explorer:`), which is why it applies to the open note
  rather than to a tree selection.
- Executing `workspace:edit-file-title` **focuses the inline title and selects its
  text** (observed: `document.activeElement` becomes the `.inline-title` div and
  `window.getSelection()` returns the file's basename). It does **not** open a modal
  text field — the rename happens in place in the title.
- The metadata cache exposes an `onRename` hook, confirming renames are tracked by the
  link resolver.

#### The "Update links" prompt — DIRECTLY OBSERVED

Renaming `NoteB.md` → `NoteBRenamed.md` (a file that three links pointed at) popped up a
**modal confirmation dialog** (in a `modal-container mod-confirmation mod-dim` overlay):

- **Title:** `Update links`
- **Body:**
  > Do you want to update internal links that link to this file?
  > This will affect **3 links in 2 files**.
- **Three buttons, left to right:** `Always update` · `Just once` · `Do not update`

Choosing **`Just once`** rewrote the inbound links:

| File | Before | After |
|---|---|---|
| `NoteA.md` | `[[NoteB]]` | `[[NoteBRenamed]]` |
| `NoteA.md` | `[[NoteB\|aliased B]]` | `[[NoteBRenamed\|aliased B]]` |
| `Subfolder/SubNote.md` | `[[NoteB]]` | `[[NoteBRenamed]]` |

Key points:
- The **alias is preserved** — only the target half of `[[target|alias]]` is rewritten.
- Links that were **already** written with the new name (e.g. `[[NoteBRenamed]]` after a
  prior manual edit) are not double-processed.
- The count "3 links in 2 files" matches exactly: NoteA had 2 links to NoteB, SubNote
  had 1.
- This prompt is governed by the setting **"Automatically update internal links"**
  (Settings → Files and links), whose description reads *"Turn off to be prompted to
  update links after renaming a file."* — i.e. with that setting **on**, Obsidian
  updates links **without** prompting; with it off, the prompt appears.
- The related setting **"New link format"** has three options:
  `Shortest path when possible` (default) · `Relative path to file` ·
  `Absolute path in vault`. This governs the *shape* of newly generated links.
- The metadata cache exposes `updateInternalLinks` and `updateRelatedLinks` methods,
  which is the machinery behind the rewrite.
- The command registry also has `editor:rename-heading` — "Rename this heading…" — for
  renaming a heading, which would need to update `[[file#heading]]` links.

**Confidence: high — the whole flow was exercised end to end and the on-disk file
contents were read back afterwards to confirm the rewrite.**

---

## 8. Frontmatter / Properties

**Confidence: high — observed in the renderer DOM and a screenshot.**

### Display

- YAML frontmatter is **not shown as raw YAML** in the note body. It is rendered as a
  **"Properties"** panel at the top of the note, headed by the literal text
  **`Properties`**.
- Each property is a **row** with:
  - a small **type icon** on the left (a "text lines" glyph for a plain string, a **tag
    glyph** for a list-of-tags property),
  - the **property name** (e.g. `title`, `tags`, `status`),
  - the **value** on the right.
- A **plain string** value renders as text (`Note A`, `draft`).
- A **list of tags** renders as **pill chips**, each with the tag name and a small
  **×** to remove it (observed: `alpha ×`, `beta ×`).
- The panel ends with an **`+ Add property`** affordance for adding new frontmatter keys.
- The panel is **collapsible** — there is a `editor:toggle-fold-properties` command
  ("Toggle fold properties in current file").
- The status bar reports the property count (`3 properties` for title/tags/status).

### Parsed frontmatter (from the live metadata cache)

```
title: "Note A"        → string
tags: ["alpha","beta"] → array of strings
status: "draft"        → string
```

Frontmatter is exposed as a plain JS object under `frontmatter` on the file cache.
The cache also carries a `tags` array for **inline** tags, separate from the frontmatter
`tags` key:

```
tags: [{ position: {start:{line:10,col:14,offset:183}, …}, tag: "#inline-tag" }]
```

### Frontmatter vs. inline tags

Two independent mechanisms that both end up in the **Tags** pane, and — importantly —
they are **unified in the cache** with a consistent `#` prefix.

1. **Frontmatter `tags:`** — a YAML list. The frontmatter value itself is stored
   **without** a leading `#` (`alpha`, `beta`), and renders as removable chips in the
   Properties panel.
2. **Inline `#tag`** — a `#` followed by tag characters in the body text. The cached value
   **keeps the leading `#`** (`#inline-tag`). Inline tags render in the body as a tinted
   pill. Inline tags must not contain spaces; nested hierarchy is expressed with `/`
   (e.g. `#project/alpha`).

The unified tag index (`metadataCache.getTags()`) returned:

```
{ "#alpha": 1, "#beta": 1, "#inline-tag": 1 }
```

— i.e. **frontmatter tags and inline tags are merged into one namespace**, and both
carry the `#` prefix. The count is the number of occurrences.

The **Tags pane** renders each tag **without** the `#` prefix (observed rows: `alpha 1`,
`beta 1`, `inline-tag 1`), with the count in a right-aligned "flair" column. Each row is
a collapsible tree item, so nested tags (`#project/alpha`) form a tree.

Pane state: `sortOrder: "frequency"`, `useHierarchy: true`, `showSearch: false`,
`searchQuery: ""` — tags are ranked by occurrence count by default, and nested tags are
treated as a hierarchy. The pane's header toolbar (observed in the screenshot) has four
buttons: a **sort-order** control, a **tags/hierarchy toggle**, a **collapse/expand-all**
control, and a **search magnifier**.

**Caveat observed:** the Tags pane initially rendered the empty state
("No tags found.") even though the cache already had three tags; it only populated after
an explicit refresh call. Worth replicating as "populate on activation and on
cache-change", but do not assume it is live on first paint.

### Reserved property keys

**Confidence: high — directly observed.** The vault-wide property registry
(`metadataCache.getAllPropertyInfos()`) contained **five** keys, but the vault only
actually used three:

```
aliases    (count 0)   <- reserved
cssclasses (count 0)   <- reserved
tags       (count 1)
title      (count 1)
status     (count 1)
```

So **`aliases` and `cssclasses` are reserved property keys** that are always registered
even when unused. `cssclasses` is the conventional key for applying CSS classes to a
note; `aliases` is the conventional key for alternative names (see §3 — it is *not* used
for link resolution).

The **"All properties" pane** rendered exactly this list, one row per key, with the
count right-aligned:
`status 1` · `tags 1` · `title 1` · `aliases 0` · `cssclasses 0`.
Its header toolbar has a **sort-order** button, a **search** button and a collapse-all
control. Pane state: `sortOrder: "frequency"`, `showSearch`, `searchQuery`.

### Other property panes

- `properties:open-local` — "Properties view: Show file properties" (the current file only).
- `markdown:add-metadata-property` — "Add file property" (hotkey `Mod+;`).
- `markdown:clear-metadata-properties` — "Clear file properties".
- `app:migrate-frontmatter` — "Format converter: Frontmatter migration" (a tool to convert
  between frontmatter formats).
- The metadata cache exposes `getAllPropertyInfos` and
  `getFrontmatterPropertyValuesForKey`, and a `metadataTypeManager`, indicating properties
  have declared **types** (text, list, number, checkbox, date, datetime) with a per-property
  type registry.
- The file cache also carries `sections` — a list of typed blocks
  (`{type: "yaml"|"heading"|"paragraph", position}`) describing the note's structure.

---

## 9. Other observed behaviour worth recording

- **Status bar** (bottom of main area) shows, left to right: *backlinks count*,
  *properties count*, a **pencil/reading-mode toggle**, *word count*, *character count*,
  and a right-aligned icon.
- **Reading view vs. Live Preview**: `markdown:toggle-preview` (`Mod+E`) toggles reading
  view; `editor:toggle-source` toggles between Live Preview and raw Source mode. The
  note's `state.mode` in `workspace.json` was observed as `"source"` with a separate
  `source: false` flag — i.e. the persisted leaf records *view mode* and *source-mode*
  independently.
- **Note title**: with `show-inline-title` on, the file's basename is rendered as a large
  heading at the top of the note, above the Properties panel. The filename appears in the
  tab header too.
- **First tab order** in the main area of a fresh vault is a **Graph view** leaf
  (observed: the sandbox's very first `workspace.json` had a `graph` leaf, then my
  `markdown` leaf was appended).
- **`Untitled.base`** appeared in the sandbox vault on first open: Obsidian auto-created a
  Base file named "Untitled" alongside the vault's own `Welcome.md`-style content. This
  suggests the **Bases** core plugin (enabled: `"bases": true`) creates an initial base
  automatically for a new vault.
- **Core plugins enabled in this install** (read from `.obsidian/core-plugins.json` of both
  real vaults, identical): file-explorer, global-search, switcher, graph, backlink, canvas,
  outgoing-link, tag-pane, properties, page-preview, daily-notes, templates, note-composer,
  command-palette, editor-status, bookmarks, outline, word-count, file-recovery, sync,
  bases. **Disabled:** footnotes, slash-command, zk-prefixer, random-note, slides,
  audio-recorder, workspaces, publish, webviewer.
- **App-level config** (not per-vault) lives in
  `~/Library/Application Support/obsidian/obsidian.json`: a `vaults` map from vault id to
  `{path, ts, open}`. The vault id is **not** a plain hash of the path (md5/sha1/sha256/
  blake2 of the path in utf-8/utf-16 all failed to reproduce the observed ids
  `81c8bfe0365819f3` and `72c544fafd1a3bd5`). Per-vault window geometry lives in a
  sibling file named `<vaultId>.json` in the same folder.

---

## 10. Explicitly NOT verified (gaps for a follow-up pass)

1. **Live Preview vs. Source mode** rendering differences for wikilinks, and how the
   `[[` autocomplete behaves in each. The observed note was in `mode: "source"` with
   `source: false`; the `editor:toggle-source` command was never exercised.
2. **Unlinked-mention matcher settings** — the "Exact match" vs "any occurrence" option
   was not varied, so only the default behaviour is documented.
3. **`[[note#heading]]` navigation** — the *parsing* of the heading fragment and the
   `displayText` arrow form (`NoteC > Heading One`) were observed, but **following** such
   a link and landing on the heading was not exercised.
4. **`^` block-reference syntax** — the autocomplete footer advertises
   `Type ^to link blocks`, but block references were not tested.
5. **Obsidian URL scheme** (`obsidian://open?vault=…&file=…`) — the `Copy Obsidian URL`
   command exists but its output format was not captured. The "Allow URI callbacks"
   setting confirms x-callback-url support exists.
6. **The `Copy current file path from vault folder` / `from system root` output format** —
   commands exist, output not captured.
7. **The `Bases` and `Canvas` plugins** — both are enabled core plugins in 1.14.x and
   have their own commands and ribbon items, but their behaviour was not investigated.
8. **Sync behaviour** — the `sync` core plugin is enabled, but nothing was observed
   (no account configured).
9. **Theme / appearance** — `appearance.json` was `{}` in both real vaults; the live
   session ran with `theme-light` and the body also carried `theme-dark` on the
   vault-picker page, so theme switching exists but was not explored.
10. **The exact "New link format" algorithm** — the three options are known, but the
    precise rule that chooses between "shortest path", "relative path" and
    "absolute path in vault" was not measured.
11. **Vault-id derivation** — the ids in `obsidian.json` are not a plain hash of the
    vault path under md5/sha1/sha256/sha512/blake2 in utf-8 or utf-16. The algorithm is
    still unknown; a clean-room implementation can pick its own scheme as long as it is
    stable and unique per path.
12. **In-place rename in the file-explorer tree** — the tree rows for both files and
    folders are plain, non-editable elements
    (`nav-file-title` / `nav-folder-title-content`, no `contenteditable` attribute) in
    their resting state. A double-click on a tree row was observed to fire a `dblclick`
    event and to select the row text, but no inline edit field appeared; the same is true
    of a right-click, which produced no DOM menu. Obsidian's context menus and
    double-click "rename in place" therefore could not be observed directly.
    **What is confirmed** is that the *new-folder* flow does put the tree row into
    `contenteditable="true"` mode, so the tree row is capable of being an edit field —
    a reimplementation should provide one for renaming existing items too.
13. **Right-click context menus** — the tree's right-click menu could not be observed:
    the `contextmenu` DOM event was dispatched and no `.menu` / `.popover` element
    appeared in the renderer. This is most likely because Obsidian's menus are native
    Electron menu instances rather than DOM overlays, which would also explain why the
    command palette (`command-palette:open`) produced no visible prompt overlay when
    invoked programmatically. Treat "Obsidian's menus are native, not DOM" as a
    hypothesis, not a verified fact.
14. **The `F2` keypress itself** — the `F2` binding is confirmed in the command
    registry (`workspace:edit-file-title` → `[{modifiers: [], key: "F2"}]`), and running
    the command programmatically focuses and selects the inline title. A *synthesised*
    `F2` key event, however, did not trigger the rename in the observation session,
    most likely because the isolated window was not the key-focused window (its body
    never gained the `is-focused` class). **The `F2` keystroke path was therefore not
    confirmed end-to-end** — only the command it is bound to.

---

## 11. A note on confidence levels used in this document

- **"observed in renderer DOM" / "observed in the live app"** — the behaviour was read
  out of a running Obsidian 1.14.4 instance via the Chrome DevTools Protocol, either
  from the DOM, from the live `app` object, or from a screenshot.
- **"read from `.obsidian/*.json`"** — the value came from a config file on disk.
- **"inferred — NOT verified"** — a documented default that was not exercised at runtime.
  Every such case is called out explicitly above; there are three: the `{{date}}` token,
  the `[[date]]` wikilink convention, and the graph's arrow/direction semantics beyond
  the `showArrow` flag.

Nothing in this document reproduces Obsidian source code, CSS, icon bytes, or branding.
Class names are quoted only where they are the observable contract of the behaviour
(e.g. `is-unresolved`), and icons are described by their `aria-label` text.

