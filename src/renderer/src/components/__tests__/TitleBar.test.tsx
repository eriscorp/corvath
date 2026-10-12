import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '@mui/material'
import { themesByName } from '@renderer/themes'
import TitleBar from '../TitleBar'

function renderTitleBar(): void {
  render(
    <ThemeProvider theme={themesByName.hybrasyl}>
      <TitleBar themeName="hybrasyl" />
    </ThemeProvider>
  )
}

/**
 * The bar's contents per platform (macos-chrome.md §2 in the document repo). The
 * padding is not asserted here: jsdom applies no media query, so a padding test
 * passes against a layout no build renders. `e2e/app-menu.spec.js` reads the
 * real padding on a Mac.
 */
describe('TitleBar', () => {
  it('draws no window buttons, name or logo on macOS: the system draws the stoplights', () => {
    window.api.platform = 'darwin'
    renderTitleBar()
    const bar = screen.getByTestId('title-bar')
    expect(bar).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(bar).not.toHaveTextContent('Corvath')
    expect(bar.querySelector('img')).toBeNull()
  })

  it('keeps the logo, the name and the three buttons elsewhere', () => {
    renderTitleBar()
    const bar = screen.getByTestId('title-bar')
    expect(bar.querySelector('img')).not.toBeNull()
    expect(bar).toHaveTextContent('Corvath')
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'minimize',
      'maximize',
      'close'
    ])
  })
})
