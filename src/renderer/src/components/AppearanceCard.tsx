import type { ReactElement } from 'react'
import { Box, Button, Paper, Typography } from '@mui/material'
import type { ThemeName } from '../../../shared/types'
import { cardDescSx, cardHeadingSx, cardSx } from '../lib/settingsCardSx'
import ThemePicker from './ThemePicker'

interface AppearanceCardProps {
  value: ThemeName
  onChange: (name: ThemeName) => void
  /** Opens the theme gallery (HTOO-572). */
  onOpenGallery: () => void
}

/**
 * The Appearance card on the Settings page: a heading, one line, and the house
 * theme picker (the template's ThemePicker, a preview card per theme).
 *
 * The card owns its own `Paper` and heading, as the About card does, so the
 * Settings page places each card bare and all of them size alike. The picker
 * replaces a theme Select: each card shows the theme in its own palette, and the
 * selected one carries a mark in `primary.main` (HTOO-572).
 *
 * The "Theme gallery" button opens the house theme gallery. It shows each
 * control in the active theme, with its measured contrast, for a review by eye.
 */
export default function AppearanceCard({
  value,
  onChange,
  onOpenGallery
}: AppearanceCardProps): ReactElement {
  return (
    <Paper sx={cardSx} data-testid="appearance-card">
      <Typography variant="h6" sx={cardHeadingSx}>
        Appearance
      </Typography>
      <Typography variant="body2" sx={cardDescSx}>
        Choose a theme. It applies at once and is remembered between launches.
      </Typography>
      <ThemePicker value={value} onChange={onChange} />
      <Box sx={{ mt: 2 }}>
        <Button onClick={onOpenGallery}>Theme gallery</Button>
      </Box>
    </Paper>
  )
}
