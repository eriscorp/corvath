import { z } from 'zod'
import type { MenuItemConstructorOptions } from 'electron'
import { GO_VIEWS, type MenuMessage, type MenuState } from '../shared/appMenu'

/**
 * The macOS application menu, in place of Electron's default one. The default
 * View menu has Reload and Force Reload, which drop the edits that the stores
 * have not saved yet, and Toggle Developer Tools; none of its items is one of
 * Corvath's own commands. macOS only: Windows and Linux are frameless with the
 * renderer's own buttons, and a menu there would register its accelerators too.
 *
 * Pure: the template comes from the renderer's last `MenuState`. An app item
 * calls `send`, and the renderer runs the same action as the matching button.
 * Standard items are Electron roles. Chromium gives a key to the page first,
 * and to the menu only when the page does not `preventDefault` it, so a page's
 * own shortcut still wins.
 *
 * The house design is docs/architecture/macos-chrome.md in the document repo
 * (§3 has the agreed shape: App · File · Edit · View · Go · Window · Help).
 * Mabon is the reference implementation; dagda's menu is the nearest relative.
 */
const menuStateSchema: z.ZodType<MenuState> = z.object({
  ready: z.boolean(),
  hasReadings: z.boolean()
})

/** The renderer's report, or null when it is not a `MenuState`. */
export function parseMenuState(value: unknown): MenuState | null {
  const r = menuStateSchema.safeParse(value)
  return r.success ? r.data : null
}

export interface MenuOptions {
  /**
   * The product name, "Corvath". Not `app.name`: package.json has no
   * `productName`, so `app.name` is "corvath" and the role labels would read
   * "Quit corvath". Adding a `productName` would move `app.name` on every
   * platform, so the labels are set here by hand (macos-chrome.md §3.1).
   */
  appName: string
  /** A dev build: adds Toggle Developer Tools. */
  isDev: boolean
  send: (msg: MenuMessage) => void
}

export function buildMenuTemplate(
  state: MenuState,
  { appName, isDev, send }: MenuOptions
): MenuItemConstructorOptions[] {
  // Each app item's `id` is its command, so a test (and e2e) finds it with
  // `Menu.getApplicationMenu().getMenuItemById(id)`. Every app item waits for
  // the renderer: before it reports, a command reaches no listener.
  const item = (
    label: string,
    command: MenuMessage['command'],
    extra: MenuItemConstructorOptions = {}
  ): MenuItemConstructorOptions => ({
    label,
    id: command,
    click: () => send({ command }),
    ...extra,
    enabled: state.ready && (extra.enabled ?? true)
  })
  const sep: MenuItemConstructorOptions = { type: 'separator' }

  return [
    {
      label: appName,
      submenu: [
        // The app's own About dialog (the About card's), not the `about` role,
        // which would show Electron's panel.
        item(`About ${appName}`, 'about'),
        // The About card's update-check button (update-check module), run from
        // here; the menu switches to Settings first.
        item('Check for Updates…', 'checkForUpdates'),
        sep,
        item('Settings…', 'settings', { accelerator: 'Cmd+,' }),
        sep,
        { role: 'services' },
        sep,
        { role: 'hide', label: `Hide ${appName}` },
        { role: 'hideOthers' },
        { role: 'unhide' },
        sep,
        { role: 'quit', label: `Quit ${appName}` }
      ]
    },
    {
      label: 'File',
      submenu: [
        // The Readings page's buttons. Import opens the page's own dialog.
        item('New Reading', 'newReading', { accelerator: 'Cmd+N' }),
        sep,
        item('Import Readings…', 'importReadings'),
        item('Export All Readings…', 'exportAllReadings', { enabled: state.hasReadings }),
        sep,
        // The Decks page's button. Export stays on each deck's row: it needs a
        // deck, and the menu has no selection to give it.
        item('Import Deck…', 'importDeck'),
        sep,
        // The About card's button: the folder that holds every corvath file.
        item('Reveal Data Folder', 'revealDataFolder'),
        sep,
        // ⌘W is the window's: Corvath has no tabs (macos-chrome.md §8).
        { role: 'close' }
      ]
    },
    // Keep it: without an Edit menu, ⌘C, ⌘V and ⌘A stop working in text fields.
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        // No zoom items: `optimizer.watchWindowShortcuts` blocks the zoom keys in
        // every build, which stops a menu accelerator too. No Reload or Force
        // Reload in any build: they drop the edits the stores have not saved.
        { role: 'togglefullscreen' },
        ...(isDev ? [sep, { role: 'toggleDevTools' } as MenuItemConstructorOptions] : [])
      ]
    },
    {
      label: 'Go',
      // The nav tabs. Corvath keeps no page history, so there is no Back or
      // Forward.
      submenu: GO_VIEWS.map(([view, label], i) =>
        item(label, `go:${view}`, { accelerator: `Cmd+${i + 1}` })
      )
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [item('Report an Issue…', 'reportIssue'), item('What’s New', 'whatsNew')]
    }
  ]
}
