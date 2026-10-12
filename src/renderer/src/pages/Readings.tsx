import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Snackbar, Typography } from '@mui/material'
import CasinoOutlinedIcon from '@mui/icons-material/CasinoOutlined'
import type { Deck, Layout } from '../../../shared/types'
import { useReadings } from '../hooks/useReadings'
import { readingsToJson } from '../lib/exportReadings'
import ReadingList from '../components/ReadingList'
import ReadingEditor from '../components/ReadingEditor'
import ImportDialog from '../components/ImportDialog'
import { useMenuRequest } from '../lib/useMenuRequest'

interface Toast {
  message: string
  severity: 'success' | 'error'
}

/** A filesystem-safe base name for an exported file. */
const safeName = (s: string): string => s.trim().replace(/[^a-z0-9._-]+/gi, '_') || 'reading'

interface ReadingsProps {
  /** Decks from the builder — for the deck field and card meanings. */
  decks: Deck[]
  /** Layouts from the builder, offered as spreads. */
  layouts: Layout[]
  /** Selected reading id, lifted to App so the Draw tab can hand one off. */
  selectedId: string | null
  onSelectId: (id: string | null) => void
  /** Switch to the Draw tab. */
  onGoToDraw: () => void
}

export default function Readings({
  decks,
  layouts,
  selectedId,
  onSelectId,
  onGoToDraw
}: ReadingsProps) {
  const {
    readings,
    loaded,
    createReading,
    updateReading,
    deleteReading,
    addEntry,
    updateEntry,
    deleteEntry,
    applyLayout,
    importReadings
  } = useReadings()
  const [importOpen, setImportOpen] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)

  useEffect(() => {
    if (!loaded) return
    if (selectedId && !readings.some((r) => r.id === selectedId)) {
      onSelectId(readings[0]?.id ?? null)
    } else if (!selectedId && readings.length > 0) {
      onSelectId(readings[0].id)
    }
  }, [loaded, readings, selectedId, onSelectId])

  const selectedReading = useMemo(
    () => readings.find((r) => r.id === selectedId) ?? null,
    [readings, selectedId]
  )

  const handleCreate = (): void => {
    const reading = createReading()
    onSelectId(reading.id)
  }

  const handleImport = (imported: Parameters<typeof importReadings>[0]): void => {
    importReadings(imported)
    setImportOpen(false)
    if (imported[0]) onSelectId(imported[0].id)
  }

  const runExport = async (name: string, readingsToSave: typeof readings): Promise<void> => {
    const result = await window.api.readings.export(name, readingsToJson(readingsToSave))
    if (result.ok) {
      setToast({ message: 'Readings exported.', severity: 'success' })
    } else if (result.error) {
      setToast({ message: result.error, severity: 'error' })
    }
  }

  const handleExportOne = (id: string): void => {
    const reading = readings.find((r) => r.id === id)
    if (reading) void runExport(safeName(reading.title || 'reading'), [reading])
  }

  const handleExportAll = (): void => {
    if (readings.length) void runExport('corvath-readings', readings)
  }

  // The macOS File menu runs the same three buttons (New Reading, Import,
  // Export all), also when this page mounts after the click.
  useMenuRequest('newReading', handleCreate)
  useMenuRequest('importReadings', () => setImportOpen(true))
  useMenuRequest('exportAllReadings', handleExportAll)

  return (
    <Box data-testid="readings-page" sx={{ flexGrow: 1, display: 'flex', minHeight: 0 }}>
      <ReadingList
        readings={readings}
        selectedId={selectedId}
        onSelect={onSelectId}
        onCreate={handleCreate}
        onDraw={onGoToDraw}
        onImport={() => setImportOpen(true)}
        onExport={handleExportOne}
        onExportAll={handleExportAll}
        onDelete={deleteReading}
      />
      {selectedReading ? (
        <ReadingEditor
          key={selectedReading.id}
          reading={selectedReading}
          decks={decks}
          layouts={layouts}
          onChange={(patch) => updateReading(selectedReading.id, patch)}
          onApplyLayout={(layout) => applyLayout(selectedReading.id, layout)}
          onAddEntry={() => addEntry(selectedReading.id)}
          onUpdateEntry={(entryId, patch) => updateEntry(selectedReading.id, entryId, patch)}
          // DELIBERATELY UNCONFIRMED, unlike deleting a reading (HTOO-409).
          // This removes one card row from the reading open in front of you:
          // its topic, question and interpretation, all still on screen as you
          // click. Re-adding it is one button. Deleting a READING destroys a
          // whole journal entry from a list, with nothing shown of what is
          // inside it — a different act with a different cost. Confirming both
          // would make the cheap one tedious and teach the habit of dismissing
          // the prompt, which is how the expensive one gets waved through.
          onDeleteEntry={(entryId) => deleteEntry(selectedReading.id, entryId)}
        />
      ) : (
        <Box
          sx={{
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            textAlign: 'center',
            p: 3
          }}
        >
          {readings.length === 0 ? (
            <>
              <Typography variant="h6">Welcome to Corvath</Typography>
              <Typography variant="body1" sx={{ opacity: 0.7, maxWidth: 420 }}>
                Draw a reading in the app, enter one by hand, or import readings you already have.
              </Typography>
              <Button
                variant="contained"
                size="large"
                startIcon={<CasinoOutlinedIcon />}
                onClick={onGoToDraw}
              >
                Draw a Reading
              </Button>
            </>
          ) : (
            <Typography variant="body1" sx={{ opacity: 0.6 }}>
              Select a reading, or create a new one.
            </Typography>
          )}
        </Box>
      )}

      <ImportDialog
        open={importOpen}
        layouts={layouts}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
      />

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
