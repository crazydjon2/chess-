import { useSyncExternalStore } from 'react'
import { subscribe, getLang } from './core.js'

export * from './core.js'

export function useLang() {
  return useSyncExternalStore(subscribe, getLang, getLang)
}
