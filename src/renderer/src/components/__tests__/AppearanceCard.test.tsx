import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material'
import { themesByName } from '@renderer/themes'
import { THEME_NAMES, type ThemeName } from '@shared/types'
import AppearanceCard from '../AppearanceCard'

/** `#rrggbb` as the `rgb(r, g, b)` that getComputedStyle reports. */
function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

function renderCard(value: ThemeName, onChange = vi.fn()): ReturnType<typeof vi.fn> {
  render(
    <ThemeProvider theme={themesByName[value]}>
      <AppearanceCard value={value} onChange={onChange} />
    </ThemeProvider>
  )
  return onChange
}

/**
 * The Appearance card in the house form: it owns its Paper and heading, and
 * holds the house theme picker, a radio group of preview cards in place of the
 * old Select. The e2e specs reach the picker by `theme-select` and each card by
 * `theme-option-<name>`.
 */
describe('AppearanceCard', () => {
  it('is a Paper with its heading and one radio per theme', () => {
    renderCard('hybrasyl')
    expect(screen.getByTestId('appearance-card')).toHaveClass('MuiPaper-root')
    expect(screen.getByText('Appearance')).toBeInTheDocument()
    const group = screen.getByRole('radiogroup', { name: 'Theme' })
    expect(group).toHaveAttribute('data-testid', 'theme-select')
    for (const name of THEME_NAMES)
      expect(screen.getByTestId(`theme-option-${name}`)).toHaveAttribute('role', 'radio')
  })

  it('checks the active theme only, and a click asks for the theme by name', async () => {
    const onChange = renderCard('danaan')
    expect(screen.getByRole('radio', { checked: true })).toHaveAccessibleName('Danaan')
    await userEvent.setup().click(screen.getByTestId('theme-option-grinneal'))
    expect(onChange).toHaveBeenCalledWith('grinneal')
  })

  // The selection mark is primary.main, the token the palette test holds at 3:1
  // on the page and on paper. On danaan, primary.light is near the parchment
  // (HTOO-572).
  it.each(THEME_NAMES)('%s: marks the selected theme with primary.main', (name) => {
    renderCard(name)
    const selected = getComputedStyle(screen.getByTestId(`theme-option-${name}`))
    expect(selected.borderTopColor).toBe(rgb(themesByName[name].palette.primary.main))
  })
})
