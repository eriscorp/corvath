import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import { themesByName } from '@renderer/themes'
import { blend, contrast, parseColor } from '@renderer/lib/contrast'
import { useSettingsStore } from '@renderer/store/settingsStore'
import type { ThemeName } from '@shared/types'
import NavBar, { NAV_ITEMS, type View } from '../NavBar'

// From the registry, so a new theme is covered unasked.
const THEME_NAMES = Object.keys(themesByName) as ThemeName[]

function renderNav(view: View = 'decks', name: ThemeName = 'hybrasyl', onChange = vi.fn()) {
  useSettingsStore.setState({ theme: name })
  render(
    <ThemeProvider theme={themesByName[name]}>
      <NavBar view={view} onChange={onChange} />
    </ThemeProvider>
  )
  return onChange
}

/** A page's button on the bar. */
function page(label: string): HTMLElement {
  return screen.getByRole('button', { name: label })
}

afterEach(() => {
  cleanup()
  useSettingsStore.setState({ theme: 'hybrasyl' })
})

describe('NavBar', () => {
  it('has a button for each page', () => {
    renderNav()
    for (const { label } of NAV_ITEMS) expect(page(label)).toBeInTheDocument()
  })

  it('is a bar, not a tab strip — the house nav bar', () => {
    renderNav()
    expect(screen.getByTestId('nav-bar')).toHaveClass('MuiToolbar-root')
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('marks the current page for assistive tech, not just by colour', () => {
    renderNav('draw')
    expect(page('Draw')).toHaveAttribute('aria-current', 'page')
    expect(page('Decks')).not.toHaveAttribute('aria-current')
  })

  it('switches the page on click', async () => {
    const user = userEvent.setup()
    const onChange = renderNav()
    await user.click(page('Settings'))
    expect(onChange).toHaveBeenCalledWith('settings')
  })
})

/**
 * The bar paints `tertiary.main` (HTOO-629), so each button on it is measured
 * against that colour, as each theme draws it. A word on a button is text, so
 * 4.5:1 (WCAG 1.4.3). An `opacity` is not in an element's computed colour, so a
 * faded part passes a colour check and still fails on screen: nothing on the
 * bar may be faded.
 */
describe('NavBar contrast', () => {
  it.each(THEME_NAMES)('%s: the bar paints tertiary.main, and nothing on it is faded', (name) => {
    renderNav('decks', name)
    const bar = screen.getByTestId('nav-bar')
    expect(parseColor(getComputedStyle(bar).backgroundColor)).toEqual(
      parseColor(themesByName[name].palette.tertiary.main)
    )
    const faded = [bar, ...bar.querySelectorAll('*')]
      .filter((el) => Number(getComputedStyle(el).opacity || '1') < 1)
      .map((el) => el.textContent ?? el.tagName)
    expect(faded).toEqual([])
  })

  it.each(THEME_NAMES)('%s: a page and the current page are 4.5:1 on the bar', (name) => {
    renderNav('decks', name)
    const bar = themesByName[name].palette.tertiary.main
    const measure = (label: string): { ratio: number; style: CSSStyleDeclaration } => {
      const style = getComputedStyle(page(label))
      // A text button at rest has no fill: MUI v9 gives it a CSS variable that
      // jsdom does not resolve. The current page's wash is a literal colour.
      const fill = style.backgroundColor.startsWith('var(')
        ? 'rgba(0, 0, 0, 0)'
        : style.backgroundColor
      return { ratio: contrast(style.color, blend(fill, bar)), style }
    }
    const rest = measure('Layouts')
    const current = measure('Decks')
    expect(rest.ratio, 'a page').toBeGreaterThanOrEqual(4.5)
    expect(current.ratio, 'the current page').toBeGreaterThanOrEqual(4.5)
    // The ring and the wash, not a colour, mark the current page.
    expect(current.style.boxShadow).toMatch(/inset/)
    expect(current.style.backgroundColor).not.toBe(rest.style.backgroundColor)
  })
})
