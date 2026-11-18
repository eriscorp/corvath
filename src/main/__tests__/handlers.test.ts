import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { readFile } from 'fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Reading } from '../../shared/types'
import { createStores } from '../store'
import { DECK_LIMITS, packDeck } from '../deckPackage'
import type { PickerDialog } from '../pickerStart'
import {
  deleteDeckImages,
  deleteImage,
  getReadings,
  importDeck,
  saveDecks,
  saveImage,
  saveReadings,
  saveSettings
} from '../handlers'
import type { HandlerContext } from '../handlers'

// A spy on the readFile that handlers.ts imports, so a test can prove that the
// deck import refuses a file on its size before it reads it (HTOO-693).
vi.mock('fs/promises', async (importOriginal) => {
  const orig = await importOriginal<typeof import('fs/promises')>()
  return { ...orig, readFile: vi.fn(orig.readFile) }
})

let dir: string
let bundled: string
let counter = 0
let ctx: HandlerContext

beforeEach(async () => {
  dir = join(tmpdir(), `corvath-handlers-${process.pid}-${counter++}`)
  bundled = join(dir, 'bundled')
  await fs.mkdir(bundled, { recursive: true })
  ctx = { store: createStores(dir, bundled) }
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

const reading = (): Reading => ({
  id: 'r1',
  title: 'T',
  date: '2026-07-09',
  deck: 'Thoth',
  entries: [{ id: 'e1', topic: '', question: '', card: 'The Star' }],
  createdAt: 'now',
  updatedAt: 'now'
})

const fileContents = (name: string): Promise<string> => fs.readFile(join(dir, name), 'utf-8')

describe('handlers — valid payloads persist', () => {
  it('saveReadings writes and getReadings reads back', async () => {
    await saveReadings(ctx, [reading()])
    expect(await getReadings(ctx)).toEqual([reading()])
  })
})

describe('handlers — invalid payloads reject without touching disk', () => {
  it('saveReadings rejects a malformed reading and leaves no file', async () => {
    // Missing required fields (title/date/entries).
    await expect(saveReadings(ctx, [{ id: 'x' }])).rejects.toBeInstanceOf(Error)
    await expect(fs.access(join(dir, 'readings.json'))).rejects.toBeTruthy()
  })

  it('saveReadings rejecting does not overwrite an existing good file', async () => {
    await saveReadings(ctx, [reading()])
    const before = await fileContents('readings.json')
    await expect(saveReadings(ctx, 'not an array')).rejects.toBeInstanceOf(Error)
    expect(await fileContents('readings.json')).toBe(before)
  })

  it('saveDecks rejects a non-array payload', async () => {
    await expect(saveDecks(ctx, { decks: [] })).rejects.toBeInstanceOf(Error)
    await expect(fs.access(join(dir, 'decks.json'))).rejects.toBeTruthy()
  })

  it('saveSettings rejects an unknown theme', async () => {
    await expect(saveSettings(ctx, { theme: 'neon' })).rejects.toBeInstanceOf(Error)
    await expect(fs.access(join(dir, 'settings.json'))).rejects.toBeTruthy()
  })
})

// HTOO-693: the import checks the file size before it reads the file.
describe('handlers — importDeck limits', () => {
  const dialogFor = (path: string): PickerDialog =>
    ({
      showOpenDialog: async () => ({ canceled: false, filePaths: [path] }),
      showSaveDialog: async () => ({ canceled: true })
    }) as unknown as PickerDialog

  it('refuses a file above the size limit and writes no image', async () => {
    const deck = {
      id: 'src',
      name: 'Big',
      suits: [],
      pipRanks: [],
      courtRanks: [],
      supportsReversed: false,
      cards: [],
      createdAt: 'a',
      updatedAt: 'b'
    }
    const path = join(dir, 'big.corvathdeck')
    await fs.writeFile(path, packDeck(deck, [{ filename: 'a.webp', data: new Uint8Array(500) }]))
    const size = (await fs.stat(path)).size

    const refused = await importDeck(ctx, dialogFor(path), null, [], {
      ...DECK_LIMITS,
      maxFileBytes: size - 1
    })
    expect(refused).toEqual({ error: expect.stringMatching(/above the limit/) })
    expect(vi.mocked(readFile)).not.toHaveBeenCalledWith(path)
    await expect(fs.access(join(dir, 'decks'))).rejects.toBeTruthy()

    const ok = await importDeck(ctx, dialogFor(path), null, [], {
      ...DECK_LIMITS,
      maxFileBytes: size
    })
    expect(ok).toEqual({ deck: expect.objectContaining({ name: 'Big' }) })
  })
})

// HTOO-697: the image channels parse their ids, so `..` never reaches the store.
describe('handlers — image ids', () => {
  const png = new Uint8Array([1])

  it.each(['..', '.', '', 7, undefined])('deleteDeckImages rejects %j', async (id) => {
    await saveReadings(ctx, [reading()])
    await expect(deleteDeckImages(ctx, id)).rejects.toBeInstanceOf(Error)
    expect(await fileContents('readings.json')).toContain('"id"')
  })

  it.each(['..', '.', '', 7])('deleteImage rejects a deck id of %j', async (id) => {
    await expect(deleteImage(ctx, id, 'decks')).rejects.toBeInstanceOf(Error)
  })

  it('saveImage rejects a deck id of ..', async () => {
    await expect(saveImage(ctx, '..', 'decks', 'json', png)).rejects.toBeInstanceOf(Error)
    await expect(fs.access(join(dir, 'decks.json'))).rejects.toBeTruthy()
  })

  it('a usable id saves and deletes', async () => {
    expect(await saveImage(ctx, 'deck-1', 'maj-0', 'png', png)).toEqual({
      filename: 'maj-0.png'
    })
    await deleteImage(ctx, 'deck-1', 'maj-0')
    await deleteDeckImages(ctx, 'deck-1')
    await expect(fs.access(join(dir, 'decks', 'deck-1'))).rejects.toBeTruthy()
  })
})
