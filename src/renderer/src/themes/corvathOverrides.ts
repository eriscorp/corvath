import type { Components, Theme } from '@mui/material/styles'

/**
 * The component overrides that corvath adds to each of the six house themes.
 * The template does not have them. Each theme file is the template's file, plus
 * one spread of this object at the start of its `components` (midir's form,
 * HTOO-572). Keep them in this one file, so that the next port of the
 * template's palettes is a copy of the six theme files and the spread line.
 *
 * - `MuiAlert`: a FILLED alert (the update notice, the toasts on Readings and
 *   Decks) sets its text colour for its fill, and its action button, close
 *   button and icon take `color="inherit"` to match. The house themes' MuiButton,
 *   MuiLink and MuiSvgIcon overrides give each of those an accent of its own,
 *   and that beat the inherit: "View release" and the close X drew the theme's
 *   teal on the teal fill (1.59:1 in hybrasyl, 1.11:1 for grinneal's X). This
 *   gives the alert's contents the alert's colour again. The fault is in the
 *   template's themes, not in the update-check module, and is reported on
 *   HTOO-572; delete this override when the template takes a fix.
 *
 * - `MuiButtonBase`: the same fault in a CONTAINED button. Its icon took the
 *   MuiSvgIcon accent, not the button's label colour: danaan's dark-gold icon
 *   on its gold fill is 1.34:1 ("Draw a reading", "New deck"). The rule sits on
 *   ButtonBase because a theme's own `MuiButton` key would replace a spread
 *   one. Also reported on HTOO-572.
 *
 * None of them uses `primary.main`, so the palette tests are not affected.
 * `corvathOverrides.test.ts` makes sure that each theme carries them, and
 * `filledControls.test.tsx` renders the notice, a toast and a contained button
 * in each theme.
 */
export const corvathOverrides: Components<Omit<Theme, 'components'>> = {
  MuiAlert: {
    styleOverrides: {
      root: {
        variants: [
          {
            props: { variant: 'filled' },
            style: {
              // Two classes and an element: more specific than one theme class
              // (`.MuiButton-root`) and than a link's `:visited` rule.
              '& .MuiAlert-icon, & .MuiAlert-action, & .MuiSvgIcon-root, & .MuiButtonBase-root, & a, & a:visited':
                { color: 'inherit' }
            }
          }
        ]
      }
    }
  },
  MuiButtonBase: {
    styleOverrides: {
      root: {
        // Two classes and an element, as above: more specific than the
        // theme's one-class MuiSvgIcon rule.
        '&.MuiButton-contained .MuiSvgIcon-root': { color: 'inherit' }
      }
    }
  }
}
