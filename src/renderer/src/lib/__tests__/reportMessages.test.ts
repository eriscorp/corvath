import { describe, expect, it } from 'vitest'
import {
  composeIssueBody,
  copyReportMessage,
  openIssueFailedMessage,
  openIssueMessage
} from '../reportMessages'

describe('composeIssueBody', () => {
  it('fences the diagnostics, so markdown does not eat a path or a placeholder', () => {
    expect(composeIssueBody('  It broke.  ', 'at <user>/a_b_c')).toBe(
      'It broke.\n\n```\nat <user>/a_b_c\n```'
    )
  })
})

describe('openIssueMessage', () => {
  it('names the clipboard on the ordinary success', () => {
    const m = openIssueMessage({ ok: true, truncated: false, copied: true })
    expect(m.severity).toBe('success')
    expect(m.text).toContain('clipboard')
  })

  it('treats truncation as information, not failure, and asks for one paste', () => {
    const m = openIssueMessage({ ok: true, truncated: true, copied: true })
    expect(m.severity).toBe('info')
    expect(m.text).toContain('paste')
  })

  it('offers the manual route when the URL was refused, and still names the clipboard', () => {
    const m = openIssueMessage({ ok: false, reason: 'unsafe-url', copied: true })
    expect(m.severity).toBe('error')
    expect(m.text).toContain('is on your clipboard')
    expect(m.text).toContain('github.com/hybrasyl/cernunnos')
  })
})

describe('openIssueMessage when the copy failed (HTOO-553)', () => {
  // Electron 44's clipboard is async and can fail or time out. Then no sentence
  // may say that the report is on the clipboard.
  it('never promises the clipboard', () => {
    for (const result of [
      { ok: true as const, truncated: false, copied: false },
      { ok: true as const, truncated: true, copied: false },
      { ok: false as const, reason: 'unsafe-url' as const, copied: false }
    ]) {
      expect(openIssueMessage(result).text).not.toMatch(/is on your clipboard|from your clipboard/)
    }
  })

  it('asks for a manual copy only when the link holds part of the report', () => {
    expect(openIssueMessage({ ok: true, truncated: true, copied: false }).text).toContain(
      'Copy the report'
    )
    expect(openIssueMessage({ ok: true, truncated: false, copied: false }).text).toContain(
      'holds all of it'
    )
  })

  it('names the intake when the page did not open either', () => {
    const m = openIssueMessage({ ok: false, reason: 'unsafe-url', copied: false })
    expect(m.severity).toBe('error')
    expect(m.text).toContain('github.com/hybrasyl/cernunnos')
  })
})

describe('openIssueFailedMessage', () => {
  it('promises no clipboard, because main threw before the copy', () => {
    expect(openIssueFailedMessage().text).not.toMatch(/is on your clipboard/)
  })
})

describe('copyReportMessage', () => {
  it('says the copy failed when it failed', () => {
    expect(copyReportMessage(true)).toEqual({
      severity: 'success',
      text: 'Report copied to your clipboard.'
    })
    expect(copyReportMessage(false).severity).toBe('error')
  })
})
