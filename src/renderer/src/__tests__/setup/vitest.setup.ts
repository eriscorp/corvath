import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { createMockApi } from './mockApi'

// A fresh bridge before each test, so no test sees another test's answers.
beforeEach(() => {
  window.api = createMockApi()
})

afterEach(() => {
  cleanup()
})
