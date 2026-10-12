import type { ReactElement } from 'react'
import { Box, Paper, Typography } from '@mui/material'
import type { Deck, Layout, ThemeName } from '../../../shared/types'
import { cardDescSx, cardHeadingSx, cardSx } from '../lib/settingsCardSx'
import ThemePicker from '../components/ThemePicker'
import AboutCard from '../components/AboutCard'
import DrawDefaultsCard from '../components/DrawDefaultsCard'

interface SettingsPageProps {
  theme: ThemeName
  onThemeChange: (name: ThemeName) => void
  decks: Deck[]
  layouts: Layout[]
}

/**
 * Settings, as a page reached from the nav tabs.
 *
 * The house shape (balor / taliesin / oghma) is a scrollable responsive grid of
 * `<Paper>` cards, one per concern — not a tab strip. A later WP adds cards to
 * this grid rather than rebuilding the shell. The page wraps Appearance and Draw
 * defaults in a `Paper` with `cardSx`. The About card brings its own, with the
 * same `cardSx`, as midir's does, so all three cards size alike.
 *
 * Appearance, Draw defaults and About. The three draw defaults were the
 * candidates HTOO-408 left open and Sabrael took on 2026-08-15; each is a choice
 * a user would otherwise re-pick on every draw, which is the bar a setting has to
 * clear here. A setting that only ever takes its default is worse than no
 * setting — a control to render, a schema field to validate, a migration to
 * carry and a line of documentation, for nothing.
 */
export default function SettingsPage({
  theme,
  onThemeChange,
  decks,
  layouts
}: SettingsPageProps): ReactElement {
  return (
    <Box data-testid="settings-page" sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 3 }}>
      <Typography variant="h5" sx={{ mb: 3 }}>
        Settings
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(560px, 1fr))',
          gap: 3,
          alignItems: 'stretch'
        }}
      >
        <Paper sx={cardSx}>
          <Typography sx={cardHeadingSx}>Appearance</Typography>
          <Typography variant="body2" sx={cardDescSx}>
            Choose a theme. It applies at once and is remembered between launches.
          </Typography>
          <ThemePicker value={theme} onChange={onThemeChange} />
        </Paper>

        <Paper sx={cardSx}>
          <DrawDefaultsCard decks={decks} layouts={layouts} />
        </Paper>

        {/* Last in the grid, and not wrapped: the house About card owns its Paper. */}
        <AboutCard />
      </Box>
    </Box>
  )
}
