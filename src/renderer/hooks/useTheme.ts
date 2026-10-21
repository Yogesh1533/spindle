import { useEffect } from 'react'
import type { ThemeMode } from '../../shared/types.js'

/**
 * Apply the theme to the document root.
 * "system" follows the OS preference via the matchMedia listener.
 */
export function useTheme(mode: ThemeMode): void {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    const apply = () => {
      const dark = mode === 'dark' || (mode === 'system' && media.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    }

    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [mode])
}
