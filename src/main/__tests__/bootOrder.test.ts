import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

// The module-scope boot sequence in src/main/index.ts, pinned by POSITION.
// The template's bootOrder.test.ts, with corvath's statements.
//
// Read as text rather than imported: index.ts pulls in the electron module at
// load, which only resolves inside an Electron runtime. And position is the
// property under test — every statement here is a call that fails SILENTLY
// when it lands on the wrong side of another one, so no unit test that stubs
// `app` can see the defect, and neither can the e2e suite. This file is the
// only evidence the order holds.
//
// Comments are stripped before anything is matched. The statements below sit
// under comment blocks that discuss the very names being searched for, so a
// match against the raw file would pass on a version with the comment and no
// code. Crude on purpose: a `//` inside a string literal would be treated as a
// comment. Nothing in index.ts has one, and the alternative is a parser.
const here = dirname(fileURLToPath(import.meta.url))
const RAW = readFileSync(join(here, '..', 'index.ts'), 'utf-8')
const MAIN = RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

/** First index of `needle`, asserting it exists so a missing statement fails
 *  by name rather than as `-1 < x`. */
function at(needle: string | RegExp): number {
  const i = typeof needle === 'string' ? MAIN.indexOf(needle) : MAIN.search(needle)
  expect(i, `${String(needle)} not found in index.ts`).toBeGreaterThan(-1)
  return i
}

describe('remote-session rendering (HTOO-325)', () => {
  it('disables hardware acceleration after setPath and before app.whenReady', () => {
    // **The silent failure this fix is most likely to grow.** The electron call
    // is a no-op after the `ready` event — it does not throw and it does not
    // warn in a way anyone reads — so a later reordering of boot would leave a
    // module, a test file and a card all describing a fix that had stopped
    // happening. Nothing else in the repository can see this: the unit suite
    // does not boot the app, and the e2e suite cannot tell a software-rendered
    // window from a composited one.
    const setPath = at("app.setPath('userData'")
    const gpu = at('app.disableHardwareAcceleration()')
    expect(setPath).toBeLessThan(gpu)
    expect(gpu).toBeLessThan(at('app.whenReady()'))
  })

  it('decides once, from the process, and keeps the answer', () => {
    // One constant read at module scope, consumed by both the electron call and
    // the CSS injection below. Two calls that could disagree is a worse shape
    // than one constant, however unlikely the disagreement — and the predicate
    // must be handed `process.platform` and `process.env` rather than reaching
    // for them, or its tests answer a different question than the app does.
    expect(MAIN).toMatch(
      /const isRemoteSession = shouldDisableHardwareAcceleration\(process\.platform, process\.env\)/
    )
  })

  it('injects the CSS on dom-ready, and only when software rendering is in force', () => {
    // Two claims a reader of `remoteSession.ts` alone cannot check. `dom-ready`
    // fires before first paint — `did-finish-load` does not, and the difference
    // is a visible flash of the blurred style on every remote launch. And the
    // injection is gated on the DECISION, so a local session's rendering stays
    // exactly as it was and the override reproduces the whole condition.
    //
    // Anchored to the gate NEAREST the injection, not the first one in the
    // file: there is a second `if (isRemoteSession)` at module scope for the
    // electron call, so a plain first-match search would report the injection
    // as gated even if somebody deleted its own `if`.
    const createWindowAt = at('function createWindow')
    const inject = at('insertCSS(REMOTE_SESSION_CSS)')
    expect(inject).toBeGreaterThan(createWindowAt)
    expect(MAIN.lastIndexOf('if (isRemoteSession)', inject)).toBeGreaterThan(createWindowAt)
    expect(MAIN.slice(createWindowAt, inject)).toContain("'dom-ready'")
  })

  it('strips comments before it measures', () => {
    // What the stripping buys, pinned on a sample rather than on index.ts: the
    // raw file does not invert today, so asserting an inversion there would pin
    // a fact about one wording of one comment. A comment that names a call
    // above the real call must not count as the call.
    const sample = '// app.whenReady() is too late\napp.disableHardwareAcceleration()\n'
    const stripped = sample.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    expect(sample.indexOf('app.whenReady()')).toBeLessThan(
      sample.indexOf('app.disableHardwareAcceleration()')
    )
    expect(stripped).not.toContain('app.whenReady()')
  })
})
