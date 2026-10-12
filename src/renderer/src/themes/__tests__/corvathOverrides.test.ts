import { describe, it, expect } from 'vitest'
import { themesByName } from '../index'
import { corvathOverrides } from '../corvathOverrides'
import type { ThemeName } from '@shared/types'

const THEME_NAMES = Object.keys(themesByName) as ThemeName[]

/**
 * Each theme file is the house template's file, plus one spread of
 * `corvathOverrides`. The next port of the template's palettes copies the six
 * files again. This test fails when that copy loses the spread, because the
 * filled alerts' actions and the contained buttons' icons then draw the theme's
 * accent on their fill, and only `filledControls.test.tsx` sees it.
 */
describe("corvath's component overrides", () => {
  const keys = Object.keys(corvathOverrides) as (keyof typeof corvathOverrides)[]

  it('holds the two overrides that the template does not have', () => {
    expect([...keys].sort()).toEqual(['MuiAlert', 'MuiButtonBase'])
  })

  it.each(THEME_NAMES)('%s carries every one of them', (name) => {
    const components = themesByName[name].components ?? {}
    for (const key of keys) expect(components[key], key).toEqual(corvathOverrides[key])
  })
})
