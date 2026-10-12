// Renderer-boundary hardening. Adapted from dagda's `windowSecurity.ts` (itself
// from mabon's WP18 pass, which answered a real static audit). Three apps found
// the same scaffold-inherited holes; corvath grew from the same skeleton, so it
// had them too.
//
// Three protections, kept in ONE place so the policy is single-sourced and
// auditable rather than scattered across window constructors:
//
//   1. hardenWindow() — deny top-level navigation away from our own content, and
//      deny every child window. The main window still hands *validated* external
//      URLs to the OS; the splash opens nothing.
//   2. guardIpc()     — wrap ipcMain so every handler rejects an IPC whose sender
//      is not the top frame of a known corvath window at our own location.
//   3. Trusted-window registration, so an unexpected webContents cannot reach the
//      handler registry just by existing.
//
// Two things dagda has that corvath does not, and why they are absent rather than
// forgotten: there is no `hardenWebviews` (corvath never sets `webviewTag`, so no
// <webview> can attach), and there are no window ROLES (corvath's only other
// window is the splash, which loads with no preload and therefore has no bridge
// to send IPC over at all).
//
// This is a SECOND gate, independent of payload validation. The zod schemas in
// `schemas/` still parse every mutating payload; nothing here replaces that.

import type { BrowserWindow, IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import { pathToFileURL } from 'url'
import { isSafeExternalUrl } from '../shared/externalUrl'

/**
 * Reduce a URL to the key we compare on: scheme, host and path, with query and
 * hash dropped.
 *
 * **Not `origin`.** The WHATWG parser returns the opaque origin `"null"` for
 * every `file:` URL, so an `origin` comparison is `"null" === "null"` in a
 * packaged build — it contributes nothing, leaving the path as the only
 * discriminator. That is enough to trust a remote host: `file://evil.example.com/
 * C:/Program Files/Corvath/…/index.html` carries our exact pathname, and both
 * origins are `"null"`. Comparing `host` explicitly is what closes it, and the
 * empty host of a local `file:` URL still distinguishes it from a UNC one.
 */
function locationKey(url: URL): string {
  return `${url.protocol}//${url.host}${url.pathname}`
}

/** Locations we consider "our own content", as `locationKey` strings. Set once at
 *  boot by `initWindowSecurity`. Empty until then, which fails closed: before
 *  init, nothing is trusted. */
let trustedLocations: string[] = []

/** webContents ids for windows we constructed. An IPC from a webContents absent
 *  from this set is rejected outright. */
const trustedWindows = new Set<number>()

/**
 * Record the renderer locations we trust. Call once at boot, before any window
 * loads. `devUrl` is `ELECTRON_RENDERER_URL` in dev (undefined in production);
 * `prodIndexHtml` is the absolute path to the packaged `renderer/index.html`.
 */
export function initWindowSecurity(devUrl: string | undefined, prodIndexHtml: string): void {
  const locations: string[] = []
  if (devUrl) {
    try {
      locations.push(locationKey(new URL(devUrl)))
    } catch {
      /* malformed dev URL — leave it out and fail closed */
    }
  }
  // pathToFileURL, never string concatenation: a path with a space, `#` or a
  // non-ASCII character produces a different file URL than the naive form, and a
  // trusted location that never matches is a lockout, not a safety margin.
  // (Corvath installs under "Program Files" and users have spaces in profile
  // names, so this is the ordinary case here, not the exotic one.)
  locations.push(locationKey(pathToFileURL(prodIndexHtml)))
  trustedLocations = locations
}

/** True when `rawUrl` points at our own renderer content. Remote pages,
 *  `about:blank` and malformed URLs are all untrusted. */
function isTrustedLocation(rawUrl: string): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  const key = locationKey(url)
  return trustedLocations.some((l) => l === key)
}

/**
 * Register a window we created, so its IPC is accepted. Forgotten when its
 * webContents is destroyed, so a stale id cannot authorize a future one that
 * Electron happens to reuse.
 */
export function registerTrustedWindow(win: BrowserWindow): void {
  const id = win.webContents.id
  trustedWindows.add(id)
  win.webContents.once('destroyed', () => trustedWindows.delete(id))
}

/**
 * Deny top-level navigation and every child window.
 *
 * `allowExternal` is true only for the main window, where a link meant for the
 * user's browser should still get there. The splash passes false: it opens
 * nothing and navigates nowhere.
 */
export function hardenWindow(
  win: BrowserWindow,
  opts: { allowExternal: boolean; openExternal: (url: string) => void }
): void {
  win.webContents.setWindowOpenHandler((details) => {
    if (opts.allowExternal && isSafeExternalUrl(details.url)) opts.openExternal(details.url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (isTrustedLocation(url)) return // our own content — e.g. a dev HMR full reload
    event.preventDefault()
    if (opts.allowExternal && isSafeExternalUrl(url)) opts.openExternal(url)
  })
}

/**
 * The authority check: accept an IPC only from the top frame of a known corvath
 * window at one of our own locations. Exported for direct unit testing.
 */
export function isSenderAllowed(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
  const contents = event.sender
  if (contents.isDestroyed()) return false
  if (!trustedWindows.has(contents.id)) return false
  // Must be the window's own top frame: an iframe inheriting the preload must not
  // reach a privileged channel.
  const frame = event.senderFrame
  if (!frame || frame !== contents.mainFrame) return false
  return isTrustedLocation(frame.url)
}

/**
 * Wrap `ipcMain` so `.handle` / `.on` / `.once` reject an untrusted sender before
 * the real handler runs. An `invoke` rejection surfaces as an error in the
 * renderer; a fire-and-forget `.on` / `.once` is dropped silently.
 *
 * Installed at the single `registerHandlers` call site, so every channel is
 * covered by construction — a new handler cannot forget to opt in.
 *
 * **`once` is guarded here and is NOT in dagda's version.** Corvath registers the
 * `app:ready` reveal handshake with `ipcMain.once`, which would otherwise fall
 * through the proxy to the raw method and be reachable by any sender. Guarding it
 * also means a rejected `once` does not consume the registration — the listener
 * stays armed for the legitimate sender instead of being burned by the first
 * untrusted caller.
 */
export function guardIpc(ipcMain: IpcMain): IpcMain {
  const wrappers = new WeakMap<(...args: never[]) => void, (...args: never[]) => void>()

  return new Proxy(ipcMain, {
    get(target, prop, receiver) {
      if (prop === 'handle') {
        return (
          channel: string,
          listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
        ): void => {
          target.handle(channel, (event, ...args) => {
            if (!isSenderAllowed(event)) {
              throw new Error(`IPC "${channel}" rejected: untrusted sender`)
            }
            return listener(event, ...args)
          })
        }
      }
      if (prop === 'on') {
        return (
          channel: string,
          listener: (event: IpcMainEvent, ...args: unknown[]) => void
        ): IpcMain => {
          const wrapped = (event: IpcMainEvent, ...args: unknown[]): void => {
            if (!isSenderAllowed(event)) return
            listener(event, ...args)
          }
          wrappers.set(listener as never, wrapped as never)
          target.on(channel, wrapped)
          return receiver as IpcMain
        }
      }
      if (prop === 'once') {
        return (
          channel: string,
          listener: (event: IpcMainEvent, ...args: unknown[]) => void
        ): IpcMain => {
          // Re-arm on rejection rather than using target.once, so an untrusted
          // sender cannot consume the one-shot registration.
          const wrapped = (event: IpcMainEvent, ...args: unknown[]): void => {
            if (!isSenderAllowed(event)) return
            target.removeListener(channel, wrapped as (...a: unknown[]) => void)
            listener(event, ...args)
          }
          wrappers.set(listener as never, wrapped as never)
          target.on(channel, wrapped)
          return receiver as IpcMain
        }
      }
      // `.on`/`.once` register a wrapper, so removal has to be remapped or it
      // silently removes nothing.
      if (prop === 'off' || prop === 'removeListener') {
        return (channel: string, listener: (...args: never[]) => void): IpcMain => {
          const wrapped = wrappers.get(listener as never) ?? listener
          target.removeListener(channel, wrapped as (...args: unknown[]) => void)
          return receiver as IpcMain
        }
      }
      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    }
  })
}

// ---------------------------------------------------------------------------
// Content-Security-Policy, served as a HEADER
//
// HTOO-402, the third instance of a shape taliesin (HTOO-164) and balor
// (HTOO-391) already closed; this is a port of balor's, not a reinvention.
//
// Corvath already carried a good `<meta http-equiv>` policy in
// `src/renderer/index.html`, and it stays as defence in depth. But a meta policy
// is applied by the PARSER, so it governs nothing that happens before the parser
// reaches it and cannot express the directives that exist only as headers
// (`frame-ancestors`, `sandbox`, `report-to`). A header applies to the response
// itself. The two are not interchangeable.
// ---------------------------------------------------------------------------

/**
 * The renderer's policy, single-sourced here and kept **identical** to the meta
 * tag in `src/renderer/index.html`.
 *
 * A meta policy and a header policy INTERSECT rather than override, so any
 * directive tightened here and not there (or vice versa) silently becomes the
 * stricter of the two — which is how a header CSP turns into a rendering bug
 * discovered weeks later. A unit test pins the two together.
 *
 * **`corvath-asset:` in `img-src` is load-bearing and is corvath's own.** It is
 * the custom scheme every deck image is served over; a policy copied from a
 * sibling will not have it, and dropping it blanks every card in the app with no
 * symptom beyond a console line.
 */
export const RENDERER_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "font-src 'self' data:; img-src 'self' data: blob: corvath-asset:;"

/**
 * The splash's policy, deliberately TIGHTER than the renderer's.
 *
 * `resources/splash.html` is one inline `<style>`, one same-origin `<img>` and
 * **no script at all** — it is self-contained so it can paint before the
 * renderer bundle exists. So it needs no `script-src` grant whatsoever.
 *
 * It is served the renderer policy in the header and carries this one in its own
 * meta tag; because the two intersect, the splash ends up under the stricter of
 * them, which is this. Selecting a policy per URL in the header would mean path
 * matching against an asar URL — fragile, for an outcome the intersection
 * already gives.
 */
export const SPLASH_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'"

/**
 * The DEVELOPMENT policy: `RENDERER_CSP` with `'unsafe-inline'` added to
 * `script-src`, and nothing else changed.
 *
 * `@vitejs/plugin-react` injects the React Refresh preamble as an INLINE
 * `<script>` at the top of `<head>`, and the HMR client is inline too. Under
 * `script-src 'self'` Chromium refuses the preamble, the plugin throws
 * `can't detect preamble`, and the window never renders.
 *
 * **The meta tag never blocked this, which is precisely the point of the card.**
 * A meta policy applies from where the parser reaches it, and the preamble is
 * injected above it — so the tag let through exactly the code a header stops.
 *
 * Keyed on the dev-server URL, **not** `app.isPackaged`: the e2e suite runs the
 * built app via `electron .`, where `isPackaged` is false. Keying on it would
 * hand the relaxed policy to the only automated check that drives a real
 * renderer, leaving the production policy tested nowhere.
 *
 * **And not on `NODE_ENV` either**, which is what this used before HTOO-467's
 * follow-up. Corvath's built main bundle reads `process.env.NODE_ENV` at run
 * time, so a stray `NODE_ENV=development` in a user's shell relaxed the policy
 * of a packaged app. Oghma found it; balor and corvath took the same fix.
 */
export const DEV_RENDERER_CSP = RENDERER_CSP.replace(
  "script-src 'self'",
  "script-src 'self' 'unsafe-inline'"
)

/**
 * The policy for this launch. The relaxation applies only when the window loads
 * from the Vite dev server, because the dev server is the reason for it.
 * `devUrl` is index.ts's `RENDERER_DEV_URL`: set only when `is.dev` and
 * electron-vite give a URL, and the same URL the window loads. The e2e suite
 * runs the built app with no dev URL, so it tests the strict policy.
 */
export function cspForRenderer(devUrl: string | undefined): string {
  return devUrl ? DEV_RENDERER_CSP : RENDERER_CSP
}

/** The header name, lower-cased once so the strip and the write cannot disagree. */
const CSP_HEADER = 'content-security-policy'

/**
 * Schemes whose responses we stamp. An allowlist rather than "everything":
 * `devtools:` is not our content to police, and `corvath-asset:` responses are
 * raw image bytes served by our own handler, where a document policy means
 * nothing.
 */
const POLICED_PROTOCOLS = new Set(['file:', 'http:', 'https:'])

/** The shapes of `onHeadersReceived` we use, named so this module needs no
 *  runtime `electron` import and the unit tests need no electron stub. */
interface HeadersReceivedDetails {
  url: string
  responseHeaders?: Record<string, string[]> | undefined
}
interface HeadersReceivedResponse {
  responseHeaders?: Record<string, string[]> | undefined
}
export interface CspSession {
  webRequest: {
    onHeadersReceived(
      listener: (
        details: HeadersReceivedDetails,
        callback: (response: HeadersReceivedResponse) => void
      ) => void
    ): void
  }
}

/** True when a response at this URL should carry our policy. */
export function isPolicedUrl(rawUrl: string): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    // A URL we cannot parse is POLICED, not exempted. A header can only ever
    // restrict, so this direction fails closed: the worst case is a policy on
    // something that did not need one.
    return true
  }
  return POLICED_PROTOCOLS.has(url.protocol)
}

/**
 * Strip every existing CSP header, then write ours.
 *
 * **Replaced, not added to.** Two CSP headers intersect, so leaving one in place
 * would make the effective policy a function of whoever else set it. Header names
 * are case-insensitive, so the match is too — and the `-report-only` variant goes
 * with it, because a report-only policy left behind is still a policy in a
 * response we did not write.
 */
export function applyCspHeaders(
  headers: Record<string, string[]> | undefined,
  policy: string
): Record<string, string[]> {
  const next: Record<string, string[]> = {}
  for (const [name, value] of Object.entries(headers ?? {})) {
    const lower = name.toLowerCase()
    if (lower === CSP_HEADER || lower === `${CSP_HEADER}-report-only`) continue
    next[name] = value
  }
  next['Content-Security-Policy'] = [policy]
  return next
}

/**
 * Put the policy on every response the renderer loads.
 *
 * `session` is INJECTED rather than imported, like the rest of this module, so
 * the unit tests need no electron at all.
 */
export function installContentSecurityPolicy(session: CspSession, policy = RENDERER_CSP): void {
  session.webRequest.onHeadersReceived((details, callback) => {
    if (!isPolicedUrl(details.url)) {
      callback({ responseHeaders: details.responseHeaders })
      return
    }
    callback({ responseHeaders: applyCspHeaders(details.responseHeaders, policy) })
  })
}

/** Test-only reset, so suites do not leak trusted windows or locations between
 *  cases. */
export function __resetWindowSecurityForTests(): void {
  trustedLocations = []
  trustedWindows.clear()
}
