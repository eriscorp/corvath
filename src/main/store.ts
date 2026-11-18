import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import { dirname, join, resolve, sep } from 'path'
import type { Deck, DeckCard, Layout, Reading, Settings } from '../shared/types'
import { createJsonStore } from './jsonStore'
import { cleanSegment, safeSegment } from './segments'
import { buildSeedDecks } from './seedDecks'
import { buildSeedLayouts } from './seedLayouts'
import { decksSchema, layoutsSchema, readingsSchema, settingsSchema } from './schemas'

const DEFAULT_SETTINGS: Settings = { theme: 'hybrasyl' }

const READINGS_VERSION = 1
interface ReadingsFile {
  version: number
  readings: Reading[]
}
const DEFAULT_READINGS_FILE: ReadingsFile = { version: READINGS_VERSION, readings: [] }

const DECKS_VERSION = 1
interface DecksFile {
  version: number
  decks: Deck[]
}
const DEFAULT_DECKS_FILE: DecksFile = { version: DECKS_VERSION, decks: [] }

const LAYOUTS_VERSION = 1
interface LayoutsFile {
  version: number
  layouts: Layout[]
}
const DEFAULT_LAYOUTS_FILE: LayoutsFile = { version: LAYOUTS_VERSION, layouts: [] }

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object'
}

export { safeSegment, cleanSegment }

/**
 * `<root>/<deckId>` when it is a direct child folder of `root`, else null.
 *
 * Every store function that touches a deck's image folder gets the folder
 * here (HTOO-697). `cleanSegment` refuses `.`, `..`, empty and dot-only ids,
 * so the folder is never `root` itself or its parent.
 */
export function deckDirWithin(root: string, deckId: string): string | null {
  const seg = cleanSegment(deckId)
  if (seg === null) return null
  const base = resolve(root)
  const target = resolve(base, seg)
  return dirname(target) === base ? target : null
}

/**
 * Resolve `<root>/<deckId>/<filename>` and confirm the result stays strictly
 * inside the deck's folder, returning null if it escapes. Both segments go
 * through `cleanSegment`, which refuses `.`, `..`, empty and dot-only names.
 * The final check against `<deckDir> + sep` is a second guard: it requires the
 * target to be a real child of the folder, not a sibling that only shares the
 * folder as a string prefix (root `.../decks`, target `.../decks.json`).
 */
export function resolveWithin(root: string, deckId: string, filename: string): string | null {
  const deckDir = deckDirWithin(root, deckId)
  const file = cleanSegment(filename)
  if (deckDir === null || file === null) return null
  const target = resolve(deckDir, file)
  return target.startsWith(deckDir + sep) ? target : null
}

const minorKey = (suit: string, rank: string): string => `${suit}|${rank}`

/**
 * The fields the seed OWNS and may update on a bump. Everything not listed is
 * the user's outright and is copied across untouched.
 *
 * `image` / `imageVersion` are deliberately absent: they are written only by a
 * user import and never by a seed, so they need no provenance to be safe.
 */
const SEEDED_CARD_FIELDS = ['name', 'meaning', 'meaningReversed', 'keywords'] as const
const SEEDED_DECK_FIELDS = ['name', 'description'] as const

type SeededCardField = (typeof SEEDED_CARD_FIELDS)[number]
type SeededDeckField = (typeof SEEDED_DECK_FIELDS)[number]

/**
 * A short, stable fingerprint of one field's value.
 *
 * A hash rather than a second copy of the text: the four meanings files run to
 * 400-500 lines each, and storing them twice would double decks.json for a
 * question answerable in 12 characters.
 */
const fingerprint = (value: unknown): string =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value ?? null))
    .digest('base64url')
    .slice(0, 12)

const isEmpty = (v: unknown): boolean =>
  v === undefined ||
  v === null ||
  (typeof v === 'string' && !v.trim()) ||
  (Array.isArray(v) && !v.length)

/**
 * Decide one field on a seedVersion bump, and say whether the seed still owns it.
 *
 * Three cases, in order:
 *   1. The user's value is empty  -> take the seed's. Nothing can be lost, and
 *      this is what lets a seed ADD a field (reversed meanings, say) to an
 *      install that never had one. A rule of "only fill empty fields" without
 *      the two cases below is the trap: once every field ships text, no field
 *      is ever empty again and no correction can ever reach an existing user.
 *   2. The user's value still matches the fingerprint we stamped  -> we wrote
 *      it, the user has not touched it, so take the seed's new value.
 *   3. Anything else -> the user's, including every unstamped field. Absence of
 *      provenance is treated as the user's work, which is the safe direction:
 *      the cost of being wrong is a correction that does not arrive, not text
 *      that is destroyed.
 */
function reconcile<T>(
  userVal: T,
  seedVal: T,
  stamp: string | undefined
): { value: T; fromSeed: boolean } {
  if (isEmpty(userVal)) return { value: seedVal, fromSeed: true }
  if (stamp !== undefined && fingerprint(userVal) === stamp) {
    return { value: seedVal, fromSeed: true }
  }
  return { value: userVal, fromSeed: false }
}

/** Stamp every seeded field of a freshly shipped card/deck. */
function stampAll<T extends object>(value: T, fields: readonly string[]): T {
  const stamps: Record<string, string> = {}
  for (const f of fields) {
    const v = (value as Record<string, unknown>)[f]
    if (!isEmpty(v)) stamps[f] = fingerprint(v)
  }
  return { ...value, seedFingerprints: stamps }
}

/** Apply the seed's provenance stamps to a whole deck, for a first install. */
export const stampSeedDeck = (seed: Deck): Deck => ({
  ...stampAll(seed, SEEDED_DECK_FIELDS),
  cards: seed.cards.map((c) => stampAll(c, SEEDED_CARD_FIELDS))
})

/**
 * Backfill provenance onto a deck stored before stamps existed.
 *
 * A stored value that still equals what the seed ships is PROVABLY unedited, so
 * it can be stamped and stays eligible for future corrections. Anything that
 * differs is left unstamped and becomes the user's for good.
 *
 * This must run before the first bump after the fix ships, which is why
 * `ensureDecksSeeded` calls it on every boot rather than behind a version gate.
 * A user who skips several releases has a stored deck older than `seed`, so more
 * fields read as "edited" than really were — they keep their text and stop
 * receiving corrections for those fields. Conservative in the safe direction.
 */
export function backfillSeedFingerprints(userDeck: Deck, seed: Deck): Deck {
  const seedCards = indexSeedCards(seed)
  // Returns the SAME reference when there is nothing to do. `ensureDecksSeeded`
  // runs this on every boot and uses identity to decide whether to write, so a
  // gratuitous copy would rewrite decks.json forever.
  const backfillOne = <T extends object>(
    stored: T,
    shipped: T | undefined,
    fields: readonly string[]
  ): T => {
    if (!shipped || (stored as { seedFingerprints?: unknown }).seedFingerprints) return stored
    const stamps: Record<string, string> = {}
    for (const f of fields) {
      const mine = (stored as Record<string, unknown>)[f]
      const theirs = (shipped as Record<string, unknown>)[f]
      if (!isEmpty(mine) && fingerprint(mine) === fingerprint(theirs)) stamps[f] = fingerprint(mine)
    }
    return { ...stored, seedFingerprints: stamps }
  }

  const deck = backfillOne(userDeck, seed, SEEDED_DECK_FIELDS)
  const cards = userDeck.cards.map((c) =>
    backfillOne(c, matchSeedCard(seedCards, c), SEEDED_CARD_FIELDS)
  )
  const cardsChanged = cards.some((c, i) => c !== userDeck.cards[i])
  if (deck === userDeck && !cardsChanged) return userDeck
  return { ...deck, cards }
}

type SeedIndex = { byId: Map<string, DeckCard>; bySuitRank: Map<string, DeckCard> }

const indexSeedCards = (deck: Deck): SeedIndex => ({
  byId: new Map(deck.cards.map((c) => [c.id, c])),
  bySuitRank: new Map(
    deck.cards
      .filter((c) => c.section === 'minor' && c.suit && c.rank)
      .map((c) => [minorKey(c.suit!, c.rank!), c])
  )
})

/** Majors match by id; minors by suit+rank, so a renumbered minor still pairs. */
const matchSeedCard = (index: SeedIndex, card: DeckCard): DeckCard | undefined =>
  card.section === 'major'
    ? index.byId.get(card.id)
    : card.suit && card.rank
      ? index.bySuitRank.get(minorKey(card.suit, card.rank))
      : undefined

/**
 * Merge an updated seed deck over the user's existing copy on a seedVersion bump.
 *
 * The seed owns pure STRUCTURE outright — `suits`, `pipRanks`, `courtRanks`,
 * `supportsReversed` — because those describe the deck's shape rather than
 * anything a user authors. Everything else is decided per field by `reconcile`,
 * so a correction reaches the text we wrote and never the text the user wrote.
 *
 * This used to be `{ ...seed, cards }` with the card list driven off
 * `seed.cards`, which discarded four separate kinds of user work in one line:
 * edited meanings, imported card art and backs, renames, and any card the user
 * had added to a built-in deck. All four are preserved below.
 */
export function mergeSeedDeck(userDeck: Deck, seed: Deck): Deck {
  const userById = new Map(userDeck.cards.map((c) => [c.id, c]))
  const userBySuitRank = new Map(
    userDeck.cards
      .filter((c) => c.section === 'minor' && c.suit && c.rank)
      .map((c) => [minorKey(c.suit!, c.rank!), c])
  )
  const claimed = new Set<string>()

  const cards: DeckCard[] = seed.cards.map((sc) => {
    const prior =
      sc.section === 'major'
        ? userById.get(sc.id)
        : sc.suit && sc.rank
          ? userBySuitRank.get(minorKey(sc.suit, sc.rank))
          : undefined
    if (!prior) return stampAll(sc, SEEDED_CARD_FIELDS)
    claimed.add(prior.id)

    const merged: DeckCard = { ...sc }
    const stamps: Record<string, string> = {}
    for (const f of SEEDED_CARD_FIELDS) {
      const { value, fromSeed } = reconcile(
        prior[f as SeededCardField],
        sc[f as SeededCardField],
        prior.seedFingerprints?.[f]
      )
      ;(merged as unknown as Record<string, unknown>)[f] = value
      // Stamp only what the seed still owns. A field we conceded to the user
      // must stay UNSTAMPED, or the next bump would read it as ours again.
      if (fromSeed && !isEmpty(value)) stamps[f] = fingerprint(value)
    }
    merged.seedFingerprints = stamps

    // Art is the user's whenever they imported any. imageVersion is written
    // only by an import and never by a seed, so its presence is the signal.
    if (prior.image !== undefined) merged.image = prior.image
    if (prior.imageVersion !== undefined) merged.imageVersion = prior.imageVersion
    return merged
  })

  // Cards the user added to a built-in deck are not in the seed at all. They
  // were previously dropped without a trace.
  for (const c of userDeck.cards) if (!claimed.has(c.id)) cards.push(c)

  const deckStamps: Record<string, string> = {}
  const deckFields: Partial<Record<SeededDeckField, string | undefined>> = {}
  for (const f of SEEDED_DECK_FIELDS) {
    const { value, fromSeed } = reconcile(
      userDeck[f as SeededDeckField],
      seed[f as SeededDeckField],
      userDeck.seedFingerprints?.[f]
    )
    deckFields[f as SeededDeckField] = value
    if (fromSeed && !isEmpty(value)) deckStamps[f] = fingerprint(value)
  }

  return {
    ...seed,
    ...deckFields,
    // A user-imported back, like card art, is theirs.
    back: userDeck.back !== undefined ? userDeck.back : seed.back,
    backVersion: userDeck.backVersion !== undefined ? userDeck.backVersion : seed.backVersion,
    createdAt: userDeck.createdAt,
    cards,
    seedFingerprints: deckStamps
  }
}

export interface Stores {
  loadSettings(): Promise<Settings>
  saveSettings(settings: Settings): Promise<void>
  loadReadings(): Promise<Reading[]>
  saveReadings(readings: Reading[]): Promise<void>
  loadDecks(): Promise<Deck[]>
  saveDecks(decks: Deck[]): Promise<void>
  /** Seed built-in decks, merging in any that are missing (e.g. new built-ins). */
  ensureDecksSeeded(now: string): Promise<void>
  loadLayouts(): Promise<Layout[]>
  saveLayouts(layouts: Layout[]): Promise<void>
  /** Seed the built-in layouts on first run (when no layouts file exists yet). */
  ensureLayoutsSeeded(now: string): Promise<void>
  /** Copy raw image bytes into <dir>/decks/<deckId>/, replacing any prior image for the card. */
  saveCardImage(deckId: string, cardId: string, ext: string, data: Uint8Array): Promise<string>
  /** Best-effort delete of a single card's image file(s). Never throws. */
  deleteCardImage(deckId: string, cardId: string): Promise<void>
  /** Best-effort delete of an entire deck's image directory. Never throws. */
  deleteDeckImages(deckId: string): Promise<void>
  /** Read a deck's image bytes (user override first, then bundled art). For export. */
  readDeckImages(deck: Deck): Promise<{ filename: string; data: Uint8Array }[]>
  /** Write raw image bytes into a deck's image folder (path-safe). For import. */
  writeDeckImages(deckId: string, files: { filename: string; data: Uint8Array }[]): Promise<void>
  /** Absolute path to a user-imported deck image, or null if it escapes the data dir. */
  resolveImagePath(deckId: string, filename: string): string | null
  /** Absolute path to a bundled (shipped) deck image, or null if it escapes the bundle. */
  resolveBundledImagePath(deckId: string, filename: string): string | null
}

/**
 * Create the hardened settings/readings/decks stores rooted at `dir`
 * (the roaming app-data directory). All files are crash-safe and recover
 * from a backup if the primary is corrupted. Deck images live under
 * `<dir>/decks/<deckId>/`.
 */
export function createStores(dir: string, bundledDecksDir: string): Stores {
  const imagesRoot = join(dir, 'decks')

  const settings = createJsonStore<Settings>({
    dir,
    filename: 'settings.json',
    defaults: DEFAULT_SETTINGS,
    normalize: (data) => {
      const parsed = settingsSchema.safeParse(data)
      return parsed.success ? parsed.data : null
    }
  })

  const readings = createJsonStore<ReadingsFile>({
    dir,
    filename: 'readings.json',
    defaults: DEFAULT_READINGS_FILE,
    normalize: (data) => {
      if (!isObject(data)) return null
      const parsed = readingsSchema.safeParse(data.readings)
      return parsed.success ? { version: READINGS_VERSION, readings: parsed.data } : null
    }
  })

  const decks = createJsonStore<DecksFile>({
    dir,
    filename: 'decks.json',
    defaults: DEFAULT_DECKS_FILE,
    normalize: (data) => {
      if (!isObject(data)) return null
      const parsed = decksSchema.safeParse(data.decks)
      return parsed.success ? { version: DECKS_VERSION, decks: parsed.data } : null
    }
  })

  const layouts = createJsonStore<LayoutsFile>({
    dir,
    filename: 'layouts.json',
    defaults: DEFAULT_LAYOUTS_FILE,
    normalize: (data) => {
      if (!isObject(data)) return null
      const parsed = layoutsSchema.safeParse(data.layouts)
      return parsed.success ? { version: LAYOUTS_VERSION, layouts: parsed.data } : null
    }
  })

  /**
   * Delete every file for a card id in a deck dir (bare name or any extension).
   * `safeCard` must come from `cleanSegment`: an empty id would match every
   * dotfile in the folder.
   */
  async function unlinkCardFiles(deckDir: string, safeCard: string): Promise<void> {
    try {
      const existing = await fs.readdir(deckDir)
      await Promise.all(
        existing
          .filter((f) => f === safeCard || f.startsWith(`${safeCard}.`))
          .map((f) => fs.unlink(join(deckDir, f)).catch(() => {}))
      )
    } catch {
      /* dir may not exist */
    }
  }

  async function saveCardImage(
    deckId: string,
    cardId: string,
    ext: string,
    data: Uint8Array
  ): Promise<string> {
    const deckDir = deckDirWithin(imagesRoot, deckId)
    const safeCard = cleanSegment(cardId)
    if (deckDir === null || safeCard === null) {
      throw new Error('Refused an image path outside the deck folder.')
    }
    const safeExt = safeSegment(ext).replace(/^\.+/, '').toLowerCase() || 'png'
    await fs.mkdir(deckDir, { recursive: true })

    // Remove any prior image for this card (any extension/version) so we never
    // accumulate stale files or serve a cached image after a replacement.
    await unlinkCardFiles(deckDir, safeCard)

    const filename = `${safeCard}.${safeExt}`
    await fs.writeFile(join(deckDir, filename), data)
    return filename
  }

  // The two deletes do nothing for a refused id: no file of a refused id can be
  // inside a deck folder, and the renderer treats a delete as fire-and-forget.
  async function deleteCardImage(deckId: string, cardId: string): Promise<void> {
    const deckDir = deckDirWithin(imagesRoot, deckId)
    const safeCard = cleanSegment(cardId)
    if (deckDir === null || safeCard === null) return
    await unlinkCardFiles(deckDir, safeCard)
  }

  async function deleteDeckImages(deckId: string): Promise<void> {
    const deckDir = deckDirWithin(imagesRoot, deckId)
    if (deckDir === null) return
    await fs.rm(deckDir, { recursive: true, force: true }).catch(() => {})
  }

  const resolveImagePath = (deckId: string, filename: string): string | null =>
    resolveWithin(imagesRoot, deckId, filename)

  const resolveBundledImagePath = (deckId: string, filename: string): string | null =>
    resolveWithin(bundledDecksDir, deckId, filename)

  async function readDeckImages(deck: Deck): Promise<{ filename: string; data: Uint8Array }[]> {
    const names = new Set<string>()
    for (const card of deck.cards) if (card.image) names.add(card.image)
    if (deck.back) names.add(deck.back)

    const out: { filename: string; data: Uint8Array }[] = []
    for (const filename of names) {
      // Prefer the user's imported image; fall back to shipped/bundled art so an
      // exported built-in deck carries its pictures too.
      const candidates = [
        resolveImagePath(deck.id, filename),
        resolveBundledImagePath(deck.id, filename)
      ]
      for (const filePath of candidates) {
        if (!filePath) continue
        try {
          const data = await fs.readFile(filePath)
          out.push({ filename, data: new Uint8Array(data) })
          break
        } catch {
          /* try next candidate */
        }
      }
    }
    return out
  }

  async function writeDeckImages(
    deckId: string,
    files: { filename: string; data: Uint8Array }[]
  ): Promise<void> {
    const deckDir = deckDirWithin(imagesRoot, deckId)
    if (deckDir === null) throw new Error('Refused an image path outside the deck folder.')
    await fs.mkdir(deckDir, { recursive: true })
    for (const { filename, data } of files) {
      // resolveWithin re-cleans both segments and rejects anything (e.g. '..')
      // that would escape the deck's folder.
      const target = resolveWithin(imagesRoot, deckId, filename)
      if (!target) continue
      await fs.writeFile(target, data)
    }
  }

  return {
    loadSettings: () => settings.load(),
    saveSettings: (value) => settings.save(value),
    loadReadings: () => readings.load().then((file) => file.readings),
    saveReadings: (value) => readings.save({ version: READINGS_VERSION, readings: value }),
    loadDecks: () => decks.load().then((file) => file.decks),
    saveDecks: (value) => decks.save({ version: DECKS_VERSION, decks: value }),
    ensureDecksSeeded: async (now) => {
      const seeds = buildSeedDecks(now)
      if (!(await decks.exists())) {
        // Stamp on the way in, so a first install already knows which text it
        // shipped and the very next bump can reason about provenance.
        await decks.save({ version: DECKS_VERSION, decks: seeds.map(stampSeedDeck) })
        return
      }
      // Merge built-ins: add any the user is missing, and update an existing
      // built-in when its seed has a newer seedVersion (a content update) —
      // preserving anything the user authored via mergeSeedDeck.
      // User-created decks and customized decks at the current version are
      // left untouched.
      const next = [...(await decks.load()).decks]
      const indexById = new Map(next.map((d, i) => [d.id, i]))
      let changed = false
      for (const seed of seeds) {
        const i = indexById.get(seed.id)
        if (i === undefined) {
          next.push(stampSeedDeck(seed))
          changed = true
          continue
        }
        if (!next[i].builtIn) continue

        // Backfill provenance BEFORE the version gate, and on every boot until
        // it has happened. An install that predates stamps has no way to tell
        // "we wrote this" from "the user wrote this", and the only moment that
        // question is answerable is while the stored text still equals the seed
        // it came from — which stops being true the instant a bump lands.
        const backfilled = backfillSeedFingerprints(next[i], seed)
        if (backfilled !== next[i]) {
          next[i] = backfilled
          changed = true
        }

        if ((seed.seedVersion ?? 1) > (next[i].seedVersion ?? 1)) {
          next[i] = mergeSeedDeck(next[i], seed)
          changed = true
        }
      }
      if (changed) await decks.save({ version: DECKS_VERSION, decks: next })
    },
    loadLayouts: () => layouts.load().then((file) => file.layouts),
    saveLayouts: (value) => layouts.save({ version: LAYOUTS_VERSION, layouts: value }),
    ensureLayoutsSeeded: async (now) => {
      if (await layouts.exists()) return
      await layouts.save({ version: LAYOUTS_VERSION, layouts: buildSeedLayouts(now) })
    },
    saveCardImage,
    deleteCardImage,
    deleteDeckImages,
    readDeckImages,
    writeDeckImages,
    resolveImagePath,
    resolveBundledImagePath
  }
}
