import { test, expect } from '@playwright/test'
import { launchApp, getMainWindow } from './helpers.js'

/**
 * The macOS application menu and title bar, in the built app. The unit tests
 * cover the template and the renderer's dispatch; this covers the wiring
 * between them: the menu main installs, the renderer's report enabling it, and
 * a click on an item reaching the renderer. macOS only
 * (docs/architecture/macos-chrome.md §6 in the document repo).
 */
test.skip(process.platform !== 'darwin', 'the application menu is macOS only')

let electronApp

test.afterEach(async () => {
  await electronApp?.close()
})

/** The application menu as `[label, [{ id, label, role, enabled }]]`. */
function readMenu(app) {
  return app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu().items.map((top) => [
      top.label,
      (top.submenu?.items ?? []).map((i) => ({
        id: i.id,
        label: i.label,
        role: i.role,
        enabled: i.enabled
      }))
    ])
  )
}

function clickItem(app, id) {
  return app.evaluate(({ Menu }, id) => Menu.getApplicationMenu().getMenuItemById(id).click(), id)
}

function itemEnabled(app, id) {
  return app.evaluate(({ Menu }, id) => Menu.getApplicationMenu().getMenuItemById(id).enabled, id)
}

test('installs the app menu, with no Reload, and an empty title bar', async () => {
  ;({ electronApp } = await launchApp())
  const page = await getMainWindow(electronApp)

  const menu = await readMenu(electronApp)
  // The first item's label is the product name in every build. (The menu BAR
  // draws "Electron" there in a dev build, from the binary's Info.plist; not a
  // bug.)
  expect(menu.map(([label]) => label)).toEqual([
    'Corvath',
    'File',
    'Edit',
    'View',
    'Go',
    'Window',
    'Help'
  ])
  const items = menu.flatMap(([, list]) => list)
  const roles = items.map((i) => i.role)
  expect(roles).not.toContain('reload')
  expect(roles).not.toContain('forcereload')
  // package.json has no productName, so the labels are set by hand.
  expect(items.map((i) => i.label)).toEqual(
    expect.arrayContaining(['About Corvath', 'Hide Corvath', 'Quit Corvath'])
  )

  // macOS draws the window buttons; the title bar draws none, and no branding.
  const bar = page.getByTestId('title-bar')
  await expect(bar).toBeVisible()
  await expect(page.getByRole('button', { name: 'minimize' })).toHaveCount(0)
  await expect(bar.locator('img')).toHaveCount(0)
  await expect(bar).not.toContainText('Corvath')
  // Real geometry, not jsdom's: the bar's left padding clears the stoplights.
  expect(await bar.evaluate((el) => getComputedStyle(el).paddingLeft)).toBe('78px')
})

test('Check for Updates… is enabled once the renderer reports, and runs the check', async () => {
  ;({ electronApp } = await launchApp())
  const page = await getMainWindow(electronApp)

  await expect.poll(() => itemEnabled(electronApp, 'checkForUpdates')).toBe(true)
  await clickItem(electronApp, 'checkForUpdates')
  // The menu opens Settings, where the button lives, and the button answers:
  // up to date, newer, or "could not check".
  await expect(page.getByTestId('settings-page')).toBeVisible()
  await expect(page.getByTestId('update-check-result')).toBeVisible({ timeout: 20_000 })
})

test('Go switches pages, Export All waits for a reading, and nothing runs over a dialog', async () => {
  ;({ electronApp } = await launchApp())
  const page = await getMainWindow(electronApp)

  await expect.poll(() => itemEnabled(electronApp, 'go:decks')).toBe(true)
  // An empty profile has no reading, and the page's "Export all" is disabled.
  expect(await itemEnabled(electronApp, 'exportAllReadings')).toBe(false)

  await clickItem(electronApp, 'go:decks')
  await expect(page.getByTestId('decks-page')).toBeVisible()

  // New Reading goes back to Readings and makes one; Export All then enables.
  await clickItem(electronApp, 'newReading')
  await expect(page.getByTestId('readings-page')).toBeVisible()
  await expect.poll(() => itemEnabled(electronApp, 'exportAllReadings')).toBe(true)

  // Import Readings… opens the page's own dialog. Go → Decks over it does
  // nothing: the page under the dialog stays.
  await clickItem(electronApp, 'importReadings')
  await expect(page.getByRole('dialog')).toBeVisible()
  await clickItem(electronApp, 'go:decks')
  await page.waitForTimeout(300)
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByTestId('readings-page')).toBeVisible()
})

test('About Corvath and What’s New open the About card’s dialogs', async () => {
  ;({ electronApp } = await launchApp())
  const page = await getMainWindow(electronApp)

  await expect.poll(() => itemEnabled(electronApp, 'about')).toBe(true)
  await clickItem(electronApp, 'about')
  await expect(page.getByRole('dialog')).toContainText('Corvath')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await clickItem(electronApp, 'whatsNew')
  await expect(page.getByRole('dialog')).toContainText(/what's new/i)
})
