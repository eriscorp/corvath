import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { ThemeProvider, Chip } from '@mui/material'
import { themesByName } from '../index'
import type { Reading, ThemeName } from '@shared/types'
import CardPreview from '@renderer/components/CardPreview'
import ReadingEditor from '@renderer/components/ReadingEditor'
import { contrast, luminance, parseColor } from '@renderer/lib/contrast'

const THEME_NAMES = Object.keys(themesByName) as ThemeName[]

/** The chip whose label is `text`. */
const chipOf = (text: string): Element => screen.getByText(text).closest('.MuiChip-root')!

const READING: Reading = {
  id: 'r1',
  title: 'T',
  date: '2026-10-11',
  deck: 'Argent Tarot',
  source: 'corvath',
  entries: [],
  createdAt: 'now',
  updatedAt: 'now'
}

/**
 * Renders corvath's two marked chips, in the components that draw them: the
 * orientation of a reversed card in the card preview (a dialog, so on paper),
 * and the source of a reading Corvath drew in the reading editor (on the page).
 * Their unmarked forms (upright, Manual) and the keyword chips are plain chips,
 * which the template's own chip override draws.
 */
function renderMarked(name: ThemeName): void {
  render(
    <ThemeProvider theme={themesByName[name]}>
      <Chip data-testid="plain" label="plain" size="small" />
      <ReadingEditor
        reading={READING}
        decks={[]}
        layouts={[]}
        onChange={vi.fn()}
        onApplyLayout={vi.fn()}
        onAddEntry={vi.fn()}
        onUpdateEntry={vi.fn()}
        onDeleteEntry={vi.fn()}
      />
      <CardPreview card={{ name: 'The Star', orientation: 'reversed' }} onClose={vi.fn()} />
    </ThemeProvider>
  )
}

/** A colour as `rgb(r, g, b)`, drawn over `under` when it is translucent. */
function over(color: string, under: string): string {
  const [r, g, b, a] = parseColor(color)
  const [ur, ug, ub] = parseColor(under)
  const mix = (c: number, u: number): number => Math.round(c * a + u * (1 - a))
  return `rgb(${mix(r, ur)}, ${mix(g, ug)}, ${mix(b, ub)})`
}

/** Contrast of an opaque label on a fill that may be translucent over `under`. */
function onFill(label: string, fill: string, under: string): number {
  const [hi, lo] = [luminance(label), luminance(fill, under)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Corvath-only (HTOO-572). Before the house chip fix, each theme's chip
 * override painted every chip with the same tint, so a `secondary` chip drew
 * like a plain one and its colour did no harm. With the fix, an OUTLINED
 * `secondary` chip draws the bar colour as text on the page: hybrasyl's
 * `#1e5e56` on its navy page, grinneal's brown on its dark page. So corvath's
 * two marked chips (a reversed card, a reading Corvath drew) are FILLED: the
 * chip takes `secondary.main` and `secondary.contrastText`, which the palette
 * test holds at 4.5:1. The house rule is the same: `secondary` is a fill only,
 * not text and not an outline (Sabrael, 2026-10-23). The template renders none
 * of these chips, so its tests cannot see this.
 */
describe('a chip in corvath', () => {
  afterEach(cleanup)

  it.each(THEME_NAMES)('%s: a marked chip shows its colour and its label reads', (name) => {
    renderMarked(name)
    const theme = themesByName[name]
    const page = theme.palette.background.default
    const plain = getComputedStyle(screen.getByTestId('plain')).backgroundColor
    for (const [label, under] of [
      ['Corvath', page],
      ['reversed', over(theme.palette.background.paper, page)]
    ]) {
      const drawn = getComputedStyle(chipOf(label))
      expect(drawn.backgroundColor, `${label} is not a plain chip`).not.toBe(plain)
      const ratio = onFill(drawn.color, drawn.backgroundColor, under)
      expect(ratio, `${label}: ${drawn.color} on ${drawn.backgroundColor}`).toBeGreaterThanOrEqual(
        4.5
      )
    }
  })

  it('an outlined secondary chip cannot read in every theme, which is why corvath fills it', () => {
    // When this fails, the bar colours have changed in the template. The house
    // rule stays: `secondary` is a fill only. The reviewed palette gives danaan
    // a dark bronze bar, so on danaan's parchment the outline reads (7.7:1);
    // in these four themes it does not (1.2:1 to 2.4:1 on the page).
    const fails = THEME_NAMES.filter((name) => {
      const theme = themesByName[name]
      render(
        <ThemeProvider theme={theme}>
          <Chip data-testid="outlined" color="secondary" variant="outlined" label="Corvath" />
        </ThemeProvider>
      )
      const text = getComputedStyle(screen.getByTestId('outlined')).color
      cleanup()
      return contrast(text, theme.palette.background.default) < 4.5
    })
    expect(fails).toEqual(expect.arrayContaining(['hybrasyl', 'chadul', 'grinneal', 'dubhaimid']))
  })
})
