/**
 * The preload bridge surface (HTOO-697).
 *
 * Loads the real `src/preload/index.ts` against a stub `electron`, then pins
 * two facts:
 *  - `api` is the only name exposed to the renderer. The @electron-toolkit
 *    `window.electron` bridge gave the renderer raw ipcRenderer and
 *    `process.env`, and must not come back.
 *  - each subscription wraps its listener: the renderer callback gets the
 *    payload only, never the IpcRendererEvent, and the returned function
 *    removes the exact listener it added.
 *
 * The walk covers every function on `api`, so a new subscription that hands
 * its callback straight to `ipcRenderer.on` fails here with no edit to the test.
 */
import { describe, expect, it, vi } from 'vitest'

type Listener = (...args: unknown[]) => void

const exposed = new Map<string, unknown>()
const listeners = new Map<string, Set<Listener>>()

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (name: string, value: unknown) => exposed.set(name, value)
  },
  ipcRenderer: {
    invoke: vi.fn(() => Promise.resolve()),
    send: vi.fn(),
    on: (channel: string, fn: Listener) => {
      if (!listeners.has(channel)) listeners.set(channel, new Set())
      listeners.get(channel)!.add(fn)
    },
    removeListener: (channel: string, fn: Listener) => listeners.get(channel)?.delete(fn)
  }
}))

// Top-level await: `it.each` reads its table when the file is collected, so
// the preload must be loaded before the describe block runs.
await import('../../preload/index')
const api = exposed.get('api')

/** Every function on the api object, with its dotted path. */
function functionsOf(obj: unknown, prefix = ''): [string, (...a: unknown[]) => unknown][] {
  const out: [string, (...a: unknown[]) => unknown][] = []
  if (!obj || typeof obj !== 'object') return out
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'function') out.push([path, value as (...a: unknown[]) => unknown])
    else out.push(...functionsOf(value, path))
  }
  return out
}

const count = (): number => [...listeners.values()].reduce((n, s) => n + s.size, 0)

describe('preload bridge surface (HTOO-697)', () => {
  it('exposes api and nothing else', () => {
    expect([...exposed.keys()]).toEqual(['api'])
  })

  it('has subscriptions to walk', () => {
    // Guards the walk below: if the stub stopped seeing subscriptions, the
    // per-function checks would pass on nothing.
    let found = 0
    for (const [, fn] of functionsOf(api)) {
      const before = count()
      const off = fn(() => {})
      if (count() > before) {
        found++
        if (typeof off === 'function') off()
      }
    }
    expect(found).toBeGreaterThanOrEqual(2)
  })

  it.each(functionsOf(api))(
    '%s passes no IpcRendererEvent and unsubscribes its own listener',
    (_path, fn) => {
      const seen: unknown[][] = []
      const before = new Map([...listeners].map(([c, s]) => [c, new Set(s)]))
      const off = fn((...args: unknown[]) => seen.push(args))

      const added: [string, Listener][] = []
      for (const [channel, set] of listeners) {
        for (const l of set) if (!before.get(channel)?.has(l)) added.push([channel, l])
      }
      if (added.length === 0) return // not a subscription

      expect(added).toHaveLength(1)
      const [channel, listener] = added[0]
      const event = { sender: { id: 1 }, senderFrame: {}, ports: [] }
      listener(event, 'payload')
      expect(seen).toEqual([['payload']])
      for (const args of seen) expect(args).not.toContain(event)

      expect(typeof off).toBe('function')
      ;(off as () => void)()
      expect(listeners.get(channel)?.has(listener)).toBe(false)
    }
  )
})
