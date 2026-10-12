/**
 * IPC handler bodies as plain functions.
 *
 * Each data handler takes only its arguments (no IPC event), so tests can
 * import and call them directly. `registerHandlers` wires every handler to its
 * channel via the supplied `ipcMain` / `BrowserWindow`. Mutating handlers parse
 * their payload with a zod schema first — an invalid payload throws, which
 * rejects the `invoke` before anything touches disk.
 */
import { readFile, writeFile } from 'fs/promises'
import { z } from 'zod'
import type {
  IpcMain,
  BrowserWindow as BrowserWindowType,
  OpenDialogOptions,
  SaveDialogOptions
} from 'electron'
import type { PickerDialog } from './pickerStart'
import type {
  Deck,
  DeckExportResult,
  DeckImportResult,
  Layout,
  OpenIssueResult,
  Reading,
  ReadingExportResult,
  RendererErrorReport,
  SavedImage,
  Settings
} from '../shared/types'
import type { UpdateCheckResult } from '../shared/updateVersion'
import { appIdentity } from '../shared/appIdentity'
import { MENU_STATE_CHANNEL, type MenuState } from '../shared/appMenu'
import { parseMenuState } from './appMenu'
import type { Stores } from './store'
import { checkForUpdate as updateCheck } from './updateCheck'
import {
  copyReportArgsSchema,
  decksSchema,
  deckSchema,
  layoutsSchema,
  openIssueArgsSchema,
  readingsSchema,
  rendererErrorSchema,
  saveImageArgsSchema,
  settingsSchema
} from './schemas'
import { CORVATHDECK_EXT, packDeck, unpackDeck, uniqueDeckName } from './deckPackage'

const DECK_FILTERS = [{ name: 'Corvath Deck', extensions: [CORVATHDECK_EXT] }]
const JSON_FILTERS = [{ name: 'JSON', extensions: ['json'] }]

export interface HandlerContext {
  store: Stores
  /** Called once when the renderer signals `app:ready` (reveals the window). */
  onAppReady?: () => void
  /**
   * Called with each valid menu-state report from the renderer (the macOS
   * menu). Wired up in index.ts, which owns the menu.
   */
  onMenuState?: (state: MenuState) => void
  /** This build's version, for the About card. */
  appVersion?: () => string
  /**
   * Open the data folder in the OS file manager.
   *
   * Injected rather than importing `shell` here, like the dialog functions
   * above, so the unit tests need no electron stub.
   */
  revealSettings?: () => void
  /** The packaged CHANGELOG.md, for the What's New dialog. */
  readChangelog?: () => Promise<string>
  /**
   * The fetch the update check uses. Defaults to the global one; index.ts
   * injects Electron's `net.fetch`, for the system proxy and the OS certificate
   * store. Injected, like the dialogs, so this file has no runtime `electron`
   * import and the node test project can load it.
   */
  fetchImpl?: typeof fetch
  /** Report Issue module. Injected, so this file stays free of a runtime
   *  `electron` import and the node test project can still load it. */
  diagnostics?: {
    build: () => string
    openIssue: (p: { title: string; body: string }) => Promise<OpenIssueResult>
    copyReport: (p: { body: string }) => Promise<{ ok: true }>
    captureRendererError: (report: RendererErrorReport) => void
    revealLogs: () => void
  }
}

/**
 * The update check (HTOO-65, update-check module v1). Takes NO argument from
 * the renderer: main owns the version, the manifest key and the release path.
 * Never throws: "up to date" and "could not tell" come back as different
 * values. It reads cernunnos `versions.json` (HTOO-382), not the releases API.
 */
export async function checkForUpdate(ctx: HandlerContext): Promise<UpdateCheckResult> {
  return updateCheck({
    currentVersion: ctx.appVersion?.() ?? '',
    updateKey: appIdentity.updateKey,
    releaseUrlPrefix: appIdentity.releaseUrlPrefix,
    fetchImpl: ctx.fetchImpl
  })
}

export const getReadings = (ctx: HandlerContext): Promise<Reading[]> => ctx.store.loadReadings()
// `async` so a schema-parse failure surfaces as a rejected promise (rejecting
// the invoke) rather than a synchronous throw at the call site.
export const saveReadings = async (ctx: HandlerContext, readings: unknown): Promise<void> =>
  ctx.store.saveReadings(readingsSchema.parse(readings))

export const getDecks = (ctx: HandlerContext): Promise<Deck[]> => ctx.store.loadDecks()
export const saveDecks = async (ctx: HandlerContext, decks: unknown): Promise<void> =>
  ctx.store.saveDecks(decksSchema.parse(decks))

export const getLayouts = (ctx: HandlerContext): Promise<Layout[]> => ctx.store.loadLayouts()
export const saveLayouts = async (ctx: HandlerContext, layouts: unknown): Promise<void> =>
  ctx.store.saveLayouts(layoutsSchema.parse(layouts))

export const loadSettings = (ctx: HandlerContext): Promise<Settings> => ctx.store.loadSettings()
export const saveSettings = async (ctx: HandlerContext, settings: unknown): Promise<void> =>
  ctx.store.saveSettings(settingsSchema.parse(settings))

export async function saveImage(
  ctx: HandlerContext,
  deckId: unknown,
  cardId: unknown,
  ext: unknown,
  data: unknown
): Promise<SavedImage> {
  const args = saveImageArgsSchema.parse({ deckId, cardId, ext, data })
  return { filename: await ctx.store.saveCardImage(args.deckId, args.cardId, args.ext, args.data) }
}

export const deleteImage = (ctx: HandlerContext, deckId: string, cardId: string): Promise<void> =>
  ctx.store.deleteCardImage(deckId, cardId)

export const deleteDeckImages = (ctx: HandlerContext, deckId: string): Promise<void> =>
  ctx.store.deleteDeckImages(deckId)

/** Prompt for a destination and write the deck (+ its images) as a `.corvathdeck` zip. */
export async function exportDeck(
  ctx: HandlerContext,
  dialog: PickerDialog,
  win: BrowserWindowType | null,
  deck: unknown
): Promise<DeckExportResult> {
  const parsed = deckSchema.parse(deck)
  const images = await ctx.store.readDeckImages(parsed)
  const bytes = packDeck(parsed, images)

  const safeName = (parsed.name || 'deck').replace(/[^a-z0-9._-]+/gi, '_')
  const opts: SaveDialogOptions = {
    defaultPath: `${safeName}.${CORVATHDECK_EXT}`,
    filters: DECK_FILTERS
  }
  const { canceled, filePath } = await dialog.showSaveDialog(win, opts)
  if (canceled || !filePath) return { canceled: true }

  try {
    await writeFile(filePath, bytes)
    return { ok: true, path: filePath }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to write the deck file.' }
  }
}

/**
 * Prompt for a destination and write pre-serialized readings JSON (built and
 * validated in the renderer). The main process only chooses the path and writes
 * bytes, so no schema is needed here.
 */
export async function exportReadings(
  dialog: PickerDialog,
  win: BrowserWindowType | null,
  defaultName: unknown,
  json: unknown
): Promise<ReadingExportResult> {
  const name = z.string().parse(defaultName)
  const text = z.string().parse(json)

  const safeName = (name || 'readings').replace(/[^a-z0-9._-]+/gi, '_')
  const opts: SaveDialogOptions = { defaultPath: `${safeName}.json`, filters: JSON_FILTERS }
  const { canceled, filePath } = await dialog.showSaveDialog(win, opts)
  if (canceled || !filePath) return { canceled: true }

  try {
    await writeFile(filePath, text, 'utf8')
    return { ok: true, path: filePath }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to write the readings file.' }
  }
}

/** Prompt for a `.corvathdeck`, then import it as a fresh user deck (new id + unique name). */
export async function importDeck(
  ctx: HandlerContext,
  dialog: PickerDialog,
  win: BrowserWindowType | null,
  existingNames: unknown
): Promise<DeckImportResult> {
  const taken = z.array(z.string()).parse(existingNames)
  const opts: OpenDialogOptions = { properties: ['openFile'], filters: DECK_FILTERS }
  const { canceled, filePaths } = await dialog.showOpenDialog(win, opts)
  if (canceled || !filePaths[0]) return { canceled: true }

  try {
    const bytes = await readFile(filePaths[0])
    const pkg = unpackDeck(new Uint8Array(bytes))
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    // Imported copies are plain user decks: new id, unique name, and no built-in
    // seed markers (so seeding never overwrites or merges them).
    const deck: Deck = {
      ...pkg.deck,
      id,
      name: uniqueDeckName(pkg.deck.name, taken),
      builtIn: false,
      seedVersion: undefined,
      createdAt: now,
      updatedAt: now
    }
    await ctx.store.writeDeckImages(id, pkg.images)
    return { deck }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to import the deck.' }
  }
}

interface RegisterDeps {
  ipcMain: IpcMain
  BrowserWindow: typeof BrowserWindowType
  /** Electron's dialog behind `withPickerStart`, so every picker has a start folder. */
  dialog: PickerDialog
}

/** Wire every IPC channel to its handler. */
export function registerHandlers(
  { ipcMain, BrowserWindow, dialog }: RegisterDeps,
  ctx: HandlerContext
): void {
  // Readings + settings persistence
  ipcMain.handle('readings:getAll', () => getReadings(ctx))
  ipcMain.handle('readings:save', (_e, readings) => saveReadings(ctx, readings))
  ipcMain.handle('readings:export', (e, name, json) =>
    exportReadings(dialog, BrowserWindow.fromWebContents(e.sender), name, json)
  )
  ipcMain.handle('settings:load', () => loadSettings(ctx))
  ipcMain.handle('settings:save', (_e, settings) => saveSettings(ctx, settings))

  // Decks persistence + image import/cleanup
  ipcMain.handle('decks:getAll', () => getDecks(ctx))
  ipcMain.handle('decks:save', (_e, decks) => saveDecks(ctx, decks))
  ipcMain.handle('decks:saveImage', (_e, deckId, cardId, ext, data) =>
    saveImage(ctx, deckId, cardId, ext, data)
  )
  ipcMain.handle('decks:deleteImage', (_e, deckId, cardId) => deleteImage(ctx, deckId, cardId))
  ipcMain.handle('decks:deleteDeckImages', (_e, deckId) => deleteDeckImages(ctx, deckId))
  ipcMain.handle('decks:exportDeck', (e, deck) =>
    exportDeck(ctx, dialog, BrowserWindow.fromWebContents(e.sender), deck)
  )
  ipcMain.handle('decks:importDeck', (e, existingNames) =>
    importDeck(ctx, dialog, BrowserWindow.fromWebContents(e.sender), existingNames)
  )

  // Layouts persistence
  ipcMain.handle('layouts:getAll', () => getLayouts(ctx))
  ipcMain.handle('layouts:save', (_e, layouts) => saveLayouts(ctx, layouts))

  // Window controls (custom frameless title bar)
  ipcMain.on('window:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
  ipcMain.on('window:toggleMaximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('window:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())
  ipcMain.handle(
    'window:isMaximized',
    (e) => BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false
  )

  // Reveal handshake: the renderer signals once it has hydrated.
  ipcMain.once('app:ready', () => ctx.onAppReady?.())

  // What the macOS menu greys out. A malformed report is dropped: the menu
  // keeps the last good one. The renderer sends it on macOS only.
  ipcMain.on(MENU_STATE_CHANNEL, (_e, value: unknown) => {
    const state = parseMenuState(value)
    if (state) ctx.onMenuState?.(state)
  })

  // About card. `getVersion` reads package.json through Electron, which is why
  // e2e launches the project DIRECTORY rather than out/main/index.js — given a
  // file, this would report Electron's own version instead of corvath's.
  ipcMain.handle('app:getVersion', () => ctx.appVersion?.() ?? '')
  ipcMain.on('app:revealSettings', () => ctx.revealSettings?.())
  ipcMain.handle('app:readChangelog', () => ctx.readChangelog?.() ?? '')
  // The update check: once from UpdateNotice after start, and from the About
  // card's Check for updates button. One channel and one result for both.
  ipcMain.handle('app:checkForUpdate', () => checkForUpdate(ctx))

  // Report Issue. Every payload is parsed, like every other mutating channel;
  // guardIpc has already answered who sent it.
  ipcMain.handle('diagnostics:build', () => ctx.diagnostics?.build() ?? '')
  ipcMain.handle('diagnostics:openIssue', (_e, args: unknown) => {
    const parsed = openIssueArgsSchema.parse(args)
    if (!ctx.diagnostics)
      return { ok: false, reason: 'unsafe-url', copied: false } as OpenIssueResult
    return ctx.diagnostics.openIssue(parsed)
  })
  ipcMain.handle('diagnostics:copyReport', (_e, args: unknown) => {
    const parsed = copyReportArgsSchema.parse(args)
    return ctx.diagnostics?.copyReport(parsed) ?? { ok: true as const }
  })
  // A fire-and-forget `on`, because it runs from an error handler. A malformed
  // payload is dropped rather than thrown back: this is the path that must never
  // raise a second error while reporting the first.
  ipcMain.on('diagnostics:reportError', (_e, report: unknown) => {
    const parsed = rendererErrorSchema.safeParse(report)
    if (parsed.success) ctx.diagnostics?.captureRendererError(parsed.data)
  })
  ipcMain.on('diagnostics:revealLogs', () => ctx.diagnostics?.revealLogs())
}
