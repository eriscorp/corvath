import {
  app,
  shell,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  net,
  protocol,
  session
} from 'electron'
import originalFs from 'original-fs'
import { join, extname } from 'path'
import { readFile } from 'fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
// 256px PNG32, not the 1254px master — this is the window/taskbar icon, and the
// master is build-time only (electron-builder reads it from build/icon.png).
import icon from '../../resources/corvath-icon-256.png?asset'
import { createStores } from './store'
import { createSplashWindow } from './splash'
import { registerHandlers } from './handlers'
import { captureError, getLogsDir, initSessionLog } from './sessionLog'
import { installGlobalErrorHandlers } from './errorHandlers'
import { buildDiagnostics, copyReport, openIssue, type DiagnosticsIo } from './diagnostics'
import { pickerDialog, withPickerStart } from './pickerStart'
import { shouldDisableHardwareAcceleration, REMOTE_SESSION_CSS } from './remoteSession'
import { sweepPortableLeftovers } from './portableSweep'
import { buildMenuTemplate } from './appMenu'
import { appIdentity } from '../shared/appIdentity'
import {
  INITIAL_MENU_STATE,
  MENU_COMMAND_CHANNEL,
  type MenuMessage,
  type MenuState
} from '../shared/appMenu'
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
//
// %LOCALAPPDATA% is honoured on EVERY platform (HTOO-543). Nothing sets it on
// macOS or Linux except the e2e helper, which points it at a temp dir. Read on
// Windows only, that redirect did nothing elsewhere: on macOS no variable moves
// appData, so every spec ran against the real profile and a spec that saves
// wrote it. Corvath has no roaming migration to guard.
/** How long after boot the portable sweep waits (portableSweep.ts). */
const PORTABLE_SWEEP_DELAY_MS = 30_000

const COMPANY = 'Erisco'
const APP_DIR = 'Corvath'
const localAppData =
  process.env.LOCALAPPDATA ??
  (process.platform === 'win32'
    ? join(app.getPath('home'), 'AppData', 'Local')
    : app.getPath('appData'))

const dataPath = join(localAppData, COMPANY, APP_DIR)
app.setPath('userData', dataPath)

// A Remote Desktop session has no GPU, so Chromium rasterises in software while
// still paying for GPU compositing and RDP re-encodes every repaint — and a
// frameless window drags through Chromium's app-region hit testing, which is
// the expensive path under exactly those conditions. HTOO-325;
// `remoteSession.ts` carries the reasoning, the CORVATH_DISABLE_GPU override,
// and what this deliberately does not detect (a reconnected console session).
//
// It sits HERE, beside the `setPath` above, because both must run before the
// `ready` event and this one fails SILENTLY afterwards rather than throwing.
// That ordering is the one thing about this fix no unit test could otherwise
// see, so `bootOrder.test.ts` reads this file and asserts the position. Read
// ONCE and kept, because `createWindow` needs the same answer later.
const isRemoteSession = shouldDisableHardwareAcceleration(process.platform, process.env)
if (isRemoteSession) app.disableHardwareAcceleration()

// Single instance (HTOO-351). Two copies share one data folder, and the store
// debounces its writes, so a second copy can flush a stale snapshot over a
// reading the first one has just saved — a loss the user cannot rebuild. The
// second launch surfaces the window we already have instead (see
// `focusMainWindow`). An installed copy beside a portable exe is the ordinary
// way two copies come to exist.
//
// The lock is keyed on the userData dir, so it comes AFTER the setPath above,
// and after the GPU call, which cannot move down (it is a no-op past `ready`)
// while the lock is indifferent: a losing instance exits before it renders.
// It comes BEFORE every module-scope side effect below — the error handlers,
// the stores, the scheme registration — so a losing instance touches none of
// them, and in particular not the owner's session log. `app.exit(0)`, not
// `app.quit()`: `quit()` is async, so the losing instance would run all of
// that before the event loop tore it down. `exit()` stops here.
// `bootOrder.test.ts` pins the position.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) app.exit(0)

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

// False until the reveal below runs for the current main window. Each window
// that `createWindow` builds starts unrevealed, also one that `activate`
// builds after ⌘W on macOS.
let mainWindowRevealed = false

/** How long a main window waits for `app:ready` before the backstop shows it. */
const REVEAL_BACKSTOP_MS = 15_000

// Reveal the main window and dismiss the splash. Called once the renderer
// signals `app:ready` (first painted frame is already in the persisted theme),
// with a timeout backstop so a renderer failure can't leave the window hidden.
// Idempotent — the backstop and the IPC signal may both fire. A window that is
// already gone is not shown: `focusMainWindow` checks `isDestroyed`.
function revealMainWindow(): void {
  if (mainWindowRevealed) return
  mainWindowRevealed = true
  focusMainWindow()
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close()
  }
  splashWindow = null
}

// Bring the window we already have to the user: the `second-instance` response,
// and the reveal's own show.
//
// **While the boot reveal is still to come, a second launch does nothing**, and
// the reveal shows and focuses the window when the renderer is ready. Showing
// it directly during boot goes around the splash: the splash is a separate
// always-on-top window, and it would hang over the app until the 15 s backstop
// (mabon's finding). Mabon calls the reveal early instead; corvath does not,
// because it holds the window hidden until the renderer has painted in the
// persisted theme, and an early reveal shows the unthemed white frame that the
// handshake exists to hide. The splash is on screen meanwhile, so the second
// launch is not silent.
//
// `restore()` before `show()`: a minimised window otherwise takes focus in the
// taskbar and never comes forward, which reads as the launch doing nothing.
function focusMainWindow(): void {
  if (!mainWindowRevealed) return
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

// Registered at module scope, before whenReady: the losing instance signals as
// soon as it fails the lock, which can land before this one has booted.
app.on('second-instance', focusMainWindow)

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    // macOS keeps its native stoplight buttons, inset into corvath's own title
    // bar; the renderer's TitleBar then draws no buttons, logo or name there.
    // `y: 10` centres the lights in the 36 px bar of the house title-bar module
    // (HTOO-572; corvath's old bar was 40 px, with `y: 12`). A different bar
    // height needs a different `y`, and only a Mac shows whether it is right.
    // Windows and Linux stay frameless with the renderer's buttons
    // (macos-chrome.md §2 in the document repo).
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 12, y: 10 } }
      : { frame: false }),
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

  // The other half of the remote-session mitigation (HTOO-327). Turning the GPU
  // off and leaving `backdropFilter: blur(2px)` on `MuiPaper.root` — which four
  // of the six themes carry — answers a drag-lag report by removing the hardware
  // and keeping the work. `remoteSession.ts` carries why this is injected rather
  // than edited into the themes.
  //
  // `dom-ready`, not `did-finish-load`: it fires before first paint, so there is
  // no flash of the blurred style. The failure is logged rather than thrown — a
  // window that renders with one expensive effect still beats no window, and
  // this whole path is a performance mitigation rather than a correctness one.
  // It goes to the session log, because a packaged app has no console.
  //
  // The splash is deliberately not a second call site: it has no `MuiPaper` and
  // is on screen for a moment.
  if (isRemoteSession) {
    const contents = mainWindow.webContents
    contents.on('dom-ready', () => {
      contents.insertCSS(REMOTE_SESSION_CSS).catch((err: unknown) => {
        captureError({
          source: 'display',
          message: `Remote-session CSS injection failed: ${err instanceof Error ? err.message : String(err)}`
        })
      })
    })
  }

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

  // A new window starts hidden until its renderer signals `app:ready`. The
  // backstop shows it if that never comes. The timer names its own window: on
  // macOS, ⌘W and a click on the Dock icon can build a new window before an
  // earlier window's timer fires, and that timer must not show the new window
  // before its renderer has painted in the persisted theme.
  mainWindowRevealed = false
  setTimeout(() => {
    if (mainWindow === win) revealMainWindow()
  }, REVEAL_BACKSTOP_MS)

  win.on('close', () => {
    win.hide()
    // On macOS the app keeps running with no window after ⌘W. A menu command
    // then reaches no renderer, so the app items go grey until a new window
    // (from the Dock) reports again. Nothing cancels a close, so this is final.
    onMenuState(INITIAL_MENU_STATE)
  })

  if (RENDERER_DEV_URL) {
    mainWindow.loadURL(RENDERER_DEV_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html')).catch((err) => {
      console.error('Failed to load renderer:', err)
    })
  }
}

// ── The macOS application menu ───────────────────────────────────────────────
// An app item sends `menu:command` to the main window; the renderer reports
// what to grey out (`app:setMenuState`), and the menu is rebuilt when that
// changes. Windows and Linux keep Electron's default (hidden) menu: a menu
// there would register its accelerators even while hidden. The design is
// docs/architecture/macos-chrome.md in the document repo.
let menuState: MenuState = INITIAL_MENU_STATE

function sendMenuCommand(msg: MenuMessage): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(MENU_COMMAND_CHANNEL, msg)
  }
}

function applyAppMenu(): void {
  if (process.platform !== 'darwin') return
  const template = buildMenuTemplate(menuState, {
    // The product name, not `app.name` ("corvath"): see MenuOptions.appName.
    appName: appIdentity.productName,
    isDev: !app.isPackaged,
    send: sendMenuCommand
  })
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function onMenuState(state: MenuState): void {
  if (JSON.stringify(state) === JSON.stringify(menuState)) return
  menuState = state
  if (app.isReady()) applyAppMenu()
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('co.eris.corvath')

  // Before the first window, so Electron's default menu (with Reload) is never
  // installed on macOS. Returns at once elsewhere.
  applyAppMenu()

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
  // and the app:ready reveal handshake) live in handlers.ts. Each window that
  // `createWindow` builds has its own 15 s reveal backstop, in case its
  // renderer never signals.
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
      onMenuState,
      appVersion: () => app.getVersion(),
      // The update check's one request goes through Chromium's network stack, so
      // it uses the system proxy and the OS certificate store.
      fetchImpl: (url, init) => net.fetch(url, init),
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

  // Portable exe only: delete the %TEMP% unpack folders that killed launches
  // left behind. Delayed so it does not compete with boot for the disk, and
  // unref'd so it never holds the process open. See portableSweep.ts for why
  // each of its rules is safe (HTOO-494). A packaged app has no console, so a
  // failure goes to the session log.
  setTimeout(() => {
    void sweepPortableLeftovers({
      // original-fs, not fs: the patched fs opens a leftover's app.asar and then
      // holds it, so every rename is refused.
      fs: originalFs.promises,
      execPath: process.execPath,
      isPortable: app.isPackaged && Boolean(process.env['PORTABLE_EXECUTABLE_DIR']),
      onError: (message) => captureError({ source: 'portable-sweep', message })
    })
  }, PORTABLE_SWEEP_DELAY_MS).unref()

  createWindow()

  // macOS: after ⌘W the app stays in the Dock with no window, and a click on
  // the Dock icon builds a new one. `createWindow` starts it unrevealed, so its
  // own `app:ready` reveals it, with its own backstop as at boot.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
