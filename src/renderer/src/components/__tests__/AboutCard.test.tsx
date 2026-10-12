import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AboutCard from '../AboutCard'
import { useReportStore } from '../../store/reportStore'

/**
 * The house About card. The page no longer wraps it, so these cases also prove
 * that the card brings its own Paper: without one, it is a loose block of text
 * on the page background.
 */
describe('AboutCard', () => {
  beforeEach(() => {
    useReportStore.setState({ open: false })
  })

  it('is its own Paper card, with its own heading', () => {
    render(<AboutCard />)
    const card = screen.getByTestId('about-card')
    expect(card).toHaveClass('MuiPaper-root')
    expect(card).toHaveTextContent(/^About/)
  })

  it('shows the running version', async () => {
    vi.mocked(window.api.getAppVersion).mockResolvedValue('9.9.9')
    render(<AboutCard />)
    expect(await screen.findByText(/Version 9\.9\.9/)).toBeVisible()
  })

  it("links corvath's own repository, not the organisation", () => {
    render(<AboutCard />)
    expect(screen.getByRole('link', { name: 'github.com/eriscorp/corvath' })).toHaveAttribute(
      'href',
      'https://github.com/eriscorp/corvath'
    )
  })

  it('keeps all four buttons', () => {
    render(<AboutCard />)
    for (const name of [/About Corvath/, /What's new/, /Reveal data folder/, /Report an issue/]) {
      expect(screen.getByRole('button', { name })).toBeVisible()
    }
  })

  it('reveals the data folder, and sends nothing with the request', async () => {
    render(<AboutCard />)
    await userEvent.click(screen.getByRole('button', { name: /Reveal data folder/ }))
    // No argument: main already knows the only folder it opens, so no path
    // crosses the bridge.
    expect(window.api.revealSettings).toHaveBeenCalledWith()
  })

  it('opens the About dialog', async () => {
    render(<AboutCard />)
    expect(screen.queryByRole('dialog')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /About Corvath/ }))
    expect(await screen.findByRole('dialog')).toBeVisible()
  })

  it("opens What's new, and only then reads the changelog", async () => {
    render(<AboutCard />)
    // Both dialogs are mounted closed, so a card that only renders costs no IPC.
    expect(window.api.readChangelog).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /What's new/ }))
    expect(await screen.findByRole('dialog')).toBeVisible()
    expect(window.api.readChangelog).toHaveBeenCalledTimes(1)
  })

  it('opens the report dialog through the store, because it has a second opener', async () => {
    render(<AboutCard />)
    await userEvent.click(screen.getByRole('button', { name: /Report an issue/ }))
    expect(useReportStore.getState().open).toBe(true)
  })

  it('offers no Reveal logs button: that is on the report dialog', () => {
    render(<AboutCard />)
    expect(screen.queryByRole('button', { name: /logs/i })).toBeNull()
  })
})
