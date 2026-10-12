export type Orientation = 'upright' | 'reversed'

export type ThemeName = 'hybrasyl' | 'danaan' | 'chadul' | 'grinneal' | 'mundanes' | 'dubhaimid'

/** A single card / question within a reading. */
export interface Entry {
  id: string
  topic: string
  question: string
  /** Links this entry to a layout position, when a layout was applied. */
  positionId?: string
  /** Drawn-card name (e.g. "The Star", "Three of Disks"). */
  card?: string
  /** Optional — orientation is not always tracked (e.g. the Argent Tarot). */
  orientation?: Orientation
  /** Free-form per-card interpretation (distinct from the deck's meaning). */
  notes?: string
}

/**
 * How a reading was produced: `manual` (entered by hand via "New Reading")
 * or `corvath` (drawn within the app).
 */
export type ReadingSource = 'manual' | 'corvath'

/**
 * How a `corvath` draw dealt its cards:
 * - `deal` — shuffled, then dealt off the top (honoring each position's top/bottom source);
 * - `fan` — cards fanned face-down, one picked per slot.
 */
export type DrawMode = 'deal' | 'fan'

/** A reading session: one deck, a date, and a list of entries. */
export interface Reading {
  id: string
  title: string
  /** Calendar date of the reading, stored as 'YYYY-MM-DD'. */
  date: string
  /** Deck used for the whole reading (e.g. "Argent Tarot"). */
  deck: string
  /** Where the reading came from; defaults to 'manual' for older readings. */
  source?: ReadingSource
  /** RNG seed used to shuffle the deck (present on `corvath` draws, for reproducibility). */
  seed?: number
  /** How a `corvath` draw dealt its cards. */
  drawMode?: DrawMode
  /** Layout/spread applied to this reading, if any. */
  layoutId?: string
  layoutName?: string
  /** Free-form overview / interpretation for the whole reading. */
  notes?: string
  entries: Entry[]
  createdAt: string
  updatedAt: string
}

/** Whether a position's card is drawn from the top or bottom of the deck. */
export type DeckSource = 'top' | 'bottom'

/** A single slot in a spread, placed on a normalized 0..1 board. */
export interface LayoutPosition {
  id: string
  name: string
  meaning?: string
  /** Card-center coordinates, normalized 0..1 across the board. */
  x: number
  y: number
  /** Rotation in degrees (e.g. 90 for a Celtic Cross "crossing" card). */
  rotation?: number
  /** Draw this card from the top or bottom of the deck (mutually exclusive). */
  source?: DeckSource
}

/** A reading layout / spread: an arrangement of named positions. */
export interface Layout {
  id: string
  name: string
  description?: string
  /** True for seeded spreads; still fully editable. */
  builtIn?: boolean
  positions: LayoutPosition[]
  createdAt: string
  updatedAt: string
}

export interface Settings {
  theme: ThemeName
  /**
   * Draw-tab defaults. All optional, and all referring to things the user can
   * delete — a deck or a spread can be gone by the next launch, so the Draw tab
   * treats an id that no longer resolves as "no default" rather than as an
   * error. Storing ids rather than names is deliberate: a rename must not
   * silently drop the default.
   */
  defaultDeckId?: string
  defaultLayoutId?: string
  defaultDrawMode?: DrawMode
}

export type CardSection = 'major' | 'minor'

/** A single card definition within a deck. */
export interface DeckCard {
  id: string
  section: CardSection
  name: string
  /** Major-arcana ordinal (e.g. 0..N); unused for minors. */
  number?: number
  /** Minor-arcana suit name (matches one of the deck's `suits`). */
  suit?: string
  /** Minor-arcana rank (one of the deck's `pipRanks` or `courtRanks`). */
  rank?: string
  /** Imported image filename, relative to the deck's image folder. */
  image?: string
  /** Bumped each time the card's image is (re)imported, for per-image cache-busting. */
  imageVersion?: number
  keywords?: string[]
  meaning?: string
  meaningReversed?: string
  /**
   * Fingerprints of the values this card was SEEDED with, per field.
   *
   * Provenance, not content: it answers "did we write this, or did the user?"
   * A field present here still matches what the seed shipped, so a seedVersion
   * bump may replace it. A field ABSENT here is the user's and is never
   * overwritten. Only fields the seed owns are tracked — see SEEDED_CARD_FIELDS
   * in store.ts. Undefined on user-created decks, which have no seed.
   */
  seedFingerprints?: Record<string, string>
}

/**
 * A tarot deck. Structure-agnostic: any number of majors, any suit/rank names —
 * "standard" is just one configuration. Minor cards are generated from
 * `suits` × (`pipRanks` + `courtRanks`) but stored explicitly so per-card
 * meanings and images persist across structure edits.
 */
export interface Deck {
  id: string
  name: string
  description?: string
  /** True for seeded decks (Argent/RWS/Empyrean/Hybrasyl); still fully editable. */
  builtIn?: boolean
  /** Seed revision; a higher value replaces an older built-in copy on startup. */
  seedVersion?: number
  suits: string[]
  pipRanks: string[]
  courtRanks: string[]
  supportsReversed: boolean
  /** Optional card-back image filename (served like card images). */
  back?: string
  /** Bumped each time the back image is (re)imported, for per-image cache-busting. */
  backVersion?: number
  cards: DeckCard[]
  createdAt: string
  updatedAt: string
  /** As `DeckCard.seedFingerprints`, for the deck's own `name` / `description`. */
  seedFingerprints?: Record<string, string>
}

/** Custom frameless-window controls exposed to the renderer. */
export interface WindowControls {
  minimize(): void
  toggleMaximize(): void
  close(): void
  isMaximized(): Promise<boolean>
  /** Subscribe to maximize/restore changes; returns an unsubscribe function. */
  onMaximizeChange(callback: (maximized: boolean) => void): () => void
}

/** Result of importing an image file for a card. */
export interface SavedImage {
  /** Filename to store on the card and reference via `corvath-asset://`. */
  filename: string
}

/** Result of exporting a deck to a `.corvathdeck` file. */
export interface DeckExportResult {
  ok?: boolean
  /** User dismissed the save dialog. */
  canceled?: boolean
  /** Path written to, on success. */
  path?: string
  error?: string
}

/** Result of importing a `.corvathdeck` file. */
export interface DeckImportResult {
  /** The freshly-created user deck (new id + unique name), on success. */
  deck?: Deck
  /** User dismissed the open dialog. */
  canceled?: boolean
  error?: string
}

/** Result of exporting one or more readings to a `.json` file. */
export interface ReadingExportResult {
  ok?: boolean
  /** User dismissed the save dialog. */
  canceled?: boolean
  /** Path written to, on success. */
  path?: string
  error?: string
}

/** A newer release advertised to the renderer (notification only — no auto-download). */
export interface UpdateInfo {
  /** Version of the latest release (tag without a leading `v`). */
  version: string
  /** Release page to open in the browser. */
  url: string
}

/** The surface exposed to the renderer on `window.api`. */
export interface TarotApi {
  readings: {
    getAll(): Promise<Reading[]>
    save(readings: Reading[]): Promise<void>
    /** Prompt for a destination and write the given JSON (one or more readings). */
    export(defaultName: string, json: string): Promise<ReadingExportResult>
  }
  decks: {
    getAll(): Promise<Deck[]>
    save(decks: Deck[]): Promise<void>
    /** Copy raw image bytes into the deck's image folder; returns the stored filename. */
    saveImage(deckId: string, cardId: string, ext: string, data: Uint8Array): Promise<SavedImage>
    /** Best-effort delete of a single card's stored image file(s). */
    deleteImage(deckId: string, cardId: string): Promise<void>
    /** Best-effort delete of an entire deck's image directory. */
    deleteDeckImages(deckId: string): Promise<void>
    /** Build the `corvath-asset://` URL for a stored image (cache-busted). */
    imageUrl(deckId: string, filename: string): string
    /** Prompt for a destination and export the deck (+ images) as a `.corvathdeck`. */
    exportDeck(deck: Deck): Promise<DeckExportResult>
    /** Prompt for a `.corvathdeck` and import it as a new user deck. `existingNames`
     * lets the importer pick a non-colliding name. */
    importDeck(existingNames: string[]): Promise<DeckImportResult>
  }
  layouts: {
    getAll(): Promise<Layout[]>
    save(layouts: Layout[]): Promise<void>
  }
  loadSettings(): Promise<Settings>
  saveSettings(settings: Settings): Promise<void>
  /** Signal the main process that the renderer has hydrated; reveals the window. */
  appReady(): void
  /** Subscribe to an available-update notification; returns an unsubscribe function. */
  onUpdateAvailable(callback: (info: UpdateInfo) => void): () => void
  /** This build's version string, for the About card. */
  getAppVersion(): Promise<string>
  /** Open the corvath data folder in the OS file manager. */
  revealSettings(): void
  /** The packaged CHANGELOG.md as raw markdown, or '' if it cannot be read. */
  readChangelog(): Promise<string>
  diagnostics: {
    /** The scrubbed diagnostics block, rebuilt on each dialog open. */
    build(): Promise<string>
    /** Copy the full report, then open a prefilled issue on the intake repo. */
    openIssue(title: string, body: string): Promise<OpenIssueResult>
    /** The clipboard alone. No account, no browser, no length budget. */
    copyReport(body: string): Promise<{ ok: true }>
    /** Forward an uncaught renderer error to main's capture site. */
    reportError(report: RendererErrorReport): void
    /** Open the session-logs folder in the OS file manager. */
    revealLogs(): void
  }
  window: WindowControls
}

/**
 * The outcome of opening a prefilled issue on the public intake repository.
 * `copied` is false when the clipboard write failed or timed out: the page still
 * opens, and the message says the clipboard holds no report.
 */
export type OpenIssueResult =
  | { ok: true; truncated: boolean; copied: boolean }
  | { ok: false; reason: 'unsafe-url'; copied: boolean }

/** One captured error, as the renderer forwards it to main. */
export interface RendererErrorReport {
  source: string
  message: string
  stack?: string
}
