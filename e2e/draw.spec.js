import { test, expect } from '@playwright/test'
import { launchApp, getMainWindow } from './helpers.js'

// HTOO-233. The draw ENGINE is well unit-tested (mulberry32, shuffledDeck,
// dealForLayout, planFan). What has never been exercised is the wiring in
// Draw.tsx: the reveal interval, the fan row-fit maths, nextSlot/pickFanCard,
// and the save handoff into Readings. None of it is reachable from jsdom — it
// needs a real window with a real layout engine, which is what E2E is for.

const MIN_FAN_STEP = 16 // must match Draw.tsx
const FAN_W = 88

/** Open the Draw page and fill in the setup form. */
async function setUpDraw(page, { spread, mode = 'deal', title = 'A spec draw' } = {}) {
  await page.getByTestId('nav-bar').getByRole('button', { name: 'Draw' }).click()
  await page.getByLabel('Title').fill(title)
  if (spread) {
    await page.getByRole('combobox', { name: 'Spread' }).click()
    await page.getByRole('option', { name: new RegExp(`^${spread} ·`) }).click()
  }
  await page.getByTestId(mode === 'fan' ? 'draw-mode-fan' : 'draw-mode-deal').click()
}

const slots = (page) => page.getByTestId('draw-slot')
const flippedSlots = (page) => page.locator('[data-testid="draw-slot"][data-flipped="true"]')
const fanCards = (page) => page.getByTestId('fan-card')
const spentFanCards = (page) => page.locator('[data-testid="fan-card"][data-spent="true"]')
const unspentFanCards = (page) => page.locator('[data-testid="fan-card"][data-spent="false"]')

// A fan card is overlapped by its right-hand neighbour, so only the leftmost
// `step` px of it are hittable — and step can be as low as MIN_FAN_STEP. Click
// inside that sliver rather than at the element's centre, which belongs to
// whichever card is painted on top of it.
const clickFanCard = (card) => card.click({ position: { x: 4, y: 60 } })

test.describe('Draw page', () => {
  let electronApp

  test.afterEach(async () => {
    await electronApp?.close()
  })

  test('deals from the top one slot at a time until every slot is face up', async () => {
    ;({ electronApp } = await launchApp())
    const page = await getMainWindow(electronApp)
    await setUpDraw(page, { spread: 'Celtic Cross', mode: 'deal' })
    await page.getByRole('button', { name: 'Shuffle & Draw' }).click()

    await expect(slots(page)).toHaveCount(10)
    // The deal is an interval, not a batch: at 480 ms a slot, ten slots take
    // ~4.8 s, so the tray must still be partly face-down right after the click.
    // This is the assertion that would fail if the reveal ever became a no-op
    // and every card simply appeared at once.
    expect(await flippedSlots(page).count()).toBeLessThan(10)

    await expect(flippedSlots(page)).toHaveCount(10, { timeout: 20_000 })

    // Every revealed slot names a real card, so the deal is wired to the deck
    // and not just flipping empty boxes.
    const names = await slots(page).evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-card-name'))
    )
    expect(names.filter((n) => n && n.length > 0)).toHaveLength(10)
    await expect(page.getByRole('button', { name: 'Save Reading' })).toBeEnabled()
  })

  test('fans the deck and fills one slot per pick', async () => {
    ;({ electronApp } = await launchApp())
    const page = await getMainWindow(electronApp)
    await setUpDraw(page, { spread: 'Three Card', mode: 'fan' })
    await page.getByRole('button', { name: 'Shuffle & Draw' }).click()

    // The fan is the whole shuffled deck, not just as many cards as slots.
    await expect(fanCards(page)).toHaveCount(78)
    await expect(page.locator('[data-testid="fan-card"][data-spent="true"]')).toHaveCount(0)
    await expect(page.getByText(/1 of 3/)).toBeVisible()

    for (let pick = 0; pick < 3; pick++) {
      // Always pick from the unspent cards; a spent one is inert by design.
      const card = unspentFanCards(page).nth(pick * 7) // spread picks across a row
      await clickFanCard(card)
      await expect(flippedSlots(page)).toHaveCount(pick + 1)
      if (pick < 2) {
        // Exactly the picked cards are spent — a pick must not consume the deck.
        await expect(spentFanCards(page)).toHaveCount(pick + 1)
        await expect(page.getByText(new RegExp(`${pick + 2} of 3`))).toBeVisible()
      }
    }

    // The fan is only shown while there is still something to pick, so a
    // completed draw retires it rather than leaving a live pile on screen.
    await expect(fanCards(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Save Reading' })).toBeEnabled()
  })

  test('fits the fan into rows that never overflow the board', async () => {
    ;({ electronApp } = await launchApp())
    const page = await getMainWindow(electronApp)
    await setUpDraw(page, { spread: 'Three Card', mode: 'fan' })
    await page.getByRole('button', { name: 'Shuffle & Draw' }).click()
    await expect(fanCards(page)).toHaveCount(78)

    // 78 cards is the >40 case: three rows.
    const rows = page.getByTestId('fan-row')
    await expect(rows).toHaveCount(3)

    const measured = await rows.evaluateAll((els) =>
      els.map((el) => ({
        step: Number(el.getAttribute('data-row-step')),
        width: el.getBoundingClientRect().width,
        parentWidth: el.parentElement.getBoundingClientRect().width
      }))
    )
    for (const row of measured) {
      // The overlap is what makes a row fit; if the step maths regressed the row
      // would either spill past the board or stack every card on one spot.
      expect(row.step).toBeGreaterThanOrEqual(MIN_FAN_STEP)
      expect(row.step).toBeLessThanOrEqual(FAN_W + 12)
      expect(row.width).toBeLessThanOrEqual(row.parentWidth + 1)
    }

    // And the page itself must not scroll sideways as a result.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('saves a completed draw into Readings and onto disk', async () => {
    ;({ electronApp } = await launchApp())
    const page = await getMainWindow(electronApp)
    await setUpDraw(page, { spread: 'Single Card', mode: 'deal', title: 'Saved by the spec' })
    await page.getByRole('button', { name: 'Shuffle & Draw' }).click()
    await expect(flippedSlots(page)).toHaveCount(1, { timeout: 10_000 })

    await page.getByRole('button', { name: 'Save Reading' }).click()

    // The handoff: Draw hands the new id up and the app switches view.
    await expect(
      page.getByTestId('nav-bar').getByRole('button', { name: 'Readings' })
    ).toHaveAttribute('aria-current', 'page')
    // And it reaches disk through the debounced store save, not just React state.
    await expect
      .poll(() => page.evaluate(() => window.api.readings.getAll().then((r) => r.length)), {
        timeout: 10_000
      })
      .toBe(1)
    const [saved] = await page.evaluate(() => window.api.readings.getAll())
    expect(saved.title).toBe('Saved by the spec')
    expect(saved.entries).toHaveLength(1)
    expect(saved.entries[0].card).toBeTruthy()
    // A corvath-drawn reading records its provenance, which is what makes it
    // reproducible — a manual entry would carry neither.
    expect(saved.source).toBe('corvath')
    expect(typeof saved.seed).toBe('number')
    expect(saved.drawMode).toBe('deal')
  })

  test('fills a slot pinned to the top of the deck without asking the user', async () => {
    // No built-in layout sets a position `source`, so this path is unreachable
    // with shipped data — the whole reason launchApp can seed layouts.json.
    const now = new Date().toISOString()
    ;({ electronApp } = await launchApp({
      seedLayouts: [
        {
          id: 'pinned-spec',
          name: 'Pinned Pair',
          positions: [
            { id: 'p1', name: 'From the top', x: 0.3, y: 0.5, source: 'top' },
            { id: 'p2', name: 'Your choice', x: 0.7, y: 0.5 }
          ],
          createdAt: now,
          updatedAt: now
        }
      ]
    }))
    const page = await getMainWindow(electronApp)
    await setUpDraw(page, { spread: 'Pinned Pair', mode: 'fan' })
    await page.getByRole('button', { name: 'Shuffle & Draw' }).click()

    // The pinned slot is decided by the shuffle and filled up front; its card is
    // already spent so it cannot also be picked out of the fan.
    await expect(flippedSlots(page)).toHaveCount(1)
    await expect(spentFanCards(page)).toHaveCount(1)
    // Only the free slot is counted in the prompt.
    await expect(page.getByText(/1 of 1/)).toBeVisible()

    await clickFanCard(unspentFanCards(page).first())
    await expect(flippedSlots(page)).toHaveCount(2)
    await expect(page.getByRole('button', { name: 'Save Reading' })).toBeEnabled()
  })
})
