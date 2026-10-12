import { test, expect } from '@playwright/test'
import { launchApp, getMainWindow } from './helpers.js'

/**
 * HTOO-325 — under software rendering the themes' Paper blur is switched off.
 * Mabon's spec, with corvath's names.
 *
 * `remoteSession.test.ts` pins the CSS and `bootOrder.test.ts` pins where it is
 * injected, as text. This checks that it lands: a launch with
 * `CORVATH_DISABLE_GPU=1` must render Paper with no backdrop filter, and a
 * normal launch — the control, so a pass here is not a theme that simply has no
 * blur — must still render the blur. Hybrasyl is the default theme and one of
 * the four that carry the blur.
 *
 * The flag reproduces the whole condition, because the injection is keyed to the
 * decision to disable the GPU and not to Remote Desktop detection. The GPU half
 * is read from `app.commandLine.hasSwitch('disable-gpu')`, which is what
 * `disableHardwareAcceleration()` sets. `getGPUFeatureStatus()` is not used: it
 * describes the machine, and a runner with no GPU reports software either way
 * (dagda's finding). A real RDP session is still owed by hand.
 */

/** Read the backdrop filter of the first Paper on the Settings page. */
async function paperBackdropFilter(page) {
  await page.getByRole('tab', { name: 'Settings', exact: true }).click()
  // Any rendered Paper will do; Settings always renders several cards.
  const paper = page.locator('[data-testid="settings-page"] .MuiPaper-root').first()
  await paper.waitFor({ state: 'visible' })
  return paper.evaluate((el) => {
    const cs = getComputedStyle(el)
    return cs.backdropFilter || cs.webkitBackdropFilter || 'none'
  })
}

const gpuSwitchOff = (electronApp) =>
  electronApp.evaluate(({ app }) => app.commandLine.hasSwitch('disable-gpu'))

test.describe('Software rendering', () => {
  let electronApp

  test.afterEach(async () => {
    await electronApp?.close().catch(() => {})
  })

  test('a normal launch keeps the GPU and the Paper blur (the control)', async () => {
    ;({ electronApp } = await launchApp({
      seedSettings: { theme: 'hybrasyl' },
      extraEnv: { CORVATH_DISABLE_GPU: '0' }
    }))
    const page = await getMainWindow(electronApp)
    expect(await gpuSwitchOff(electronApp)).toBe(false)
    expect(await paperBackdropFilter(page)).toContain('blur')
  })

  test('CORVATH_DISABLE_GPU=1 disables the GPU and removes the Paper blur', async () => {
    ;({ electronApp } = await launchApp({
      seedSettings: { theme: 'hybrasyl' },
      extraEnv: { CORVATH_DISABLE_GPU: '1' }
    }))
    const page = await getMainWindow(electronApp)
    expect(await gpuSwitchOff(electronApp)).toBe(true)
    expect(await paperBackdropFilter(page)).toBe('none')
  })
})
