/**
 * The platform's command key. Pure — callers pass `window.api.platform`, so
 * this half tests in the node project.
 *
 * On macOS the command key is ⌘ alone. Control belongs to the text system there
 * (⌃K deletes to the end of the line, ⌃P moves up a line, ⌃F moves forward), so
 * a Control chord is never the app's. Elsewhere Ctrl and ⌘ are interchangeable.
 *
 * Use `isModKey(e, window.api.platform)` wherever a key handler would read
 * `e.ctrlKey || e.metaKey`. A handler that also has bare-letter keys returns
 * early on `isForeignChord`, or ⌃B reads as B. ⇧⌘Z is redo on macOS; keep
 * Ctrl+Y off macOS. In e2e, press `ControlOrMeta+…`, never `Control+…`.
 * (macos-chrome.md §4; copied from mabon.)
 */
type Mods = Pick<KeyboardEvent, 'ctrlKey' | 'metaKey'>

/** Is the platform's command key held? */
export function isModKey(e: Mods, platform: string): boolean {
  return platform === 'darwin' ? e.metaKey && !e.ctrlKey : e.ctrlKey || e.metaKey
}

/** A Control chord on macOS: the text system's, so the app leaves it alone. */
export function isForeignChord(e: Mods, platform: string): boolean {
  return platform === 'darwin' && e.ctrlKey
}
