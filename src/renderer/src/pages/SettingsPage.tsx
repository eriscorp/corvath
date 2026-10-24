import { useState, type ReactElement } from 'react'
import { Box, Typography } from '@mui/material'
import type { Deck, Layout, ThemeName } from '../../../shared/types'
import AppearanceCard from '../components/AppearanceCard'
import AboutCard from '../components/AboutCard'
import DrawDefaultsCard from '../components/DrawDefaultsCard'
import ThemeGallery from './ThemeGallery'

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
 * this grid rather than rebuilding the shell. Each card owns its own `Paper`,
 * with the same `cardSx`, as midir's About card does, so the page places the
 * cards bare and all three size alike.
 *
 * Appearance, Draw defaults and About. The three draw defaults were the
 * candidates HTOO-408 left open and Sabrael took on 2026-08-15; each is a choice
 * a user would otherwise re-pick on every draw, which is the bar a setting has to
 * clear here. A setting that only ever takes its default is worse than no
 * setting — a control to render, a schema field to validate, a migration to
 * carry and a line of documentation, for nothing.
 *
 * The Appearance card opens the theme gallery (HTOO-572) in place of the cards.
 * Its Back button returns to the cards. The gallery is not a nav tab: it is a
 * review tool under Settings, so the Settings tab stays selected. A tab change
 * unmounts this page, so the cards show again on the next visit.
 */
export default function SettingsPage({
  theme,
  onThemeChange,
  decks,
  layouts
}: SettingsPageProps): ReactElement {
  const [gallery, setGallery] = useState(false)
  if (gallery) return <ThemeGallery onBack={() => setGallery(false)} />
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
        <AppearanceCard
          value={theme}
          onChange={onThemeChange}
          onOpenGallery={() => setGallery(true)}
        />
        <DrawDefaultsCard decks={decks} layouts={layouts} />
        <AboutCard />
      </Box>
    </Box>
  )
}
