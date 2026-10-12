import {
  Autocomplete,
  Box,
  Card,
  CardContent,
  IconButton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography
} from '@mui/material'
import { useState } from 'react'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import type { Deck, Entry, LayoutPosition, Orientation } from '../../../shared/types'
import DrawCard from './DrawCard'
import CardPreview from './CardPreview'
import { sameName } from '../lib/sameName'

interface EntryCardProps {
  entry: Entry
  index: number
  /** The reading's deck, resolved from the deck builder (null if no match). */
  deck: Deck | null
  /**
   * The layout position this entry fills, when the reading has a spread. Names
   * the slot in the header so the card list reads like the board.
   */
  position?: LayoutPosition | null
  onChange: (patch: Partial<Entry>) => void
  onDelete: () => void
}

export default function EntryCard({
  entry,
  index,
  deck,
  position,
  onChange,
  onDelete
}: EntryCardProps) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const cardNames = deck ? deck.cards.map((c) => c.name) : []
  // The typed card name against the deck's, in either Unicode form (sameName).
  const deckCard = deck?.cards.find((c) => sameName(c.name, entry.card)) ?? null
  const reversedDisabled = !!deck && !deck.supportsReversed
  const isReversed = entry.orientation === 'reversed' && !reversedDisabled

  const artUrl =
    deck && deckCard?.image ? window.api.decks.imageUrl(deck.id, deckCard.image) : undefined

  const meaning = deckCard
    ? ((isReversed ? deckCard.meaningReversed || deckCard.meaning : deckCard.meaning) ?? '')
    : ''

  const meaningHelp = !deck
    ? 'Set the reading’s deck to one from the Deck builder to show meanings.'
    : !deckCard
      ? 'No matching card in this deck.'
      : !meaning
        ? 'No meaning set for this card in the deck.'
        : ' '

  return (
    <Card variant="outlined">
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 1.5 }}>
          {/* Name the slot, so the card list reads like the board above it. The
              position's meaning goes on its own line rather than into the
              overline, which is uppercased and letterspaced — a sentence set
              that way is unreadable. */}
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="overline" sx={{ opacity: 0.8, display: 'block', lineHeight: 1.4 }}>
              {position?.name ? `Card ${index + 1} · ${position.name}` : `Card ${index + 1}`}
            </Typography>
            {position?.meaning && (
              <Typography variant="caption" sx={{ opacity: 0.6, display: 'block' }}>
                {position.meaning}
              </Typography>
            )}
          </Box>
          <Tooltip title="Remove card">
            <IconButton size="small" onClick={onDelete} aria-label="remove card">
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
          {entry.card && (
            <Box sx={{ flexShrink: 0, display: { xs: 'none', sm: 'block' }, pt: 0.5 }}>
              <DrawCard
                flipped
                faceUrl={artUrl}
                name={entry.card}
                orientation={isReversed ? 'reversed' : undefined}
                width={104}
                height={166}
                onClick={() => setPreviewOpen(true)}
              />
            </Box>
          )}
          <Stack spacing={2} sx={{ flexGrow: 1, minWidth: 0 }}>
            <TextField
              label="Topic"
              value={entry.topic}
              onChange={(e) => onChange({ topic: e.target.value })}
              fullWidth
              size="small"
            />
            <TextField
              label="Question"
              value={entry.question}
              onChange={(e) => onChange({ question: e.target.value })}
              fullWidth
              size="small"
            />

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {deck ? (
                <Autocomplete
                  freeSolo
                  options={cardNames}
                  value={entry.card ?? ''}
                  onInputChange={(_e, value) => onChange({ card: value })}
                  sx={{ flexGrow: 1, minWidth: 220 }}
                  renderInput={(params) => (
                    <TextField {...params} label="Card drawn" size="small" />
                  )}
                />
              ) : (
                <TextField
                  label="Card drawn"
                  value={entry.card ?? ''}
                  onChange={(e) => onChange({ card: e.target.value })}
                  size="small"
                  sx={{ flexGrow: 1, minWidth: 220 }}
                />
              )}

              <ToggleButtonGroup
                exclusive
                size="small"
                value={entry.orientation ?? null}
                onChange={(_e, value: Orientation | null) =>
                  onChange({ orientation: value ?? undefined })
                }
                aria-label="orientation"
              >
                <ToggleButton value="upright" aria-label="upright">
                  Upright
                </ToggleButton>
                <Tooltip title={reversedDisabled ? 'This deck does not track reversed cards' : ''}>
                  <span>
                    <ToggleButton
                      value="reversed"
                      aria-label="reversed"
                      disabled={reversedDisabled}
                    >
                      Reversed
                    </ToggleButton>
                  </span>
                </Tooltip>
              </ToggleButtonGroup>
            </Box>

            <TextField
              label="Meaning (from deck)"
              value={meaning}
              slotProps={{ input: { readOnly: true } }}
              fullWidth
              multiline
              minRows={2}
              size="small"
              helperText={meaningHelp}
            />

            <TextField
              label="Notes"
              placeholder="Your interpretation of this card…"
              value={entry.notes ?? ''}
              onChange={(e) => onChange({ notes: e.target.value })}
              fullWidth
              multiline
              minRows={2}
              size="small"
            />
          </Stack>
        </Box>
      </CardContent>

      <CardPreview
        card={
          previewOpen && entry.card
            ? {
                name: entry.card,
                artUrl,
                orientation: isReversed ? 'reversed' : undefined,
                keywords: deckCard?.keywords,
                meaning: meaning || undefined
              }
            : null
        }
        onClose={() => setPreviewOpen(false)}
      />
    </Card>
  )
}
