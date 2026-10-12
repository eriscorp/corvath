import { promises as fs } from 'fs'
import { join } from 'path'
import os from 'os'
import { scrubText, type ScrubContext } from '../shared/scrub'
import { formatErrorLine, type ErrorEntry } from '../shared/diagnostics'

/**
 * Per-session ERROR log. One file per launch under `<userData>/logs`, keeping the
 * five most recent.
 *
 * **Errors only, never a trace.** Corvath saves a data file 200 ms after each run
 * of edits. A trace of those saves is a large file that nobody reads, and
 * it would put the text of the user's readings and the paths of their imported
 * card images on disk for no gain. What is here is what a bug report needs: the
 * things that went wrong this session.
 *
 * **Scrubbed at CAPTURE — before the ring buffer, before the file.** That is the
 * invariant the whole module rests on, because it is what makes an on-disk log
 * already safe to attach to a public issue. There is no sanitising pass on the way
 * out; if this one is skipped, nothing downstream repairs it. The module came from
 * balor, which holds a GitHub token. Corvath holds no token, but the scrub is the
 * shared house one, so `session-log.test.ts` still proves that a token-shaped
 * string reaches neither the ring nor the disk.
 *
 * **Best-effort throughout.** A logging failure must never disturb the app: every
 * filesystem call swallows its error, and there is no path by which `captureError`
 * can throw. It is called FROM the global error handlers, so a throw here would be
 * a second uncaught error raised while reporting the first.
 *
 * Appends are serialised through a queue — `settingsManager`'s pattern — so two
 * errors a millisecond apart cannot interleave half-lines. A log whose lines are
 * spliced together is worse than one that lost a line, because it reads as a real
 * stack that never happened.
 *
 * `logs/` is a subfolder rather than a file beside `settings.json`, so
 * **Reveal logs folder** has a target that holds nothing else.
 */

const KEEP_SESSIONS = 5

/**
 * How many captured errors the diagnostics block can show. A report is read by a
 * person, and the first errors of a session are usually the informative ones — but
 * a cap keeps a repeating failure from pushing an unbounded amount of text into a
 * GitHub URL, which is a budget `truncateBodyForUrl` then has to spend.
 */
const RING_MAX = 20

let logsDir: string | null = null
let sessionFile: string | null = null
let scrubCtx: ScrubContext = {}
const ring: ErrorEntry[] = []
let appendQueue: Promise<void> = Promise.resolve()

/**
 * `YYYYMMDD-HHmmss-SSS` — compact, filename-safe, and sortable.
 *
 * Lexical order over these names IS chronological order, which is the property
 * `rotate` relies on to decide what is oldest without stat-ing anything. Milliseconds
 * are in the name because two launches in the same second is a normal thing to do
 * while developing, and a collision would silently merge two sessions into one file.
 */
function sessionStamp(): string {
  const iso = new Date().toISOString() // 2026-08-06T16:42:15.123Z
  const date = iso.slice(0, 10).replace(/-/g, '')
  const time = iso.slice(11, 19).replace(/:/g, '')
  const ms = iso.slice(20, 23)
  return `${date}-${time}-${ms}`
}

const SESSION_RE = /^session-.*\.log$/

/**
 * Keep the newest `KEEP_SESSIONS` session files and unlink the rest.
 *
 * The pattern is anchored, so nothing this module did not create is a candidate for
 * deletion — the folder is Corvath's, but a directory an app unlinks from on every
 * launch deserves a narrower rule than "everything here is mine".
 */
async function rotate(dir: string): Promise<void> {
  const entries = await fs.readdir(dir).catch(() => [] as string[])
  const sessions = entries.filter((f) => SESSION_RE.test(f)).sort() // oldest first
  const excess = sessions.length - KEEP_SESSIONS
  for (let i = 0; i < excess; i++) {
    await fs.unlink(join(dir, sessions[i])).catch(() => {})
  }
}

function enqueueAppend(line: string): Promise<void> {
  const write = (): Promise<void> =>
    fs.appendFile(sessionFile as string, `${line}\n`, 'utf-8').catch(() => {})
  // `.then(write, write)` rather than `.then(write)`: a rejected link would
  // otherwise poison the chain and silently stop every later append.
  appendQueue = appendQueue.then(write, write)
  return appendQueue
}

/**
 * Create this run's file, capture the scrub context, and prune older sessions.
 *
 * Call once at startup. `os.homedir()` and `os.userInfo()` are read HERE rather
 * than per capture: they cannot change while the process runs, and `userInfo()`
 * throws on a system with no passwd entry for the uid — a container, some CI
 * images — which is a thing to survive once at boot rather than on every error.
 */
export async function initSessionLog(dir: string): Promise<void> {
  logsDir = dir
  let userName: string | undefined
  try {
    userName = os.userInfo().username
  } catch {
    userName = undefined
  }
  scrubCtx = { homeDir: os.homedir(), userName }
  sessionFile = join(dir, `session-${sessionStamp()}.log`)
  await fs.mkdir(dir, { recursive: true }).catch(() => undefined)
  // Touch, so a launch that threw nothing still counts as a session for rotation.
  // Append mode creates without truncating — a file already at this name would be
  // a second launch inside the same millisecond, and losing its contents is worse
  // than sharing a file.
  await fs.appendFile(sessionFile, '', 'utf-8').catch(() => {})
  await rotate(dir)
}

/**
 * Scrub, ring-buffer, and best-effort-append one captured error.
 *
 * Synchronous by contract. Its callers are `process.on('uncaughtException')` and an
 * IPC listener, neither of which has anywhere to put a promise; the disk write is
 * fire-and-forget behind the queue.
 *
 * The ring is populated even before `initSessionLog` has resolved, so an error
 * thrown during boot still reaches a report — it just does not reach a file.
 */
export function captureError(entry: ErrorEntry = {}): void {
  const scrubbed: ErrorEntry = {
    timestamp: new Date().toISOString(),
    source: entry.source || 'error',
    origin: entry.origin || 'main',
    message: scrubText(String(entry.message ?? ''), scrubCtx),
    stack: entry.stack ? scrubText(String(entry.stack), scrubCtx) : undefined
  }
  ring.push(scrubbed)
  if (ring.length > RING_MAX) ring.shift()
  if (sessionFile) void enqueueAppend(formatErrorLine(scrubbed))
}

/** The most recent scrubbed entries from THIS session — main and renderer alike. */
export function getRecentErrors(n = RING_MAX): ErrorEntry[] {
  return ring.slice(-n)
}

/**
 * Where the session logs are, or null before `initSessionLog` has run.
 *
 * Null is a real answer and the caller must handle it rather than opening the
 * parent folder as a fallback: revealing the wrong directory is a worse failure
 * than revealing none, because it looks like it worked.
 */
export function getLogsDir(): string | null {
  return logsDir
}

/**
 * Test-only: resolve once every append enqueued so far has been written.
 *
 * A test that asserts on file contents has to wait for the serialised queue, and the
 * obvious way to wait is a `setTimeout`. That is a guess about how long a disk takes,
 * and it fails on the machine under the most load — which is CI, after the change has
 * been pushed. Awaiting the queue itself is the same wait with no number in it.
 *
 * Production has no caller and wants none: `captureError` is synchronous by contract
 * because it runs from `process.on('uncaughtException')`, which has nowhere to put a
 * promise.
 */
export function _flushSessionLogForTests(): Promise<void> {
  return appendQueue
}

/** Test-only: reset module state between cases. */
export function _resetSessionLogForTests(): void {
  logsDir = null
  sessionFile = null
  scrubCtx = {}
  ring.length = 0
  appendQueue = Promise.resolve()
}
