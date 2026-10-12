// Pure construction of a GitHub "new issue" prefill URL, plus the length-budget
// truncation that keeps it openable. No node/electron imports.
//
// **`URLSearchParams` does the encoding, and that is the security argument for why
// a title and a body need no escaping rules of their own.** A body is prose the
// user typed, and it enters a container with a framing (a URL) — which is exactly
// what `URLSearchParams` closes: it percent-encodes `&`, `#`, `?` and every
// control byte, so there is no separator left for a body to break out through.
//
// The composed URL is still gated on `isSafeExternalUrl` before it reaches
// `shell.openExternal` (in `main/diagnostics.ts`): the pure screen first, then the
// authority that owns the format.

export const TRUNCATION_NOTE =
  '\n\n_(diagnostics truncated — the full report is on your clipboard; paste it here)_'

/** The note when the clipboard write failed: the clipboard holds no report. */
export const TRUNCATION_NOTE_NOT_COPIED =
  '\n\n_(diagnostics truncated — use Copy to clipboard in the app, then paste the full report here)_'

export interface IssueUrlParams {
  owner: string
  repo: string
  title?: string
  body?: string
  labels?: string[]
}

/** Build a `github.com/<owner>/<repo>/issues/new` prefill URL. */
export function buildIssueUrl({
  owner,
  repo,
  title = '',
  body = '',
  labels = []
}: IssueUrlParams): string {
  const params = new URLSearchParams()
  if (title) params.set('title', title)
  if (body) params.set('body', body)
  if (labels && labels.length) params.set('labels', labels.join(','))
  return `https://github.com/${owner}/${repo}/issues/new?${params.toString()}`
}

/**
 * Build the issue URL with `body` trimmed so the WHOLE URL fits in `maxUrlLen`,
 * appending a note that points at the clipboard when it had to trim.
 *
 * **Binary search over the built URL, not arithmetic over the body.** Percent
 * encoding expands a string non-linearly and by an amount that depends on its
 * bytes — a body of newlines and backticks triples, a body of ASCII words barely
 * grows — so any "budget minus overhead" sum is wrong for some real input and
 * right for the one it was tested against. Measuring the finished URL is the
 * property that makes this correct, and it is also its own self-check: the
 * returned URL is short enough because that is the condition the search accepted.
 *
 * The caller copies the FULL body to the clipboard before opening the URL, so a
 * truncated prefill is completable by paste. When that copy fails, the caller
 * gives `TRUNCATION_NOTE_NOT_COPIED` as `note`, so the issue does not point at an
 * empty clipboard.
 */
export function truncateBodyForUrl(
  p: IssueUrlParams,
  maxUrlLen: number,
  note: string = TRUNCATION_NOTE
): { url: string; truncated: boolean } {
  const full = buildIssueUrl(p)
  if (full.length <= maxUrlLen) return { url: full, truncated: false }

  const body = p.body || ''
  let lo = 0
  let hi = body.length
  let best = ''
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const candidate = body.slice(0, mid) + note
    if (buildIssueUrl({ ...p, body: candidate }).length <= maxUrlLen) {
      best = candidate
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  // `best` stays empty when even the note alone does not fit — a budget smaller
  // than the title and labels. Returning the URL without a body is still the right
  // answer: the issue page opens, and the clipboard has everything.
  return { url: buildIssueUrl({ ...p, body: best }), truncated: true }
}
