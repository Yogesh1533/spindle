/**
 * Remembers which notes were open, so that a reload comes back to the same
 * place.
 *
 * The session is kept per vault, outside the vault, in the main process. When
 * the vault changes the tabs are replaced rather than kept, because the tabs
 * belong to the vault: a path that made sense in one folder of notes means
 * nothing in another.
 */

import { useEffect, useState } from 'react'
import { useVaultStore } from '../store/useVaultStore.js'

/** How long to wait after the last change before writing it out. */
const SAVE_DELAY = 250

export function useSession(root: string | null): void {
  const tabs = useVaultStore((s) => s.tabs)
  const activeTab = useVaultStore((s) => s.activeTab)
  const splitTabs = useVaultStore((s) => s.splitTabs)
  const activeSplit = useVaultStore((s) => s.activeSplit)

  /** The vault whose tabs have been put back, so we do it only once. */
  const [restoredRoot, setRestoredRoot] = useState<string | null>(null)

  // Put the tabs back.
  useEffect(() => {
    if (!root || restoredRoot === root) return
    let cancelled = false

    // The tabs on screen belong to the vault that was open before, so they
    // go before the new vault's tabs arrive.
    useVaultStore.getState().setSession(null)

    void (async () => {
      const session = await window.spindle.session.get(root)
      if (cancelled) return
      useVaultStore.getState().setSession(session)
      setRestoredRoot(root)
    })()

    return () => {
      cancelled = true
    }
  }, [root, restoredRoot])

  // And write them out again whenever they change.
  useEffect(() => {
    if (!root || restoredRoot !== root) return
    const timer = window.setTimeout(() => {
      void window.spindle.session.set(root, { tabs, activeTab, splitTabs, activeSplit })
    }, SAVE_DELAY)
    return () => window.clearTimeout(timer)
  }, [root, restoredRoot, tabs, activeTab, splitTabs, activeSplit])
}
