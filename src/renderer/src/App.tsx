import { useEffect, useState } from 'react'
import { Box, CircularProgress, CssBaseline, ThemeProvider } from '@mui/material'
import type { ThemeName } from '../../shared/types'
import { hybrasylTheme, themesByName } from './themes'
import { useSettingsStore } from './store/settingsStore'
import { useReadingsStore } from './store/readingsStore'
import { useDecksStore } from './store/decksStore'
import { useLayoutsStore } from './store/layoutsStore'
import { useDecks } from './hooks/useDecks'
import { useLayouts } from './hooks/useLayouts'
import TitleBar from './components/TitleBar'
import SettingsPage from './pages/SettingsPage'
import UpdateNotice from './components/UpdateNotice'
import ReportIssueDialog from './components/ReportIssueDialog'
import { useReportStore } from './store/reportStore'
import NavBar, { type View } from './components/NavBar'
import Readings from './pages/Readings'
import Draw from './pages/Draw'
import DeckBuilder from './pages/DeckBuilder'
import Layouts from './pages/Layouts'

// Scrollbar accent per theme, pushed onto :root as CSS variables (see main.css).
const scrollbarColors: Record<ThemeName, { thumb: string; thumbHover: string; track: string }> = {
  hybrasyl: {
    thumb: 'rgba(58,158,144,0.5)',
    thumbHover: 'rgba(58,158,144,0.8)',
    track: 'rgba(6,12,18,0.4)'
  },
  chadul: {
    thumb: 'rgba(46,122,58,0.5)',
    thumbHover: 'rgba(46,122,58,0.8)',
    track: 'rgba(4,14,6,0.4)'
  },
  danaan: {
    thumb: 'rgba(184,146,42,0.5)',
    thumbHover: 'rgba(184,146,42,0.8)',
    track: 'rgba(200,180,120,0.3)'
  },
  grinneal: {
    thumb: 'rgba(106,122,80,0.5)',
    thumbHover: 'rgba(106,122,80,0.8)',
    track: 'rgba(22,18,14,0.4)'
  },
  mundanes: {
    thumb: 'rgba(25,118,210,0.5)',
    thumbHover: 'rgba(25,118,210,0.8)',
    track: 'rgba(201,205,212,0.4)'
  },
  dubhaimid: {
    thumb: 'rgba(92,139,196,0.5)',
    thumbHover: 'rgba(92,139,196,0.8)',
    track: 'rgba(30,30,30,0.4)'
  }
}

function App(): React.JSX.Element {
  const themeName = useSettingsStore((s) => s.theme)
  const hydrated = useSettingsStore((s) => s.hydrated)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const [view, setView] = useState<View>('readings')
  // Lifted so the Draw tab can select the reading it produces when it hands off
  // to the Readings tab.
  const [selectedReadingId, setSelectedReadingId] = useState<string | null>(null)
  const decksApi = useDecks()
  const layoutsApi = useLayouts()
  const reportOpen = useReportStore((s) => s.open)
  const setReportOpen = useReportStore((s) => s.setOpen)

  // Hydrate every store once at startup, so pages no longer reload from disk
  // when they remount on a tab switch. Once settings land (theme is known), tell
  // main to reveal the window — the first visible frame is already themed.
  useEffect(() => {
    useSettingsStore
      .getState()
      .hydrate()
      .finally(() => window.api.appReady())
    void useReadingsStore.getState().hydrate()
    void useDecksStore.getState().hydrate()
    void useLayoutsStore.getState().hydrate()
  }, [])

  // Keep the themed scrollbar CSS variables in sync with the active theme.
  useEffect(() => {
    const colors = scrollbarColors[themeName] ?? scrollbarColors.hybrasyl
    const root = document.documentElement
    root.style.setProperty('--scrollbar-thumb', colors.thumb)
    root.style.setProperty('--scrollbar-thumb-hover', colors.thumbHover)
    root.style.setProperty('--scrollbar-track', colors.track)
  }, [themeName])

  const changeTheme = (name: ThemeName): void => setTheme(name)

  const theme = themesByName[themeName] ?? hybrasylTheme

  // Gate first paint on settings hydration so the app never flashes the default
  // theme. In practice the window stays hidden until app:ready fires (just after
  // this resolves), so this spinner is a backstop rather than a visible state.
  if (!hydrated) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box
          data-testid="app-hydrating"
          sx={{
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'background.default'
          }}
        >
          <CircularProgress />
        </Box>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        data-testid="app-root"
        data-theme={themeName}
        sx={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.default'
        }}
      >
        <TitleBar themeName={themeName} />
        <NavBar view={view} onChange={setView} />

        {view === 'readings' && (
          <Readings
            decks={decksApi.decks}
            layouts={layoutsApi.layouts}
            selectedId={selectedReadingId}
            onSelectId={setSelectedReadingId}
            onGoToDraw={() => setView('draw')}
          />
        )}
        {view === 'draw' && (
          <Draw
            decks={decksApi.decks}
            layouts={layoutsApi.layouts}
            onDone={(id) => {
              setSelectedReadingId(id)
              setView('readings')
            }}
          />
        )}
        {view === 'decks' && <DeckBuilder api={decksApi} />}
        {view === 'layouts' && <Layouts api={layoutsApi} />}
        {view === 'settings' && (
          <SettingsPage
            theme={themeName}
            onThemeChange={changeTheme}
            decks={decksApi.decks}
            layouts={layoutsApi.layouts}
          />
        )}

        {/* The update-check module's notice. It checks once, 10 s after it
            mounts, and shows only a newer version that the user did not close. */}
        <UpdateNotice />
        {/* Mounted here rather than in the About card because it has two
            openers: that button, and the error boundary's own copy. */}
        <ReportIssueDialog open={reportOpen} onClose={() => setReportOpen(false)} />
      </Box>
    </ThemeProvider>
  )
}

export default App
