import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { Box } from '@mui/material'
import type { LayoutPosition } from '../../../../shared/types'
import { clamp01 } from '../../lib/layout'

/** The drawn card's art for a position, as resolved by the caller. */
export interface PositionArt {
  url: string
  reversed?: boolean
}

interface LayoutBoardProps {
  positions: LayoutPosition[]
  selectedId?: string | null
  onSelect?: (id: string) => void
  /** When provided, cards are draggable and report new normalized coords. */
  onMove?: (id: string, x: number, y: number) => void
  /** Optional secondary label under the position name (e.g. the drawn card). */
  sublabel?: (position: LayoutPosition, index: number) => string | undefined
  /**
   * Optional face art for a filled position. Only the reading view passes this —
   * the layout editor has no deck or entries to resolve art from.
   */
  art?: (position: LayoutPosition, index: number) => PositionArt | undefined
  height?: number
}

// Tiles are 2x their original 54x80 so the art is legible rather than a smudge.
//
// Size and board height are coupled, so change them together: positions are
// normalized, and the tightest vertical gap in a seeded spread is 0.22 (the
// Celtic Cross staff, y = 0.16/0.38/0.60/0.82). A tile taller than 0.22 * height
// therefore collides with the one above it — at 800 that caps CARD_H at 176.
export const CARD_W = 108
export const CARD_H = 160
export const DEFAULT_HEIGHT = 800

export default function LayoutBoard({
  positions,
  selectedId,
  onSelect,
  onMove,
  sublabel,
  art,
  height = DEFAULT_HEIGHT
}: LayoutBoardProps) {
  const boardRef = useRef<HTMLDivElement>(null)
  const dragId = useRef<string | null>(null)

  const handlePointerDown = (e: ReactPointerEvent, id: string): void => {
    onSelect?.(id)
    if (!onMove) return
    e.preventDefault()
    dragId.current = id
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: ReactPointerEvent): void => {
    if (!dragId.current || !boardRef.current) return
    const rect = boardRef.current.getBoundingClientRect()
    onMove?.(
      dragId.current,
      clamp01((e.clientX - rect.left) / rect.width),
      clamp01((e.clientY - rect.top) / rect.height)
    )
  }

  const handlePointerUp = (e: ReactPointerEvent): void => {
    if (!dragId.current) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    dragId.current = null
  }

  return (
    <Box
      ref={boardRef}
      sx={{
        position: 'relative',
        width: '100%',
        height,
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: 'background.default',
        overflow: 'hidden',
        touchAction: 'none'
      }}
    >
      {positions.map((position, index) => {
        const selected = position.id === selectedId
        const sub = sublabel?.(position, index)
        const face = art?.(position, index)
        return (
          <Box
            key={position.id}
            onPointerDown={(e) => handlePointerDown(e, position.id)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            // With art the tile is mostly image, so the names move to a tooltip.
            title={
              face ? [`${index + 1}. ${position.name}`, sub].filter(Boolean).join(' — ') : undefined
            }
            sx={{
              position: 'absolute',
              left: `${position.x * 100}%`,
              top: `${position.y * 100}%`,
              width: CARD_W,
              height: CARD_H,
              transform: `translate(-50%, -50%) rotate(${position.rotation ?? 0}deg)`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.25,
              p: 0.5,
              borderRadius: 1,
              border: 2,
              // primary.main, not secondary: secondary is a fill only (HTOO-572).
              borderColor: selected ? 'primary.main' : 'divider',
              bgcolor: 'background.paper',
              cursor: onMove ? 'grab' : onSelect ? 'pointer' : 'default',
              boxShadow: selected ? 3 : 0,
              userSelect: 'none'
            }}
          >
            {face && (
              // Fills the tile, under the ordinal badge. `contain` letterboxes
              // rather than cropping, since bundled decks vary in aspect and the
              // tile's own ratio matches none of them exactly. A reversed card
              // rotates 180° *within* the tile, so on a crossing position it
              // composes with the tile's own rotation — which is what a reversed
              // crossing card should look like.
              <Box
                component="img"
                src={face.url}
                alt=""
                onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                  // The art is decoration here; the tooltip still names the card.
                  e.currentTarget.style.display = 'none'
                }}
                sx={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  borderRadius: 0.5,
                  transform: face.reversed ? 'rotate(180deg)' : 'none'
                }}
              />
            )}
            {position.source && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 4,
                  right: 6,
                  fontSize: '1rem',
                  fontWeight: 700,
                  lineHeight: 1,
                  color: 'primary.main',
                  ...(face && {
                    color: 'common.white',
                    textShadow: '0 0 3px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.7)'
                  })
                }}
                title={position.source === 'top' ? 'Top of deck' : 'Bottom of deck'}
              >
                {position.source === 'top' ? '↑' : '↓'}
              </Box>
            )}
            <Box
              sx={{
                fontWeight: 700,
                fontSize: '1.6rem',
                lineHeight: 1,
                // Over art, the ordinal needs its own backdrop to stay readable.
                ...(face && {
                  position: 'absolute',
                  top: 3,
                  left: 6,
                  fontSize: '1rem',
                  color: 'common.white',
                  textShadow: '0 0 3px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.7)'
                })
              }}
            >
              {index + 1}
            </Box>
            {!face && (
              <Box
                sx={{
                  fontSize: '0.85rem',
                  lineHeight: 1.15,
                  textAlign: 'center',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical'
                }}
              >
                {position.name}
              </Box>
            )}
            {!face && sub && (
              <Box
                sx={{
                  fontSize: '0.78rem',
                  lineHeight: 1.15,
                  textAlign: 'center',
                  color: 'primary.main',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical'
                }}
              >
                {sub}
              </Box>
            )}
          </Box>
        )
      })}
    </Box>
  )
}
