import { create } from 'zustand'
import type { View } from '../components/NavBar'

/**
 * The page on screen. A store rather than `App`'s own state because the macOS
 * menu switches pages too (Go, Settings…, and every command whose button is on
 * another page), and `runMenuCommand` runs outside React. Transient: Corvath
 * opens on Readings each time, as before.
 */
interface ViewState {
  view: View
  setView: (view: View) => void
}

export const useViewStore = create<ViewState>((set) => ({
  view: 'readings',
  setView: (view) => set({ view })
}))
