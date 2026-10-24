import { test, expect } from '@playwright/test'
import { launchApp, getMainWindow } from './helpers.js'

// Cycle every theme and assert each one actually renders. A theme is wired
// through four places (the ThemeName union, THEME_NAMES in shared/types, main's
// THEME_NAMES, and the themesByName map) and a miss in any of them fails quietly
// — the picker still shows the entry, but the theme silently falls back. This is
// the cheapest way to catch that, and it also exercises the plain and the
// decorated title bars.

const THEMES = ['hybrasyl', 'danaan', 'chadul', 'grinneal', 'mundanes', 'dubhaimid']

test.describe('Themes', () => {
  let electronApp

  test.afterEach(async () => {
    await electronApp?.close()
  })

  test('every theme applies, repaints, and raises no page errors', async () => {
    ;({ electronApp } = await launchApp())
    const page = await getMainWindow(electronApp)

    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))

    const backgrounds = new Set()

    // The picker moved to Settings (HTOO-408); it is a page now, not chrome.
    await page.getByRole('tab', { name: 'Settings', exact: true }).click()

    for (const theme of THEMES) {
      // The picker is a radio group of preview cards, one per theme.
      const option = page.getByTestId('theme-select').getByTestId(`theme-option-${theme}`)
      await option.click()
      await expect(option).toHaveAttribute('aria-checked', 'true')

      const root = page.getByTestId('app-root')
      await expect(root).toHaveAttribute('data-theme', theme)

      backgrounds.add(await root.evaluate((el) => getComputedStyle(el).backgroundColor))
    }

    // Distinct palettes, not six aliases of the same fallback.
    expect(backgrounds.size).toBeGreaterThan(1)
    expect(errors).toEqual([])
  })
})
