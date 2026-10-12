import { vi } from 'vitest'
import type { Settings, TarotApi } from '../../../../shared/types'

/**
 * A fresh `window.api` for each jsdom test. jsdom has no preload, so a component
 * that calls the bridge needs a stand-in, and a shared one keeps each test file
 * from writing its own (the template's arrangement).
 *
 * Every read answers with an empty, valid value. A test that needs another
 * answer sets that one method, for example
 * `vi.mocked(window.api.getAppVersion).mockResolvedValue('9.9.9')`.
 */
export function createMockApi(): TarotApi {
  return {
    readings: {
      getAll: vi.fn(async () => []),
      save: vi.fn(async () => undefined),
      export: vi.fn(async () => ({ canceled: true }))
    },
    decks: {
      getAll: vi.fn(async () => []),
      save: vi.fn(async () => undefined),
      saveImage: vi.fn(async () => ({ filename: 'x.png' })),
      deleteImage: vi.fn(async () => undefined),
      deleteDeckImages: vi.fn(async () => undefined),
      imageUrl: vi.fn(
        (deckId: string, filename: string) => `corvath-asset://img/${deckId}/${filename}`
      ),
      exportDeck: vi.fn(async () => ({ canceled: true })),
      importDeck: vi.fn(async () => ({ canceled: true }))
    },
    layouts: {
      getAll: vi.fn(async () => []),
      save: vi.fn(async () => undefined)
    },
    loadSettings: vi.fn(async (): Promise<Settings> => ({ theme: 'hybrasyl' })),
    saveSettings: vi.fn(async () => undefined),
    appReady: vi.fn(),
    // `no-entry` is the live answer until corvath's first release: no notice,
    // and nothing for a test to clean up unless it asks for another answer.
    checkForUpdate: vi.fn(async () => ({ ok: false, reason: 'no-entry' }) as const),
    getAppVersion: vi.fn(async () => '0.0.0-test'),
    revealSettings: vi.fn(),
    readChangelog: vi.fn(async () => ''),
    diagnostics: {
      build: vi.fn(async () => ''),
      openIssue: vi.fn(async () => ({ ok: true as const, truncated: false, copied: true })),
      copyReport: vi.fn(async () => ({ ok: true as const })),
      reportError: vi.fn(),
      revealLogs: vi.fn()
    },
    window: {
      minimize: vi.fn(),
      toggleMaximize: vi.fn(),
      close: vi.fn(),
      isMaximized: vi.fn(async () => false),
      onMaximizeChange: vi.fn(() => () => undefined)
    }
  }
}
