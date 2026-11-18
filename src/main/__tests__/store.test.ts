import { promises as fs } from 'fs'
import { join, resolve, sep } from 'path'
import { tmpdir } from 'os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Deck } from '../../shared/types'
import {
  backfillSeedFingerprints,
  cleanSegment,
  createStores,
  deckDirWithin,
  mergeSeedDeck,
  resolveWithin,
  safeSegment,
  stampSeedDeck
} from '../store'
import { buildSeedDecks } from '../seedDecks'

let dir: string
let bundled: string
let counter = 0

beforeEach(async () => {
  dir = join(tmpdir(), `corvath-store-${process.pid}-${counter++}`)
  bundled = join(dir, 'bundled')
  await fs.mkdir(bundled, { recursive: true })
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

const stores = (): ReturnType<typeof createStores> => createStores(dir, bundled)

describe('safeSegment', () => {
  it('strips path separators and traversal characters', () => {
    expect(safeSegment('../../etc/passwd')).toBe('....etcpasswd')
    expect(safeSegment('a/b\\c')).toBe('abc')
    expect(safeSegment('deck-1_v2.png')).toBe('deck-1_v2.png')
  })
})

describe('cleanSegment', () => {
  it('refuses a segment that cannot name a child', () => {
    for (const v of ['', '.', '..', '...', '/', '\\', '../', '..\\', ' . ']) {
      expect(cleanSegment(v)).toBeNull()
    }
  })
  it('keeps an ordinary id or filename', () => {
    expect(cleanSegment('maj-0.webp')).toBe('maj-0.webp')
    expect(cleanSegment('6f1c2a7e-0b1d-4c59-9a3e-2f2b8c1d9e0a')).toBe(
      '6f1c2a7e-0b1d-4c59-9a3e-2f2b8c1d9e0a'
    )
    expect(cleanSegment('.hidden')).toBe('.hidden')
  })
})

describe('deckDirWithin', () => {
  it('gives a direct child of the root, and null for the root or its parent', () => {
    const root = resolve('/data/decks')
    expect(deckDirWithin(root, 'thoth')).toBe(join(root, 'thoth'))
    expect(deckDirWithin(root, '..')).toBeNull()
    expect(deckDirWithin(root, '.')).toBeNull()
    expect(deckDirWithin(root, '')).toBeNull()
  })
})

describe('resolveWithin', () => {
  it('resolves a clean segment inside the root', () => {
    const root = resolve(dir, 'decks')
    expect(resolveWithin(root, 'thoth', 'maj-0.png')).toBe(join(root, 'thoth', 'maj-0.png'))
  })

  it('rejects a segment that escapes the root to a non-prefix sibling', () => {
    const root = resolve(dir, 'decks')
    // safeSegment keeps dots, so `..` resolves to the parent — which does not
    // start with the root string and is rejected.
    expect(resolveWithin(root, '..', 'x.png')).toBeNull()
  })

  it('rejects a sibling that merely shares the root as a string prefix (Phase 4 fix)', () => {
    // root `.../decks`, deckId `..`, filename `decks.json` → resolves to the
    // real `.../decks.json`, which the old `startsWith(root)` check wrongly
    // admitted. The `root + sep` comparison rejects it.
    const root = resolve(dir, 'decks')
    expect(resolveWithin(root, '..', 'decks.json')).toBeNull()
  })

  it('accepts a genuine child and yields a path under the root', () => {
    const root = resolve(dir, 'decks')
    const out = resolveWithin(root, 'thoth', 'maj-0.png')
    expect(out).not.toBeNull()
    expect(out!.startsWith(root + sep)).toBe(true)
  })
})

describe('settings normalize', () => {
  it('coerces an unknown theme back to the default', async () => {
    await fs.writeFile(join(dir, 'settings.json'), JSON.stringify({ theme: 'bogus' }), 'utf-8')
    expect(await stores().loadSettings()).toEqual({ theme: 'hybrasyl' })
  })

  it('keeps a valid theme', async () => {
    await fs.writeFile(join(dir, 'settings.json'), JSON.stringify({ theme: 'danaan' }), 'utf-8')
    expect(await stores().loadSettings()).toEqual({ theme: 'danaan' })
  })

  it('rejects a non-object file and returns defaults', async () => {
    await fs.writeFile(join(dir, 'settings.json'), JSON.stringify([1, 2, 3]), 'utf-8')
    expect(await stores().loadSettings()).toEqual({ theme: 'hybrasyl' })
  })
})

describe('readings/decks/layouts normalize', () => {
  it('rejects a payload whose array field is missing', async () => {
    await fs.writeFile(join(dir, 'readings.json'), JSON.stringify({ readings: 'nope' }), 'utf-8')
    expect(await stores().loadReadings()).toEqual([])
    await fs.writeFile(join(dir, 'decks.json'), JSON.stringify({ nope: [] }), 'utf-8')
    expect(await stores().loadDecks()).toEqual([])
  })
})

describe('ensureDecksSeeded', () => {
  const now = '2026-07-09T00:00:00.000Z'
  /** The deck as currently specced — avoids hardcoding a seedVersion that moves. */
  const currentSeed = (id: string): Deck => buildSeedDecks(now).find((d) => d.id === id)!

  it('seeds all built-ins on first run', async () => {
    const s = stores()
    await s.ensureDecksSeeded(now)
    const decks = await s.loadDecks()
    expect(decks.map((d) => d.id).sort()).toEqual(['argent', 'empyrean', 'hybrasyl', 'rws'].sort())
  })

  it('adds a missing built-in without disturbing user decks', async () => {
    const userDeck: Deck = {
      id: 'my-deck',
      name: 'Mine',
      suits: [],
      pipRanks: [],
      courtRanks: [],
      supportsReversed: false,
      cards: [],
      createdAt: now,
      updatedAt: now
    }
    // Persist only the user deck (no built-ins), then seed.
    const s = stores()
    await s.saveDecks([userDeck])
    await s.ensureDecksSeeded(now)
    const decks = await s.loadDecks()
    expect(decks.find((d) => d.id === 'my-deck')).toEqual(userDeck)
    expect(decks.find((d) => d.id === 'argent')).toBeTruthy()
  })

  it('replaces an older built-in when the seedVersion bumps', async () => {
    const s = stores()
    // A stale built-in rws at seedVersion 1 (current seed is 2).
    const stale: Deck = {
      id: 'rws',
      name: 'Old RWS',
      builtIn: true,
      seedVersion: 1,
      suits: [],
      pipRanks: [],
      courtRanks: [],
      supportsReversed: false,
      cards: [],
      createdAt: now,
      updatedAt: now
    }
    await s.saveDecks([stale])
    await s.ensureDecksSeeded(now)
    const rws = (await s.loadDecks()).find((d) => d.id === 'rws')!
    expect(rws.seedVersion).toBe(currentSeed('rws').seedVersion)
    // Structure is the seed's outright.
    expect(rws.cards).toHaveLength(currentSeed('rws').cards.length)
    expect(rws.suits).toEqual(currentSeed('rws').suits)

    // The NAME is not, and this assertion was flipped by HTOO-231. This fixture
    // carries no provenance stamps, so nothing distinguishes "a name we shipped
    // in an older build" from "a name the user typed" — and the merge resolves
    // that ambiguity in the user's favour deliberately. The cost of being wrong
    // here is a stale deck title the user can fix in one edit; the cost of the
    // other default was destroying text with no way to get it back.
    expect(rws.name).toBe('Old RWS')
  })

  it('upgrades a built-in stored without a seedVersion at all', async () => {
    const s = stores()
    // Decks seeded before seedVersion existed have the field absent, which the
    // merge reads as version 1 — so a spec at 2 must still upgrade them. This
    // is the shape the hand-built hybrasyl deck was stored in.
    const versionless: Deck = {
      id: 'hybrasyl',
      name: 'Hybrasyl',
      builtIn: true,
      suits: [],
      pipRanks: [],
      courtRanks: [],
      supportsReversed: true,
      cards: [],
      createdAt: now,
      updatedAt: now
    }
    await s.saveDecks([versionless])
    await s.ensureDecksSeeded(now)
    const hybrasyl = (await s.loadDecks()).find((d) => d.id === 'hybrasyl')!
    expect(hybrasyl.seedVersion).toBe(currentSeed('hybrasyl').seedVersion)
    expect(hybrasyl.suits).toEqual(['Swords', 'Staves', 'Coins', 'Cups'])
    expect(hybrasyl.cards).toHaveLength(83)
  })

  it('leaves a customized built-in at the current seedVersion untouched', async () => {
    const s = stores()
    await s.ensureDecksSeeded(now)
    const decks = await s.loadDecks()
    const argent = decks.find((d) => d.id === 'argent')!
    const customized = { ...argent, name: 'My Argent' }
    await s.saveDecks(decks.map((d) => (d.id === 'argent' ? customized : d)))
    await s.ensureDecksSeeded(now)
    expect((await s.loadDecks()).find((d) => d.id === 'argent')!.name).toBe('My Argent')
  })

  // INVERTED. This test previously asserted the defect as intended behaviour:
  // "a non-empty seed value wins", so a bump replaced a user's own note. Now
  // that all four decks ship full text, that rule silently destroys anything a
  // user writes over a built-in card. HTOO-231.
  it('keeps a user edit through a bump, and still delivers text they never touched', async () => {
    const s = stores()
    await s.ensureDecksSeeded(now)
    const decks = await s.loadDecks()
    const rws = decks.find((d) => d.id === 'rws')!
    const foolId = rws.cards[0].id
    const untouchedId = rws.cards[1].id
    const edited: Deck = {
      ...rws,
      seedVersion: 1,
      cards: rws.cards.map((c) =>
        c.id === foolId ? { ...c, meaning: 'my note', keywords: ['mine'] } : c
      )
    }
    await s.saveDecks(decks.map((d) => (d.id === 'rws' ? edited : d)))
    await s.ensureDecksSeeded(now)

    const merged = (await s.loadDecks()).find((d) => d.id === 'rws')!
    expect(merged.seedVersion).toBe(currentSeed('rws').seedVersion)

    // The user's text survives, and stays unstamped so it survives the NEXT
    // bump too.
    const fool = merged.cards.find((c) => c.id === foolId)!
    expect(fool.meaning).toBe('my note')
    expect(fool.keywords).toEqual(['mine'])
    expect(fool.seedFingerprints?.meaning).toBeUndefined()

    // A card they never edited still receives the seed's current text — this is
    // the half a naive "only fill empty fields" fix would break forever.
    const untouched = merged.cards.find((c) => c.id === untouchedId)!
    const shipped = currentSeed('rws').cards.find((c) => c.id === untouchedId)!
    expect(untouched.meaning).toBe(shipped.meaning)
  })

  it('does not rewrite decks.json once provenance has been backfilled', async () => {
    // backfillSeedFingerprints runs on every boot; it must return the same
    // reference when there is nothing to do, or the store writes forever.
    const s = stores()
    await s.ensureDecksSeeded(now)
    await s.ensureDecksSeeded(now)
    const before = await fs.readFile(join(dir, 'decks.json'), 'utf8')
    await s.ensureDecksSeeded(now)
    expect(await fs.readFile(join(dir, 'decks.json'), 'utf8')).toBe(before)
  })
})

describe('mergeSeedDeck', () => {
  const base = (over: Partial<Deck>): Deck => ({
    id: 'd',
    name: 'D',
    suits: ['Wands'],
    pipRanks: ['Ace'],
    courtRanks: [],
    supportsReversed: false,
    cards: [],
    createdAt: 'now',
    updatedAt: 'now',
    ...over
  })

  // INVERTED, same reason as the bump test above: an UNSTAMPED value is the
  // user's, because nothing proves we wrote it. Absence of provenance is
  // treated as authorship — the safe direction.
  it('keeps an unstamped user value, because nothing proves the seed wrote it', () => {
    const user = base({ cards: [{ id: 'maj-0', section: 'major', name: 'Fool', meaning: 'user' }] })
    const seed = base({
      name: 'D2',
      cards: [{ id: 'maj-0', section: 'major', name: 'Fool', meaning: 'seed' }]
    })
    const out = mergeSeedDeck(user, seed)
    expect(out.name).toBe('D')
    expect(out.cards[0].meaning).toBe('user')
  })

  it('takes the seed value when the stored one still matches its stamp', () => {
    const seeded = stampSeedDeck(
      base({ name: 'D', cards: [{ id: 'maj-0', section: 'major', name: 'Fool', meaning: 'v1' }] })
    )
    const seed = base({
      name: 'D2',
      cards: [{ id: 'maj-0', section: 'major', name: 'Fool', meaning: 'v2' }]
    })
    const out = mergeSeedDeck(seeded, seed)
    expect(out.name).toBe('D2')
    expect(out.cards[0].meaning).toBe('v2')
    // Re-stamped against the new value, so the bump after this one still works.
    expect(out.cards[0].seedFingerprints?.meaning).toBeDefined()
  })

  it('preserves imported art, a card back, and cards the user added', () => {
    const user = base({
      back: 'my-back.png',
      backVersion: 3,
      cards: [
        {
          id: 'maj-0',
          section: 'major',
          name: 'Fool',
          image: 'fool.png',
          imageVersion: 2
        },
        { id: 'mine-1', section: 'major', name: 'A card I added' }
      ]
    })
    const seed = base({
      back: 'seed-back.png',
      cards: [{ id: 'maj-0', section: 'major', name: 'Fool', meaning: 'seed' }]
    })
    const out = mergeSeedDeck(user, seed)

    // All four losses the old `{ ...seed, cards }` caused, in one assertion set.
    expect(out.cards[0].image).toBe('fool.png')
    expect(out.cards[0].imageVersion).toBe(2)
    expect(out.back).toBe('my-back.png')
    expect(out.backVersion).toBe(3)
    expect(out.cards.find((c) => c.id === 'mine-1')).toBeDefined()
  })

  it('lets the seed own pure structure outright', () => {
    const user = base({ suits: ['Old'], pipRanks: ['A'], supportsReversed: false })
    const seed = base({
      suits: ['Wands', 'Cups'],
      pipRanks: ['Ace', 'Two'],
      supportsReversed: true
    })
    const out = mergeSeedDeck(user, seed)
    expect(out.suits).toEqual(['Wands', 'Cups'])
    expect(out.pipRanks).toEqual(['Ace', 'Two'])
    expect(out.supportsReversed).toBe(true)
  })

  it('backfills a stamp only where the stored value still equals the seed', () => {
    const shipped = base({
      cards: [
        { id: 'maj-0', section: 'major', name: 'Fool', meaning: 'shipped' },
        { id: 'maj-1', section: 'major', name: 'Magician', meaning: 'shipped' }
      ]
    })
    const stored = base({
      cards: [
        { id: 'maj-0', section: 'major', name: 'Fool', meaning: 'shipped' },
        { id: 'maj-1', section: 'major', name: 'Magician', meaning: 'I rewrote this' }
      ]
    })
    const out = backfillSeedFingerprints(stored, shipped)
    expect(out.cards[0].seedFingerprints?.meaning).toBeDefined()
    expect(out.cards[1].seedFingerprints?.meaning).toBeUndefined()

    // And the edited card then survives a bump, which is the point of the backfill.
    const bumped = mergeSeedDeck(out, base({ cards: [{ ...shipped.cards[1], meaning: 'v2' }] }))
    expect(bumped.cards[0].meaning).toBe('I rewrote this')
  })

  it('falls back to the user field when the seed leaves it empty, matched by suit+rank', () => {
    const user = base({
      cards: [
        {
          id: 'u1',
          section: 'minor',
          name: 'Ace of Wands',
          suit: 'Wands',
          rank: 'Ace',
          meaning: 'u'
        }
      ]
    })
    const seed = base({
      cards: [{ id: 's1', section: 'minor', name: 'Ace of Wands', suit: 'Wands', rank: 'Ace' }]
    })
    const out = mergeSeedDeck(user, seed)
    // Seed structure (its id/name) wins, but the user's meaning is carried over.
    expect(out.cards[0].id).toBe('s1')
    expect(out.cards[0].meaning).toBe('u')
  })
})

describe('image cleanup', () => {
  const writeImg = async (deckId: string, name: string): Promise<string> => {
    const p = join(dir, 'decks', deckId, name)
    await fs.mkdir(join(dir, 'decks', deckId), { recursive: true })
    await fs.writeFile(p, new Uint8Array([1, 2, 3]))
    return p
  }
  const exists = async (p: string): Promise<boolean> =>
    fs.access(p).then(
      () => true,
      () => false
    )

  it('deleteCardImage removes only the target card files', async () => {
    const s = stores()
    const a = await writeImg('thoth', 'maj-0.png')
    const b = await writeImg('thoth', 'maj-1.png')
    await s.deleteCardImage('thoth', 'maj-0')
    expect(await exists(a)).toBe(false)
    expect(await exists(b)).toBe(true)
  })

  it('deleteDeckImages removes the whole deck directory', async () => {
    const s = stores()
    await writeImg('thoth', 'maj-0.png')
    await s.deleteDeckImages('thoth')
    expect(await exists(join(dir, 'decks', 'thoth'))).toBe(false)
  })

  it('image deletes never throw for a missing deck/card', async () => {
    const s = stores()
    await expect(s.deleteCardImage('nope', 'nope')).resolves.toBeUndefined()
    await expect(s.deleteDeckImages('nope')).resolves.toBeUndefined()
  })
})

// HTOO-697. Every id that cannot name a child folder, on a real data folder:
// the journal, the decks file and another deck's art must all survive.
describe('image paths stay inside the deck folder (HTOO-697)', () => {
  const UNSAFE_IDS = ['..', '.', '...', '', '/', '../..', '..\\..']
  const exists = async (p: string): Promise<boolean> =>
    fs.access(p).then(
      () => true,
      () => false
    )

  let marks: string[]
  beforeEach(async () => {
    marks = [
      join(dir, 'readings.json'),
      join(dir, 'decks.json'),
      join(dir, 'decks.json.bak'),
      join(dir, 'decks', 'other', 'maj-0.png'),
      join(dir, 'decks', '.hidden')
    ]
    for (const p of marks) {
      await fs.mkdir(join(p, '..'), { recursive: true })
      await fs.writeFile(p, 'KEEP')
    }
  })
  const allKept = async (): Promise<void> => {
    for (const p of marks) expect(await fs.readFile(p, 'utf8')).toBe('KEEP')
  }

  it.each(UNSAFE_IDS)('deleteDeckImages(%j) deletes nothing', async (id) => {
    await stores().deleteDeckImages(id)
    await allKept()
    expect(await exists(dir)).toBe(true)
  })

  it.each(UNSAFE_IDS)('deleteCardImage(%j, "decks") deletes nothing', async (id) => {
    await stores().deleteCardImage(id, 'decks')
    await allKept()
  })

  it('deleteCardImage with an empty card id does not match the dotfiles', async () => {
    await stores().deleteCardImage('other', '')
    await stores().deleteCardImage('other', '.')
    await allKept()
  })

  it.each(UNSAFE_IDS)('saveCardImage(%j, "decks", "json") is refused', async (id) => {
    await expect(stores().saveCardImage(id, 'decks', 'json', new Uint8Array([1]))).rejects.toThrow(
      /outside the deck folder/
    )
    await allKept()
  })

  it('saveCardImage with a dot-only card id is refused', async () => {
    await expect(stores().saveCardImage('other', '..', 'png', new Uint8Array([1]))).rejects.toThrow(
      /outside the deck folder/
    )
    await allKept()
  })

  it.each(UNSAFE_IDS)('writeDeckImages(%j) is refused', async (id) => {
    await expect(
      stores().writeDeckImages(id, [{ filename: 'decks.json', data: new Uint8Array([1]) }])
    ).rejects.toThrow(/outside the deck folder/)
    await allKept()
  })

  it('a usable id still saves, deletes one card, and deletes its own folder', async () => {
    const s = stores()
    const name = await s.saveCardImage('mine', 'maj-1', 'png', new Uint8Array([1]))
    expect(name).toBe('maj-1.png')
    expect(await exists(join(dir, 'decks', 'mine', 'maj-1.png'))).toBe(true)
    await s.deleteCardImage('mine', 'maj-1')
    expect(await exists(join(dir, 'decks', 'mine', 'maj-1.png'))).toBe(false)
    await s.deleteDeckImages('mine')
    expect(await exists(join(dir, 'decks', 'mine'))).toBe(false)
    await allKept()
  })
})

describe('deck image export/import (read/write)', () => {
  const imgDeck = (overrides: Partial<Deck> = {}): Deck => ({
    id: 'd1',
    name: 'D',
    suits: [],
    pipRanks: [],
    courtRanks: [],
    supportsReversed: false,
    back: 'back.webp',
    cards: [{ id: 'the-star', section: 'major', name: 'The Star', image: 'the-star.webp' }],
    createdAt: 'a',
    updatedAt: 'b',
    ...overrides
  })

  it('writeDeckImages then readDeckImages round-trips a deck’s images', async () => {
    const s = stores()
    await s.writeDeckImages('d1', [
      { filename: 'the-star.webp', data: new Uint8Array([1, 2, 3]) },
      { filename: 'back.webp', data: new Uint8Array([4, 5]) }
    ])
    const out = await s.readDeckImages(imgDeck())
    const byName = Object.fromEntries(out.map((i) => [i.filename, Array.from(i.data)]))
    expect(byName['the-star.webp']).toEqual([1, 2, 3])
    expect(byName['back.webp']).toEqual([4, 5])
    expect(out).toHaveLength(2)
  })

  it('readDeckImages falls back to bundled art when the user has no copy', async () => {
    const s = stores()
    await fs.mkdir(join(bundled, 'emp'), { recursive: true })
    await fs.writeFile(join(bundled, 'emp', 'cups-ace.webp'), new Uint8Array([7, 7]))
    const deck = imgDeck({
      id: 'emp',
      back: undefined,
      cards: [{ id: 'cups-ace', section: 'minor', name: 'Ace of Cups', image: 'cups-ace.webp' }]
    })
    const out = await s.readDeckImages(deck)
    expect(out).toHaveLength(1)
    expect(Array.from(out[0].data)).toEqual([7, 7])
  })

  it('writeDeckImages skips a filename that would escape the deck folder', async () => {
    const s = stores()
    await s.writeDeckImages('d1', [{ filename: '..', data: new Uint8Array([9]) }])
    // '..' resolves to the images root itself → rejected, so nothing is written
    // (the deck folder is created but stays empty).
    const entries = await fs.readdir(join(dir, 'decks', 'd1'))
    expect(entries).toHaveLength(0)
  })
})
