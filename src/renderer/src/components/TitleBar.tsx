import { useEffect, useState } from 'react'
import { AppBar, Box, IconButton, Toolbar, Tooltip, Typography } from '@mui/material'
import MinimizeIcon from '@mui/icons-material/Minimize'
import CropSquareIcon from '@mui/icons-material/CropSquare'
import FilterNoneIcon from '@mui/icons-material/FilterNone'
import CloseIcon from '@mui/icons-material/Close'
import { ENGRAVED_CHROME_THEMES, type ThemeName } from '../../../shared/types'
// 64px WebP for a 22px render, imported so vite fingerprints and bundles it. The
// previous `BASE_URL + 'corvath.png'` pulled the 1254px/2.36 MB master out of the
// publicDir, which also meant a second copy of it in the packaged app.
import logoUrl from '../assets/corvath.webp'

// Interactive controls must opt out of the window-drag region.
const noDrag = { WebkitAppRegion: 'no-drag' } as const

// Dark bar text (danaan's #1a1008 on its gold bar, grinneal's near-black on its
// tan one) is engraved: a thin cream edge below and right, as if cut into the
// bar. Which themes engrave is ENGRAVED_CHROME_THEMES in shared/types (HTOO-572;
// from mabon WP96 and taliesin #96). Corvath's other bars have no edge: the
// template's #000 keyline belongs to the Game-Icons chrome, which corvath
// declines (00a-backlog.md).
const ENGRAVE = '1px 1px 0 rgba(255,248,232,0.75)'

interface TitleBarProps {
  /** Selects the engraved chrome for the themes with dark bar text. */
  themeName: ThemeName
}

export default function TitleBar({ themeName }: TitleBarProps) {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void window.api.window.isMaximized().then(setMaximized)
    return window.api.window.onMaximizeChange(setMaximized)
  }, [])

  // The bar paints `secondary.main` and its text and icons take
  // `secondary.contrastText`, as in every house app: the palette test holds
  // that pair at 4.5:1 in each theme (HTOO-572). The theme's MuiAppBar fill is
  // not used, because on mundanes it is white, and the plain themes' white
  // foreground is now their contrastText.
  const engraved = ENGRAVED_CHROME_THEMES.includes(themeName)
  // Each theme's MuiSvgIcon override gives every icon an accent of its own
  // (danaan's is 1.6:1 on its gold bar), so the window icons take the bar's
  // text colour from the button instead.
  const iconSx = {
    '& .MuiSvgIcon-root': {
      color: 'inherit',
      ...(engraved && { filter: `drop-shadow(${ENGRAVE})` })
    }
  }

  // macOS draws its own stoplight buttons, inset at the bar's left edge (main's
  // `titleBarStyle: 'hiddenInset'`), and a Mac title bar carries no app name or
  // logo. There the bar is an empty drag region; a double-click on it zooms the
  // window natively (macos-chrome.md §2 in the document repo).
  const isMac = window.api.platform === 'darwin'

  return (
    <AppBar
      position="static"
      elevation={0}
      sx={{
        WebkitAppRegion: 'drag',
        userSelect: 'none',
        bgcolor: 'secondary.main',
        color: 'secondary.contrastText'
      }}
    >
      <Toolbar
        data-testid="title-bar"
        variant="dense"
        // The Toolbar's gutters are a media query (24 px from `sm` up), and an
        // `sx` padding without a breakpoint does not override it: the old
        // `px: 1.5` never applied, and Windows rendered 24 px a side (measured in
        // the built app). So `disableGutters`, and both paddings set here: 24 px
        // (3) keeps Windows as it was, and 78 px on macOS clears the stoplights,
        // which end near x = 66.
        disableGutters
        sx={{ minHeight: 40, pr: 3, pl: isMac ? '78px' : 3 }}
      >
        {!isMac && (
          <>
            <Box
              component="img"
              src={logoUrl}
              alt=""
              sx={{ width: 22, height: 22, mr: 1.5, borderRadius: '4px', display: 'block' }}
            />
            <Typography
              variant="h6"
              sx={{
                fontSize: '1rem',
                letterSpacing: '0.14em',
                color: 'secondary.contrastText',
                textShadow: engraved ? ENGRAVE : 'none'
              }}
            >
              Corvath
            </Typography>
          </>
        )}

        <Box sx={{ flexGrow: 1 }} />

        {!isMac && (
          <>
            <Tooltip title="Minimize">
              <IconButton
                size="small"
                sx={{ ...noDrag, ...iconSx, color: 'secondary.contrastText' }}
                aria-label="minimize"
                onClick={() => window.api.window.minimize()}
              >
                <MinimizeIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={maximized ? 'Restore' : 'Maximize'}>
              <IconButton
                size="small"
                sx={{ ...noDrag, ...iconSx, color: 'secondary.contrastText' }}
                aria-label="maximize"
                onClick={() => window.api.window.toggleMaximize()}
              >
                {maximized ? (
                  <FilterNoneIcon fontSize="small" />
                ) : (
                  <CropSquareIcon fontSize="small" />
                )}
              </IconButton>
            </Tooltip>
            <Tooltip title="Close">
              <IconButton
                size="small"
                sx={{
                  ...noDrag,
                  ...iconSx,
                  color: 'secondary.contrastText',
                  '&:hover': { bgcolor: 'error.main', color: 'common.white' }
                }}
                aria-label="close"
                onClick={() => window.api.window.close()}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        )}
      </Toolbar>
    </AppBar>
  )
}
