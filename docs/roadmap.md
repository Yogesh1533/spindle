# Spindle — what could come next

The app is at v1: a vault of plain Markdown, an editor that renders as you
type, links that keep themselves up to date, search, tags, daily notes and a
graph. This is a list of what could be added, roughly in the order I would
build it, with why each one is worth the effort.

Two rules hold for all of it: the vault stays plain Markdown that any other
editor can open, and the app keeps working with no account and no network.

---

## 1. The small ones — a day each, and they change how the app feels

### Hover preview for links
Pointing at a `[[wikilink]]` shows the target note in a popover, with the
matching heading scrolled into view.

**Why:** right now a link either opens the note (and you lose your place) or
does nothing. A preview lets you check where a link goes without leaving the
sentence you are writing, which is the difference between a note-taking app
you use and one you fight.

### Task list across the whole vault
A pane that collects every `- [ ]` item from every note, grouped by note,
with the box tickable in place.

**Why:** the biggest practical weakness of plain Markdown is that a task
buried in a meeting note is invisible until you open that note. This is the
one thing a structured tool does better than text, and it can be done without
inventing a format: the tasks stay exactly where they are, and the pane is
just another view of the same lines.

### Block references and block embeds
`[[Note#^blockid]]` to point at a single paragraph, and `![[Note#^blockid]]` to
quote it in place.

**Why:** note links point at whole notes, which get unwieldy. Pointing at the
exact paragraph is how you write "see the argument in my design note" without
duplicating the text and letting the two copies drift apart.

### Undo across notes, and per-note history
`Cmd+Z` reaches back into notes you closed, and every note keeps a short
history of its saved versions.

**Why:** the first time a find-and-replace across a vault mangles a file, the
app has lost your trust. Cheap insurance, and it makes the riskier
vault-wide edits possible in the first place.

### Tab management: pin, reopen, group
Pinned tabs stay, `Cmd+Shift+T` reopens the last closed tab, and tabs can be
grouped by folder or tag.

**Why:** a research session opens fifteen notes and closes them in the wrong
order. Pinning the two or three that matter, and being able to bring back the
one you just closed, is what keeps a long session navigable.

### Reopen the vault you had open, per project
A vault switcher in the title bar, and a "recent vaults" list.

**Why:** people keep one vault per project — work, personal, research. The
app already remembers the last vault, but making several easy to jump between
is what turns it from a viewer into a workspace.

---

## 2. The medium ones — a week each

### Properties panel
The YAML frontmatter shown as editable fields (title, status, owner, due
date), with the raw YAML still there underneath.

**Why:** frontmatter is the only structured data a plain-text vault can hold,
and today you have to hand-edit YAML, where one missing space breaks the
whole block. A fields panel makes the structured part of a note easy to fill
in, and easy to read back.

### Bases: a table view of the vault
Treat the frontmatter as a spreadsheet — filter by tag, status or date, sort
by any column, group the results.

**Why:** this is where plain Markdown stops and you need something else. "Every
open task across every project, sorted by due date" cannot be answered by
grepping, and answering it is the reason many people buy a structured tool.
The vault does not change: it is still Markdown, and the table is a view over
it.

### A calendar and agenda
A month view of the notes that have a date in their frontmatter, and an agenda
of what is due.

**Why:** it turns the vault into something you can plan in. Combined with the
task pane, it answers "what is on this week?" without leaving the app.

### Templates and snippets
Insert a reusable block — a meeting-note skeleton, a code template, a
frontmatter stub — at the cursor.

**Why:** everybody types the same twenty lines over and over. It also gives
the daily-note template a sibling, so any note can have one.

### Attachments, and embedding images
Drag an image into a note; it is copied into the vault and embedded with
`![[image.png]]`.

**Why:** notes about a screen, a diagram or a whiteboard are notes with
pictures in them. Keeping the images inside the vault keeps the whole thing
one folder you can zip, back up or put in a cloud drive.

### Export to PDF, Markdown or HTML
For one note, a folder, or the whole vault.

**Why:** a vault is private by nature, and sometimes the note has to leave
it — for a report, a thesis, a blog post. Exporting without turning the
vault into a website keeps the two concerns apart.

### Vault health report
Orphaned notes (nothing links to them and they link to nothing), broken
links, notes never opened, most-linked notes.

**Why:** vaults rot. A vault you have kept for three years is full of notes
you cannot find again, and the graph is the wrong tool for spotting them.
This one is about housekeeping, and it is a good reason to keep using the
app.

---

## 3. The bigger ones — a month each

### Canvas: a whiteboard of notes
A board where cards are placed freely and connected by arrows, each card
backed by a real note.

**Why:** some thinking is spatial — a plan, a system, a research area — and a
folder of Markdown files cannot show that. Cards stay ordinary notes, so
nothing is trapped in the canvas.

### The app as a plugin host
A small, documented API so other people can add features, with the features
shipped as plugins rather than built in.

**Why:** the fastest way for a note app to grow is to let other people grow
it, and the slowest thing for the maintainer is maintaining every idea
forever. This is also the biggest commitment: a plugin API is a promise about
the future that is hard to take back.

### Sync through your own cloud drive
Keep the vault in a Dropbox, iCloud or Syncthing folder and let that do the
syncing. No account here, no server here.

**Why:** local-first is the whole idea, and the honest answer to "how do I get
this on my other machine?" is usually "put the folder in the drive you
already use". A built-in sync service would mean accounts, servers and a
privacy policy — the opposite of what this app is.

### Local, offline question answering over your own notes
Index the vault for retrieval and ask questions in plain language, using a
model that runs on your machine.

**Why:** "what did I decide about the pricing?" is a question no search box
answers well, and it is the question people ask a notes app. It can be done
without sending a single byte off the machine, which keeps the promise that
the app has no network features.

### A phone app that talks to the same vault
Read and capture on a phone, through a folder you already sync.

**Why:** the ideas that matter get captured in the two minutes before you fall
asleep, not at a desk. A read-and-capture companion is much smaller than a
full mobile editor, and much more likely to be finished.

---

## What I would do next

The task pane, the hover preview and the properties panel, in that order.
Together they cover the three things plain Markdown is worst at: a task you
cannot see, a link you cannot check, and a field you cannot fill in — and
none of them change the format of the vault.
