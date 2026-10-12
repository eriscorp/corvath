// Privacy scrubbing for captured errors and the diagnostics block. PURE — no
// node/electron imports; the caller (main) passes `homeDir` / `userName` in from
// `os.*`, which is what keeps this unit-testable and keeps `shared/` free of node.
//
// **Scrubbing runs at CAPTURE**, in `main/sessionLog.ts`, before the ring buffer
// and before disk. One scrub site covers every source — main's own uncaught
// errors, forwarded renderer errors, and React's `componentDidCatch` — which is
// what makes the on-disk session logs already safe to hand to a bug report. There
// is no second sanitising pass on attach; `main/diagnostics.ts` runs one more over
// the assembled block only as idempotent insurance.
//
// Goal: strip anything identifying a person or a machine — usernames, home and
// data paths, emails and IP addresses — while leaving enough of an error (type,
// message, file basename) to debug from.
//
// **Corvath's exposure differs from balor's, and the difference is worth naming.**
// Balor added the credential rules because it captures git's own stderr, and git
// echoes the remote URL — sometimes carrying a token — in most of its failure
// messages. Corvath spawns nothing, holds no credential, and talks to one
// unauthenticated endpoint (the house version manifest in `updateCheck.ts`). The
// three generic container rules are kept anyway as cheap insurance: they match the
// SHAPE a secret travels in rather than guessing at its value, so they cannot go
// stale the way a prefix match would.
//
// What corvath's logs actually carry is **paths** — the data directory, a deck's
// image folder, an imported file the user picked. So the path rules are the ones
// doing the work here, and they are the reason this runs at all.

/** Escape a string for literal use inside a RegExp. */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// A URL's userinfo — `https://user:secret@host/…`. Keeps the scheme and host, so
// the failing endpoint is still named.
const URL_USERINFO_RE = /\b([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/gi

// `Authorization: Bearer <t>` / `token <t>`. Keeps the scheme, drops the value —
// so a 401 still says which kind of credential was refused.
const AUTH_HEADER_RE = /\b(authorization\s*:\s*)(\w+\s+)?\S+/gi

// A shell- or env-style assignment whose NAME says it carries a secret. Generic on
// purpose, so this file needs no list of the names any one app happens to use.
const SECRET_ASSIGNMENT_RE = /\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY))(\s*=\s*)\S+/gi

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g

// Deep ABSOLUTE paths (3+ components) collapse to "…<sep><basename>". Runs before
// the account-path rules so a path with an embedded username folds in one pass,
// dropping the account name AND the local directory structure rather than leaving
// a redacted skeleton of it. For corvath this is the rule that matters most:
// nearly every path in its logs sits under the user's own profile.
const WIN_DEEP_PATH_RE = /[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\){2,}[^\\/:*?"<>|\r\n]+/g
// POSIX variant. The lookbehind is what keeps it from eating a URL's path
// (`https://a/b/c`) or a path already glued to a word or a colon.
const POSIX_DEEP_PATH_RE = /(?<![:/\w])(?:\/[^/\s:*?"<>|\r\n]+){3,}/g

// Short named-account paths the collapse could not reach — only two components,
// `C:\Users\alice` or `/home/alice`. Keep the recognisable prefix, redact the name.
const WIN_USER_RE = /([A-Za-z]:[\\/]Users[\\/])([^\\/:*?"<>|\r\n]+)/gi
const POSIX_HOME_RE = /((?:\/Users|\/home)\/)([^/\r\n]+)/g

export interface ScrubContext {
  homeDir?: string
  userName?: string
}

/**
 * Scrub identifying information out of a block of text.
 *
 * The order below is load-bearing at three points:
 *
 * - **Credentials first.** The userinfo rule leaves `https://<redacted>@host/…`,
 *   which still names the failing endpoint. Letting the email rule reach it first
 *   would produce `https://<email>/…` — redacted, but no longer an answer to
 *   "which endpoint".
 * - **Deep paths before account paths**, so an embedded username is dropped with
 *   the whole path rather than redacted in place inside a path that survives.
 * - **`homeDir` after both**, because it exists for the install that lives nowhere
 *   near `/home` or `C:\Users` and is therefore the case the shapes above miss.
 */
export function scrubText(text: string, ctx: ScrubContext = {}): string {
  if (typeof text !== 'string' || text.length === 0) return text
  const { homeDir, userName } = ctx
  let out = text

  // 1. Credentials, in the three containers they travel in.
  out = out.replace(URL_USERINFO_RE, '$1<redacted>@')
  out = out.replace(AUTH_HEADER_RE, (_m, head: string, scheme?: string) =>
    scheme ? `${head}${scheme}<redacted>` : `${head}<redacted>`
  )
  out = out.replace(SECRET_ASSIGNMENT_RE, '$1$2<redacted>')

  // 2. Emails and IPv4 — independent of any path shape, so they run up front.
  out = out.replace(EMAIL_RE, '<email>')
  out = out.replace(IPV4_RE, '<ip>')

  // 3. Collapse deep absolute paths to their basename.
  out = out.replace(WIN_DEEP_PATH_RE, (m) => `…\\${m.split('\\').pop()}`)
  out = out.replace(POSIX_DEEP_PATH_RE, (m) => `…/${m.split('/').pop()}`)

  // 4. Short account paths the collapse did not reach.
  out = out.replace(WIN_USER_RE, '$1<user>')
  out = out.replace(POSIX_HOME_RE, '$1<user>')

  // 5. An explicit home directory, for a non-standard install location.
  if (typeof homeDir === 'string' && homeDir.length > 0) {
    out = out.replace(new RegExp(escapeRegExp(homeDir), 'gi'), '<HOME>')
  }

  // 6. A bare username token elsewhere in the text — inside a message, or a URL
  // the path rules left alone. Only when long enough to be unambiguous: a
  // two-character name would clobber innocent substrings ("al" inside "also"),
  // and a diagnostics block nobody can read is worse than one naming an account.
  if (typeof userName === 'string' && userName.length >= 3) {
    out = out.replace(new RegExp(`\\b${escapeRegExp(userName)}\\b`, 'g'), '<user>')
  }

  return out
}
