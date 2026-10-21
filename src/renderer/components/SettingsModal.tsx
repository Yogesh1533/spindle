import { useEffect, useState } from 'react'
import { useVaultStore } from '../store/useVaultStore.js'
import type { AppSettings, ThemeMode } from '../../shared/types.js'

/**
 * The settings modal.
 *
 * Settings live outside the vault (in the app's own userData folder), so
 * changing anything here never touches the user's Markdown files.
 */
export function SettingsModal() {
  const open = useVaultStore((s) => s.settingsOpen)
  const setOpen = useVaultStore((s) => s.setSettingsOpen)
  const settings = useVaultStore((s) => s.settings)
  const setSettings = useVaultStore((s) => s.setSettings)

  // Edits are kept locally until the modal is closed, so a half-typed
  // value never gets written to disk.
  const [draft, setDraft] = useState<AppSettings>(settings)

  useEffect(() => {
    if (open) setDraft(settings)
  }, [open, settings])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open) return null

  const update = (patch: Partial<AppSettings>) => setDraft({ ...draft, ...patch })

  const close = async () => {
    // Only the fields that actually changed are sent.
    const patch: Partial<AppSettings> = {}
    for (const key of Object.keys(draft) as (keyof AppSettings)[]) {
      if (draft[key] !== settings[key]) {
        // TypeScript cannot narrow a union of value types here, but every
        // setting in AppSettings is a primitive, so this is safe.
        ;(patch as Record<string, unknown>)[key] = draft[key]
      }
    }
    if (Object.keys(patch).length > 0) {
      setSettings(patch)
      await window.slate.settings.set(patch)
    }
    setOpen(false)
  }

  return (
    <div className="overlay" onClick={() => void close()}>
      <div className="settings" onClick={(e) => e.stopPropagation()}>
        <div className="settings__header">
          <h2 className="settings__title">Settings</h2>
          <button className="settings__close" onClick={() => void close()} aria-label="Close">
            ×
          </button>
        </div>

        <div className="settings__body">
          <section className="settings__section">
            <h3 className="settings__heading">Appearance</h3>

            <label className="settings__row">
              <span className="settings__label">Theme</span>
              <div className="seg">
                {(['light', 'dark', 'system'] as ThemeMode[]).map((mode) => (
                  <button
                    key={mode}
                    className={`seg__button ${draft.theme === mode ? 'is-active' : ''}`}
                    onClick={() => update({ theme: mode })}
                  >
                    {mode[0].toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
            </label>

            <label className="settings__row">
              <span className="settings__label">Editor font size</span>
              <div className="settings__inline">
                <input
                  className="input settings__number"
                  type="number"
                  min={10}
                  max={28}
                  value={draft.editorFontSize}
                  onChange={(e) =>
                    update({ editorFontSize: Number(e.target.value) || draft.editorFontSize })
                  }
                />
                <span className="settings__unit">px</span>
              </div>
            </label>

            <label className="settings__row">
              <span className="settings__label">Default view</span>
              <div className="seg">
                <button
                  className={`seg__button ${draft.defaultViewMode === 'preview' ? 'is-active' : ''}`}
                  onClick={() => update({ defaultViewMode: 'preview' })}
                >
                  Reading
                </button>
                <button
                  className={`seg__button ${draft.defaultViewMode === 'source' ? 'is-active' : ''}`}
                  onClick={() => update({ defaultViewMode: 'source' })}
                >
                  Source
                </button>
              </div>
            </label>
          </section>

          <section className="settings__section">
            <h3 className="settings__heading">Daily notes</h3>

            <label className="settings__row">
              <span className="settings__label">Folder</span>
              <input
                className="input"
                placeholder="Daily"
                value={draft.dailyNotesFolder}
                onChange={(e) => update({ dailyNotesFolder: e.target.value })}
              />
            </label>
            <p className="settings__hint">
              The folder inside the vault where daily notes are created. Leave empty to keep them
              in the vault root.
            </p>

            <label className="settings__row">
              <span className="settings__label">File name format</span>
              <input
                className="input"
                placeholder="YYYY-MM-DD"
                value={draft.dailyNoteFormat}
                onChange={(e) => update({ dailyNoteFormat: e.target.value })}
              />
            </label>
            <p className="settings__hint">
              Tokens: <code>YYYY</code> <code>YY</code> <code>MMMM</code> <code>MMM</code>{' '}
              <code>MM</code> <code>M</code> <code>DD</code> <code>D</code> <code>WW</code>{' '}
              <code>dddd</code> <code>ddd</code>
            </p>

            <label className="settings__row">
              <span className="settings__label">Template</span>
              <input
                className="input"
                placeholder="Templates/Daily.md"
                value={draft.dailyNotesTemplate}
                onChange={(e) => update({ dailyNotesTemplate: e.target.value })}
              />
            </label>
            <p className="settings__hint">
              A note inside the vault used as the starting point for new daily notes. It may
              contain <code>{'{{date}}'}</code>, <code>{'{{title}}'}</code> and{' '}
              <code>{'{{time}}'}</code>.
            </p>
          </section>
        </div>

        <div className="settings__footer">
          <button className="button" onClick={() => void close()}>
            Cancel
          </button>
          <button className="button button--primary" onClick={() => void close()}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
