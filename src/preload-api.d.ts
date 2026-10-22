import type { SpindleApi } from '../electron/preload.js'

declare global {
  interface Window {
    spindle: SpindleApi
  }
}

export {}
