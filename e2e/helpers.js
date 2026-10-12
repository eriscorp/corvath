import { _electron as electron, expect } from '@playwright/test'
import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const repoRoot = join(__dirname, '..')

// The app's userData subdir under %LOCALAPPDATA%. Must match src/main/index.ts
// (`join(localAppData, 'Erisco', 'Corvath')`).
export const USERDATA_SUBPATH = ['Erisco', 'Corvath']

/** Pre-write one of the app's JSON stores into a profile dir before launch. */
function seedStore(localAppData, filename, contents) {
  const dir = join(localAppData, ...USERDATA_SUBPATH)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, filename), JSON.stringify(contents, null, 2))
}

// Launch the BUILT app under Electron.
//
// %LOCALAPPDATA% is redirected to a throwaway temp dir because src/main/index.ts
// derives its userData (settings.json) from %LOCALAPPDATA% at module load, on
// every platform — pointing it at a temp dir keeps every run hermetic and off
// the real profile. assertIsolated below fails the launch if it is not.
// Pass an existing `localAppData` to reuse one dir across two launches
// (persistence-across-relaunch tests). `extraEnv` adds variables to the launch,
// such as CORVATH_DISABLE_GPU.
//
// The `seed*` options pre-write a store so a spec can reach state the shipped
// data cannot. `seedLayouts` exists for the draw specs specifically: no built-in
// layout sets a position `source`, so the pinned-slot path in `planFan` is
// unreachable with seeded data alone.
export async function launchApp({
  seedSettings,
  seedDecks,
  seedLayouts,
  seedReadings,
  localAppData: reuseDir,
  extraEnv
} = {}) {
  const localAppData = reuseDir ?? mkdtempSync(join(tmpdir(), 'hyb-e2e-'))
  if (seedSettings) seedStore(localAppData, 'settings.json', seedSettings)
  // The store files are versioned envelopes, not bare arrays — see src/main/store.ts.
  if (seedDecks) seedStore(localAppData, 'decks.json', { version: 1, decks: seedDecks })
  if (seedLayouts) seedStore(localAppData, 'layouts.json', { version: 1, layouts: seedLayouts })
  if (seedReadings) seedStore(localAppData, 'readings.json', { version: 1, readings: seedReadings })
  // Strip ELECTRON_RUN_AS_NODE — if it's set in the parent environment (some
  // Electron-hosted terminals set it), the launched electron binary runs as
  // plain Node (no `app`, no windows) and the main process throws at
  // app.setPath. We want a real Electron app here.
  const env = { ...process.env, LOCALAPPDATA: localAppData, NODE_ENV: 'test', ...extraEnv }
  delete env.ELECTRON_RUN_AS_NODE
  // Launch the project DIRECTORY, not out/main/index.js. Given a file, Electron
  // treats that file as the whole app and never reads the repo's package.json,
  // so app.getVersion() returns ELECTRON's version and app.getAppPath() returns
  // out/main — both differing from a packaged build, which is the one thing
  // these specs exist to model. See the house E2E doc §3.5.
  const electronApp = await electron.launch({ args: ['.'], cwd: repoRoot, env })
  await assertIsolated(electronApp, localAppData)
  return { electronApp, localAppData }
}

// Fail the launch when the app's userData is not under the temp dir (HTOO-543).
// This is the alarm, not the fix: it reads userData AFTER the launch, so the app
// has already made its profile folder wherever userData points. It stops a SPEC
// from saving into the real profile. The `localAppData` line in
// src/main/index.ts is what keeps the launch itself off the real profile.
export async function assertIsolated(electronApp, localAppData) {
  const userData = await electronApp.evaluate(({ app }) => app.getPath('userData'))
  const expected = join(localAppData, ...USERDATA_SUBPATH)
  if (resolve(userData).toLowerCase() !== resolve(expected).toLowerCase()) {
    await electronApp.close().catch(() => {})
    throw new Error(`e2e isolation failed: userData is ${userData}, expected ${expected}`)
  }
}

// Find the real main window and wait until it's actually shown. The app pops a
// splash window first, so `firstWindow()` can return the wrong one. The splash
// has NO preload, so we identify the main window by the presence of a preload
// bridge: `window.electron` (the @electron-toolkit bridge, exposed by every
// sibling's preload) — bridge-name-independent, so this needs no per-app tweak.
// `bridge` is an extra app-global to also accept (default 'api'); override it
// only if your app both renames window.api AND drops the toolkit bridge.
export async function getMainWindow(electronApp, { bridge = 'api' } = {}) {
  let page = null
  for (let i = 0; i < 120 && !page; i++) {
    for (const w of electronApp.windows()) {
      const isMain = await w
        .evaluate((b) => !!(window.electron || window[b]), bridge)
        .catch(() => false)
      if (isMain) {
        page = w
        break
      }
    }
    if (!page) await electronApp.waitForEvent('window', { timeout: 500 }).catch(() => {})
  }
  if (!page) throw new Error('main renderer window (with a preload bridge) never appeared')

  const win = await electronApp.browserWindow(page)
  await expect.poll(() => win.evaluate((bw) => bw.isVisible()), { timeout: 20_000 }).toBe(true)
  await page.waitForSelector('[data-testid="app-root"]', { state: 'visible' })
  return page
}

// Snapshot native window geometry (main process) paired with the renderer's view
// of where a given element actually sits on screen, both in CSS px so they're
// directly comparable. `screenLeftOf(sel)` is the tool for measuring content
// offsets / letterboxing; the offset spec pattern (see the E2E doc) builds on it.
export async function readGeometry(electronApp, page, selector = '[data-testid="app-root"]') {
  const win = await electronApp.browserWindow(page)
  const native = await win.evaluate((bw) => ({
    bounds: bw.getBounds(),
    contentBounds: bw.getContentBounds()
  }))
  const dom = await page.evaluate((sel) => {
    const el = document.querySelector(sel)
    const r = el?.getBoundingClientRect()
    return {
      screenX: window.screenX,
      innerWidth: window.innerWidth,
      elementScreenLeft: r ? Math.round(window.screenX + r.left) : null
    }
  }, selector)
  return { native, dom, letterbox: dom.screenX - native.bounds.x }
}

export function tempExists(p) {
  return existsSync(p)
}
