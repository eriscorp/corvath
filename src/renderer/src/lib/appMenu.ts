import { useEffect } from 'react'
import type { GoView, MenuMessage, MenuState } from '@shared/appMenu'
import { useMenuStore } from '@renderer/store/menuStore'
import { useViewStore } from '@renderer/store/viewStore'
import { useReadingsStore } from '@renderer/store/readingsStore'
import { useReportStore } from '@renderer/store/reportStore'

/**
 * The renderer half of the macOS application menu: run a menu command, and
 * report what the menu greys out. Each command runs the same action as its
 * button. A command whose action a store holds calls the store; one whose
 * action a component holds in its own state goes through `menuStore`, after a
 * switch to the page that owns it (macos-chrome.md §3.3 in the document repo).
 */
export function runMenuCommand(msg: MenuMessage): void {
  // Nothing while a modal is open: a page change would unmount the page under
  // a dialog that belongs to it (the readings import, a delete confirmation),
  // and lose what was typed there. A Mac app disables its menu behind a sheet
  // the same way. The standard roles (Copy, Paste, Quit) are main's and still
  // work.
  if (isModalOpen()) return
  const { request } = useMenuStore.getState()
  const { setView } = useViewStore.getState()
  switch (msg.command) {
    case 'settings':
      setView('settings')
      return
    // The About card on the Settings page owns these: its two dialogs and its
    // update-check button.
    case 'about':
    case 'checkForUpdates':
    case 'whatsNew':
      setView('settings')
      request(msg.command)
      return
    // The Readings page's buttons.
    case 'newReading':
    case 'importReadings':
      setView('readings')
      request(msg.command)
      return
    case 'exportAllReadings':
      // "Export all" is disabled without a reading; the menu greys it out the
      // same way, and this is the guard behind the greying.
      if (useReadingsStore.getState().readings.length === 0) return
      setView('readings')
      request('exportAllReadings')
      return
    // The Decks page's button.
    case 'importDeck':
      setView('decks')
      request('importDeck')
      return
    // The About card's button; it needs no page.
    case 'revealDataFolder':
      window.api.revealSettings()
      return
    // The dialog is mounted in App, because the error boundary opens it too.
    case 'reportIssue':
      useReportStore.getState().setOpen(true)
      return
    default:
      // Every case left is a `go:<view>` item.
      setView(msg.command.slice('go:'.length) as GoView)
  }
}

/** An open MUI `Modal`: a dialog, a menu, a select's list or a popover. A
 *  closed one is unmounted, or carries `MuiModal-hidden` when kept mounted. */
export function isModalOpen(doc: Document = document): boolean {
  return doc.querySelector('.MuiModal-root:not(.MuiModal-hidden)') !== null
}

/** What the menu greys out, from the stores. */
export function currentMenuState(): MenuState {
  return {
    ready: true,
    hasReadings: useReadingsStore.getState().readings.length > 0
  }
}

/**
 * The stores `currentMenuState` reads. The menu state is sent again whenever
 * one of them changes, and only when the state differs (the readings store
 * changes with every keystroke in a reading; the report does not).
 */
const MENU_STATE_STORES: { subscribe: (listener: () => void) => () => void }[] = [useReadingsStore]

/**
 * Wire the menu once the app has hydrated: run its commands, and report its
 * state. macOS only; elsewhere there is no menu to drive. Called once, in App.
 */
export function useAppMenu(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || window.api.platform !== 'darwin') return
    let last = ''
    const report = (): void => {
      const state = currentMenuState()
      const json = JSON.stringify(state)
      if (json === last) return
      last = json
      window.api.menu.setState(state)
    }
    report()
    const unsubs = MENU_STATE_STORES.map((s) => s.subscribe(report))
    const offCommand = window.api.menu.onCommand(runMenuCommand)
    return () => {
      for (const u of unsubs) u()
      offCommand()
    }
  }, [enabled])
}
