import { describe, it, expect, vi } from 'vitest'
import type { IpcMain } from 'electron'
import { registerHandlers } from '../handlers'
import type { Stores } from '../store'
import type { PickerDialog } from '../pickerStart'

/**
 * The reveal handshake answers every window, not only the first. On macOS ⌘W
 * closes the window and the app stays in the Dock; a click on the Dock icon
 * builds a new window, which stays hidden until its renderer sends `app:ready`.
 * With a `once` listener that second signal reached nothing.
 */
describe('app:ready', () => {
  it('is an `on` listener, so a later window is revealed too', () => {
    const on = new Map<string, (...args: unknown[]) => void>()
    const once = new Map<string, (...args: unknown[]) => void>()
    const ipcMain = {
      handle: () => undefined,
      on: (channel: string, fn: (...args: unknown[]) => void) => on.set(channel, fn),
      once: (channel: string, fn: (...args: unknown[]) => void) => once.set(channel, fn)
    } as unknown as IpcMain
    const onAppReady = vi.fn()
    registerHandlers(
      { ipcMain, BrowserWindow: {} as never, dialog: {} as PickerDialog },
      { store: {} as Stores, onAppReady }
    )
    expect(once.has('app:ready')).toBe(false)
    on.get('app:ready')!({})
    on.get('app:ready')!({})
    expect(onAppReady).toHaveBeenCalledTimes(2)
  })
})
