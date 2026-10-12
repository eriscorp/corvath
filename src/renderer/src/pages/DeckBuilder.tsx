import { useEffect, useState } from 'react'
import { Alert, Box, Snackbar, Typography } from '@mui/material'
import type { UseDecks } from '../hooks/useDecks'
import DeckList from '../components/decks/DeckList'
import DeckEditor from '../components/decks/DeckEditor'
import { useMenuRequest } from '../lib/useMenuRequest'

interface Toast {
  message: string
  severity: 'success' | 'error'
}

interface DeckBuilderProps {
  api: UseDecks
}

export default function DeckBuilder({ api }: DeckBuilderProps) {
  const {
    decks,
    loaded,
    createDeck,
    updateDeck,
    deleteDeck,
    addMajor,
    updateCard,
    deleteCard,
    importCardImage,
    importDeckBack,
    exportDeck,
    importDeck
  } = api
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)

  // Keep selection valid; default to the first deck once loaded.
  useEffect(() => {
    if (!loaded) return
    if (selectedId && !decks.some((d) => d.id === selectedId)) {
      setSelectedId(decks[0]?.id ?? null)
    } else if (!selectedId && decks.length > 0) {
      setSelectedId(decks[0].id)
    }
  }, [loaded, decks, selectedId])

  const selected = decks.find((d) => d.id === selectedId) ?? null

  const handleCreate = (): void => {
    const deck = createDeck()
    setSelectedId(deck.id)
  }

  const handleImport = async (): Promise<void> => {
    const result = await importDeck()
    if (result.deck) {
      setSelectedId(result.deck.id)
      setToast({ message: `Imported "${result.deck.name}".`, severity: 'success' })
    } else if (result.error) {
      setToast({ message: result.error, severity: 'error' })
    }
  }

  // File → Import Deck… (macOS) runs the Import Deck button, also when this
  // page mounts after the click.
  useMenuRequest('importDeck', () => void handleImport())

  const handleExport = async (id: string): Promise<void> => {
    const result = await exportDeck(id)
    if (result.ok) {
      setToast({ message: 'Deck exported.', severity: 'success' })
    } else if (result.error) {
      setToast({ message: result.error, severity: 'error' })
    }
  }

  return (
    <Box data-testid="decks-page" sx={{ flexGrow: 1, display: 'flex', minHeight: 0 }}>
      <DeckList
        decks={decks}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCreate={handleCreate}
        onImport={() => void handleImport()}
        onExport={(id) => void handleExport(id)}
        onDelete={deleteDeck}
      />
      {selected ? (
        <DeckEditor
          key={selected.id}
          deck={selected}
          onUpdateDeck={(patch) => updateDeck(selected.id, patch)}
          onAddMajor={() => addMajor(selected.id)}
          onUpdateCard={(cardId, patch) => updateCard(selected.id, cardId, patch)}
          onDeleteCard={(cardId) => deleteCard(selected.id, cardId)}
          onImportImage={(cardId, file) => void importCardImage(selected.id, cardId, file)}
          onImportBack={(file) => void importDeckBack(selected.id, file)}
        />
      ) : (
        <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="body1" sx={{ opacity: 0.6 }}>
            Select a deck, or create a new one.
          </Typography>
        </Box>
      )}

      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? (
          <Alert
            severity={toast.severity}
            variant="filled"
            onClose={() => setToast(null)}
            sx={{ width: '100%' }}
          >
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  )
}
