import { test, expect } from '@playwright/test'
import { launchApp, getMainWindow } from './helpers.js'

/**
 * The update-check module v1 (HTOO-65, HTOO-382) in the built app, end to end:
 * the renderer, the preload bridge, the handler, `net.fetch` and the manifest
 * rules, with the manifest answered here.
 *
 * **No spec reaches the live manifest.** Its answer for corvath changes at the
 * first release, from `no-entry` to an entry, so a spec that read it would
 * change result on a day that no commit made. Instead each spec gives the
 * default session an `https` handler before the start check runs (10 s after
 * mount). `net.fetch` goes through the session's protocol handlers, so the real
 * request path runs and only the answer is fixed. The handler answers ONLY the
 * manifest URL and refuses every other https request, so a second request that
 * appears later fails here rather than going out unseen.
 *
 * Each launch waits out the 10 s start delay once, so this file is slow on
 * purpose. The unit tests cover every branch; this file covers the wiring.
 */

const MANIFEST_URL = 'https://raw.githubusercontent.com/hybrasyl/cernunnos/main/versions.json'
const START_WAIT_MS = 12_000

/** Answer the manifest with `manifest`, and refuse every other https request. */
async function serveManifest(electronApp, manifest) {
  await electronApp.evaluate(
    ({ protocol }, { url, body }) => {
      globalThis.__manifestRequests = 0
      protocol.handle('https', (request) => {
        if (request.url !== url) return new Response('not served in e2e', { status: 599 })
        globalThis.__manifestRequests += 1
        return new Response(body, { headers: { 'content-type': 'application/json' } })
      })
    },
    { url: MANIFEST_URL, body: JSON.stringify(manifest) }
  )
}

const manifestRequests = (electronApp) => electronApp.evaluate(() => globalThis.__manifestRequests)

async function openAboutCard(page) {
  await page.getByRole('tab', { name: 'Settings', exact: true }).click()
  const card = page.getByTestId('about-card')
  await expect(card.getByTestId('about-version')).toContainText(/Version \d+\.\d+\.\d+/)
  return card
}

test.describe('Update check', () => {
  let electronApp

  test.afterEach(async () => {
    await electronApp?.close()
  })

  test('with no corvath entry: silent at start, explained on the button', async () => {
    ;({ electronApp } = await launchApp())
    // The live state until the first release: other apps, no corvath.
    await serveManifest(electronApp, {
      schema: 1,
      apps: {
        taliesin: {
          version: '2.14.0',
          released: '2026-10-11T06:51:37Z',
          url: 'https://github.com/hybrasyl/taliesin/releases/tag/v2.14.0'
        }
      }
    })
    const page = await getMainWindow(electronApp)

    // The start check runs, and a failure at start is not news.
    await expect.poll(() => manifestRequests(electronApp), { timeout: START_WAIT_MS }).toBe(1)
    await page.waitForTimeout(500)
    await expect(page.getByText(/is available\./)).toHaveCount(0)

    const card = await openAboutCard(page)
    await card.getByRole('button', { name: 'Check for updates' }).click()
    await expect(card.getByTestId('update-check-result')).toHaveText(
      'Could not check for updates. The version list has no entry for this app yet.'
    )
    expect(await manifestRequests(electronApp)).toBe(2)
  })

  test('with a newer entry: the notice names it, and closing it keeps it closed', async () => {
    ;({ electronApp } = await launchApp())
    const url = 'https://github.com/eriscorp/corvath/releases/tag/v99.0.0'
    await serveManifest(electronApp, {
      schema: 1,
      apps: { corvath: { version: '99.0.0', released: '2026-10-11T00:00:00Z', url } }
    })
    const page = await getMainWindow(electronApp)

    const notice = page.getByRole('status').filter({ hasText: 'Corvath 99.0.0 is available.' })
    await expect(notice).toBeVisible({ timeout: START_WAIT_MS })
    await expect(notice.getByRole('link', { name: 'View release' })).toHaveAttribute('href', url)

    // A click elsewhere (here, the Settings tab) does not close it: HTOO-65's
    // defect 2. The X does, and it stores the version.
    const card = await openAboutCard(page)
    await expect(notice).toBeVisible()
    await notice.getByRole('button', { name: 'Close' }).click()
    await expect(notice).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('corvath:dismissedVersion'))).toBe(
      '99.0.0'
    )

    // The button still offers the closed version: the user asked.
    await card.getByRole('button', { name: 'Check for updates' }).click()
    await expect(card.getByTestId('update-check-result')).toContainText(
      'Corvath 99.0.0 is available.'
    )
  })
})
