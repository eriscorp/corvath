/**
 * The style constants every Settings card uses.
 *
 * Extracted on the FIRST card rather than the fifth, deliberately. Balor pulled
 * this module out only after five copies had already drifted and one of them had
 * repeated a real bug (HTOO-271), and its own note says to copy it early. There
 * are three cards here today; the settings roster in `00a-backlog.md` is where the
 * rest arrive from.
 */

export const cardSx = {
  p: 3,
  display: 'flex',
  flexDirection: 'column',
  height: '100%'
} as const

/**
 * `text.button`, the house heading colour (the template's card vocabulary, and
 * midir's). The palette test holds it at 4.5:1 on the page and on paper in all
 * six themes (HTOO-572). Each card heading is `variant="h6"`, as midir's are.
 *
 * Corvath used `text.primary` here until the canonical palettes landed, for two
 * reasons that no longer hold. Corvath had no `augmentation.ts`, so no theme
 * defined the extended tokens, and balor's `text.headline` resolved to nothing.
 * And in the old palettes `text.button` was the colour of text ON a filled
 * button, so Mundanes set it to white, which a light Paper hides (HTOO-271).
 * The canonical palettes define every token, and give `text.button` one job:
 * headings on the page and on cards. Mundanes' is `#1a1a1a`. The bars use
 * `secondary.contrastText` instead.
 */
export const cardHeadingSx = { color: 'text.button', fontWeight: 'bold' } as const

export const cardDescSx = { color: 'text.secondary', mb: 2 } as const
