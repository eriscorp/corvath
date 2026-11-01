import { Button, Toolbar } from '@mui/material'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { chromeKind, navButtonSx } from '@renderer/components/titleChrome'

export type View = 'readings' | 'draw' | 'decks' | 'layouts' | 'settings'

/**
 * Every nav destination, in bar order.
 *
 * Exported because `e2e/nav-pages.spec.js` walks this list rather than its own
 * copy: a hand-maintained list in the spec is a list that stops matching the app
 * exactly when a new page needs covering, which is the hole HTOO-393 describes.
 * The `testId` is the page-level hook each page renders.
 */
export const NAV_ITEMS: { view: View; label: string; testId: string }[] = [
  { view: 'readings', label: 'Readings', testId: 'readings-page' },
  { view: 'draw', label: 'Draw', testId: 'draw-page' },
  { view: 'decks', label: 'Decks', testId: 'decks-page' },
  { view: 'layouts', label: 'Layouts', testId: 'layouts-page' },
  { view: 'settings', label: 'Settings', testId: 'settings-page' }
]

interface NavBarProps {
  view: View
  onChange: (view: View) => void
}

/**
 * The app's second bar, directly under the title bar: the house nav bar (balor
 * `NavToolbar.tsx`, taliesin, creidhne, epona, mabon), a dense `Toolbar` on
 * `tertiary.main` (HTOO-629). Corvath puts a word on each button, as mabon
 * does, because labels read clearer than glyphs for its few pages. The colours,
 * the hover and the current-page mark are the house nav-bar button,
 * `navButtonSx` (HTOO-572), and `aria-current` says the same in words.
 */
export default function NavBar({ view, onChange }: NavBarProps) {
  const kind = chromeKind(useSettingsStore((s) => s.theme))

  return (
    <Toolbar
      data-testid="nav-bar"
      variant="dense"
      disableGutters
      sx={{
        bgcolor: 'tertiary.main',
        color: 'tertiary.contrastText',
        minHeight: 40,
        px: 1,
        gap: 0.5,
        flexShrink: 0
      }}
    >
      {NAV_ITEMS.map((item) => (
        // `color="inherit"`: a primary text button takes the themes' accent rule,
        // which beats `sx` (filledControls.ts).
        <Button
          key={item.view}
          size="small"
          color="inherit"
          aria-current={view === item.view ? 'page' : undefined}
          onClick={() => onChange(item.view)}
          sx={{ ...navButtonSx(kind, view === item.view), minWidth: 0, px: 1.5, flexShrink: 0 }}
        >
          {item.label}
        </Button>
      ))}
    </Toolbar>
  )
}
