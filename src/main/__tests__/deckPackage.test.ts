import { describe, expect, it } from 'vitest'
import { strFromU8, strToU8, zipSync } from 'fflate'
import type { Deck } from '../../shared/types'
import {
  DECK_LIMITS,
  DeckLimitError,
  type DeckLimits,
  packDeck,
  unpackDeck,
  uniqueDeckName
} from '../deckPackage'

function makeDeck(): Deck {
  return {
    id: 'src-id',
    name: 'My Deck',
    builtIn: true,
    seedVersion: 3,
    suits: ['Cups'],
    pipRanks: ['Ace'],
    courtRanks: ['King'],
    supportsReversed: true,
    back: 'back.webp',
    cards: [
      { id: 'the-star', section: 'major', name: 'The Star', number: 0, image: 'the-star.webp' },
      { id: 'cups-ace', section: 'minor', name: 'Ace of Cups', suit: 'Cups', rank: 'Ace' }
    ],
    createdAt: 'a',
    updatedAt: 'b'
  }
}

const bytes = (nums: number[]): Uint8Array => new Uint8Array(nums)

describe('packDeck / unpackDeck', () => {
  it('round-trips a deck and its images', () => {
    const deck = makeDeck()
    const images = [
      { filename: 'the-star.webp', data: bytes([1, 2, 3]) },
      { filename: 'back.webp', data: bytes([9, 8]) }
    ]
    const zip = packDeck(deck, images)
    const out = unpackDeck(zip)

    expect(out.deck).toEqual(deck)
    const byName = Object.fromEntries(out.images.map((i) => [i.filename, Array.from(i.data)]))
    expect(byName['the-star.webp']).toEqual([1, 2, 3])
    expect(byName['back.webp']).toEqual([9, 8])
    expect(out.images).toHaveLength(2)
  })

  it('throws on bytes that are not a zip', () => {
    expect(() => unpackDeck(bytes([0, 1, 2, 3]))).toThrow(/not a valid \.corvathdeck/i)
  })

  it('throws when deck.json is missing', () => {
    // A valid zip that has an image entry but no deck.json.
    const zip = zipSync({ 'images/x.webp': bytes([1]) })
    expect(() => unpackDeck(zip)).toThrow(/missing deck\.json/i)
  })

  it('rejects an invalid deck.json (schema failure)', () => {
    // Hand-build a package whose deck.json is structurally wrong.
    const bad = packDeck({ ...makeDeck(), suits: 'nope' as unknown as string[] }, [])
    expect(() => unpackDeck(bad)).toThrow()
  })
})

// HTOO-693. Real zips from fflate, with small limits so each case is cheap.
// Entries are stored (level 0) unless a case needs deflate, so the compressed
// and uncompressed sizes are equal and each boundary is exact.
describe('unpackDeck resource limits (HTOO-693)', () => {
  const deckJson = strToU8(JSON.stringify(makeDeck()))
  const fill = (n: number, v = 7): Uint8Array => new Uint8Array(n).fill(v)
  const stored = (files: Record<string, Uint8Array>): Uint8Array =>
    zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [v, { level: 0 }]])))
  const limits = (over: Partial<DeckLimits> = {}): DeckLimits => ({
    ...DECK_LIMITS,
    maxFileBytes: 1_000_000,
    maxEntries: 3,
    maxDeckJsonBytes: deckJson.length,
    maxImageBytes: 1000,
    maxTotalBytes: deckJson.length + 2000,
    ratioFloorBytes: 1024,
    maxRatio: 10,
    ...over
  })

  /** Rewrite the uncompressed size that the central directory declares for `name`. */
  function declare(zip: Uint8Array, name: string, size: number): Uint8Array {
    const out = zip.slice()
    const view = new DataView(out.buffer)
    for (let i = 0; i + 46 <= out.length; i++) {
      if (view.getUint32(i, true) !== 0x02014b50) continue
      const nameLen = view.getUint16(i + 28, true)
      if (strFromU8(out.subarray(i + 46, i + 46 + nameLen)) === name) {
        view.setUint32(i + 24, size, true)
        return out
      }
    }
    throw new Error(`no central directory entry for ${name}`)
  }

  it('accepts a deck at every boundary', () => {
    const zip = stored({
      'deck.json': deckJson,
      'images/a.webp': fill(1000),
      'images/b.webp': fill(1000)
    })
    const out = unpackDeck(zip, limits({ maxFileBytes: zip.length }))
    expect(out.images.map((i) => i.data.length)).toEqual([1000, 1000])
  })

  it('refuses a file above the size limit before it unzips', () => {
    const zip = stored({ 'deck.json': deckJson })
    expect(() => unpackDeck(zip, limits({ maxFileBytes: zip.length - 1 }))).toThrow(DeckLimitError)
  })

  it('refuses too many entries, the skipped ones included', () => {
    const zip = stored({
      'deck.json': deckJson,
      'images/a.webp': fill(1),
      'other/1': fill(1),
      'other/2': fill(1)
    })
    expect(() => unpackDeck(zip, limits())).toThrow(/more than 3 entries/)
  })

  it('refuses an oversized deck.json', () => {
    const zip = stored({ 'deck.json': deckJson })
    expect(() => unpackDeck(zip, limits({ maxDeckJsonBytes: deckJson.length - 1 }))).toThrow(
      /deck\.json.*above the limit/
    )
  })

  it('refuses an oversized image', () => {
    const zip = stored({ 'deck.json': deckJson, 'images/a.webp': fill(1001) })
    expect(() => unpackDeck(zip, limits())).toThrow(/images\/a\.webp.*above the limit/)
  })

  it('refuses more than the total limit', () => {
    const zip = stored({
      'deck.json': deckJson,
      'images/a.webp': fill(1000),
      'images/b.webp': fill(1000)
    })
    expect(() => unpackDeck(zip, limits({ maxTotalBytes: deckJson.length + 1999 }))).toThrow(
      /more than .* bytes uncompressed/
    )
  })

  it('refuses a high compression ratio', () => {
    // 4 KiB of zeros deflates to a few bytes: far above 10 to 1.
    const zip = zipSync({ 'deck.json': [deckJson, { level: 0 }], 'images/z.webp': fill(4096, 0) })
    expect(() => unpackDeck(zip, limits({ maxImageBytes: 8192 }))).toThrow(/compresses more than/)
  })

  it('refuses an entry that declares a size above the limit', () => {
    const zip = declare(
      stored({ 'deck.json': deckJson, 'images/a.webp': fill(10) }),
      'images/a.webp',
      0xfffffff0
    )
    expect(() => unpackDeck(zip, limits())).toThrow(/images\/a\.webp.*above the limit/)
  })

  it('never allocates past a declared size that is too small', () => {
    // A deflated entry that inflates to 900 bytes but declares 50: fflate's
    // output buffer is the declared size, so the inflate stops there.
    const real = new Uint8Array(900).map((_, i) => (i * 31) % 251)
    const zip = declare(
      zipSync({ 'deck.json': [deckJson, { level: 0 }], 'images/a.webp': real }),
      'images/a.webp',
      50
    )
    const out = unpackDeck(zip, limits())
    expect(out.images[0].data.length).toBe(50)
  })

  it('does not inflate an entry the import does not use', () => {
    // `other/big` declares 4 GiB. It is skipped before its size is read.
    const zip = declare(
      stored({ 'deck.json': deckJson, 'other/big': fill(10) }),
      'other/big',
      0xfffffff0
    )
    expect(unpackDeck(zip, limits()).images).toEqual([])
  })

  it('a refusal is a DeckLimitError, not the not-a-zip message', () => {
    const zip = stored({ 'deck.json': deckJson, 'images/a.webp': fill(1001) })
    expect(() => unpackDeck(zip, limits())).toThrow(DeckLimitError)
    expect(() => unpackDeck(zip, limits())).not.toThrow(/not a valid/)
  })

  it('the default limits fit the largest bundled deck shape', () => {
    // 80 entries, a 2.5 MB image and a 52 KB deck.json, as measured.
    expect(DECK_LIMITS.maxEntries).toBeGreaterThanOrEqual(80 * 10)
    expect(DECK_LIMITS.maxImageBytes).toBeGreaterThanOrEqual(2_511_527 * 10)
    expect(DECK_LIMITS.maxDeckJsonBytes).toBeGreaterThanOrEqual(52_339 * 10)
    expect(DECK_LIMITS.maxTotalBytes).toBeGreaterThanOrEqual(30_070_496 * 10)
  })
})

describe('uniqueDeckName', () => {
  it('keeps the name when free', () => {
    expect(uniqueDeckName('Thoth', ['Rider-Waite'])).toBe('Thoth')
  })

  it('tags a colliding name', () => {
    expect(uniqueDeckName('Thoth', ['Thoth'])).toBe('Thoth (imported)')
  })

  it('counts up when the tagged name also collides', () => {
    expect(uniqueDeckName('Thoth', ['Thoth', 'Thoth (imported)'])).toBe('Thoth (imported) 2')
    expect(uniqueDeckName('Thoth', ['Thoth', 'Thoth (imported)', 'Thoth (imported) 2'])).toBe(
      'Thoth (imported) 3'
    )
  })

  it('falls back for a blank name', () => {
    expect(uniqueDeckName('   ', [])).toBe('Imported Deck')
  })
})
