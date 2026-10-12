import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  applyCspHeaders,
  cspForRenderer,
  DEV_RENDERER_CSP,
  installContentSecurityPolicy,
  isPolicedUrl,
  RENDERER_CSP,
  SPLASH_CSP,
  type CspSession
} from '../windowSecurity'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..', '..')
const read = (p: string): string => readFileSync(join(repoRoot, p), 'utf8')

/** Pull the policy out of a document's `<meta http-equiv>` tag. */
function metaCsp(html: string): string | undefined {
  return /http-equiv="Content-Security-Policy"[\s\S]*?content="([^"]*)"/.exec(html)?.[1]
}

describe('the meta tag and the header policy are the same policy', () => {
  // A meta policy and a header policy INTERSECT rather than override. If these
  // two ever drift, the effective policy silently becomes the stricter of them
  // and the symptom arrives later as a rendering bug in an unrelated feature.
  it('renderer: index.html carries exactly RENDERER_CSP', () => {
    expect(metaCsp(read('src/renderer/index.html'))).toBe(RENDERER_CSP)
  })

  it('splash: splash.html carries exactly SPLASH_CSP', () => {
    expect(metaCsp(read('resources/splash.html'))).toBe(SPLASH_CSP)
  })

  it("keeps corvath-asset: in the renderer's img-src", () => {
    // Corvath-specific and load-bearing: every deck image is served over this
    // custom scheme. A policy copied from a sibling would not have it, and
    // dropping it blanks every card in the app.
    expect(RENDERER_CSP).toMatch(/img-src[^;]*corvath-asset:/)
  })

  it('grants the splash no script source at all', () => {
    // The splash is pure markup and CSS by design, so it never needs one.
    expect(SPLASH_CSP).toContain("default-src 'none'")
    expect(SPLASH_CSP).not.toContain('script-src')
  })
})

describe('cspForRenderer', () => {
  it('serves the strict policy with no dev-server URL', () => {
    // The e2e suite runs the built app with no dev URL, so it exercises the
    // policy that actually ships rather than the relaxed one.
    expect(cspForRenderer(undefined)).toBe(RENDERER_CSP)
    // An empty variable is not a location; index.ts turns it into undefined.
    expect(cspForRenderer('')).toBe(RENDERER_CSP)
  })

  // HTOO-467's follow-up. Keyed on NODE_ENV, a stray NODE_ENV=development in a
  // user's shell relaxed a PACKAGED app, because the built bundle reads it at
  // run time. The key is now the URL main loads, so the shell has no say.
  it('is keyed in index.ts on the dev URL, and never on NODE_ENV', () => {
    const index = read('src/main/index.ts')
    expect(index).toContain('cspForRenderer(RENDERER_DEV_URL)')
    expect(index).not.toMatch(/installContentSecurityPolicy\([^)]*NODE_ENV/)
    // Main reads no NODE_ENV at all, so the key cannot come back by a side road.
    expect(index).not.toMatch(/process\.env\.NODE_ENV|process\.env\[['"]NODE_ENV['"]\]/)
  })

  it('relaxes only script-src for the dev server', () => {
    expect(cspForRenderer('http://localhost:5173')).toBe(DEV_RENDERER_CSP)
    expect(DEV_RENDERER_CSP).toContain("script-src 'self' 'unsafe-inline'")

    // Compare directive by directive rather than by string surgery: a dev-only
    // hole in some OTHER directive would be a relaxation nothing ever tests,
    // and a substring check cannot tell the two apart.
    const directives = (csp: string): Map<string, string> =>
      new Map(
        csp
          .split(';')
          .map((d) => d.trim())
          .filter(Boolean)
          .map((d) => {
            const [name, ...rest] = d.split(/\s+/)
            return [name, rest.join(' ')]
          })
      )
    const prod = directives(RENDERER_CSP)
    const dev = directives(DEV_RENDERER_CSP)
    expect([...dev.keys()]).toEqual([...prod.keys()])
    for (const [name, value] of prod) {
      if (name === 'script-src') continue
      expect(dev.get(name)).toBe(value)
    }
    expect(dev.get('script-src')).toBe("'self' 'unsafe-inline'")
  })
})

describe('isPolicedUrl', () => {
  it('polices the schemes our documents load over', () => {
    expect(isPolicedUrl('file:///C:/Program%20Files/Corvath/index.html')).toBe(true)
    expect(isPolicedUrl('http://localhost:5173/')).toBe(true)
    expect(isPolicedUrl('https://example.com/')).toBe(true)
  })

  it('leaves devtools and our own asset scheme alone', () => {
    // devtools: is Chromium's own inspector, not our content to police.
    expect(isPolicedUrl('devtools://devtools/bundled/inspector.html')).toBe(false)
    // corvath-asset: responses are raw image bytes from our handler; a document
    // policy on them means nothing.
    expect(isPolicedUrl('corvath-asset://argent/maj-0.webp')).toBe(false)
  })

  it('polices a URL it cannot parse, rather than exempting it', () => {
    // Fails closed: a header can only restrict, so the worst case is a policy on
    // something that did not need one.
    expect(isPolicedUrl('not a url')).toBe(true)
  })
})

describe('applyCspHeaders', () => {
  it('writes the policy when there is none', () => {
    expect(applyCspHeaders(undefined, RENDERER_CSP)).toEqual({
      'Content-Security-Policy': [RENDERER_CSP]
    })
  })

  it('replaces an existing policy rather than adding a second', () => {
    const out = applyCspHeaders({ 'content-security-policy': ['default-src *'] }, RENDERER_CSP)
    expect(Object.keys(out)).toEqual(['Content-Security-Policy'])
    expect(out['Content-Security-Policy']).toEqual([RENDERER_CSP])
  })

  it('matches the header name case-insensitively', () => {
    const out = applyCspHeaders({ 'Content-Security-POLICY': ['default-src *'] }, RENDERER_CSP)
    expect(Object.keys(out)).toEqual(['Content-Security-Policy'])
  })

  it('strips a report-only policy too', () => {
    // A report-only policy left behind is still a policy in a response we did
    // not write.
    const out = applyCspHeaders(
      { 'Content-Security-Policy-Report-Only': ["default-src 'none'"] },
      RENDERER_CSP
    )
    expect(Object.keys(out)).toEqual(['Content-Security-Policy'])
  })

  it('leaves unrelated headers untouched', () => {
    const out = applyCspHeaders(
      { 'Content-Type': ['text/html'], 'X-Whatever': ['1'] },
      RENDERER_CSP
    )
    expect(out['Content-Type']).toEqual(['text/html'])
    expect(out['X-Whatever']).toEqual(['1'])
    expect(out['Content-Security-Policy']).toEqual([RENDERER_CSP])
  })
})

describe('installContentSecurityPolicy', () => {
  /** A session stub that captures the listener and lets a test drive it. */
  function fakeSession(): {
    session: CspSession
    send: (url: string, headers?: Record<string, string[]>) => Record<string, string[]> | undefined
  } {
    let listener:
      | ((
          d: { url: string; responseHeaders?: Record<string, string[]> },
          cb: (r: { responseHeaders?: Record<string, string[]> }) => void
        ) => void)
      | undefined
    return {
      session: {
        webRequest: {
          onHeadersReceived: (fn) => {
            listener = fn
          }
        }
      } as CspSession,
      send: (url, headers) => {
        let out: Record<string, string[]> | undefined
        listener?.({ url, responseHeaders: headers }, (r) => {
          out = r.responseHeaders
        })
        return out
      }
    }
  }

  it('stamps a policed response', () => {
    const { session, send } = fakeSession()
    installContentSecurityPolicy(session)
    expect(send('file:///app/index.html')?.['Content-Security-Policy']).toEqual([RENDERER_CSP])
  })

  it('passes an unpoliced response through untouched', () => {
    const { session, send } = fakeSession()
    installContentSecurityPolicy(session)
    const out = send('corvath-asset://argent/maj-0.webp', { 'Content-Type': ['image/webp'] })
    expect(out).toEqual({ 'Content-Type': ['image/webp'] })
    expect(out?.['Content-Security-Policy']).toBeUndefined()
  })

  it('serves whichever policy it was given', () => {
    const { session, send } = fakeSession()
    installContentSecurityPolicy(session, DEV_RENDERER_CSP)
    expect(send('http://localhost:5173/')?.['Content-Security-Policy']).toEqual([DEV_RENDERER_CSP])
  })
})
