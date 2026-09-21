import { describe, it, expect, vi, beforeEach } from 'vitest'

// The splash is a BrowserWindow, so stand in a fake for the electron module.
// hardenWindow is real: it only touches `webContents`, which the fake supplies.
const created: FakeWindow[] = []

class FakeWindow {
  options: Record<string, unknown>
  visible = false
  loadedFile: string | null = null
  webContents = {
    setWindowOpenHandler: vi.fn(),
    on: vi.fn()
  }
  private handlers = new Map<string, () => void>()

  constructor(options: Record<string, unknown>) {
    this.options = options
    created.push(this)
  }

  loadFile(path: string): Promise<void> {
    this.loadedFile = path
    return Promise.resolve()
  }
  once(event: string, handler: () => void): void {
    this.handlers.set(event, handler)
  }
  emit(event: string): void {
    this.handlers.get(event)?.()
  }
  show(): void {
    this.visible = true
  }
}

vi.mock('electron', () => ({ BrowserWindow: FakeWindow }))

const { createSplashWindow } = await import('../splash')

beforeEach(() => {
  created.length = 0
})

/** The fake the last call built over — `created` is push-ordered. */
const win = (): FakeWindow => created[created.length - 1]

describe('createSplashWindow', () => {
  it('creates a frameless, transparent, always-on-top window that starts hidden', () => {
    createSplashWindow()
    expect(win().options).toMatchObject({
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false
    })
    expect(win().visible).toBe(false)
  })

  it('is fully transparent, not just `transparent: true`', () => {
    // HTOO-456. Chromium's default native background is opaque white, and a
    // transparent window can paint it for a frame before its first real paint.
    // `transparent: true` alone does not change that default; only an explicit
    // fully-transparent `backgroundColor` does.
    createSplashWindow()
    expect(win().options).toMatchObject({ backgroundColor: '#00000000' })
  })

  it('loads resources/splash.html', () => {
    createSplashWindow()
    expect(win().loadedFile).toMatch(/resources[\\/]splash\.html$/)
  })

  it('shows as soon as ready-to-show fires', () => {
    createSplashWindow()
    win().emit('ready-to-show')
    expect(win().visible).toBe(true)
  })

  it('is hardened — opens no windows', () => {
    createSplashWindow()
    expect(win().webContents.setWindowOpenHandler).toHaveBeenCalledTimes(1)
    expect(win().webContents.on).toHaveBeenCalledWith('will-navigate', expect.any(Function))
  })
})
