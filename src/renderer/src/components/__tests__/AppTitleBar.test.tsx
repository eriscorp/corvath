import { afterEach, describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import { hybrasylTheme } from '@renderer/themes'
import { appIdentity } from '@shared/appIdentity'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { PLAIN_CHROME_THEMES } from '../titleChrome'
import AppTitleBar from '../AppTitleBar'

function renderAppTitleBar(): void {
  render(
    <ThemeProvider theme={hybrasylTheme}>
      <AppTitleBar />
    </ThemeProvider>
  )
}

/**
 * Corvath's wiring of the house TitleBar: its name, its settings theme, and its
 * preload bridge (`window.api.window`). The template's AppTitleBar test, with
 * corvath's window calls.
 */
describe('AppTitleBar', () => {
  afterEach(() => useSettingsStore.setState({ theme: 'hybrasyl' }))

  it("shows the app's product name", () => {
    renderAppTitleBar()
    expect(screen.getByTestId('title-bar')).toHaveTextContent(appIdentity.productName)
  })

  it('wires the window buttons to the preload bridge', async () => {
    const user = userEvent.setup()
    renderAppTitleBar()

    await user.click(screen.getByRole('button', { name: 'Minimize' }))
    expect(window.api.window.minimize).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Maximize' }))
    expect(window.api.window.toggleMaximize).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(window.api.window.close).toHaveBeenCalledOnce()
  })

  it("draws the chrome of the settings store's theme", () => {
    // A plain theme draws no keyline on the wordmark; a decorated one does.
    useSettingsStore.setState({ theme: PLAIN_CHROME_THEMES[0] })
    renderAppTitleBar()
    const shadow = getComputedStyle(screen.getByText(appIdentity.productName)).textShadow
    expect(shadow).not.toMatch(/#000|rgb\(0, 0, 0\)/)
  })

  it('draws the empty drag region on macOS', () => {
    window.api.platform = 'darwin'
    renderAppTitleBar()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
