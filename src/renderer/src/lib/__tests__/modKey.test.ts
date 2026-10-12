import { describe, it, expect } from 'vitest'
import { isModKey, isForeignChord } from '../modKey'

const keys = (ctrlKey: boolean, metaKey: boolean): { ctrlKey: boolean; metaKey: boolean } => ({
  ctrlKey,
  metaKey
})

describe('isModKey', () => {
  it('is ⌘ alone on macOS', () => {
    expect(isModKey(keys(false, true), 'darwin')).toBe(true)
    expect(isModKey(keys(true, false), 'darwin')).toBe(false)
    expect(isModKey(keys(true, true), 'darwin')).toBe(false)
    expect(isModKey(keys(false, false), 'darwin')).toBe(false)
  })

  it('is Ctrl or ⌘ elsewhere', () => {
    for (const platform of ['win32', 'linux']) {
      expect(isModKey(keys(true, false), platform)).toBe(true)
      expect(isModKey(keys(false, true), platform)).toBe(true)
      expect(isModKey(keys(false, false), platform)).toBe(false)
    }
  })
})

describe('isForeignChord', () => {
  it('is any Control chord on macOS, and nothing elsewhere', () => {
    expect(isForeignChord(keys(true, false), 'darwin')).toBe(true)
    expect(isForeignChord(keys(true, true), 'darwin')).toBe(true)
    expect(isForeignChord(keys(false, true), 'darwin')).toBe(false)
    expect(isForeignChord(keys(true, false), 'win32')).toBe(false)
  })
})
