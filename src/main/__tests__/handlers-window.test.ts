import { describe, it, expect, vi } from 'vitest'
import type { IpcMain } from 'electron'
import { registerHandlers } from '../handlers'
import type { Stores } from '../store'
import type { PickerDialog } from '../pickerStart'

/**
 * The window buttons, from the main side. TitleBar.test.tsx checks that each
 * button sends its channel; this checks what main does with it. It replaced a
 * check by eye on the Linux box (Sabrael, 2026-11-02): maximise twice
 * restores, and close closes the window that sent it.
 */
describe('the window-button channels', () => {
  function wire(): {
    send: (channel: string) => void
    invoke: (channel: string) => unknown
    win: { minimize: () => void; maximize: () => void; unmaximize: () => void; close: () => void }
  } {
    const on = new Map<string, (...args: unknown[]) => unknown>()
    const handle = new Map<string, (...args: unknown[]) => unknown>()
    const ipcMain = {
      handle: (channel: string, fn: (...args: unknown[]) => unknown) => handle.set(channel, fn),
      on: (channel: string, fn: (...args: unknown[]) => unknown) => on.set(channel, fn)
    } as unknown as IpcMain
    let maximized = false
    const win = {
      minimize: vi.fn(),
      maximize: vi.fn(() => (maximized = true)),
      unmaximize: vi.fn(() => (maximized = false)),
      isMaximized: () => maximized,
      close: vi.fn()
    }
    const sender = {}
    registerHandlers(
      {
        ipcMain,
        BrowserWindow: { fromWebContents: (wc: unknown) => (wc === sender ? win : null) } as never,
        dialog: {} as PickerDialog
      },
      { store: {} as Stores }
    )
    return {
      send: (channel) => on.get(channel)!({ sender }),
      invoke: (channel) => handle.get(channel)!({ sender }),
      win
    }
  }

  it('minimise minimises the window that sent it', () => {
    const { send, win } = wire()
    send('window:minimize')
    expect(win.minimize).toHaveBeenCalledOnce()
  })

  it('maximise maximises, and a second press restores', () => {
    const { send, invoke, win } = wire()
    send('window:toggleMaximize')
    expect(win.maximize).toHaveBeenCalledOnce()
    expect(invoke('window:isMaximized')).toBe(true)
    send('window:toggleMaximize')
    expect(win.unmaximize).toHaveBeenCalledOnce()
    expect(win.maximize).toHaveBeenCalledOnce()
    expect(invoke('window:isMaximized')).toBe(false)
  })

  it('close closes the window that sent it', () => {
    const { send, win } = wire()
    send('window:close')
    expect(win.close).toHaveBeenCalledOnce()
  })
})
