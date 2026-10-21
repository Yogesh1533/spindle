import type { SlateApi } from '../electron/preload.js'

declare global {
  interface Window {
    slate: SlateApi
  }
}

export {}
