import { Box, type SxProps, type Theme } from '@mui/material'
import type { Orientation } from '../../../shared/types'

export const CARD_W = 150
export const CARD_H = 240

interface DrawCardProps {
  /** When true the card shows its face; otherwise its back. */
  flipped: boolean
  /** Card face art URL, if the deck card has an image. */
  faceUrl?: string
  /** Card display name — shown on the face when there is no art. */
  name?: string
  orientation?: Orientation
  /** Card-back art URL, if the deck defines one. */
  backUrl?: string
  onClick?: () => void
  /** Dim + disable (e.g. a fan card already picked). */
  spent?: boolean
  /** Highlight (e.g. the slot awaiting a pick). */
  highlight?: boolean
  /** Override the card dimensions (defaults to CARD_W × CARD_H). */
  width?: number
  height?: number
  sx?: SxProps<Theme>
}

/**
 * A single tarot card that flips between its back and face in 3D. Used for both
 * the dealt slots and the fanned pick pile. The face shows the deck's art when
 * available, falling back to the card name; a reversed card renders rotated 180°.
 */
export default function DrawCard({
  flipped,
  faceUrl,
  name,
  orientation,
  backUrl,
  onClick,
  spent,
  highlight,
  width = CARD_W,
  height = CARD_H,
  sx
}: DrawCardProps) {
  const nameFontSize = width < 80 ? '0.5rem' : '0.68rem'
  const faceContent = faceUrl ? (
    <Box
      component="img"
      src={faceUrl}
      alt={name ?? ''}
      sx={{
        width: '100%',
        height: '100%',
        // `contain` so no card art is cropped, even when the scan's aspect ratio
        // differs from the card box (e.g. RWS is narrower than 5:8).
        objectFit: 'contain',
        transform: orientation === 'reversed' ? 'rotate(180deg)' : 'none'
      }}
    />
  ) : (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        p: 0.5,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        fontSize: nameFontSize,
        lineHeight: 1.15,
        bgcolor: 'background.paper',
        color: 'text.primary',
        transform: orientation === 'reversed' ? 'rotate(180deg)' : 'none'
      }}
    >
      {name}
    </Box>
  )

  return (
    <Box
      onClick={spent ? undefined : onClick}
      sx={{
        width,
        height,
        flexShrink: 0,
        perspective: '700px',
        cursor: onClick && !spent ? 'pointer' : 'default',
        opacity: spent ? 0.35 : 1,
        transition: 'opacity 0.3s, box-shadow 0.2s, transform 0.15s',
        borderRadius: 1.5,
        // The ring takes currentColor. primary.main reads at 3:1 and more on
        // the page in every theme; secondary.light does not (HTOO-572).
        boxShadow: highlight ? '0 0 0 2px' : 0,
        color: highlight ? 'primary.main' : undefined,
        '&:hover': onClick && !spent ? { transform: 'translateY(-4px)' } : undefined,
        ...sx
      }}
    >
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          height: '100%',
          transition: 'transform 0.5s',
          transformStyle: 'preserve-3d',
          transform: flipped ? 'rotateY(180deg)' : 'none'
        }}
      >
        {/* Back (shown when not flipped). Center-based radial so an overlapped
            sliver looks identical on every card (a directional gradient would
            make adjacent slivers land on different phases and appear to
            alternate light/dark). */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            borderRadius: 1.5,
            overflow: 'hidden',
            border: 1,
            borderColor: 'divider',
            ...(backUrl
              ? {}
              : {
                  background:
                    'radial-gradient(circle at 50% 42%, #263a64 0%, #182a52 55%, #101a38 100%)',
                  boxShadow: 'inset 0 0 0 3px rgba(240,230,204,0.12)'
                })
          }}
        >
          {backUrl && (
            <Box
              component="img"
              src={backUrl}
              alt=""
              sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
        </Box>

        {/* Face (shown when flipped) */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            borderRadius: 1.5,
            overflow: 'hidden',
            border: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper'
          }}
        >
          {faceContent}
        </Box>
      </Box>
    </Box>
  )
}
