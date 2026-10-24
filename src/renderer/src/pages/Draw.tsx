import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import {
  Box,
  Button,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from '@mui/material'
import CasinoOutlinedIcon from '@mui/icons-material/CasinoOutlined'
import ReplayIcon from '@mui/icons-material/Replay'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import type { Deck, DeckSource, DrawMode, Layout } from '../../../shared/types'
import {
  assembleReading,
  dealForCount,
  dealForLayout,
  drawPool,
  makeSeed,
  planFan,
  type DrawnCard
} from '../lib/draw'
import { useReadings } from '../hooks/useReadings'
import { useSettingsStore } from '../store/settingsStore'
import { resolveDefault } from '../lib/settingsFields'
import DrawCard, { CARD_W } from '../components/DrawCard'
import CardPreview, { type PreviewCard } from '../components/CardPreview'

interface DrawProps {
  decks: Deck[]
  layouts: Layout[]
  /** Called with the new reading's id once a draw is saved. */
  onDone: (readingId: string) => void
}

type Structure = 'spread' | 'free'

interface Slot {
  name: string
  positionId?: string
  /** Set when the layout pins this slot to the top or bottom of the deck. */
  source?: DeckSource
}

/** Frozen at shuffle time so tweaking the setup can't disturb an in-progress draw. */
interface Session {
  deck: Deck
  layout: Layout | null
  mode: DrawMode
  seed: number
  slots: Slot[]
  /** Deal mode: the cards already assigned, in slot order. */
  dealt: DrawnCard[]
  /** Fan mode: the full shuffled deck the user picks from. */
  fan: DrawnCard[]
  /** Fan mode: slot index -> fan index, for slots the layout pins to an end. */
  pinned: Record<number, number>
}

const today = (): string => new Date().toISOString().slice(0, 10)
const DEAL_INTERVAL_MS = 480

/** Fan cards this size so more fit per row; the tray uses the larger default. */
const FAN_W = 88
const FAN_H = 132
const MIN_FAN_STEP = 16

/** Split a list into `rows` roughly equal chunks (row-major order preserved). */
function chunkRows<T>(arr: T[], rows: number): T[][] {
  const perRow = Math.ceil(arr.length / rows)
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += perRow) out.push(arr.slice(i, i + perRow))
  return out
}

export default function Draw({ decks, layouts, onDone }: DrawProps): ReactElement {
  const { addReading } = useReadings()

  // The Settings tab's draw defaults, read ONCE as lazy initial state. The
  // component remounts whenever the Draw tab is entered, so that is enough — and
  // it is also what keeps a default from yanking the picker out from under a draw
  // the user is in the middle of setting up.
  //
  // `resolveDefault` is what makes a deleted deck or spread harmless: a dangling
  // id reads as "no default" and falls back to the first, rather than leaving an
  // empty picker with a stale id behind it.
  const defaultDeckId = useSettingsStore((s) => s.defaultDeckId)
  const defaultLayoutId = useSettingsStore((s) => s.defaultLayoutId)
  const defaultDrawMode = useSettingsStore((s) => s.defaultDrawMode)

  const [title, setTitle] = useState('Corvath Reading')
  const [date, setDate] = useState(today)
  const [deckName, setDeckName] = useState(
    () => (resolveDefault(decks, defaultDeckId) ?? decks[0])?.name ?? ''
  )
  const [structure, setStructure] = useState<Structure>(() => (layouts.length ? 'spread' : 'free'))
  const [layoutId, setLayoutId] = useState(
    () => (resolveDefault(layouts, defaultLayoutId) ?? layouts[0])?.id ?? ''
  )
  const [count, setCount] = useState(3)
  const [mode, setMode] = useState<DrawMode>(() => defaultDrawMode ?? 'deal')

  const [session, setSession] = useState<Session | null>(null)
  const [revealed, setRevealed] = useState(0)
  /** Fan mode, keyed by slot index — picks don't arrive in slot order once slots are pinned. */
  const [picks, setPicks] = useState<Record<number, DrawnCard>>({})
  const [used, setUsed] = useState<Set<number>>(new Set())
  const [preview, setPreview] = useState<PreviewCard | null>(null)

  const deck = useMemo(() => decks.find((d) => d.name === deckName) ?? null, [decks, deckName])
  const poolSize = deck ? drawPool(deck).length : 0
  const layout = useMemo(() => layouts.find((l) => l.id === layoutId) ?? null, [layouts, layoutId])

  const spreadSlots = layout?.positions.length ?? 0
  const clampedCount = Math.max(1, Math.min(count, poolSize || 1))
  const slotCount = structure === 'spread' ? spreadSlots : clampedCount

  const setupError = !deck
    ? 'Pick a deck.'
    : poolSize === 0
      ? 'This deck has no cards to draw.'
      : structure === 'spread' && !layout
        ? 'Pick a spread.'
        : slotCount > poolSize
          ? `This spread needs ${slotCount} cards but the deck only has ${poolSize}.`
          : null

  // Deal mode: progressively flip slots after a session starts.
  const revealTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (!session || session.mode !== 'deal') return
    revealTimer.current = setInterval(() => {
      setRevealed((r) => {
        if (r >= session.slots.length) {
          if (revealTimer.current) clearInterval(revealTimer.current)
          return r
        }
        return r + 1
      })
    }, DEAL_INTERVAL_MS)
    return () => {
      if (revealTimer.current) clearInterval(revealTimer.current)
    }
  }, [session])

  // Measure the fan board so each row can be overlapped to fit without scrolling.
  const fanRef = useRef<HTMLDivElement>(null)
  const [fanWidth, setFanWidth] = useState(0)
  useEffect(() => {
    const el = fanRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => setFanWidth(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [session])

  const faceUrl = (card: DrawnCard): string | undefined => {
    if (!session) return undefined
    const def = session.deck.cards.find((c) => c.id === card.cardId)
    return def?.image ? window.api.decks.imageUrl(session.deck.id, def.image) : undefined
  }
  const backUrl = session?.deck.back
    ? window.api.decks.imageUrl(session.deck.id, session.deck.back)
    : undefined

  const openPreview = (card: DrawnCard): void => {
    const def = session?.deck.cards.find((c) => c.id === card.cardId)
    const meaning = def
      ? card.orientation === 'reversed'
        ? def.meaningReversed || def.meaning
        : def.meaning
      : undefined
    setPreview({
      name: card.name,
      artUrl: faceUrl(card),
      orientation: card.orientation,
      keywords: def?.keywords,
      meaning
    })
  }

  const startDraw = (): void => {
    if (!deck || setupError) return
    const seed = makeSeed()
    const activeLayout = structure === 'spread' ? layout : null
    const slots: Slot[] = activeLayout
      ? activeLayout.positions.map((p) => ({ name: p.name, positionId: p.id, source: p.source }))
      : Array.from({ length: clampedCount }, (_, i) => ({ name: `Card ${i + 1}` }))
    const { fan, pinned } = planFan(deck, activeLayout, seed)
    setSession({
      deck,
      layout: activeLayout,
      mode,
      seed,
      slots,
      dealt: activeLayout
        ? dealForLayout(deck, activeLayout, seed)
        : dealForCount(deck, clampedCount, seed),
      fan,
      pinned
    })
    setRevealed(0)
    // Pinned slots are decided by the shuffle, not the user — fill them up front
    // and spend their cards so they can't also be picked out of the fan.
    setPicks(
      Object.fromEntries(Object.entries(pinned).map(([slot, fanIndex]) => [slot, fan[fanIndex]]))
    )
    setUsed(new Set(Object.values(pinned)))
  }

  /** The slot the next fan pick fills: the lowest unpinned, unfilled one. */
  const nextSlot = useMemo(() => {
    if (!session) return undefined
    const i = session.slots.findIndex((_s, idx) => !(idx in session.pinned) && !(idx in picks))
    return i === -1 ? undefined : i
  }, [session, picks])

  const pickFanCard = (index: number): void => {
    if (!session || used.has(index) || nextSlot === undefined) return
    setPicks((p) => ({ ...p, [nextSlot]: session.fan[index] }))
    setUsed((u) => new Set(u).add(index))
  }

  const drawnCount = session
    ? session.mode === 'deal'
      ? Math.min(revealed, session.slots.length)
      : Object.keys(picks).length
    : 0
  const complete = session != null && drawnCount >= session.slots.length

  // The fan prompt counts only the slots actually up to the user.
  const pinnedCount = session ? Object.keys(session.pinned).length : 0
  const freeSlots = session ? session.slots.length - pinnedCount : 0
  const pickedFree = Object.keys(picks).length - pinnedCount

  const handleSave = (): void => {
    if (!session || !complete) return
    const reading = assembleReading({
      deck: session.deck,
      title,
      date,
      drawMode: session.mode,
      seed: session.seed,
      layout: session.layout,
      drawn: session.mode === 'deal' ? session.dealt : session.slots.map((_s, i) => picks[i])
    })
    addReading(reading)
    onDone(reading.id)
  }

  // ---- Slot tray, shared by both modes ----
  const renderTray = (): ReactElement => {
    if (!session) return <></>
    const assignedFor = (i: number): DrawnCard | undefined =>
      session.mode === 'deal' ? (i < revealed ? session.dealt[i] : undefined) : picks[i]
    const isCurrent = (i: number): boolean => session.mode === 'fan' && i === nextSlot

    return (
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2.5,
          justifyContent: 'center',
          alignItems: 'flex-start'
        }}
      >
        {session.slots.map((slot, i) => {
          const card = assignedFor(i)
          return (
            <Stack
              key={i}
              // E2E hooks: the tray is otherwise anonymous divs, and whether a
              // slot has been filled is only expressed as a 3D transform.
              data-testid="draw-slot"
              data-slot-index={i}
              data-flipped={!!card}
              data-card-name={card?.name ?? ''}
              spacing={0.75}
              sx={{ width: CARD_W + 24, alignItems: 'center' }}
            >
              <DrawCard
                flipped={!!card}
                faceUrl={card ? faceUrl(card) : undefined}
                name={card?.name}
                orientation={card?.orientation}
                backUrl={backUrl}
                highlight={isCurrent(i)}
                onClick={card ? () => openPreview(card) : undefined}
              />
              <Typography
                variant="caption"
                sx={{ textAlign: 'center', lineHeight: 1.15, opacity: 0.85 }}
              >
                {slot.name}
              </Typography>
              {session.mode === 'fan' && slot.source && (
                <Typography
                  variant="caption"
                  sx={{ textAlign: 'center', lineHeight: 1.1, opacity: 0.6 }}
                >
                  {slot.source === 'bottom' ? 'from the bottom' : 'from the top'}
                </Typography>
              )}
              {card && (
                <Typography variant="caption" sx={{ textAlign: 'center', lineHeight: 1.1 }}>
                  {card.name}
                  {/* primary.main, not secondary: secondary is a fill only, and
                      secondary.light is 1.2:1 on danaan's page (HTOO-572). */}
                  {card.orientation === 'reversed' && (
                    <Box component="span" sx={{ color: 'primary.main' }}>
                      {' '}
                      (rev)
                    </Box>
                  )}
                </Typography>
              )}
            </Stack>
          )
        })}
      </Box>
    )
  }

  // ---- Fan pick pile: 1–3 overlapping rows sized to fit the board width ----
  const renderFan = (): ReactElement => {
    if (!session) return <></>
    const n = session.fan.length
    const rows = n <= 14 ? 1 : n <= 40 ? 2 : 3
    const indexRows = chunkRows(
      session.fan.map((_, i) => i),
      rows
    )
    const avail = fanWidth || 900

    return (
      <Box ref={fanRef} sx={{ width: '100%' }}>
        {indexRows.map((row, r) => {
          // Overlap so a full row spans `avail` without horizontal scroll.
          const step =
            row.length > 1
              ? Math.max(MIN_FAN_STEP, Math.min(FAN_W + 12, (avail - FAN_W) / (row.length - 1)))
              : 0
          return (
            <Box
              key={r}
              data-testid="fan-row"
              data-row-step={step}
              sx={{ display: 'flex', justifyContent: 'center', mb: r < rows - 1 ? 1.5 : 0 }}
            >
              {row.map((gi, ci) => (
                <Box
                  key={gi}
                  // A fan card carries no text, role or index of its own, and
                  // `spent` is only an opacity — so a spec has nothing to grip.
                  data-testid="fan-card"
                  data-fan-index={gi}
                  data-spent={used.has(gi)}
                  sx={{
                    ml: ci === 0 ? 0 : `${step - FAN_W}px`,
                    position: 'relative',
                    transition: 'transform 0.12s',
                    '&:hover': { zIndex: 5 }
                  }}
                >
                  <DrawCard
                    flipped={false}
                    backUrl={backUrl}
                    spent={used.has(gi)}
                    width={FAN_W}
                    height={FAN_H}
                    onClick={() => pickFanCard(gi)}
                  />
                </Box>
              ))}
            </Box>
          )
        })}
      </Box>
    )
  }

  const renderSetup = (): ReactElement => (
    <Stack spacing={2.5} sx={{ maxWidth: 1100, mx: 'auto', width: '100%' }}>
      <Typography variant="h5">Draw a Reading</Typography>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <TextField
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          sx={{ flex: '1 1 240px' }}
        />
        <TextField
          label="Date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ flex: '1 1 160px' }}
        />
      </Box>

      <FormControl fullWidth>
        <InputLabel id="draw-deck-label">Deck</InputLabel>
        <Select
          labelId="draw-deck-label"
          label="Deck"
          value={deckName}
          onChange={(e) => setDeckName(e.target.value)}
        >
          {decks.map((d) => (
            <MenuItem key={d.id} value={d.name}>
              {d.name} · {drawPool(d).length} cards
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Box>
        <RadioGroup
          row
          value={structure}
          onChange={(e) => setStructure(e.target.value as Structure)}
        >
          <FormControlLabel
            value="spread"
            control={<Radio />}
            label="Use a spread"
            disabled={layouts.length === 0}
          />
          <FormControlLabel value="free" control={<Radio />} label="Just draw N cards" />
        </RadioGroup>

        {structure === 'spread' ? (
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel id="draw-spread-label">Spread</InputLabel>
            <Select
              labelId="draw-spread-label"
              label="Spread"
              value={layoutId}
              onChange={(e) => setLayoutId(e.target.value)}
            >
              {layouts.map((l) => (
                <MenuItem key={l.id} value={l.id}>
                  {l.name} · {l.positions.length} cards
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : (
          <TextField
            label="Number of cards"
            type="number"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            slotProps={{ htmlInput: { min: 1, max: poolSize || 1 } }}
            sx={{ mt: 1, width: 180 }}
          />
        )}
      </Box>

      <Box>
        <Typography variant="caption" sx={{ opacity: 0.7 }}>
          How to draw
        </Typography>
        <ToggleButtonGroup
          exclusive
          fullWidth
          value={mode}
          onChange={(_e, v: DrawMode | null) => v && setMode(v)}
          size="small"
          sx={{ mt: 0.5 }}
        >
          {/* The `deal`/`fan` values never reach the DOM, so a spec cannot
              assert which mode is selected without these. */}
          <ToggleButton value="deal" data-testid="draw-mode-deal">
            Deal from top
          </ToggleButton>
          <ToggleButton value="fan" data-testid="draw-mode-fan">
            Fan &amp; pick
          </ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="caption" sx={{ display: 'block', mt: 0.75, opacity: 0.6 }}>
          {mode === 'deal'
            ? 'Shuffles, then deals a card into each slot (honoring any top/bottom slots).'
            : 'Shuffles and fans the deck face-down — pick one card for each slot. Slots pinned to the top or bottom of the deck are filled for you.'}
        </Typography>
      </Box>

      {setupError && (
        <Typography variant="body2" color="error">
          {setupError}
        </Typography>
      )}

      <Button
        variant="contained"
        size="large"
        startIcon={<CasinoOutlinedIcon />}
        disabled={!!setupError}
        onClick={startDraw}
        sx={{ alignSelf: 'flex-start' }}
      >
        Shuffle &amp; Draw
      </Button>
    </Stack>
  )

  const renderDraw = (): ReactElement => {
    if (!session) return <></>
    return (
      <Stack spacing={3} sx={{ width: '100%' }}>
        <Box>
          <Typography variant="h5" sx={{ textAlign: 'center' }}>
            {session.layout ? session.layout.name : `${session.slots.length}-Card Draw`}
          </Typography>
          <Typography variant="body2" sx={{ textAlign: 'center', opacity: 0.7 }}>
            {session.deck.name} ·{' '}
            {session.mode === 'deal' ? 'dealt from the top' : 'fanned & picked'}
          </Typography>
        </Box>

        {renderTray()}

        {session.mode === 'fan' && !complete && nextSlot !== undefined && (
          <>
            <Divider />
            <Typography variant="body1" sx={{ textAlign: 'center' }}>
              Pick a card for <strong>{session.slots[nextSlot].name}</strong>{' '}
              <Box component="span" sx={{ opacity: 0.6 }}>
                ({pickedFree + 1} of {freeSlots})
              </Box>
            </Typography>
            {renderFan()}
          </>
        )}

        {session.mode === 'deal' && !complete && (
          <Typography variant="body2" sx={{ textAlign: 'center', opacity: 0.7 }}>
            Dealing…
          </Typography>
        )}

        {complete && (
          <Typography variant="body2" sx={{ textAlign: 'center', opacity: 0.7 }}>
            All cards drawn — save to record and interpret this reading.
          </Typography>
        )}
      </Stack>
    )
  }

  return (
    <Box
      data-testid="draw-page"
      sx={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
    >
      <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 3 }}>
        {session ? renderDraw() : renderSetup()}
      </Box>

      {session && (
        <Box
          sx={{
            flexShrink: 0,
            borderTop: 1,
            borderColor: 'divider',
            p: 1.5,
            display: 'flex',
            gap: 1,
            alignItems: 'center'
          }}
        >
          <Button startIcon={<ArrowBackIcon />} onClick={() => setSession(null)}>
            Back
          </Button>
          <Button startIcon={<ReplayIcon />} onClick={startDraw}>
            Reshuffle
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          <Button variant="contained" disabled={!complete} onClick={handleSave}>
            Save Reading
          </Button>
        </Box>
      )}

      <CardPreview card={preview} onClose={() => setPreview(null)} />
    </Box>
  )
}
