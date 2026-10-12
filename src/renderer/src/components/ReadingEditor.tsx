import {
  Autocomplete,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import { useState } from 'react'
import type { Deck, Entry, Layout, LayoutPosition, Reading } from '../../../shared/types'
import ConfirmDialog from './ConfirmDialog'
import EntryCard from './EntryCard'
import LayoutBoard, { type PositionArt } from './layouts/LayoutBoard'

interface ReadingEditorProps {
  reading: Reading
  /** Decks from the deck builder — used for the deck field and card meanings. */
  decks: Deck[]
  /** Layouts from the layout builder, offered as spreads. */
  layouts: Layout[]
  onChange: (patch: Partial<Reading>) => void
  onApplyLayout: (layout: Layout | null) => void
  onAddEntry: () => void
  onUpdateEntry: (entryId: string, patch: Partial<Entry>) => void
  onDeleteEntry: (entryId: string) => void
}

export default function ReadingEditor({
  reading,
  decks,
  layouts,
  onChange,
  onApplyLayout,
  onAddEntry,
  onUpdateEntry,
  onDeleteEntry
}: ReadingEditorProps) {
  const deckOptions = decks.map((d) => d.name).filter(Boolean)
  const currentDeck = decks.find((d) => d.name === reading.deck) ?? null
  const activeLayout = layouts.find((l) => l.id === reading.layoutId) ?? null

  // The layout awaiting confirmation, or null. `window.confirm` let this be a
  // synchronous early return; a real dialog cannot, so the choice is parked here
  // and applied from the dialog's own callback.
  const [pendingLayout, setPendingLayout] = useState<Layout | null>(null)

  const handleSelectLayout = (layoutId: string): void => {
    const layout = layouts.find((l) => l.id === layoutId) ?? null
    const hasContent = reading.entries.some((e) => e.topic || e.question || e.card)
    if (hasContent) {
      setPendingLayout(layout)
      return
    }
    onApplyLayout(layout)
  }

  // For the board preview, show the drawn card under each position.
  const cardForPosition = (positionId: string): string | undefined =>
    reading.entries.find((e) => e.positionId === positionId)?.card || undefined

  /** The spread slot an entry fills, when the reading has a layout. */
  const positionForEntry = (entry: Reading['entries'][number]): LayoutPosition | null =>
    activeLayout?.positions.find((p) => p.id === entry.positionId) ?? null

  // …and its face art, when the deck has any. Entries link to a position by id,
  // then to a deck card by name — the same two hops EntryCard makes.
  const artForPosition = (positionId: string): PositionArt | undefined => {
    const entry = reading.entries.find((e) => e.positionId === positionId)
    if (!entry?.card || !currentDeck) return undefined
    const card = currentDeck.cards.find((c) => c.name === entry.card)
    if (!card?.image) return undefined
    return {
      url: `${window.api.decks.imageUrl(currentDeck.id, card.image)}?v=${card.imageVersion ?? 0}`,
      reversed: entry.orientation === 'reversed' && currentDeck.supportsReversed
    }
  }

  const isCorvath = reading.source === 'corvath'

  return (
    <Box sx={{ flexGrow: 1, height: '100%', overflowY: 'auto', p: 3 }}>
      <Stack spacing={2.5} sx={{ maxWidth: 1200, mx: 'auto' }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <TextField
            label="Title"
            value={reading.title}
            onChange={(e) => onChange({ title: e.target.value })}
            sx={{ flexGrow: 1 }}
          />
          {/* Filled when marked, as in the card preview: an outlined secondary
              chip draws the bar colour as text on the page (HTOO-572). */}
          <Chip
            label={isCorvath ? 'Corvath' : 'Manual'}
            color={isCorvath ? 'secondary' : 'default'}
            variant={isCorvath ? 'filled' : 'outlined'}
            size="small"
            title="How this reading was created"
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            label="Date"
            type="date"
            value={reading.date}
            onChange={(e) => onChange({ date: e.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ flex: '1 1 180px' }}
          />
          <Autocomplete
            freeSolo
            options={deckOptions}
            value={reading.deck}
            onInputChange={(_e, value) => onChange({ deck: value })}
            sx={{ flex: '1 1 180px' }}
            renderInput={(params) => <TextField {...params} label="Deck" />}
          />
          <FormControl sx={{ flex: '1 1 180px' }}>
            <InputLabel id="layout-label">Layout</InputLabel>
            <Select
              labelId="layout-label"
              label="Layout"
              value={reading.layoutId ?? ''}
              onChange={(e) => handleSelectLayout(e.target.value)}
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              {layouts.map((layout) => (
                <MenuItem key={layout.id} value={layout.id}>
                  {layout.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {activeLayout && (
          <Box>
            <Typography variant="caption" sx={{ opacity: 0.7 }}>
              {activeLayout.name} spread
            </Typography>
            <LayoutBoard
              positions={activeLayout.positions}
              sublabel={(position) => cardForPosition(position.id)}
              art={(position) => artForPosition(position.id)}
            />
          </Box>
        )}

        <Divider />

        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Cards
          </Typography>
          <Button startIcon={<AddIcon />} onClick={onAddEntry}>
            Add Card
          </Button>
        </Box>

        {reading.entries.length === 0 ? (
          <Typography variant="body2" sx={{ opacity: 0.6 }}>
            No cards yet. Add one to record a topic, question, and meaning.
          </Typography>
        ) : (
          <Stack spacing={2}>
            {reading.entries.map((entry, index) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                index={index}
                deck={currentDeck}
                position={positionForEntry(entry)}
                onChange={(patch) => onUpdateEntry(entry.id, patch)}
                onDelete={() => onDeleteEntry(entry.id)}
              />
            ))}
          </Stack>
        )}

        <Divider>Notes</Divider>
        <TextField
          label="Reading notes"
          placeholder="Overall impressions, narrative, advice…"
          value={reading.notes ?? ''}
          onChange={(e) => onChange({ notes: e.target.value })}
          fullWidth
          multiline
          minRows={4}
        />
      </Stack>

      <ConfirmDialog
        open={pendingLayout !== null}
        title="Replace the cards in this reading?"
        message={
          <>
            Applying <strong>{pendingLayout?.name || 'this spread'}</strong> replaces the cards
            currently in this reading, and the topics, questions and interpretations written on
            them. This cannot be undone.
          </>
        }
        confirmLabel="Replace"
        destructive
        onConfirm={() => {
          onApplyLayout(pendingLayout)
          setPendingLayout(null)
        }}
        onCancel={() => setPendingLayout(null)}
      />
    </Box>
  )
}
