import { describe, it, expect, vi } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'
import { buildMenuTemplate, parseMenuState } from '../appMenu'
import { GO_VIEWS, INITIAL_MENU_STATE, type MenuState } from '../../shared/appMenu'

const READY: MenuState = { ready: true, hasReadings: true }

function build(state: MenuState = READY, isDev = false, send = vi.fn()) {
  return buildMenuTemplate(state, { appName: 'Corvath', isDev, send })
}

/** Every item, depth first. */
function flat(items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return items.flatMap((i) => [
    i,
    ...(Array.isArray(i.submenu) ? flat(i.submenu as MenuItemConstructorOptions[]) : [])
  ])
}

function byId(items: MenuItemConstructorOptions[], id: string): MenuItemConstructorOptions {
  const found = flat(items).find((i) => i.id === id)
  if (!found) throw new Error(`no item ${id}`)
  return found
}

/** A top-level menu's items: an app item by its id, a standard item by role. */
function menu(t: MenuItemConstructorOptions[], label: string): (string | undefined)[] {
  const top = t.find((i) => i.label === label || i.role === label)
  return (top?.submenu as MenuItemConstructorOptions[]).map((i) =>
    i.type === 'separator' ? '-' : (i.id ?? i.role)
  )
}

const APP_ITEMS = [
  'about',
  'checkForUpdates',
  'settings',
  'newReading',
  'importReadings',
  'exportAllReadings',
  'importDeck',
  'revealDataFolder',
  'go:readings',
  'go:draw',
  'go:decks',
  'go:layouts',
  'reportIssue',
  'whatsNew'
]

describe('buildMenuTemplate (macOS application menu)', () => {
  it('has the house menus, in order', () => {
    expect(build().map((i) => i.label ?? i.role)).toEqual([
      'Corvath',
      'File',
      'editMenu',
      'View',
      'Go',
      'windowMenu',
      'help'
    ])
  })

  it('fills each menu with the commands of corvath', () => {
    const t = build()
    expect(menu(t, 'Corvath')).toEqual([
      'about',
      'checkForUpdates',
      '-',
      'settings',
      '-',
      'services',
      '-',
      'hide',
      'hideOthers',
      'unhide',
      '-',
      'quit'
    ])
    expect(menu(t, 'File')).toEqual([
      'newReading',
      '-',
      'importReadings',
      'exportAllReadings',
      '-',
      'importDeck',
      '-',
      'revealDataFolder',
      '-',
      'close'
    ])
    expect(menu(t, 'Go')).toEqual(['go:readings', 'go:draw', 'go:decks', 'go:layouts'])
    expect(menu(t, 'help')).toEqual(['reportIssue', 'whatsNew'])
  })

  it('has no Reload or Force Reload, no zoom, and Developer Tools only in a dev build', () => {
    const roles = (t: MenuItemConstructorOptions[]): unknown[] => flat(t).map((i) => i.role)
    for (const t of [build(), build(READY, true)]) {
      expect(roles(t)).not.toContain('reload')
      expect(roles(t)).not.toContain('forceReload')
      // The optimizer blocks the zoom keys, so the menu offers no zoom.
      for (const role of ['resetZoom', 'zoomIn', 'zoomOut']) expect(roles(t)).not.toContain(role)
    }
    expect(roles(build())).not.toContain('toggleDevTools')
    expect(roles(build(READY, true))).toContain('toggleDevTools')
  })

  it('keeps the Edit menu, without which ⌘C, ⌘V and ⌘A stop working in text fields', () => {
    expect(build().map((i) => i.role)).toContain('editMenu')
  })

  it('names the product in the role labels, not the package name "corvath"', () => {
    const t = build()
    expect(byId(t, 'about').label).toBe('About Corvath')
    const labelOf = (role: string): unknown => flat(t).find((i) => i.role === role)?.label
    expect(labelOf('hide')).toBe('Hide Corvath')
    expect(labelOf('quit')).toBe('Quit Corvath')
  })

  it('gives ⌘, to Settings, ⌘N to New Reading, and ⌘1 to ⌘4 to the pages', () => {
    const t = build()
    expect(byId(t, 'settings').accelerator).toBe('Cmd+,')
    expect(byId(t, 'newReading').accelerator).toBe('Cmd+N')
    expect(GO_VIEWS.map(([view]) => byId(t, `go:${view}`).accelerator)).toEqual([
      'Cmd+1',
      'Cmd+2',
      'Cmd+3',
      'Cmd+4'
    ])
  })

  it('sends its command when an item is clicked', () => {
    for (const id of APP_ITEMS) {
      const send = vi.fn()
      ;(byId(build(READY, false, send), id).click as unknown as () => void)()
      expect(send).toHaveBeenCalledExactlyOnceWith({ command: id })
    }
  })

  it('greys out every app item until the renderer reports', () => {
    for (const id of APP_ITEMS) {
      expect(byId(build(INITIAL_MENU_STATE), id).enabled, id).toBe(false)
      expect(byId(build(READY), id).enabled, id).toBe(true)
    }
  })

  it('greys out Export All Readings without a reading, as the page disables its button', () => {
    const t = build({ ready: true, hasReadings: false })
    expect(byId(t, 'exportAllReadings').enabled).toBe(false)
    expect(byId(t, 'newReading').enabled).toBe(true)
    expect(byId(t, 'importReadings').enabled).toBe(true)
  })
})

describe('parseMenuState', () => {
  it('accepts a MenuState', () => {
    expect(parseMenuState(READY)).toEqual(READY)
    expect(parseMenuState(INITIAL_MENU_STATE)).toEqual(INITIAL_MENU_STATE)
  })

  it('rejects anything else', () => {
    expect(parseMenuState(null)).toBeNull()
    expect(parseMenuState({})).toBeNull()
    expect(parseMenuState({ ready: true })).toBeNull()
    expect(parseMenuState({ ready: 'yes', hasReadings: false })).toBeNull()
  })
})
