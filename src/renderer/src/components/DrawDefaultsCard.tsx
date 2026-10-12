import type { ReactElement } from 'react'
import { FormControl, InputLabel, MenuItem, Paper, Select, Stack, Typography } from '@mui/material'
import type { Deck, DrawMode, Layout } from '../../../shared/types'
import { cardDescSx, cardHeadingSx, cardSx } from '../lib/settingsCardSx'
import { useSettingsStore } from '../store/settingsStore'

interface DrawDefaultsCardProps {
  decks: Deck[]
  layouts: Layout[]
}

/** The "no default" choice. An empty string, because MUI `Select` cannot hold
 *  `undefined` as a controlled value without warning about it. */
const NONE = ''

/**
 * What the Draw tab starts on.
 *
 * Each of these is a default a user would otherwise re-pick on every draw, which
 * is the bar the register set for a setting earning its place. Nothing here
 * changes an existing draw: the Draw tab reads them once, when it mounts.
 *
 * **A default is a preference, not a constraint.** Every one of them can still be
 * changed on the Draw tab itself, and each can be set back to "None" — a control
 * the user cannot un-set is a worse bug than the one it was added to fix.
 *
 * The card owns its own `Paper`, as the About and Appearance cards do, so the
 * Settings page places it bare.
 */
export default function DrawDefaultsCard({ decks, layouts }: DrawDefaultsCardProps): ReactElement {
  const defaultDeckId = useSettingsStore((s) => s.defaultDeckId)
  const defaultLayoutId = useSettingsStore((s) => s.defaultLayoutId)
  const defaultDrawMode = useSettingsStore((s) => s.defaultDrawMode)
  const setDefaultDeckId = useSettingsStore((s) => s.setDefaultDeckId)
  const setDefaultLayoutId = useSettingsStore((s) => s.setDefaultLayoutId)
  const setDefaultDrawMode = useSettingsStore((s) => s.setDefaultDrawMode)

  // A deck or spread can be deleted after it was chosen here. Falling back to
  // NONE keeps the Select controlled and shows the truth — the default is gone —
  // rather than rendering a blank option with a dangling id behind it.
  const deckValue = decks.some((d) => d.id === defaultDeckId) ? defaultDeckId : NONE
  const layoutValue = layouts.some((l) => l.id === defaultLayoutId) ? defaultLayoutId : NONE

  return (
    <Paper sx={cardSx} data-testid="draw-defaults-card">
      <Typography variant="h6" sx={cardHeadingSx}>
        Draw defaults
      </Typography>
      <Typography variant="body2" sx={cardDescSx}>
        What the Draw tab starts on. You can still change any of them for a single draw.
      </Typography>

      <Stack spacing={2} sx={{ maxWidth: 360 }}>
        <FormControl size="small">
          <InputLabel id="default-deck-label">Default deck</InputLabel>
          <Select
            labelId="default-deck-label"
            label="Default deck"
            value={deckValue ?? NONE}
            onChange={(e) => setDefaultDeckId(e.target.value || undefined)}
            data-testid="default-deck-select"
          >
            <MenuItem value={NONE}>
              <em>None — use the first deck</em>
            </MenuItem>
            {decks.map((d) => (
              <MenuItem key={d.id} value={d.id}>
                {d.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small">
          <InputLabel id="default-spread-label">Default spread</InputLabel>
          <Select
            labelId="default-spread-label"
            label="Default spread"
            value={layoutValue ?? NONE}
            onChange={(e) => setDefaultLayoutId(e.target.value || undefined)}
            data-testid="default-spread-select"
          >
            <MenuItem value={NONE}>
              <em>None — use the first spread</em>
            </MenuItem>
            {layouts.map((l) => (
              <MenuItem key={l.id} value={l.id}>
                {l.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small">
          <InputLabel id="default-mode-label">Default draw mode</InputLabel>
          <Select
            labelId="default-mode-label"
            label="Default draw mode"
            value={defaultDrawMode ?? NONE}
            onChange={(e) => setDefaultDrawMode((e.target.value || undefined) as DrawMode)}
            data-testid="default-mode-select"
          >
            <MenuItem value={NONE}>
              <em>None — deal from the top</em>
            </MenuItem>
            <MenuItem value="deal">Deal from top</MenuItem>
            <MenuItem value="fan">Fan &amp; pick</MenuItem>
          </Select>
        </FormControl>
      </Stack>
    </Paper>
  )
}
