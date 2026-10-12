import { app, shell, BrowserWindow, clipboard, dialog, ipcMain, protocol, session } from 'electron'
import { join, extname } from 'path'
import { readFile } from 'fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
// 256px PNG32, not the 1254px master — this is the window/taskbar icon, and the
// master is build-time only (electron-builder reads it from build/icon.png).
import icon from '../../resources/corvath-icon-256.png?asset'
import { createStores } from './store'
import { createSplashWindow } from './splash'
import { registerHandlers } from './handlers'
import { checkForUpdate } from './updateCheck'
import { captureError, getLogsDir, initSessionLog } from './sessionLog'
import { installGlobalErrorHandlers } from './errorHandlers'
import { buildDiagnostics, copyReport, openIssue, type DiagnosticsIo } from './diagnostics'
import { pickerDialog, withPickerStart } from './pickerStart'
import {
  cspForRenderer,
  guardIpc,
  hardenWindow,
  initWindowSecurity,
  installContentSecurityPolicy,
  registerTrustedWindow
} from './windowSecurity'

// Everything — readings, decks, settings, and the disposable Electron cache —
// lives under %LOCALAPPDATA%/Erisco/Corvath. On Windows Electron's appData path
// is the ROAMING dir, so we resolve %LOCALAPPDATA% ourselves; macOS/Linux have no
// roaming concept and appData is already local (mirrors hyb-electron-template).
const COMPANY = 'Erisco'
const APP_DIR = 'Corvath'
const localAppData =
  process.platform === 'win32'
    ? (process.env.LOCALAPPDATA ?? join(app.getPath('home'), 'AppData', 'Local'))
    : app.getPath('appData')

const dataPath = join(localAppData, COMPANY, APP_DIR)
app.setPath('userData', dataPath)

// The two side effects main/diagnostics.ts needs, injected rather than imported
// there. That keeps the module free of a runtime `electron` import — which is
// what lets handlers.ts import it under the node test project — and it makes
// "the clipboard gets the full body BEFORE the URL opens" an assertion on two
// spies rather than an electron stub.
//
// `clipboard.writeText` returns a Promise since Electron 44 (HTOO-553). The old
// `(text) => void` type accepted it, so no typecheck found the dropped Promise.
// A failed or timed-out copy goes to the session log, so a report shows it.
const diagnosticsIo: DiagnosticsIo = {
  writeClipboard: (text) => clipboard.writeText(text),
  onCopyFailed: (reason) =>
    captureError({ source: 'clipboard', message: `Clipboard write failed: ${reason}` }),
  openExternal: (url) => {
    void shell.openExternal(url)
  }
}

// Installed at module scope, as early as anything can be: an uncaught error
// during boot is exactly the one a report needs, and it can happen before
// whenReady resolves. Capture rings-buffers until initSessionLog gives it a
// file, which is the best-effort contract the whole module is built on.
installGlobalErrorHandlers(captureError)

// Bundled (shipped) deck art lives in <appRoot>/bundled/decks/<deckId>/.
// __dirname is out/main in dev and inside the asar in production; both resolve
// to a readable bundled/ alongside the app.
const bundledDecksDir = join(__dirname, '../../bundled/decks')

const store = createStores(dataPath, bundledDecksDir)

// Custom scheme for serving imported deck images to the renderer. Registered as
// privileged so it's treated as secure and usable from <img>/fetch under CSP.
protocol.registerSchemesAsPrivileged([
  { scheme: 'corvath-asset', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml'
}

// corvath-asset://img/<deckId>/<filename> — try the user's imported image
// first, then fall back to bundled (shipped) deck art.
async function handleAssetRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const [deckId, ...rest] = url.pathname.replace(/^\/+/, '').split('/')
  const id = decodeURIComponent(deckId ?? '')
  const filename = decodeURIComponent(rest.join('/'))
  const candidates = [
    store.resolveImagePath(id, filename),
    store.resolveBundledImagePath(id, filename)
  ]
  for (const filePath of candidates) {
    if (!filePath) continue
    try {
      const data = await readFile(filePath)
      const mime = IMAGE_MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
      // no-cache: Chromium revalidates instead of hard-caching, so a replaced
      // image (same URL, unchanged version) still refreshes.
      return new Response(new Uint8Array(data), {
        headers: { 'content-type': mime, 'cache-control': 'no-cache' }
      })
    } catch {
      /* try next candidate */
    }
  }
  return new Response('Not found', { status: 404 })
}

// The dev-server URL, or undefined. ONE expression for the three things that
// depend on it, so they cannot disagree: the trusted location, the URL the
// window loads, and the CSP relaxation (HTOO-467). `|| undefined`, not
// `?? undefined`: an empty variable must fall through to the packaged path,
// not be trusted as a location.
const RENDERER_DEV_URL = (is.dev && process.env['ELECTRON_RENDERER_URL']) || undefined

let mainWindow: BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null

// Reveal the main window and dismiss the splash. Called once the renderer
// signals `app:ready` (first painted frame is already in the persisted theme),
// with a timeout backstop so a renderer failure can't leave the window hidden.
// Idempotent — the backstop and the IPC signal may both fire.
function revealMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
    mainWindow.show()
  }
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close()
  }
  splashWindow = null
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    icon,
    title: 'Corvath',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Checked, not assumed. The preload uses no node built-ins, but that alone
      // does NOT make it sandbox-safe: externalizeDepsPlugin was leaving
      // `require("@electron-toolkit/preload")` in the built output, and a
      // sandboxed preload can only require electron. The vite preload config now
      // bundles that package instead of externalizing it, so `require("electron")`
      // is all that remains — verified against out/preload/index.js.
      sandbox: true
    }
  })

  // Trusted before anything loads, so the first IPC from this window is accepted
  // and nothing else is.
  registerTrustedWindow(mainWindow)
  hardenWindow(mainWindow, {
    allowExternal: true,
    openExternal: (url) => void shell.openExternal(url)
  })

  // Keep the renderer's maximize/restore icon in sync with the actual state.
  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximizeChange', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximizeChange', false))

  // A window keeps its native background — Electron's default white, because no
  // `backgroundColor` can be right for a theme set that has light entries —
  // while the renderer's compositor tears down. That background is what paints
  // for the last frame or two before the window leaves the screen, which reads
  // as a white flash on quit (HTOO-456). Hiding the window takes it off screen
  // first: `close` runs before the teardown, and the close itself proceeds as
  // normal after this returns. Corvath has no close guard, so one hide here
  // covers every close path — title-bar button, Alt+F4, taskbar, `app.quit()` —
  // because they all raise `close`.
  const win = mainWindow
  win.on('close', () => {
    win.hide()
  })

  if (RENDERER_DEV_URL) {
    mainWindow.loadURL(RENDERER_DEV_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html')).catch((err) => {
      console.error('Failed to load renderer:', err)
    })
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('co.eris.corvath')

  // Errors only, five sessions kept, in a subfolder of its own so "Reveal logs"
  // has a target holding nothing else.
  await initSessionLog(join(dataPath, 'logs'))

  // Establish what counts as "our own content" BEFORE any window loads. Until
  // this runs the trusted set is empty, which fails closed.
  initWindowSecurity(RENDERER_DEV_URL, join(__dirname, '../renderer/index.html'))

  // Serve the CSP as a HEADER as well as the meta tag in index.html. Installed
  // here, before the splash loads, because the splash is the first document the
  // app paints and a policy installed after it would miss it entirely.
  // Relaxed only for the dev server, never on NODE_ENV: the built bundle reads
  // NODE_ENV at run time, so a stray NODE_ENV=development in a user's shell
  // relaxed a packaged app (HTOO-467).
  installContentSecurityPolicy(session.defaultSession, cspForRenderer(RENDERER_DEV_URL))

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  protocol.handle('corvath-asset', handleAssetRequest)

  // Show the splash immediately, before the (awaited) seed work and window load,
  // so the user gets instant feedback.
  splashWindow = createSplashWindow()

  const seededAt = new Date().toISOString()
  await store.ensureDecksSeeded(seededAt)
  await store.ensureLayoutsSeeded(seededAt)

  // All IPC channels (data persistence, image import/cleanup, window controls,
  // and the app:ready reveal handshake) live in handlers.ts. Reveal has a 15 s
  // backstop in case the renderer never signals.
  // guardIpc wraps ipcMain once, here — every channel registered inside
  // registerHandlers is covered by construction, so a new handler cannot forget
  // to validate its sender.
  // withPickerStart wraps the dialog once, for the same reason: since Electron 43
  // a picker with no start folder opens in Downloads, and every picker added
  // later gets the rule without remembering it (HTOO-553).
  registerHandlers(
    {
      ipcMain: guardIpc(ipcMain),
      BrowserWindow,
      dialog: withPickerStart(pickerDialog(dialog), {
        // getPath throws when the OS has no such folder. A picker then starts at
        // the next one rather than failing to open.
        fallbacks: () =>
          (['documents', 'home'] as const).flatMap((name) => {
            try {
              return [app.getPath(name)]
            } catch {
              return []
            }
          })
      })
    },
    {
      store,
      onAppReady: revealMainWindow,
      appVersion: () => app.getVersion(),
      // The folder every corvath file lives in, which is what a user asking
      // "where are my readings" wants — not the parent, and not a single file.
      revealSettings: () => {
        shell.openPath(dataPath).then((err) => {
          if (err) console.error('[app:revealSettings] could not open', dataPath, '-', err)
        })
      },
      // CHANGELOG.md is named in electron-builder.yml's `files` allowlist purely
      // so this can read it. In dev the app root is the repo, so the same path
      // resolves either way.
      diagnostics: {
        build: () => buildDiagnostics(app.getVersion()),
        openIssue: (p) => openIssue(diagnosticsIo, p),
        copyReport: (p) => copyReport(diagnosticsIo, p),
        // Renderer errors join main's own at the single scrub site, which is what
        // makes the on-disk log already safe to attach.
        captureRendererError: (report) => captureError({ ...report, origin: 'renderer' }),
        revealLogs: () => {
          const dir = getLogsDir()
          if (!dir) return
          shell.openPath(dir).then((err) => {
            if (err) console.error('[diagnostics:revealLogs] could not open', dir, '-', err)
          })
        }
      },
      readChangelog: async () => {
        try {
          return await readFile(join(app.getAppPath(), 'CHANGELOG.md'), 'utf8')
        } catch (err) {
          console.error('[app:readChangelog] could not read the changelog -', err)
          return ''
        }
      }
    }
  )
  setTimeout(revealMainWindow, 15000)

  createWindow()

  // Best-effort update notification. The fetch latency comfortably outlasts the
  // renderer mount, but gate on load anyway so the message isn't sent into a
  // page that hasn't registered its listener yet.
  void checkForUpdate(app.getVersion()).then((info) => {
    if (!info || !mainWindow || mainWindow.isDestroyed()) return
    const send = (): void => mainWindow?.webContents.send('update:available', info)
    if (mainWindow.webContents.isLoading()) mainWindow.webContents.once('did-finish-load', send)
    else send()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
