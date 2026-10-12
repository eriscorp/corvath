import { describe, it, expect } from 'vitest'
import { nameKey, sameName } from '../sameName'

// "Défaite": NFC has é as one code point; NFD has e + U+0301 (as Finder
// stores a file name on macOS).
const NFC = 'D\u00e9faite'
const NFD = 'De\u0301faite'

describe('sameName', () => {
  it('matches the composed and decomposed forms of one name', () => {
    expect(NFC).not.toBe(NFD)
    expect(sameName(NFC, NFD)).toBe(true)
    expect(sameName(NFD, NFC)).toBe(true)
  })

  it('does not match a different name, or a missing one', () => {
    expect(sameName(NFC, 'Defaite')).toBe(false)
    expect(sameName(NFC, undefined)).toBe(false)
    expect(sameName(null, NFC)).toBe(false)
  })

  it('composes a name for a key', () => {
    expect(nameKey(NFD)).toBe(NFC)
  })
})
