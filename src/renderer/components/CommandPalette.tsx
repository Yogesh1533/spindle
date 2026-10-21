import { useEffect, useMemo, useRef, useState } from 'react'
import { useVaultStore } from '../store/useVaultStore.js'
import { runCommand } from '../hooks/useCommands.js'
import { createNewNote, openDailyNote } from '../lib/actions.js'
import {
  IconCalendar,
  IconCommand,
  IconFile,
  IconFiles,
  IconGraph,
  IconMoon,
  IconSearch,
  IconSun,
  IconTag,
} from './icons.js'

interface PaletteCommand {
  id: string
  title: string
  subtitle?: string
  keys?: string
  icon: React.ReactNode
  run: () => void | Promise<void>
}

/**
 * The command palette (Cmd+P): run any command by name.
 */
export function CommandPalette() {
  const open = useVaultStore((s) => s.commandPaletteOpen)
  const setOpen = useVaultStore((s) => s.setCommandPaletteOpen)
  const settings = useVaultStore((s) => s.settings)
  const setSettings = useVaultStore((s) => s.setSettings)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const commands = useMemo<PaletteCommand[]>(
    () => [
      {
        id: 'file:new-note',
        title: 'New note',
        keys: 'Cmd N',
        icon: <IconFile />,
        run: async () => {
          await createNewNote()
        },
      },
      {
        id: 'file:new-folder',
        title: 'New folder',
        keys: 'Cmd Shift N',
        icon: <IconFiles />,
        run: () => runCommand('file:new-folder'),
      },
      {
        id: 'vault:open',
        title: 'Open another vault',
        icon: <IconFiles />,
        run: () => runCommand('vault:open'),
      },
      {
        id: 'ui:search',
        title: 'Search all notes',
        keys: 'Cmd Shift F',
        icon: <IconSearch />,
        run: () => runCommand('ui:search'),
      },
      {
        id: 'ui:quick-switcher',
        title: 'Quick switcher',
        keys: 'Cmd O',
        icon: <IconFiles />,
        run: () => runCommand('ui:quick-switcher'),
      },
      {
        id: 'ui:graph-view',
        title: 'Open graph view',
        keys: 'Cmd G',
        icon: <IconGraph />,
        run: () => runCommand('ui:graph-view'),
      },
      {
        id: 'daily:open',
        title: "Open today's daily note",
        keys: 'Cmd D',
        icon: <IconCalendar />,
        run: () => openDailyNote(),
      },
      {
        id: 'editor:toggle-mode',
        title: 'Toggle reading / source view',
        keys: 'Cmd E',
        icon: <IconCommand />,
        run: () => runCommand('editor:toggle-mode'),
      },
      {
        id: 'ui:toggle-file-explorer',
        title: 'Toggle file explorer',
        keys: 'Cmd B',
        icon: <IconFiles />,
        run: () => runCommand('ui:toggle-file-explorer'),
      },
      {
        id: 'ui:toggle-right-sidebar',
        title: 'Toggle right sidebar',
        keys: 'Cmd Shift B',
        icon: <IconFiles />,
        run: () => runCommand('ui:toggle-right-sidebar'),
      },
      {
        id: 'ui:toggle-theme',
        title: `Switch to ${settings.theme === 'dark' ? 'light' : 'dark'} theme`,
        icon: settings.theme === 'dark' ? <IconSun /> : <IconMoon />,
        run: async () => {
          const next = settings.theme === 'dark' ? 'light' : 'dark'
          setSettings({ theme: next })
          await window.slate.settings.set({ theme: next })
        },
      },
      {
        id: 'ui:tag-pane',
        title: 'Show tags pane',
        icon: <IconTag />,
        run: () => useVaultStore.getState().setRightPane('tags'),
      },
    ],
    [settings.theme, setSettings]
  )

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return commands
    return commands.filter(
      (c) => c.title.toLowerCase().includes(needle) || c.id.includes(needle)
    )
  }, [commands, query])

  useEffect(() => {
    setSelected(0)
  }, [query])

  if (!open) return null

  const choose = (command: PaletteCommand) => {
    setOpen(false)
    void command.run()
  }

  return (
    <div className="overlay" onClick={() => setOpen(false)}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette__input"
          placeholder="Type a command…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSelected((s) => Math.min(s + 1, results.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSelected((s) => Math.max(s - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              const target = results[selected]
              if (target) choose(target)
            } else if (e.key === 'Escape') {
              setOpen(false)
            }
          }}
        />

        <div className="palette__results">
          {results.length === 0 ? (
            <div className="palette__empty">No commands match “{query}”.</div>
          ) : (
            results.map((command, i) => (
              <div
                key={command.id}
                className={`palette__item ${i === selected ? 'is-selected' : ''}`}
                onMouseEnter={() => setSelected(i)}
                onClick={() => choose(command)}
              >
                <span className="palette__item-icon">{command.icon}</span>
                <div className="palette__item-main">
                  <div className="palette__item-title">{command.title}</div>
                </div>
                {command.keys && <span className="palette__item-key">{command.keys}</span>}
              </div>
            ))
          )}
        </div>

        <div className="palette__hint">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> run
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  )
}
