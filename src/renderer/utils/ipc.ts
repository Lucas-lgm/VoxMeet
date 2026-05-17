import { toRaw } from 'vue'

/**
 * Strip Vue reactive proxies and prepare data for Electron IPC.
 *
 * Vue 3's deep reactivity wraps objects in Proxy, which cannot be
 * transmitted through Electron's structured clone IPC mechanism.
 * Use this before passing any reactive data to `window.electronAPI.*`.
 */
export function toPlain<T>(obj: T): T {
  return JSON.parse(JSON.stringify(toRaw(obj)))
}
