import { useState } from 'react'
import { IconFiles, IconPlus } from './icons.js'

interface Props {
  onOpenVault: () => void
}

/**
 * Shown when no vault is open: pick a folder to open, or create a new one.
 */
export function VaultPicker({ onOpenVault }: Props) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const createVault = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      const result = await window.slate.vault.create(trimmed)
      if (!result.ok) {
        setError(result.error ?? 'Could not create that folder.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create that folder.')
    }
  }

  return (
    <div className="empty" style={{ flex: 1 }}>
      <div className="empty__inner">
        <div
          style={{
            width: 52,
            height: 52,
            margin: '0 auto 16px',
            borderRadius: 14,
            background: 'var(--accent-subtle)',
            color: 'var(--accent-text)',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <IconFiles size={26} />
        </div>

        <h1 className="empty__title" style={{ fontSize: 21 }}>
          Slate
        </h1>
        <p className="empty__body">
          A local-first Markdown notebook. Open any folder of <code>.md</code> files — Slate
          reads and writes them in place and never migrates your files.
        </p>

        {creating ? (
          <div className="empty__actions" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <input
              className="input"
              autoFocus
              placeholder="~/Documents/My Vault"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createVault()
                if (e.key === 'Escape') setCreating(false)
              }}
            />
            {error && (
              <div style={{ color: 'var(--danger)', fontSize: 12.5, textAlign: 'left' }}>{error}</div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="button button--primary" onClick={() => void createVault()}>
                Create
              </button>
              <button className="button button--ghost" onClick={() => setCreating(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="empty__actions">
            <button className="button button--primary" onClick={onOpenVault}>
              Open a vault
            </button>
            <button className="button" onClick={() => setCreating(true)}>
              <IconPlus size={13} />
              New vault
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
