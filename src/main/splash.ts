import { BrowserWindow } from 'electron'
import { join } from 'path'
import { hardenWindow } from './windowSecurity'

/**
 * Frameless, transparent splash window shown the instant the app boots — before
 * the main window's renderer bundle has evaluated. It stays up until the
 * renderer signals `app:ready` (see the boot sequence in `index.ts`), so the
 * user gets immediate branded feedback instead of a few seconds of nothing.
 *
 * Deliberately dependency-free and self-contained (loads a static
 * `resources/splash.html`, which pulls in the app logo from the same folder)
 * — ported from taliesin.
 */
export function createSplashWindow(): BrowserWindow {
  const splash = new BrowserWindow({
    width: 420,
    height: 260,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    center: true,
    skipTaskbar: true,
    show: false,
    // Chromium's default native background is opaque white, and `transparent:
    // true` alone does not change it — a transparent window can still paint
    // white for a frame before its first real paint. Only an explicit fully
    // transparent `backgroundColor` removes it. Same root cause as the close
    // flash in index.ts (HTOO-456), at the other end of the window's life.
    backgroundColor: '#00000000',
    // The splash has no IPC needs; keep it isolated with no preload.
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // The splash opens nothing and navigates nowhere. It is never registered as a
  // trusted IPC sender — with no preload it has no bridge to send over anyway.
  hardenWindow(splash, { allowExternal: false, openExternal: () => {} })

  // resources/ is bundled with the app (and packed into the asar, from which
  // loadFile reads transparently), so this resolves in production too.
  splash.loadFile(join(__dirname, '../../resources/splash.html')).catch((err) => {
    console.error('Failed to load splash:', err)
  })

  splash.once('ready-to-show', () => splash.show())
  return splash
}
