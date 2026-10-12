import { Box, Chip, Dialog, DialogContent, Stack, Typography } from '@mui/material'
import type { Orientation } from '../../../shared/types'

export interface PreviewCard {
  name: string
  artUrl?: string
  orientation?: Orientation
  keywords?: string[]
  meaning?: string
}

interface CardPreviewProps {
  /** The card to show, or null when closed. */
  card: PreviewCard | null
  onClose: () => void
}

/**
 * A blown-up view of a single card: large art (reversed cards rotated), the
 * name, orientation, keywords, and the deck meaning when available. Shown when a
 * face-up card is clicked in the draw tray or a recorded reading.
 */
export default function CardPreview({ card, onClose }: CardPreviewProps) {
  return (
    <Dialog open={!!card} onClose={onClose} maxWidth="md">
      {card && (
        <DialogContent>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={3}
            sx={{ alignItems: { xs: 'center', sm: 'flex-start' } }}
          >
            <Box
              sx={{
                flexShrink: 0,
                cursor: 'zoom-out',
                display: 'flex',
                justifyContent: 'center'
              }}
              onClick={onClose}
            >
              {card.artUrl ? (
                <Box
                  component="img"
                  src={card.artUrl}
                  alt={card.name}
                  sx={{
                    maxHeight: '68vh',
                    maxWidth: 'min(48vw, 380px)',
                    objectFit: 'contain',
                    borderRadius: 1.5,
                    boxShadow: 4,
                    transform: card.orientation === 'reversed' ? 'rotate(180deg)' : 'none'
                  }}
                />
              ) : (
                <Box
                  sx={{
                    width: 240,
                    height: 384,
                    borderRadius: 1.5,
                    border: 1,
                    borderColor: 'divider',
                    bgcolor: 'background.default',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    p: 2,
                    textAlign: 'center'
                  }}
                >
                  <Typography variant="h6">{card.name}</Typography>
                </Box>
              )}
            </Box>

            <Stack spacing={1.5} sx={{ minWidth: 220, maxWidth: 340, pt: 1 }}>
              <Box>
                <Typography variant="h5">{card.name}</Typography>
                {/* A reversed card is a FILLED secondary chip. Outlined, it drew
                    the bar colour as text on the page, which most themes cannot
                    read (corvathChips.test.tsx, HTOO-572). */}
                {card.orientation && (
                  <Chip
                    label={card.orientation}
                    size="small"
                    color={card.orientation === 'reversed' ? 'secondary' : 'default'}
                    variant={card.orientation === 'reversed' ? 'filled' : 'outlined'}
                    sx={{ mt: 0.5, textTransform: 'capitalize' }}
                  />
                )}
              </Box>

              {card.keywords && card.keywords.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {card.keywords.map((kw) => (
                    <Chip key={kw} label={kw} size="small" />
                  ))}
                </Box>
              )}

              {card.meaning ? (
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {card.meaning}
                </Typography>
              ) : (
                <Typography variant="body2" sx={{ opacity: 0.6 }}>
                  No meaning set for this card in the deck.
                </Typography>
              )}
            </Stack>
          </Stack>
        </DialogContent>
      )}
    </Dialog>
  )
}
