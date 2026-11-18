/// <reference types="vite/client" />

import type { TarotApi } from '../../shared/types'

declare global {
  interface Window {
    api: TarotApi
  }
}

export {}
