import { create } from 'zustand'

/**
 * The menu commands whose action a component holds in its own state: the About
 * card's two dialogs and its update check, and the Readings and Decks pages'
 * create, import and export. The menu leaves a pending request here and the
 * owning component takes it with `useMenuRequest`, also when the component
 * mounts after the request (the menu switches to the owning page first, and
 * the page mounts on the next render). No dialog moves out of its component
 * for the menu's sake (macos-chrome.md §3.3 in the document repo).
 */
export type MenuRequest =
  | 'about'
  | 'checkForUpdates'
  | 'whatsNew'
  | 'newReading'
  | 'importReadings'
  | 'exportAllReadings'
  | 'importDeck'

interface MenuStore {
  /** A request per command, keyed by a counter so a repeat is a new value. */
  pending: Partial<Record<MenuRequest, number>>
  request: (command: MenuRequest) => void
  /** Drop a request; true when there was one. */
  take: (command: MenuRequest) => boolean
}

let seq = 0

export const useMenuStore = create<MenuStore>((set, get) => ({
  pending: {},
  request: (command) => set((s) => ({ pending: { ...s.pending, [command]: ++seq } })),
  take: (command) => {
    if (get().pending[command] === undefined) return false
    set((s) => {
      const pending = { ...s.pending }
      delete pending[command]
      return { pending }
    })
    return true
  }
}))
