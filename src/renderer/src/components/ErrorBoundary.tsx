import React from 'react'
import { Box, Button, Stack, Typography } from '@mui/material'
import ReportIssueDialog from './ReportIssueDialog'

/**
 * The top-level React error boundary: what replaces the white screen.
 *
 * **Mounted outside `<App>`'s `ThemeProvider`, in `main.tsx`, and that is the whole
 * point of where it sits.** A render error inside the themed tree unmounts that
 * tree, so a fallback rendered under the same provider is a fallback rendered by the
 * thing that just failed. Everything below therefore renders on MUI's default theme
 * — plainer than the rest of Corvath, and reliably present.
 *
 * **The fallback carries its OWN `ReportIssueDialog` with its own local flag**, not
 * the one `App` mounts and not `reportStore`'s. By the time this renders, `App` is
 * gone; the dialog works anyway because it takes everything it shows over IPC and
 * holds no application state at all.
 *
 * `componentDidCatch` forwards to main, so a React error lands in the same session
 * log as an uncaught exception and a rejected promise. It is the third source into
 * the one scrub site, which is what makes the log safe to attach without a second
 * pass over it.
 *
 * A class component, because `getDerivedStateFromError` and `componentDidCatch`
 * have no hook equivalent. React still offers none; this is not an oversight.
 */
interface ErrorBoundaryProps {
  children: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  reportOpen: boolean
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, reportOpen: false }
  }

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    try {
      window.api?.diagnostics?.reportError({
        source: 'react',
        message: error?.message ? `${error.name || 'Error'}: ${error.message}` : String(error),
        // The component stack joins the JS stack rather than replacing it: the JS
        // stack says which function threw, the component stack says which screen the
        // user was on, and a bug report wants both.
        stack: `${error?.stack ?? ''}${info?.componentStack ? `\n${info.componentStack}` : ''}`
      })
    } catch {
      /* best effort — reporting a crash must not raise a second one */
    }
  }

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children

    return (
      <Box
        data-testid="error-boundary-fallback"
        sx={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          p: 4,
          textAlign: 'center'
        }}
      >
        <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
          Something went wrong.
        </Typography>
        {/* Names what is safe, because the next thing this person does is decide
            whether to close Corvath. A screen error does not reach the data files:
            the renderer only asks main to save, and main writes each file whole (a
            .tmp file, then a rename, with a .bak copy kept). An edit goes to main
            200 ms after the last keystroke, and Reload sends an edit that is still
            waiting (the beforeunload flush in store/persist.ts). */}
        <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 520 }}>
          Corvath hit an unexpected error and could not draw this screen. Your saved readings, decks
          and spreads are safe. Report what happened, or reload and carry on.
        </Typography>
        <Stack direction="row" sx={{ gap: 2, mt: 1 }}>
          <Button variant="contained" onClick={() => this.setState({ reportOpen: true })}>
            Report an issue
          </Button>
          <Button variant="outlined" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </Stack>
        <ReportIssueDialog
          open={this.state.reportOpen}
          onClose={() => this.setState({ reportOpen: false })}
        />
      </Box>
    )
  }
}

export default ErrorBoundary
