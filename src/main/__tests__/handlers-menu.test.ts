import { describe, it, expect, vi } from 'vitest'
import type { IpcMain } from 'electron'
import { registerHandlers, type HandlerContext } from '../handlers'
import { MENU_STATE_CHANNEL } from '../../shared/appMenu'
import type { Stores } from '../store'
import type { PickerDialog } from '../pickerStart'

/** The `on` and `once` listeners that `registerHandlers` installs, by channel. */
function register(ctx: Partial<HandlerContext>): Map<string, (...args: unknown[]) => void> {
  const listeners = new Map<string, (...args: unknown[]) => void>()
  const add = (channel: string, fn: (...args: unknown[]) => void): void => {
    listeners.set(channel, fn)
  }
  const ipcMain = { handle: () => undefined, on: add, once: add } as unknown as IpcMain
  registerHandlers(
    { ipcMain, BrowserWindow: {} as never, dialog: {} as PickerDialog },
    { store: {} as Stores, ...ctx }
  )
  return listeners
}

describe('the macOS menu state (app:setMenuState)', () => {
  it('passes a valid report to main, and drops a malformed one', () => {
    const onMenuState = vi.fn()
    const listener = register({ onMenuState }).get(MENU_STATE_CHANNEL)
    expect(listener).toBeDefined()
    listener!({}, { ready: true, hasReadings: false })
    listener!({}, { ready: 'yes' })
    listener!({}, null)
    expect(onMenuState).toHaveBeenCalledExactlyOnceWith({ ready: true, hasReadings: false })
  })
})
