import { useVaultStore } from '../store/useVaultStore.js'
import { IconFiles, IconGraph, IconMoon, IconSearch, IconSpindle, IconSun } from './icons.js'

interface Props {
  onOpenVault: () => void
}

export function TitleBar({ onOpenVault }: Props) {
  const root = useVaultStore((s) => s.root)
  const settings = useVaultStore((s) => s.settings)
  const graphOpen = useVaultStore((s) => s.graphOpen)
  const setGraphOpen = useVaultStore((s) => s.setGraphOpen)
  const setSearchOpen = useVaultStore((s) => s.setSearchOpen)
  const setSettings = useVaultStore((s) => s.setSettings)

  const vaultName = root ? root.split('/').filter(Boolean).pop() : 'No vault'

  const toggleTheme = () => {
    const next = settings.theme === 'dark' ? 'light' : 'dark'
    setSettings({ theme: next })
    void window.spindle.settings.set({ theme: next })
  }

  return (
    <header className="titlebar">
      <span className="titlebar__brand">
        <IconSpindle size={15} className="titlebar__mark" />
        <span className="titlebar__name">Spindle</span>
      </span>
      {root && <span className="titlebar__sep">/</span>}
      <span className="titlebar__title">{vaultName}</span>
      <div className="titlebar__spacer" />

      {root && (
        <>
          <button
            className="ribbon__button"
            title="Search (Cmd+Shift+F)"
            onClick={() => setSearchOpen(true)}
          >
            <IconSearch />
          </button>
          <button
            className={`ribbon__button ${graphOpen ? 'is-active' : ''}`}
            title="Graph view (Cmd+G)"
            onClick={() => setGraphOpen(!graphOpen)}
          >
            <IconGraph />
          </button>
          <button
            className="ribbon__button"
            title={`Switch to ${settings.theme === 'dark' ? 'light' : 'dark'} theme`}
            onClick={toggleTheme}
          >
            {settings.theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
        </>
      )}

      {!root && (
        <button className="button button--primary" onClick={onOpenVault}>
          <IconFiles />
          Open vault
        </button>
      )}
    </header>
  )
}
