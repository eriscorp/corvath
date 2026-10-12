import type { OpenDialogOptions, SaveDialogOptions } from 'electron'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { dialogDefaultPath, pickerDialog, pickerStartPath, withPickerStart } from '../pickerStart'

// Ported from midir's pickerStart.test.ts (HTOO-553). Corvath has no game folder,
// so the start folder is the last pick, then Documents, then home.

const docs = join('/home/me/Documents')
const home = join('/home/me')
const onDisk = new Set([join('/'), join('/decks'), join('/decks', 'rws.corvathdeck'), home, docs])
const exists = async (p: string): Promise<boolean> => onDisk.has(p)

describe('pickerStartPath', () => {
  it('takes the first candidate that exists', async () => {
    expect(await pickerStartPath([docs, home], exists)).toBe(docs)
  })

  it('skips a stale folder, an empty string and a missing value', async () => {
    expect(await pickerStartPath([null, undefined, '', join('/moved'), home], exists)).toBe(home)
  })

  it('returns undefined when nothing exists, so the dialog gets no defaultPath', async () => {
    expect(await pickerStartPath([join('/nope')], exists)).toBeUndefined()
  })
})

describe('dialogDefaultPath', () => {
  const start = async (): Promise<string | undefined> => docs

  it('uses the start folder when the handler names nothing', async () => {
    expect(await dialogDefaultPath(undefined, start, 'open', exists)).toBe(docs)
    expect(await dialogDefaultPath('', start, 'save', exists)).toBe(docs)
  })

  it('keeps an open path that exists, and does not look for a start folder', async () => {
    const noStart = vi.fn(start)
    const path = join('/decks', 'rws.corvathdeck')
    expect(await dialogDefaultPath(path, noStart, 'open', exists)).toBe(path)
    expect(noStart).not.toHaveBeenCalled()
  })

  it('keeps a save path whose folder exists, although the file is new', async () => {
    const path = join('/decks', 'argent.corvathdeck')
    expect(await dialogDefaultPath(path, start, 'save', exists)).toBe(path)
  })

  it('puts a bare save name in the start folder, not in Downloads', async () => {
    // exportDeck and exportReadings give a bare name.
    expect(await dialogDefaultPath('Argent_Tarot.corvathdeck', start, 'save', exists)).toBe(
      join(docs, 'Argent_Tarot.corvathdeck')
    )
  })

  it('moves a stale save path to the start folder and keeps its name', async () => {
    const stale = join('/moved', 'readings.json')
    expect(await dialogDefaultPath(stale, start, 'save', exists)).toBe(join(docs, 'readings.json'))
  })

  it('opens at the start folder, with no name, when the path and its folder are gone', async () => {
    const gone = join('/moved', 'x.corvathdeck')
    expect(await dialogDefaultPath(gone, start, 'open', exists)).toBe(docs)
  })

  it('never hands an open dialog a bare name', async () => {
    expect(await dialogDefaultPath('decks', start, 'open', exists)).toBe(docs)
  })

  it('passes the request through when there is no start folder', async () => {
    const none = async (): Promise<undefined> => undefined
    expect(await dialogDefaultPath('readings.json', none, 'save', exists)).toBe('readings.json')
    expect(await dialogDefaultPath(undefined, none, 'open', exists)).toBeUndefined()
  })
})

describe('withPickerStart', () => {
  function setup(fallbacks: string[] = [docs, home]) {
    const inner = {
      showOpenDialog: vi.fn(async (_window: unknown, _opts: OpenDialogOptions) => ({
        canceled: false,
        filePaths: [] as string[]
      })),
      showSaveDialog: vi.fn(async (_window: unknown, _opts: SaveDialogOptions) => ({
        canceled: false,
        filePath: ''
      }))
    }
    const dialog = withPickerStart(inner, { fallbacks: () => fallbacks, exists })
    const lastOpen = (): unknown => inner.showOpenDialog.mock.calls.at(-1)?.[1]
    const lastSave = (): unknown => inner.showSaveDialog.mock.calls.at(-1)?.[1]
    return { inner, dialog, lastOpen, lastSave }
  }

  it('opens in Documents, then in home when Documents is gone', async () => {
    const withDocs = setup()
    await withDocs.dialog.showOpenDialog(null, { properties: ['openFile'] })
    expect(withDocs.lastOpen()).toMatchObject({ defaultPath: docs })

    const without = setup([join('/no-documents'), home])
    await without.dialog.showOpenDialog(null, { properties: ['openFile'] })
    expect(without.lastOpen()).toMatchObject({ defaultPath: home })
  })

  it('puts a bare save name in Documents', async () => {
    const { dialog, lastSave } = setup()
    await dialog.showSaveDialog(null, { defaultPath: 'readings.json' })
    expect(lastSave()).toMatchObject({ defaultPath: join(docs, 'readings.json') })
  })

  it('opens the next dialog in the folder of the last pick', async () => {
    const { inner, dialog, lastOpen, lastSave } = setup()
    inner.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: [join('/decks', 'rws.corvathdeck')]
    })
    await dialog.showOpenDialog(null, { properties: ['openFile'] })
    await dialog.showSaveDialog(null, { defaultPath: 'Argent_Tarot.corvathdeck' })
    expect(lastSave()).toMatchObject({ defaultPath: join('/decks', 'Argent_Tarot.corvathdeck') })

    await dialog.showOpenDialog(null, { properties: ['openFile'] })
    expect(lastOpen()).toMatchObject({ defaultPath: join('/decks') })
  })

  it('remembers the folder of a save too', async () => {
    const { inner, dialog, lastOpen } = setup()
    inner.showSaveDialog.mockResolvedValueOnce({
      canceled: false,
      filePath: join(home, 'readings.json')
    })
    await dialog.showSaveDialog(null, { defaultPath: 'readings.json' })
    await dialog.showOpenDialog(null, { properties: ['openFile'] })
    expect(lastOpen()).toMatchObject({ defaultPath: home })
  })

  it('passes the parent window through and keeps the other options', async () => {
    const { inner, dialog, lastOpen } = setup()
    const parent = { id: 1 } as never
    inner.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] })
    const filters = [{ name: 'Corvath Deck', extensions: ['corvathdeck'] }]
    expect(await dialog.showOpenDialog(parent, { properties: ['openFile'], filters })).toEqual({
      canceled: true,
      filePaths: []
    })
    expect(inner.showOpenDialog.mock.calls.at(-1)?.[0]).toBe(parent)
    expect(lastOpen()).toMatchObject({ properties: ['openFile'], filters })
  })
})

describe('pickerDialog', () => {
  it('calls the one-argument Electron form when there is no parent window', async () => {
    const electron = {
      showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
      showSaveDialog: vi.fn(async () => ({ canceled: true }))
    }
    const dialog = pickerDialog(electron as never)
    await dialog.showOpenDialog(null, { title: 'a' })
    expect(electron.showOpenDialog).toHaveBeenLastCalledWith({ title: 'a' })
    const parent = { id: 1 } as never
    await dialog.showSaveDialog(parent, { title: 'b' })
    expect(electron.showSaveDialog).toHaveBeenLastCalledWith(parent, { title: 'b' })
  })
})
