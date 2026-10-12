import { describe, expect, it } from 'vitest'
import type { Layout } from '../../../../shared/types'
import { parseReadingsImport } from '../importReadings'

const threeCard: Layout = {
  id: 'lay-3',
  name: 'Three Card',
  positions: [
    { id: 'p1', name: 'Past', x: 0.2, y: 0.5 },
    { id: 'p2', name: 'Present', x: 0.5, y: 0.5 },
    { id: 'p3', name: 'Future', x: 0.8, y: 0.5 }
  ],
  createdAt: 'now',
  updatedAt: 'now'
}

const valid = JSON.stringify({
  title: 'Morning',
  date: '2026-06-16',
  deck: 'Thoth',
  layout: 'Three Card',
  entries: [{ card: 'The Star' }, { card: 'Two of Cups' }, { card: 'The Sun' }]
})

describe('parseReadingsImport', () => {
  it('reports invalid JSON without throwing', () => {
    const res = parseReadingsImport('{ nope', [])
    expect(res.readings).toEqual([])
    expect(res.errors[0]).toMatch(/Invalid JSON/)
  })

  it('parses a valid single reading and maps entries to layout positions by order', () => {
    const res = parseReadingsImport(valid, [threeCard])
    expect(res.errors).toEqual([])
    expect(res.readings).toHaveLength(1)
    const r = res.readings[0]
    expect(r.title).toBe('Morning')
    expect(r.layoutId).toBe('lay-3')
    expect(r.entries.map((e) => e.positionId)).toEqual(['p1', 'p2', 'p3'])
  })

  it('is all-or-nothing: one bad reading discards the whole batch', () => {
    const batch = JSON.stringify([
      JSON.parse(valid),
      { date: '2026-06-17', entries: [{ card: 'X' }] } // missing title
    ])
    const res = parseReadingsImport(batch, [threeCard])
    expect(res.readings).toEqual([])
    expect(res.errors.some((e) => /"title" is required/.test(e))).toBe(true)
  })

  it('does not map positions when entry count differs from layout size', () => {
    const two = JSON.stringify({
      title: 'Two',
      date: '2026-06-16',
      entries: [{ card: 'A' }, { card: 'B' }]
    })
    const res = parseReadingsImport(two, [threeCard])
    expect(res.readings[0].entries.every((e) => e.positionId === undefined)).toBe(true)
  })

  it('finds a layout whose name is in the other Unicode form, or another case', () => {
    // "Croisé" with é composed (typed) in the layout, decomposed (as macOS
    // stores a file name) in the import.
    const croise: Layout = { ...threeCard, id: 'lay-x', name: 'Croisé' }
    const text = JSON.stringify({ ...JSON.parse(valid), layout: 'CROISÉ' })
    const res = parseReadingsImport(text, [croise])
    expect(res.errors).toEqual([])
    expect(res.readings[0].layoutId).toBe('lay-x')
  })

  it('errors when a named layout is not found', () => {
    const res = parseReadingsImport(valid, []) // no layouts
    expect(res.readings).toEqual([])
    expect(res.errors.some((e) => /layout "Three Card" not found/.test(e))).toBe(true)
  })

  it('rejects an invalid orientation', () => {
    const bad = JSON.stringify({
      title: 'T',
      date: '2026-06-16',
      entries: [{ card: 'A', orientation: 'sideways' }]
    })
    const res = parseReadingsImport(bad, [])
    expect(res.errors.some((e) => /orientation/.test(e))).toBe(true)
  })
})
