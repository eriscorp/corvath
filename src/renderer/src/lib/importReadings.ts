import type { Entry, Layout, Orientation, Reading, ReadingSource } from '../../../shared/types'
import { nowIso, uid } from './deck'
import { nameKey } from './sameName'

export interface ImportResult {
  readings: Reading[]
  errors: string[]
}

const ORIENTATIONS: Orientation[] = ['upright', 'reversed']
const SOURCES: ReadingSource[] = ['manual', 'corvath']

const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

/** Example payload shown in the import dialog's help. */
export const IMPORT_EXAMPLE = `[
  {
    "title": "Morning guidance",
    "date": "2026-06-16",
    "deck": "Argent Tarot",
    "layout": "Three Card",
    "source": "manual",
    "notes": "Overall narrative / interpretation goes here.",
    "entries": [
      { "topic": "Past", "question": "What shaped this?", "card": "The Star", "orientation": "upright", "notes": "Felt like a turning point." },
      { "topic": "Present", "card": "Two of Cups" },
      { "topic": "Future", "card": "The Sun" }
    ]
  }
]`

/**
 * Parse + validate an import payload (a single reading object or an array).
 * All-or-nothing: if anything fails validation, no readings are returned.
 * Meanings are intentionally NOT imported — they derive from the deck.
 */
export function parseReadingsImport(text: string, layouts: Layout[]): ImportResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (e) {
    return { readings: [], errors: [`Invalid JSON: ${(e as Error).message}`] }
  }

  const items = Array.isArray(data) ? data : [data]
  if (items.length === 0) return { readings: [], errors: ['No readings found in the payload.'] }

  const errors: string[] = []
  const readings: Reading[] = []

  items.forEach((raw, i) => {
    const where = items.length > 1 ? `Reading ${i + 1}: ` : ''
    if (!raw || typeof raw !== 'object') {
      errors.push(`${where}must be a JSON object.`)
      return
    }
    const r = raw as Record<string, unknown>

    const title = asString(r.title)?.trim()
    if (!title) errors.push(`${where}"title" is required.`)

    const date = asString(r.date)?.trim()
    if (!date) errors.push(`${where}"date" is required (YYYY-MM-DD).`)

    const entriesRaw = r.entries
    if (!Array.isArray(entriesRaw) || entriesRaw.length === 0) {
      errors.push(`${where}"entries" must be a non-empty array.`)
    }

    const source = SOURCES.includes(r.source as ReadingSource)
      ? (r.source as ReadingSource)
      : 'manual'
    const deck = asString(r.deck) ?? ''
    const notes = asString(r.notes) ?? ''

    const layoutName = asString(r.layout)?.trim()
    // Case-blind, and blind to the Unicode form (sameName.ts).
    const layoutKey = layoutName && nameKey(layoutName).toLowerCase()
    const layout = layoutKey
      ? (layouts.find((l) => nameKey(l.name).toLowerCase() === layoutKey) ?? null)
      : null
    if (layoutName && !layout) errors.push(`${where}layout "${layoutName}" not found.`)

    const entries: Entry[] = []
    if (Array.isArray(entriesRaw)) {
      entriesRaw.forEach((eRaw, j) => {
        const ew = `${where}entry ${j + 1}: `
        if (!eRaw || typeof eRaw !== 'object') {
          errors.push(`${ew}must be an object.`)
          return
        }
        const e = eRaw as Record<string, unknown>
        const card = asString(e.card)?.trim()
        if (!card) errors.push(`${ew}"card" is required.`)

        let orientation: Orientation | undefined
        const o = e.orientation
        if (o !== undefined && o !== null && o !== '') {
          if (ORIENTATIONS.includes(o as Orientation)) orientation = o as Orientation
          else errors.push(`${ew}"orientation" must be "upright" or "reversed".`)
        }

        entries.push({
          id: uid(),
          topic: asString(e.topic) ?? '',
          question: asString(e.question) ?? '',
          card: card ?? '',
          orientation,
          notes: asString(e.notes)
        })
      })
    }

    // Map entries to layout positions by order when the counts line up.
    if (layout && entries.length === layout.positions.length) {
      entries.forEach((entry, k) => {
        entry.positionId = layout.positions[k].id
      })
    }

    if (title && date && entries.length) {
      const now = nowIso()
      readings.push({
        id: uid(),
        title,
        date,
        deck,
        source,
        notes,
        layoutId: layout?.id,
        layoutName: layout?.name,
        entries,
        createdAt: now,
        updatedAt: now
      })
    }
  })

  if (errors.length) return { readings: [], errors }
  return { readings, errors: [] }
}
