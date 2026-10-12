import { test, expect } from '@playwright/test'
import { launchApp, getMainWindow } from './helpers.js'

// Boot smoke: the whole harness + startup handshake in one spec. Launches the
// built app, skips the splash, waits for the main window to be revealed (which
// only happens after the renderer signals app:ready), and asserts the hydrated
// UI is on screen. If this passes, the E2E harness is wired correctly.

test.describe('App boots', () => {
  let electronApp

  test.afterEach(async () => {
    await electronApp?.close()
  })

  test('reveals the main window with the title bar and hydrated content', async () => {
    ;({ electronApp } = await launchApp())
    const page = await getMainWindow(electronApp)

    await expect(page.getByTestId('title-bar')).toBeVisible()
    // On macOS the bar is an empty drag region beside the native stoplights;
    // app-menu.spec.js checks it there.
    if (process.platform !== 'darwin') {
      await expect(page.getByTestId('title-bar')).toContainText('Corvath')
    }

    // Hydration finished: the real page is shown, not the loading spinner.
    await expect(page.getByTestId('app-hydrating')).toHaveCount(0)
    await expect(page.getByTestId('app-root')).toBeVisible()

    // All four tabs are present.
    for (const tab of ['Readings', 'Draw', 'Decks', 'Layouts']) {
      await expect(page.getByRole('tab', { name: tab })).toBeVisible()
    }
  })

  test('seeds the built-in decks and layouts on a first run', async () => {
    ;({ electronApp } = await launchApp())
    const page = await getMainWindow(electronApp)

    // Seeding happens in main before the window opens, so by the time the
    // renderer has hydrated these are already on disk — a round-trip no unit
    // test covers end to end.
    const deckIds = await page.evaluate(() =>
      window.api.decks.getAll().then((decks) => decks.map((d) => d.id).sort())
    )
    expect(deckIds).toEqual(['argent', 'empyrean', 'hybrasyl', 'rws'])

    const layoutNames = await page.evaluate(() =>
      window.api.layouts.getAll().then((layouts) => layouts.map((l) => l.name))
    )
    expect(layoutNames).toContain('Celtic Cross')
  })
})
