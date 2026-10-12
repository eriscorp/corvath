import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

// The `portable:` block in electron-builder.yml, pinned because both of its
// decisions look wrong to a reader who has not read the comment above them. The
// template's test (95dbe41), with mabon's and midir's proof that the reader
// can see the key it reports absent.
//
// - `unpackDirName: true` (HTOO-351). The electron-builder docs say `false`, and
//   `false` silently restores the shared $TEMP directory that shows the
//   "Corvath cannot be closed" box on a second launch. It is also what lets
//   portableSweep.ts find its own folder (HTOO-494).
// - No `splashImage` (HTOO-466). The image puts the NSIS stub in GUI mode, which
//   flashes a blank "Setup" window after every close. The obvious answer to the
//   silent unpack gap is to add the image back, in good faith.
//
// Both land on the PACKAGED exe only, so nothing else in the repo exercises them.
// Like verify-fuses.test.mjs's config half, this checks the REQUEST, not the
// artifact.

const REPO_ROOT = join(import.meta.dirname, '..')
const YML = readFileSync(join(REPO_ROOT, 'electron-builder.yml'), 'utf8').replace(/\r\n/g, '\n')

/**
 * The keys of the top-level `portable:` block, comments excluded. The block ends
 * at the next column-0 key, so a key in another block cannot satisfy it.
 */
function portableKeys(yml = YML) {
  const lines = yml.split('\n')
  const start = lines.indexOf('portable:')
  expect(start, 'electron-builder.yml has no top-level portable: block').toBeGreaterThan(-1)
  const keys = {}
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break
    const m = /^ {2}([A-Za-z]+):\s*(.*?)\s*$/.exec(line)
    if (m) keys[m[1]] = m[2]
  }
  return keys
}

describe('the portable target', () => {
  it('extracts to a directory unique to each launch (HTOO-351)', () => {
    // `true`, not `false`: app-builder-lib gives `false` a build-time KSUID.
    expect(portableKeys().unpackDirName).toBe('true')
  })

  it('has no splash image, so the NSIS stub stays silent (HTOO-466)', () => {
    expect(portableKeys()).not.toHaveProperty('splashImage')
  })

  it('reads the block it means to read', () => {
    // A reader that found nothing would pass the splashImage case vacuously.
    expect(portableKeys()).toHaveProperty('artifactName')
  })

  it('can see a splashImage when the block has one', () => {
    // A test for an absence passes for the wrong reason as easily as the right
    // one, so the reader is proved on a block that HAS the key.
    const sample = [
      'portable:',
      '  artifactName: x.exe',
      '  # a comment that names splashImage: is not a key',
      '  splashImage: build/portable-splash.bmp',
      'nsis:',
      '  oneClick: false'
    ].join('\n')
    expect(portableKeys(sample)).toEqual({
      artifactName: 'x.exe',
      splashImage: 'build/portable-splash.bmp'
    })
  })

  it('says beside the block why the image is absent', () => {
    // The reason is the guard a person reads; the test is the one a machine does.
    expect(YML).toContain('NO `splashImage`, on purpose (HTOO-466)')
  })
})
