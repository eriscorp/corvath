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
import AppTitleBar from './components/AppTitleBar'
import SettingsPage from './pages/SettingsPage'
import UpdateNotice from './components/UpdateNotice'
import ReportIssueDialog from './components/ReportIssueDialog'
import { useReportStore } from './store/reportStore'
import { useViewStore } from './store/viewStore'
import { useAppMenu } from './lib/appMenu'
import NavBar from './components/NavBar'
import Readings from './pages/Readings'
import Draw from './pages/Draw'
import DeckBuilder from './pages/DeckBuilder'
import Layouts from './pages/Layouts'

function App(): React.JSX.Element {
  const themeName = useSettingsStore((s) => s.theme)
  const hydrated = useSettingsStore((s) => s.hydrated)
  const setTheme = useSettingsStore((s) => s.setTheme)
  // In a store, not here: the macOS menu switches pages too (viewStore.ts).
  const view = useViewStore((s) => s.view)
  const setView = useViewStore((s) => s.setView)
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

  // The macOS application menu: run its commands and report what it greys out,
  // once settings have hydrated. Does nothing off macOS.
  useAppMenu(hydrated)

  const changeTheme = (name: ThemeName): void => setTheme(name)

  const theme = themesByName[themeName] ?? hybrasylTheme

  // Push the theme's scrollbar colours onto :root as CSS variables, so the
  // scrollbars follow the active theme (main.css uses them). The colours are in
  // each theme's palette, as in the template (HTOO-572).
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--scrollbar-thumb', theme.palette.background.scrollbarDark)
    root.style.setProperty('--scrollbar-thumb-hover', theme.palette.background.scrollbarLight)
    root.style.setProperty('--scrollbar-track', theme.palette.background.paperDark)
  }, [theme])

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
        <AppTitleBar />
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
