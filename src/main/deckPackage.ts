/**
 * Pure pack/unpack for the portable `.corvathdeck` format — a zip holding the
 * deck's JSON plus its image files. No filesystem or Electron access here, so it
 * is unit-testable in isolation; the handler layer supplies the bytes and the
 * store reads/writes the actual files.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type UnzipFileInfo } from 'fflate'
import type { Deck } from '../shared/types'
import { deckSchema } from './schemas'

export const CORVATHDECK_EXT = 'corvathdeck'

const DECK_ENTRY = 'deck.json'
const IMAGE_PREFIX = 'images/'

export interface DeckImage {
  filename: string
  data: Uint8Array
}

export interface DeckPackage {
  deck: Deck
  images: DeckImage[]
}

/** Build `.corvathdeck` zip bytes from a deck and its image files. */
export function packDeck(deck: Deck, images: DeckImage[]): Uint8Array {
  const files: Record<string, Uint8Array> = {
    [DECK_ENTRY]: strToU8(JSON.stringify(deck, null, 2))
  }
  for (const { filename, data } of images) {
    // Guard against a stray path separator smuggling images out of the folder.
    const safe = filename.replace(/[/\\]/g, '_')
    files[`${IMAGE_PREFIX}${safe}`] = data
  }
  return zipSync(files)
}

const MiB = 1024 * 1024
const GiB = 1024 * MiB

/**
 * Resource limits for a `.corvathdeck` import (HTOO-693).
 *
 * A deck file comes from another person, so its zip metadata is untrusted.
 * Without limits, a small file can make main allocate without bound: a huge
 * entry count, or an entry that declares gigabytes. fflate inflates each entry
 * into a buffer of its DECLARED size and drops what inflates past it, so
 * capping the declared sizes before the inflate bounds the memory.
 *
 * Each limit is far above the decks that exist. Measured on 2026-11-18 over
 * the bundled decks and Sabrael's profile: the largest deck is 30 MB in 80
 * files, the largest image 2.5 MB (`rws/back.png`), and the largest deck.json
 * 52 KB. A user deck of high-resolution scans can be much larger.
 */
export interface DeckLimits {
  maxFileBytes: number
  maxEntries: number
  maxDeckJsonBytes: number
  maxImageBytes: number
  maxTotalBytes: number
  maxRatio: number
  ratioFloorBytes: number
}

export const DECK_LIMITS: Readonly<DeckLimits> = Object.freeze({
  /** The .corvathdeck file. The import reads it whole, so this bounds the first allocation. */
  maxFileBytes: 1 * GiB,
  /** Entries in the central directory, the ones the import skips included. */
  maxEntries: 5000,
  /** `deck.json`, uncompressed. */
  maxDeckJsonBytes: 16 * MiB,
  /** One image, uncompressed. */
  maxImageBytes: 64 * MiB,
  /** All kept entries together, uncompressed, as the central directory declares. */
  maxTotalBytes: 1 * GiB,
  /** Uncompressed / compressed, for an entry above `ratioFloorBytes`. */
  maxRatio: 100,
  ratioFloorBytes: 1 * MiB
})

/** A deck file refused on a resource limit. The message is for the user. */
export class DeckLimitError extends Error {}

/** The refusal for a deck file of `fileBytes`, or null when the size is in the limit. */
export function deckFileSizeViolation(
  fileBytes: number,
  limits: DeckLimits = DECK_LIMITS
): string | null {
  return fileBytes > limits.maxFileBytes
    ? `This deck file is ${fileBytes} bytes, above the limit of ${limits.maxFileBytes}.`
    : null
}

const isKept = (name: string): boolean =>
  name === DECK_ENTRY || (name.startsWith(IMAGE_PREFIX) && name.length > IMAGE_PREFIX.length)

/**
 * The fflate filter that applies `limits` to each central-directory entry
 * before its inflate. It throws a DeckLimitError to stop the whole unzip, and
 * returns false for an entry the import does not use, so that entry is never
 * inflated.
 */
function limitFilter(limits: DeckLimits): (f: UnzipFileInfo) => boolean {
  let count = 0
  let total = 0
  return (f) => {
    count++
    if (count > limits.maxEntries) {
      throw new DeckLimitError(`This deck file has more than ${limits.maxEntries} entries.`)
    }
    if (!isKept(f.name)) return false
    const packed = f.size
    const size = f.originalSize
    if (!Number.isSafeInteger(size) || size < 0 || !Number.isSafeInteger(packed) || packed < 0) {
      throw new DeckLimitError(`Entry "${f.name}" declares a size that is not valid.`)
    }
    // A stored entry is a slice of `packed` bytes; an inflated one is a buffer
    // of `size` bytes. Either can be the allocation, so both are checked.
    const alloc = Math.max(size, packed)
    const max = f.name === DECK_ENTRY ? limits.maxDeckJsonBytes : limits.maxImageBytes
    if (alloc > max) {
      throw new DeckLimitError(`Entry "${f.name}" is ${alloc} bytes, above the limit of ${max}.`)
    }
    if (size > limits.ratioFloorBytes && (packed === 0 || size / packed > limits.maxRatio)) {
      throw new DeckLimitError(`Entry "${f.name}" compresses more than ${limits.maxRatio} to 1.`)
    }
    total += alloc
    if (total > limits.maxTotalBytes) {
      throw new DeckLimitError(
        `This deck file holds more than ${limits.maxTotalBytes} bytes uncompressed.`
      )
    }
    return true
  }
}

/**
 * Parse and validate a `.corvathdeck` archive. Throws if it isn't a valid
 * package (missing/invalid `deck.json`) or if it passes a limit in `limits`,
 * so callers can surface the message.
 */
export function unpackDeck(bytes: Uint8Array, limits: DeckLimits = DECK_LIMITS): DeckPackage {
  const sizeRefusal = deckFileSizeViolation(bytes.length, limits)
  if (sizeRefusal) throw new DeckLimitError(sizeRefusal)

  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes, { filter: limitFilter(limits) })
  } catch (err) {
    if (err instanceof DeckLimitError) throw err
    throw new Error('This file is not a valid .corvathdeck archive.')
  }

  const deckJson = entries[DECK_ENTRY]
  if (!deckJson) throw new Error('Not a valid .corvathdeck — missing deck.json.')

  let parsed: unknown
  try {
    parsed = JSON.parse(strFromU8(deckJson))
  } catch {
    throw new Error('The deck.json inside this .corvathdeck is not valid JSON.')
  }
  const deck = deckSchema.parse(parsed)

  const images: DeckImage[] = []
  for (const [path, data] of Object.entries(entries)) {
    if (path !== DECK_ENTRY) images.push({ filename: path.slice(IMAGE_PREFIX.length), data })
  }
  return { deck, images }
}

/**
 * A deck name not already in `taken`. Appends " (imported)" and then a counter
 * so an imported deck never silently shadows an existing one by name.
 */
export function uniqueDeckName(name: string, taken: string[]): string {
  const base = name.trim() || 'Imported Deck'
  const set = new Set(taken)
  if (!set.has(base)) return base
  const withTag = `${base} (imported)`
  if (!set.has(withTag)) return withTag
  let n = 2
  while (set.has(`${withTag} ${n}`)) n++
  return `${withTag} ${n}`
}
