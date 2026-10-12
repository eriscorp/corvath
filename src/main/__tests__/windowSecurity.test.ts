import { join } from 'path'
import { pathToFileURL } from 'url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow, IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import {
  __resetWindowSecurityForTests,
  guardIpc,
  hardenWindow,
  initWindowSecurity,
  isSenderAllowed,
  registerTrustedWindow
} from '../windowSecurity'

// windowSecurity imports electron for TYPES only, so it runs unmodified in the
// node project against these fakes — no electron mock needed.

const PROD_INDEX = join('C:', 'Program Files', 'Corvath', 'resources', 'app.asar', 'index.html')
const PROD_URL = pathToFileURL(PROD_INDEX).href
const DEV_URL = 'http://127.0.0.1:5173/'

type Frame = { url: string }

function makeSender(id: number, frameUrl: string, destroyed = false) {
  const mainFrame: Frame = { url: frameUrl }
  return { id, mainFrame, isDestroyed: () => destroyed }
}

/** An IpcMainInvokeEvent-shaped fake: sender + senderFrame. */
function makeEvent(sender: ReturnType<typeof makeSender>, senderFrame?: Frame): IpcMainInvokeEvent {
  return {
    sender,
    senderFrame: senderFrame ?? sender.mainFrame
  } as unknown as IpcMainInvokeEvent
}

/** A BrowserWindow-shaped fake that records the handlers hardenWindow installs. */
function makeWindow(id: number, frameUrl = PROD_URL) {
  const listeners = new Map<string, (...args: never[]) => void>()
  const sender = makeSender(id, frameUrl)
  const destroyedHandlers: Array<() => void> = []
  const webContents = {
    ...sender,
    setWindowOpenHandler: vi.fn(),
    on: (event: string, fn: (...args: never[]) => void) => listeners.set(event, fn),
    once: (event: string, fn: () => void) => {
      if (event === 'destroyed') destroyedHandlers.push(fn)
    }
  }
  return {
    win: { webContents } as unknown as BrowserWindow,
    webContents,
    listeners,
    destroy: () => destroyedHandlers.forEach((f) => f())
  }
}

beforeEach(() => {
  __resetWindowSecurityForTests()
  initWindowSecurity(DEV_URL, PROD_INDEX)
})

afterEach(() => {
  __resetWindowSecurityForTests()
})

describe('isSenderAllowed', () => {
  it('accepts the top frame of a registered window at our own location', () => {
    const { win, webContents } = makeWindow(1)
    registerTrustedWindow(win)
    expect(isSenderAllowed(makeEvent(webContents))).toBe(true)
  })

  it('accepts the dev-server location too', () => {
    const { win, webContents } = makeWindow(1, DEV_URL)
    registerTrustedWindow(win)
    expect(isSenderAllowed(makeEvent(webContents))).toBe(true)
  })

  it('rejects a window that was never registered', () => {
    const { webContents } = makeWindow(2)
    expect(isSenderAllowed(makeEvent(webContents))).toBe(false)
  })

  it('rejects a sub-frame even inside a trusted window', () => {
    const { win, webContents } = makeWindow(3)
    registerTrustedWindow(win)
    // An iframe inheriting the preload must not reach a privileged channel.
    const iframe: Frame = { url: PROD_URL }
    expect(isSenderAllowed(makeEvent(webContents, iframe))).toBe(false)
  })

  it('rejects a trusted window that has navigated to a remote page', () => {
    const { win, webContents } = makeWindow(4, 'https://evil.example.com/')
    registerTrustedWindow(win)
    expect(isSenderAllowed(makeEvent(webContents))).toBe(false)
  })

  it('rejects a file: URL carrying our pathname on a REMOTE host', () => {
    // The reason locationKey compares host and not origin: the WHATWG parser
    // gives every file: URL the opaque origin "null", so an origin check would
    // pass this.
    const unc = `file://evil.example.com${pathToFileURL(PROD_INDEX).pathname}`
    const { win, webContents } = makeWindow(5, unc)
    registerTrustedWindow(win)
    expect(isSenderAllowed(makeEvent(webContents))).toBe(false)
  })

  it('rejects a destroyed sender', () => {
    const { win } = makeWindow(6)
    registerTrustedWindow(win)
    const dead = makeSender(6, PROD_URL, true)
    expect(isSenderAllowed(makeEvent(dead))).toBe(false)
  })

  it('forgets a window once its webContents is destroyed', () => {
    const { win, webContents, destroy } = makeWindow(7)
    registerTrustedWindow(win)
    expect(isSenderAllowed(makeEvent(webContents))).toBe(true)
    destroy()
    // A reused id must not inherit the old window's trust.
    expect(isSenderAllowed(makeEvent(webContents))).toBe(false)
  })

  it('trusts nothing before initWindowSecurity runs', () => {
    __resetWindowSecurityForTests()
    const { win, webContents } = makeWindow(8)
    registerTrustedWindow(win)
    expect(isSenderAllowed(makeEvent(webContents))).toBe(false)
  })
})

describe('guardIpc', () => {
  function makeIpcMain() {
    const handlers = new Map<string, (e: IpcMainInvokeEvent, ...a: unknown[]) => unknown>()
    const listeners = new Map<string, Array<(e: IpcMainEvent, ...a: unknown[]) => void>>()
    const ipc = {
      handle: (c: string, fn: (e: IpcMainInvokeEvent, ...a: unknown[]) => unknown) =>
        handlers.set(c, fn),
      on: (c: string, fn: (e: IpcMainEvent, ...a: unknown[]) => void) => {
        listeners.set(c, [...(listeners.get(c) ?? []), fn])
        return ipc
      },
      once: (c: string, fn: (e: IpcMainEvent, ...a: unknown[]) => void) => {
        listeners.set(c, [...(listeners.get(c) ?? []), fn])
        return ipc
      },
      removeListener: (c: string, fn: (...a: unknown[]) => void) => {
        listeners.set(
          c,
          (listeners.get(c) ?? []).filter((l) => l !== fn)
        )
        return ipc
      }
    }
    const emit = (c: string, e: IpcMainEvent, ...a: unknown[]): void => {
      for (const l of [...(listeners.get(c) ?? [])]) l(e, ...a)
    }
    return { ipc: ipc as unknown as IpcMain, handlers, listeners, emit }
  }

  it('runs an invoke handler for a trusted sender', async () => {
    const { ipc, handlers } = makeIpcMain()
    const { win, webContents } = makeWindow(10)
    registerTrustedWindow(win)
    const body = vi.fn().mockReturnValue('ok')
    guardIpc(ipc).handle('decks:getAll', body)
    const result = await handlers.get('decks:getAll')!(makeEvent(webContents))
    expect(result).toBe('ok')
    expect(body).toHaveBeenCalledOnce()
  })

  it('throws and never runs the body for an untrusted invoke', () => {
    const { ipc, handlers } = makeIpcMain()
    const { webContents } = makeWindow(11) // never registered
    const body = vi.fn()
    guardIpc(ipc).handle('decks:save', body)
    expect(() => handlers.get('decks:save')!(makeEvent(webContents))).toThrow(/untrusted sender/)
    expect(body).not.toHaveBeenCalled()
  })

  it('silently drops an untrusted .on message', () => {
    const { ipc, emit } = makeIpcMain()
    const { webContents } = makeWindow(12)
    const body = vi.fn()
    guardIpc(ipc).on('window:close', body)
    emit('window:close', makeEvent(webContents) as unknown as IpcMainEvent)
    expect(body).not.toHaveBeenCalled()
  })

  it('delivers a trusted .on message', () => {
    const { ipc, emit } = makeIpcMain()
    const { win, webContents } = makeWindow(13)
    registerTrustedWindow(win)
    const body = vi.fn()
    guardIpc(ipc).on('window:close', body)
    emit('window:close', makeEvent(webContents) as unknown as IpcMainEvent)
    expect(body).toHaveBeenCalledOnce()
  })

  it('guards .once, so a channel registered that way is covered', () => {
    const { ipc, emit } = makeIpcMain()
    const { win, webContents } = makeWindow(14)
    const body = vi.fn()
    guardIpc(ipc).once('app:ready', body)

    // Untrusted caller first: dropped, and it must NOT consume the one-shot.
    const untrusted = makeWindow(99)
    emit('app:ready', makeEvent(untrusted.webContents) as unknown as IpcMainEvent)
    expect(body).not.toHaveBeenCalled()

    // The legitimate window still gets through afterwards.
    registerTrustedWindow(win)
    emit('app:ready', makeEvent(webContents) as unknown as IpcMainEvent)
    expect(body).toHaveBeenCalledOnce()

    // ...and only once.
    emit('app:ready', makeEvent(webContents) as unknown as IpcMainEvent)
    expect(body).toHaveBeenCalledOnce()
  })

  it('remaps removeListener to the wrapper it actually registered', () => {
    const { ipc, emit } = makeIpcMain()
    const { win, webContents } = makeWindow(15)
    registerTrustedWindow(win)
    const body = vi.fn()
    const guarded = guardIpc(ipc)
    guarded.on('window:minimize', body)
    guarded.removeListener('window:minimize', body)
    emit('window:minimize', makeEvent(webContents) as unknown as IpcMainEvent)
    expect(body).not.toHaveBeenCalled()
  })

  it('passes through other ipcMain members', () => {
    const { ipc } = makeIpcMain()
    expect(typeof guardIpc(ipc).handle).toBe('function')
  })
})

describe('hardenWindow', () => {
  it('denies every child window, and opens only safe external URLs', () => {
    const { win, webContents } = makeWindow(20)
    const openExternal = vi.fn()
    hardenWindow(win, { allowExternal: true, openExternal })

    const handler = webContents.setWindowOpenHandler.mock.calls[0][0] as (d: {
      url: string
    }) => unknown
    expect(handler({ url: 'https://example.com' })).toEqual({ action: 'deny' })
    expect(openExternal).toHaveBeenCalledWith('https://example.com')

    openExternal.mockClear()
    expect(handler({ url: 'file:///C:/Windows/System32/calc.exe' })).toEqual({ action: 'deny' })
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('opens nothing at all when allowExternal is false (the splash)', () => {
    const { win, webContents } = makeWindow(21)
    const openExternal = vi.fn()
    hardenWindow(win, { allowExternal: false, openExternal })
    const handler = webContents.setWindowOpenHandler.mock.calls[0][0] as (d: {
      url: string
    }) => unknown
    expect(handler({ url: 'https://example.com' })).toEqual({ action: 'deny' })
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('allows navigation to our own content (dev HMR full reload)', () => {
    const { win, listeners } = makeWindow(22)
    hardenWindow(win, { allowExternal: true, openExternal: vi.fn() })
    const event = { preventDefault: vi.fn() }
    listeners.get('will-navigate')!(event as never, PROD_URL as never)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('blocks navigation to a remote page and hands it to the OS instead', () => {
    const { win, listeners } = makeWindow(23)
    const openExternal = vi.fn()
    hardenWindow(win, { allowExternal: true, openExternal })
    const event = { preventDefault: vi.fn() }
    listeners.get('will-navigate')!(event as never, 'https://evil.example.com/' as never)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(openExternal).toHaveBeenCalledWith('https://evil.example.com/')
  })

  it('blocks navigation to a dangerous scheme and does NOT hand it to the OS', () => {
    const { win, listeners } = makeWindow(24)
    const openExternal = vi.fn()
    hardenWindow(win, { allowExternal: true, openExternal })
    const event = { preventDefault: vi.fn() }
    listeners.get('will-navigate')!(event as never, 'file:///C:/Windows/System32/calc.exe' as never)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(openExternal).not.toHaveBeenCalled()
  })
})
