import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

// The Linux icon set is GENERATED but COMMITTED — CI has no ImageMagick, so
// electron-builder packages whatever is in the tree. That makes it exactly the
// kind of artifact that goes stale silently: change the master, forget
// `node scripts/make-linux-icons.mjs`, and the build stays green while the
// package ships the previous artwork at the previous sizes.
//
// This reads PNG headers directly rather than shelling out, so it needs no
// ImageMagick and runs in the ordinary suite. It therefore checks the two
// properties a header carries — geometry and colour type — and NOT the alpha
// bounding box, which needs pixel decoding. `make-linux-icons.mjs` asserts the
// bounding boxes itself at the moment it writes them, which is the right place
// for the check that needs a decoder.
//
// Ported from taliesin's `scripts/icons.test.mjs` (itself from balor), plus
// mabon's schema-key check at the bottom. R-008 / HTOO-38 / HTOO-63.
const REPO_ROOT = join(import.meta.dirname, '..')
const BUILD = join(REPO_ROOT, 'build')
const ICONS = join(BUILD, 'icons')

/** hicolor's standard set, and the same list `make-linux-icons.mjs` writes. */
const SIZES = [16, 24, 32, 48, 64, 128, 256, 512]
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
// PNG colour type 6 is truecolour WITH alpha; type 2 is truecolour without.
// Type 2 is the failure this catches: a master flattened onto its background
// renders the rounded corners as a solid rectangle at every size, and still
// reports `srgba` to `magick identify -format "%[channels]"`.
const RGBA = 6
const RGB = 2

function readHeader(path) {
  const buf = readFileSync(path)
  expect(buf.subarray(0, 8), `${path} is not a PNG`).toEqual(PNG_SIGNATURE)
  expect(buf.subarray(12, 16).toString('ascii'), `${path} first chunk`).toBe('IHDR')
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    colorType: buf.readUInt8(25)
  }
}

const builderYml = readFileSync(join(REPO_ROOT, 'electron-builder.yml'), 'utf8')
const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'))

describe('committed Linux icon artifacts', () => {
  it('build/icons/ holds exactly the eight hicolor sizes and nothing else', () => {
    // "Nothing else" matters: `collectIconsFromDir` takes every file matching
    // /^(\d+)(?:x\d+)?\.png$/i, so a stray 1024x1024.png left behind by a hand
    // run would be installed as a hicolor entry outside the theme's index.
    expect(readdirSync(ICONS).sort()).toEqual(SIZES.map((n) => `${n}x${n}.png`).sort())
  })

  it.each(SIZES)('build/icons/%ix%i.png is that size and RGBA', (px) => {
    expect(readHeader(join(ICONS, `${px}x${px}.png`))).toEqual({
      width: px,
      height: px,
      colorType: RGBA
    })
  })

  it('linux.icon points at the directory, not a single file', () => {
    // The whole defect in one line. A single PNG is never resampled, so any
    // value here ending in .png yields exactly one hicolor entry at that file's
    // own size — which for a 1254 master is a size no desktop indexes.
    expect(builderYml).toMatch(/^ {2}icon: build\/icons$/m)
  })
})

describe('the two masters are not interchangeable', () => {
  // Corvath carries two unrelated pieces of artwork, and no check inside the
  // generator can tell which one is CORRECT — both would resize cleanly. This
  // is the only place that records the distinction as an assertion.
  it('build/icon.png is the Windows master, 1254 and opaque', () => {
    // Opaque BY DESIGN — R-002 recorded that this tile is a deliberate square
    // that its consumers round in CSS, and told the next reader not to "fix"
    // the missing alpha. It is pinned here so that repointing linux.icon at it
    // has to change this line too.
    expect(readHeader(join(BUILD, 'icon.png'))).toEqual({
      width: 1254,
      height: 1254,
      colorType: RGB
    })
  })

  it('build/icon-mac.png is the macOS master, 1024 and RGBA', () => {
    // The macOS/Linux artwork with Apple's squircle and 824/1024 inset applied.
    // The Linux set descends from the same master WITHOUT that inset, which is
    // why nothing here crops.
    expect(readHeader(join(BUILD, 'icon-mac.png'))).toEqual({
      width: 1024,
      height: 1024,
      colorType: RGBA
    })
  })

  it('the generator names the macOS/Linux master, not the Windows one', () => {
    const gen = readFileSync(join(REPO_ROOT, 'scripts/make-linux-icons.mjs'), 'utf8')
    expect(gen).toContain('Corvath_fixed.png')
    // Only as the thing it warns against, never as a default source.
    expect(gen).not.toMatch(/^const DEFAULT_SOURCE.*icon\.png/m)
  })
})

describe('the desktop entry half of R-008', () => {
  // A correct hicolor set is only half of it. Oghma shipped the right sizes and
  // still drew a generic taskbar icon, because nothing tied the running window
  // to the installed .desktop entry.
  it('desktopName is in package.json, where the schema expects it', () => {
    expect(pkg.desktopName).toBe('corvath.desktop')
  })

  it('linux.syncDesktopName is on', () => {
    expect(builderYml).toMatch(/^ {2}syncDesktopName: true$/m)
  })

  it('the deb target has a maintainer', () => {
    // The .deb is what installs the desktop entry. electron-builder takes its
    // maintainer from linux.maintainer, else from package.json's author email,
    // and with neither it fails the Linux build outright. The author here has no
    // email, so linux.maintainer is the one that has to be present.
    expect(builderYml).toMatch(/^ {4}- target: deb$/m)
    const authorEmail =
      typeof pkg.author === 'object' ? pkg.author.email : /<[^>]+>/.test(pkg.author ?? '')
    expect(childKeys('linux').includes('maintainer') || Boolean(authorEmail)).toBe(true)
  })

  it('every platform block uses only keys electron-builder declares', () => {
    // Mabon's finding, and the general form of the trap above: there is no
    // `linux.desktopName` key. Putting it there is NOT silently ignored — it
    // rejects the entire linux block with "configuration.linux should be one of
    // these: null", a message that never names the offending key. And
    // `npm run build` is electron-vite, which never reads electron-builder.yml,
    // so typecheck, lint, the whole suite and the build all stay green on a
    // configuration that cannot package at all.
    //
    // Checked against electron-builder's own shipped schema rather than a list
    // maintained here, so it stays true across upgrades.
    const scheme = JSON.parse(
      readFileSync(join(REPO_ROOT, 'node_modules/app-builder-lib/scheme.json'), 'utf8')
    ).definitions

    const BLOCKS = {
      win: 'WindowsConfiguration',
      mac: 'MacConfiguration',
      linux: 'LinuxConfiguration',
      nsis: 'NsisOptions',
      portable: 'PortableOptions',
      dmg: 'DmgOptions',
      appImage: 'AppImageOptions',
      deb: 'DebOptions'
    }

    for (const [block, definition] of Object.entries(BLOCKS)) {
      const allowed = Object.keys(scheme[definition]?.properties ?? {})
      expect(allowed.length, `${definition} has no properties in the schema`).toBeGreaterThan(0)

      for (const key of childKeys(block)) {
        expect(allowed, `${block}.${key} is not a key electron-builder declares`).toContain(key)
      }
    }
  })
})

/**
 * Immediate children of a top-level block in electron-builder.yml.
 *
 * Raw text rather than a parser: there is no YAML dependency in this repository,
 * this is a file it owns, and the job is to catch a human edit. Comments and
 * list items are skipped; only `  key:` at exactly two spaces counts.
 */
function childKeys(block) {
  const lines = builderYml.split('\n')
  const start = lines.findIndex((l) => l === `${block}:`)
  if (start === -1) return []
  const keys = []
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break // next top-level key ends the block
    const match = /^ {2}([A-Za-z][\w-]*):/.exec(line)
    if (match) keys.push(match[1])
  }
  return keys
}
