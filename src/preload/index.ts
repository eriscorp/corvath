import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  Deck,
  DeckExportResult,
  DeckImportResult,
  Layout,
  Reading,
  ReadingExportResult,
  SavedImage,
  OpenIssueResult,
  RendererErrorReport,
  Settings,
  TarotApi
} from '../shared/types'
import type { UpdateCheckResult } from '../shared/updateVersion'

const api: TarotApi = {
  // A sandboxed preload has `process.platform`; the renderer has no `process`.
  platform: process.platform,

  readings: {
    getAll: (): Promise<Reading[]> => ipcRenderer.invoke('readings:getAll'),
    save: (readings: Reading[]): Promise<void> => ipcRenderer.invoke('readings:save', readings),
    export: (defaultName: string, json: string): Promise<ReadingExportResult> =>
      ipcRenderer.invoke('readings:export', defaultName, json)
  },
  decks: {
    getAll: (): Promise<Deck[]> => ipcRenderer.invoke('decks:getAll'),
    save: (decks: Deck[]): Promise<void> => ipcRenderer.invoke('decks:save', decks),
    saveImage: (
      deckId: string,
      cardId: string,
      ext: string,
      data: Uint8Array
    ): Promise<SavedImage> => ipcRenderer.invoke('decks:saveImage', deckId, cardId, ext, data),
    deleteImage: (deckId: string, cardId: string): Promise<void> =>
      ipcRenderer.invoke('decks:deleteImage', deckId, cardId),
    deleteDeckImages: (deckId: string): Promise<void> =>
      ipcRenderer.invoke('decks:deleteDeckImages', deckId),
    imageUrl: (deckId: string, filename: string): string =>
      `corvath-asset://img/${encodeURIComponent(deckId)}/${encodeURIComponent(filename)}`,
    exportDeck: (deck: Deck): Promise<DeckExportResult> =>
      ipcRenderer.invoke('decks:exportDeck', deck),
    importDeck: (existingNames: string[]): Promise<DeckImportResult> =>
      ipcRenderer.invoke('decks:importDeck', existingNames)
  },
  layouts: {
    getAll: (): Promise<Layout[]> => ipcRenderer.invoke('layouts:getAll'),
    save: (layouts: Layout[]): Promise<void> => ipcRenderer.invoke('layouts:save', layouts)
  },
  loadSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings: Settings): Promise<void> =>
    ipcRenderer.invoke('settings:save', settings),
  appReady: (): void => ipcRenderer.send('app:ready'),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  revealSettings: (): void => ipcRenderer.send('app:revealSettings'),
  readChangelog: (): Promise<string> => ipcRenderer.invoke('app:readChangelog'),
  checkForUpdate: (): Promise<UpdateCheckResult> => ipcRenderer.invoke('app:checkForUpdate'),
  diagnostics: {
    build: (): Promise<string> => ipcRenderer.invoke('diagnostics:build'),
    openIssue: (title: string, body: string): Promise<OpenIssueResult> =>
      ipcRenderer.invoke('diagnostics:openIssue', { title, body }),
    copyReport: (body: string): Promise<{ ok: true }> =>
      ipcRenderer.invoke('diagnostics:copyReport', { body }),
    // A send, not an invoke: this runs from an error handler, and awaiting a
    // reply while reporting a crash is a way to turn one fault into a hang.
    reportError: (report: RendererErrorReport): void =>
      ipcRenderer.send('diagnostics:reportError', report),
    revealLogs: (): void => ipcRenderer.send('diagnostics:revealLogs')
  },
  window: {
    minimize: (): void => ipcRenderer.send('window:minimize'),
    toggleMaximize: (): void => ipcRenderer.send('window:toggleMaximize'),
    close: (): void => ipcRenderer.send('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
    onMaximizeChange: (callback: (maximized: boolean) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, maximized: boolean): void => callback(maximized)
      ipcRenderer.on('window:maximizeChange', listener)
      return () => ipcRenderer.removeListener('window:maximizeChange', listener)
    }
  }
}

// We always run with contextIsolation: true (the BrowserWindow default), so the
// non-isolated fallback some templates ship with is dead code here.
contextBridge.exposeInMainWorld('electron', electronAPI)
contextBridge.exposeInMainWorld('api', api)
