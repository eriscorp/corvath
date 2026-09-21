import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// HTOO-456. The main window hides itself on `close` so the renderer's compositor
// tears down off screen instead of showing the native white background for the
// last frame or two.
//
// Read as text rather than imported. src/main/index.ts pulls in the electron
// module at load, which only resolves inside an Electron runtime. Same pattern
// as balor's windowClose.test.ts, which is the model for this file.
//
// The flash itself has no machine: it is a frame-level paint during window
// teardown, Playwright cannot see it, and a spec asserting `isVisible() === false`
// during close passes on the broken code too. What CAN be pinned is that the
// handler exists and that it hides unconditionally — Corvath has no close guard,
// so a hide behind any branch would leave some close route flashing.
const MAIN = stripComments(readFileSync(join(__dirname, '..', 'index.ts'), 'utf-8'))

// Comments are removed before anything is matched. The handler under test is
// wrapped in a comment that discusses hiding, closing and quitting — exactly
// the words being searched for — so a match against the raw file would pass on
// a version with the comment and no code.
//
// Crude on purpose: a `//` inside a string literal is treated as a comment.
// Nothing in index.ts has one, and the alternative is a parser.
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

// Return the body of `signature`'s block, by brace matching. Safe here only
// because comments are already gone and the handler contains no brace inside a
// string.
function blockBody(source: string, signature: string, label: string): string {
  const start = source.indexOf(signature)
  expect(start, `${label} not found`).toBeGreaterThan(-1)
  const open = source.indexOf('{', start)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i)
  }
  throw new Error(`unbalanced braces after ${label}`)
}

describe('main process — window close', () => {
  const body = blockBody(MAIN, "win.on('close'", "the main window's close handler")

  it('hides the window on close', () => {
    expect(body).toMatch(/win\.hide\(\)/)
  })

  it('hides unconditionally — no branch may decide whether the hide runs', () => {
    // Corvath has no unsaved-changes guard and no tray, so the handler has no
    // legitimate branch. A conditional hide is the shape this defect takes when
    // it comes back: one close route hides and the rest flash.
    expect(body).not.toMatch(/\bif\s*\(/)
    expect(body).not.toMatch(/preventDefault/)
    expect(body).not.toMatch(/\?\./)
  })

  it('hides in `close` and nowhere else', () => {
    // `closed` fires after the window is destroyed — too late, the teardown has
    // already painted. Only `close` runs before it. Corvath registers no
    // `closed` handler on the main window today, so rather than look for one,
    // pin that the only hide in the file is the one inside `close`.
    const count = (s: string): number => (s.match(/win\.hide\(\)/g) ?? []).length
    expect(count(MAIN)).toBe(count(body))
    expect(MAIN).not.toMatch(/on\('closed'/)
  })
})
