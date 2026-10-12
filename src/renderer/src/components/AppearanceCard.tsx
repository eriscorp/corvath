import type { ReactElement } from 'react'
import { Paper, Typography } from '@mui/material'
import type { ThemeName } from '../../../shared/types'
import { cardDescSx, cardHeadingSx, cardSx } from '../lib/settingsCardSx'
import ThemePicker from './ThemePicker'

interface AppearanceCardProps {
  value: ThemeName
  onChange: (name: ThemeName) => void
}

/**
 * The Appearance card on the Settings page: a heading, one line, and the house
 * theme picker (the template's ThemePicker, a preview card per theme).
 *
 * The card owns its own `Paper` and heading, as the About card does, so the
 * Settings page places each card bare and all of them size alike. The picker
 * replaces a theme Select: each card shows the theme in its own palette, and the
 * selected one carries a mark in `primary.main` (HTOO-572).
 */
export default function AppearanceCard({ value, onChange }: AppearanceCardProps): ReactElement {
  return (
    <Paper sx={cardSx} data-testid="appearance-card">
      <Typography variant="h6" sx={cardHeadingSx}>
        Appearance
      </Typography>
      <Typography variant="body2" sx={cardDescSx}>
        Choose a theme. It applies at once and is remembered between launches.
      </Typography>
      <ThemePicker value={value} onChange={onChange} />
    </Paper>
  )
}
