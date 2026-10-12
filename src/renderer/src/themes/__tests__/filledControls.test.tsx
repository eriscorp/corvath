import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import { Alert, Button } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import { themesByName } from '../index'
import { contrast } from './contrast'
import type { ThemeName } from '@shared/types'
import UpdateNotice, { START_DELAY_MS } from '@renderer/components/UpdateNotice'

const THEME_NAMES = Object.keys(themesByName) as ThemeName[]

/** The colour an element draws in. */
const drawn = (el: Element): string => getComputedStyle(el).color

/**
 * A filled control's contents read like its label (`corvathOverrides.ts`).
 *
 * The house update notice (a byte copy, not changed here) puts "View release"
 * and a close X in a filled info alert, both with `color="inherit"`. The house
 * themes' MuiButton, MuiLink and MuiSvgIcon overrides beat that inherit, so in
 * hybrasyl both drew the theme's teal on the teal fill (1.59:1), and in
 * grinneal the X was 1.11:1. The Readings and Decks toasts are the same filled
 * alert with a close X. This renders both and asks that every part of the
 * alert take the message's colour. The message colour is MUI's own choice for
 * the fill; mundanes' white on its info blue is 3.86:1, and that is MUI's
 * default, so this asks 3:1 of it, the threshold MUI picks a label by.
 */
describe('a filled control', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.localStorage.clear()
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it.each(THEME_NAMES)('%s: the update notice draws its action like its message', async (name) => {
    window.api.checkForUpdate = vi.fn(async () => ({
      ok: true as const,
      update: { version: '9.0.0', url: 'https://github.com/eriscorp/corvath/releases/tag/v9.0.0' }
    }))
    render(
      <ThemeProvider theme={themesByName[name]}>
        <UpdateNotice />
      </ThemeProvider>
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(START_DELAY_MS)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    const alert = screen.getByRole('status')
    const message = drawn(alert)
    const fill = getComputedStyle(alert).backgroundColor
    expect(contrast(message, fill), `message ${message} on ${fill}`).toBeGreaterThanOrEqual(3)
    expect(drawn(screen.getByText('View release').closest('a')!), 'View release').toBe(message)
    expect(drawn(alert.querySelector('.MuiAlert-icon svg')!), 'the info icon').toBe(message)
    const close = screen.getByRole('button', { name: 'Close' })
    expect(drawn(close.querySelector('svg')!), 'the close X').toBe(message)
  })

  it.each(THEME_NAMES)('%s: a toast draws its close X like its message', (name) => {
    render(
      <ThemeProvider theme={themesByName[name]}>
        <Alert severity="success" variant="filled" onClose={() => {}}>
          Saved.
        </Alert>
      </ThemeProvider>
    )
    const alert = screen.getByRole('alert')
    const close = screen.getByRole('button', { name: 'Close' })
    expect(drawn(close.querySelector('svg')!)).toBe(drawn(alert))
  })

  // The same fault in a contained button: its icon took the theme's MuiSvgIcon
  // accent (danaan: 1.34:1 on its gold fill). It now takes the label's colour.
  it.each(THEME_NAMES)('%s: a contained button draws its icon like its label', (name) => {
    render(
      <ThemeProvider theme={themesByName[name]}>
        <Button variant="contained" startIcon={<AddIcon />}>
          New deck
        </Button>
      </ThemeProvider>
    )
    const button = screen.getByRole('button', { name: 'New deck' })
    expect(drawn(button.querySelector('svg')!)).toBe(drawn(button))
  })
})
