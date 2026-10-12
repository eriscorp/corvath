import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, renderHook, screen } from '@testing-library/react'
import { GO_VIEWS, type MenuCommand } from '@shared/appMenu'
import type { Reading } from '@shared/types'
import { runMenuCommand, isModalOpen, useAppMenu } from '@renderer/lib/appMenu'
import { useMenuRequest } from '@renderer/lib/useMenuRequest'
import { useMenuStore } from '@renderer/store/menuStore'
import { useViewStore } from '@renderer/store/viewStore'
import { useReadingsStore } from '@renderer/store/readingsStore'
import { useReportStore } from '@renderer/store/reportStore'
import { NAV_ITEMS } from '@renderer/components/NavBar'
import AboutCard from '@renderer/components/AboutCard'
import Readings from '@renderer/pages/Readings'

const READING: Reading = {
  id: 'r1',
  title: 'A reading',
  date: '2026-10-11',
  deck: 'Argent Tarot',
  entries: [],
  createdAt: '2026-10-11T00:00:00.000Z',
  updatedAt: '2026-10-11T00:00:00.000Z'
}

beforeEach(() => {
  useMenuStore.setState({ pending: {} })
  useViewStore.setState({ view: 'readings' })
  useReadingsStore.setState({ readings: [], hydrated: true })
  useReportStore.setState({ open: false })
})

describe('the Go menu', () => {
  it('lists every nav tab but Settings, which is Settings… (⌘,) in the app menu', () => {
    // shared/appMenu.ts cannot import the renderer's NavBar (the preload reads
    // it), so it keeps its own list; this holds the two equal.
    expect(GO_VIEWS.map(([view, label]) => ({ view, label }))).toEqual(
      NAV_ITEMS.filter((i) => i.view !== 'settings').map(({ view, label }) => ({ view, label }))
    )
  })
})

describe('useMenuRequest', () => {
  it('runs a request made before the component mounted, once', () => {
    const handler = vi.fn()
    useMenuStore.getState().request('checkForUpdates')
    function Owner(): null {
      useMenuRequest('checkForUpdates', handler)
      return null
    }
    const { rerender } = render(<Owner />)
    rerender(<Owner />)
    expect(handler).toHaveBeenCalledOnce()
    expect(useMenuStore.getState().pending.checkForUpdates).toBeUndefined()
  })

  it('runs each later request', () => {
    const handler = vi.fn()
    renderHook(() => useMenuRequest('checkForUpdates', handler))
    act(() => runMenuCommand({ command: 'checkForUpdates' }))
    act(() => runMenuCommand({ command: 'checkForUpdates' }))
    expect(handler).toHaveBeenCalledTimes(2)
  })
})

describe('runMenuCommand', () => {
  const run = (command: MenuCommand): void => act(() => runMenuCommand({ command }))
  const pending = (): string[] => Object.keys(useMenuStore.getState().pending)
  const view = (): string => useViewStore.getState().view

  it('does nothing while a modal is open', () => {
    const modal = document.createElement('div')
    modal.className = 'MuiModal-root'
    document.body.appendChild(modal)
    expect(isModalOpen()).toBe(true)
    run('about')
    run('go:decks')
    run('reportIssue')
    expect(pending()).toEqual([])
    expect(view()).toBe('readings')
    expect(useReportStore.getState().open).toBe(false)
    // A kept-mounted, closed modal does not count.
    modal.classList.add('MuiModal-hidden')
    run('go:decks')
    expect(view()).toBe('decks')
    modal.remove()
  })

  it('switches pages for Go and for Settings…', () => {
    run('go:draw')
    expect(view()).toBe('draw')
    run('go:layouts')
    expect(view()).toBe('layouts')
    run('settings')
    expect(view()).toBe('settings')
    expect(pending()).toEqual([])
  })

  it.each([
    ['about', 'settings'],
    ['checkForUpdates', 'settings'],
    ['whatsNew', 'settings'],
    ['newReading', 'readings'],
    ['importReadings', 'readings'],
    ['importDeck', 'decks']
  ] as const)('%s opens the %s page and leaves a request for it', (command, page) => {
    useViewStore.setState({ view: 'layouts' })
    run(command)
    expect(view()).toBe(page)
    expect(pending()).toEqual([command])
  })

  it('exports all readings only when there is one, as the button does', () => {
    useViewStore.setState({ view: 'layouts' })
    run('exportAllReadings')
    expect(view()).toBe('layouts')
    expect(pending()).toEqual([])
    useReadingsStore.setState({ readings: [READING] })
    run('exportAllReadings')
    expect(view()).toBe('readings')
    expect(pending()).toEqual(['exportAllReadings'])
  })

  it('reveals the data folder and opens the report dialog in place', () => {
    run('revealDataFolder')
    expect(window.api.revealSettings).toHaveBeenCalledOnce()
    run('reportIssue')
    expect(useReportStore.getState().open).toBe(true)
    expect(view()).toBe('readings')
  })
})

describe('the owners take their requests on mount', () => {
  it('the About card opens About Corvath', async () => {
    useMenuStore.getState().request('about')
    await act(async () => {
      render(<AboutCard />)
    })
    expect(screen.getByRole('dialog')).toHaveTextContent('Corvath')
    expect(useMenuStore.getState().pending.about).toBeUndefined()
  })

  it('the About card opens What’s new', async () => {
    useMenuStore.getState().request('whatsNew')
    await act(async () => {
      render(<AboutCard />)
    })
    expect(screen.getByRole('dialog')).toHaveTextContent(/what's new/i)
  })

  it('the Readings page makes a new reading', async () => {
    useMenuStore.getState().request('newReading')
    await act(async () => {
      render(
        <Readings
          decks={[]}
          layouts={[]}
          selectedId={null}
          onSelectId={() => undefined}
          onGoToDraw={() => undefined}
        />
      )
    })
    expect(useReadingsStore.getState().readings).toHaveLength(1)
    expect(useMenuStore.getState().pending.newReading).toBeUndefined()
  })

  it('the Readings page exports every reading', async () => {
    useReadingsStore.setState({ readings: [READING] })
    useMenuStore.getState().request('exportAllReadings')
    await act(async () => {
      render(
        <Readings
          decks={[]}
          layouts={[]}
          selectedId="r1"
          onSelectId={() => undefined}
          onGoToDraw={() => undefined}
        />
      )
    })
    expect(window.api.readings.export).toHaveBeenCalledOnce()
    expect(vi.mocked(window.api.readings.export).mock.calls[0][0]).toBe('corvath-readings')
  })
})

describe('useAppMenu', () => {
  it('reports the state and listens on macOS', () => {
    window.api.platform = 'darwin'
    renderHook(() => useAppMenu(true))
    expect(window.api.menu.setState).toHaveBeenCalledExactlyOnceWith({
      ready: true,
      hasReadings: false
    })
    expect(window.api.menu.onCommand).toHaveBeenCalledExactlyOnceWith(runMenuCommand)
  })

  it('reports again when the readings change what the menu greys out, and only then', () => {
    window.api.platform = 'darwin'
    renderHook(() => useAppMenu(true))
    act(() => useReadingsStore.setState({ readings: [READING] }))
    act(() => useReadingsStore.setState({ readings: [{ ...READING, title: 'Renamed' }] }))
    expect(vi.mocked(window.api.menu.setState).mock.calls).toEqual([
      [{ ready: true, hasReadings: false }],
      [{ ready: true, hasReadings: true }]
    ])
  })

  it('stops listening on unmount', () => {
    const off = vi.fn()
    window.api.platform = 'darwin'
    vi.mocked(window.api.menu.onCommand).mockReturnValue(off)
    const { unmount } = renderHook(() => useAppMenu(true))
    unmount()
    expect(off).toHaveBeenCalledOnce()
  })

  it('does nothing elsewhere, or before hydration', () => {
    renderHook(() => useAppMenu(true))
    window.api.platform = 'darwin'
    renderHook(() => useAppMenu(false))
    expect(window.api.menu.setState).not.toHaveBeenCalled()
    expect(window.api.menu.onCommand).not.toHaveBeenCalled()
  })
})
