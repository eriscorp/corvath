/**
 * The macOS application menu (macos-chrome.md in the document repo; mabon is
 * the reference). Main builds the menu; an app item sends its command to the
 * renderer, which runs the same action as the matching button. Both sides read
 * the command names from here, so they cannot disagree.
 *
 * NO package imports in this file: the sandboxed preload imports the channel
 * names from here, and a sandboxed preload can load only `electron`. That is
 * why `parseMenuState` (zod) lives in `main/appMenu.ts`. The view list is typed
 * here rather than imported from the renderer's NavBar for the same reason;
 * `appMenu.test.tsx` holds the two lists equal.
 */

/** Main → renderer: an app menu item was chosen. */
export const MENU_COMMAND_CHANNEL = 'menu:command'
/** Renderer → main: what the menu greys out (`MenuState`). */
export const MENU_STATE_CHANNEL = 'app:setMenuState'

/** The views the Go menu lists, in tab order, with ⌘1…⌘4. Settings is not
 *  here: it is Settings… (⌘,) in the app menu, as on every Mac. */
export const GO_VIEWS = [
  ['readings', 'Readings'],
  ['draw', 'Draw'],
  ['decks', 'Decks'],
  ['layouts', 'Layouts']
] as const

export type GoView = (typeof GO_VIEWS)[number][0]

/**
 * Corvath's menu commands. A command whose action a store holds runs at once.
 * A command whose action a component holds in its own state (a dialog's
 * `open`, a page's create, import or export) goes through the pending-request
 * pattern (`menuStore`), after a switch to the page that owns it.
 */
export type MenuCommand =
  | 'about'
  | 'checkForUpdates'
  | 'settings'
  | 'newReading'
  | 'importReadings'
  | 'exportAllReadings'
  | 'importDeck'
  | 'revealDataFolder'
  | 'reportIssue'
  | 'whatsNew'
  | `go:${GoView}`

/** What a menu item sends. */
export interface MenuMessage {
  command: MenuCommand
}

/**
 * What the menu greys out. Main validates it (`parseMenuState`). An item is
 * greyed out when its button would be absent or disabled.
 */
export interface MenuState {
  /** The renderer has hydrated and listens for commands. Before that, a
   *  command would reach no listener and be lost. */
  ready: boolean
  /** There is at least one reading: the Readings page disables "Export all"
   *  without one. */
  hasReadings: boolean
}

/** Before the renderer reports: every app item is greyed out. */
export const INITIAL_MENU_STATE: MenuState = {
  ready: false,
  hasReadings: false
}
