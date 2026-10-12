import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Deck, Layout, Reading } from '../../../../shared/types'
import ReadingEditor from '../ReadingEditor'

/**
 * The layout-apply guard, HTOO-409's second half.
 *
 * It was a `window.confirm` — unstyled OS chrome in a frameless, six-theme app,
 * and blocking. Replacing it changed the control flow rather than the styling:
 * `window.confirm` allowed a synchronous early return, and a real dialog cannot,
 * so the chosen layout is parked in state and applied from the dialog's callback.
 * **That rewrite is the risk these tests cover** — the guard itself already
 * existed.
 */
const LAYOUTS: Layout[] = [
  {
    id: 'l1',
    name: 'Celtic Cross',
    positions: [],
    createdAt: 'now',
    updatedAt: 'now'
  } as unknown as Layout
]

const reading = (entries: Reading['entries']): Reading => ({
  id: 'r1',
  title: 'T',
  date: '2026-08-14',
  deck: 'Rider-Waite-Smith',
  entries,
  createdAt: 'now',
  updatedAt: 'now'
})

const setup = (
  entries: Reading['entries']
): { onApplyLayout: ReturnType<typeof vi.fn>; user: ReturnType<typeof userEvent.setup> } => {
  const onApplyLayout = vi.fn()
  const user = userEvent.setup()
  render(
    <ReadingEditor
      reading={reading(entries)}
      decks={[]}
      layouts={LAYOUTS}
      onChange={vi.fn()}
      onApplyLayout={onApplyLayout}
      onAddEntry={vi.fn()}
      onUpdateEntry={vi.fn()}
      onDeleteEntry={vi.fn()}
    />
  )
  return { onApplyLayout, user }
}

/** The Layout field is a MUI Select; pick the one layout on offer. */
const chooseLayout = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
  const select = screen.getByRole('combobox', { name: /layout/i })
  await user.click(select)
  await user.click(await screen.findByRole('option', { name: /celtic cross/i }))
}

const filled: Reading['entries'] = [
  { id: 'e1', topic: 'Work', question: 'What now?', card: 'The Fool' } as Reading['entries'][number]
]

describe('applying a layout over an existing reading', () => {
  it('asks first when the reading already has content', async () => {
    const { onApplyLayout, user } = setup(filled)
    await chooseLayout(user)
    expect(onApplyLayout).not.toHaveBeenCalled()
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
  })

  it('does not apply when cancelled', async () => {
    const { onApplyLayout, user } = setup(filled)
    await chooseLayout(user)
    await user.click(screen.getByTestId('confirm-cancel'))
    expect(onApplyLayout).not.toHaveBeenCalled()
  })

  it('applies the chosen layout when accepted', async () => {
    // The rewrite's real hazard: the layout has to survive from the select
    // handler to the dialog callback. Passing null here would look like a
    // working guard and quietly clear the reading's spread.
    const { onApplyLayout, user } = setup(filled)
    await chooseLayout(user)
    await user.click(screen.getByTestId('confirm-accept'))
    expect(onApplyLayout).toHaveBeenCalledExactlyOnceWith(LAYOUTS[0])
  })

  it('does not ask when the reading is empty', async () => {
    // The guard exists to protect written work. An empty reading has none, and
    // a prompt there is friction that teaches people to click through.
    const { onApplyLayout, user } = setup([])
    await chooseLayout(user)
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument()
    expect(onApplyLayout).toHaveBeenCalledExactlyOnceWith(LAYOUTS[0])
  })
})

describe('matching typed names to the deck (macos-chrome.md §8)', () => {
  it('finds the deck and the card when the names are in the other Unicode form', () => {
    // The deck and card names are decomposed (NFD, as macOS stores a file
    // name); the reading holds them composed (NFC, as typed). Before sameName
    // the entry read "No matching card in this deck."
    const deck = {
      id: 'd1',
      name: 'Arcane\u0301',
      suits: [],
      pipRanks: [],
      courtRanks: [],
      supportsReversed: true,
      cards: [
        { id: 'c1', section: 'major', name: 'L\u2019E\u0301toile', meaning: 'Hope returns.' }
      ],
      createdAt: 'now',
      updatedAt: 'now'
    } as Deck
    render(
      <ReadingEditor
        reading={{
          ...reading([{ id: 'e1', topic: '', question: '', card: 'L\u2019\u00c9toile' }]),
          deck: 'Arcan\u00e9'
        }}
        decks={[deck]}
        layouts={LAYOUTS}
        onChange={vi.fn()}
        onApplyLayout={vi.fn()}
        onAddEntry={vi.fn()}
        onUpdateEntry={vi.fn()}
        onDeleteEntry={vi.fn()}
      />
    )
    expect(screen.queryByText('No matching card in this deck.')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('Hope returns.')).toBeInTheDocument()
  })
})
