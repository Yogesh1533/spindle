import { useVaultStore } from '../store/useVaultStore.js'
import {
  IconBacklinks,
  IconCalendar,
  IconCommand,
  IconFiles,
  IconGraph,
  IconOutgoing,
  IconOutline,
  IconPlus,
  IconSearch,
  IconTag,
} from './icons.js'
import { createNewNote, openDailyNote } from '../lib/actions.js'

export function Ribbon() {
  const rightPane = useVaultStore((s) => s.rightPane)
  const setRightPane = useVaultStore((s) => s.setRightPane)
  const graphOpen = useVaultStore((s) => s.graphOpen)
  const setGraphOpen = useVaultStore((s) => s.setGraphOpen)
  const setSearchOpen = useVaultStore((s) => s.setSearchOpen)
  const setCommandPaletteOpen = useVaultStore((s) => s.setCommandPaletteOpen)
  const setQuickSwitcherOpen = useVaultStore((s) => s.setQuickSwitcherOpen)

  return (
    <nav className="ribbon" aria-label="Main">
      <button
        className="ribbon__button"
        title="New note (Cmd+N)"
        onClick={() => void createNewNote()}
      >
        <IconPlus />
      </button>
      <button
        className="ribbon__button"
        title="Quick switcher (Cmd+O)"
        onClick={() => setQuickSwitcherOpen(true)}
      >
        <IconFiles />
      </button>
      <button
        className="ribbon__button"
        title="Search (Cmd+Shift+F)"
        onClick={() => setSearchOpen(true)}
      >
        <IconSearch />
      </button>
      <button
        className="ribbon__button"
        title="Daily note (Cmd+D)"
        onClick={() => void openDailyNote()}
      >
        <IconCalendar />
      </button>
      <button
        className="ribbon__button"
        title="Command palette (Cmd+P)"
        onClick={() => setCommandPaletteOpen(true)}
      >
        <IconCommand />
      </button>

      <div style={{ height: 12 }} />

      <button
        className={`ribbon__button ${graphOpen ? 'is-active' : ''}`}
        title="Graph view (Cmd+G)"
        onClick={() => setGraphOpen(!graphOpen)}
      >
        <IconGraph />
      </button>
      <button
        className={`ribbon__button ${rightPane === 'backlinks' ? 'is-active' : ''}`}
        title="Backlinks"
        onClick={() => setRightPane('backlinks')}
      >
        <IconBacklinks />
      </button>
      <button
        className={`ribbon__button ${rightPane === 'outgoing' ? 'is-active' : ''}`}
        title="Outgoing links"
        onClick={() => setRightPane('outgoing')}
      >
        <IconOutgoing />
      </button>
      <button
        className={`ribbon__button ${rightPane === 'tags' ? 'is-active' : ''}`}
        title="Tags"
        onClick={() => setRightPane('tags')}
      >
        <IconTag />
      </button>
      <button
        className={`ribbon__button ${rightPane === 'outline' ? 'is-active' : ''}`}
        title="Outline"
        onClick={() => setRightPane('outline')}
      >
        <IconOutline />
      </button>
    </nav>
  )
}
