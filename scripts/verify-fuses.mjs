// Read the Electron fuse wire back out of a PACKAGED binary and fail if the
// fuses `electron-builder.yml` configures are not what it asked for.
//
// HTOO-403. Why this exists rather than trusting the YAML: the fuse wire is
// written into the binary during packaging, so the config is proof that
// electron-builder was ASKED, not that it did it. `npm run validate`, the whole
// unit suite and every e2e spec pass on a build that has silently stopped
// applying them, because none of them ever look at an artifact — Playwright
// drives `out/`. The failure is silent by construction, which is the argument
// for automating the check rather than against it.
//
// Corvath is more exposed to this than it looks. It ships TWO Windows artifacts
// and both wrap the same `win-unpacked/corvath.exe` — the portable exe as a
// self-extracting stub, the installer by writing it to disk — so one check
// covers both, which is worth doing deliberately rather than checking whichever
// artifact someone happens to think of.
//
// Ported from taliesin's implementation (HTOO-167), itself from balor's
// (HTOO-303). Copied rather than re-derived because of the first trap below.
//
// TWO THINGS THIS DELIBERATELY DOES NOT DO:
//
//  * It does not use `getCurrentFuseWire` from `@electron/fuses`, and that is a
//    real defect rather than a preference. That function reads the FIRST
//    sentinel only. A mac universal binary has two — `flipFuses` writes both —
//    and corvath's dmg is built for `arch: universal`, so the public reader
//    would check the x64 slice, report a pass, and never read arm64. A verifier
//    that cannot see half the artifact it is verifying is worse than none,
//    because it reads as coverage. This scans EVERY sentinel and asserts each.
//
//  * It does not launch anything. The behavioural half — that
//    `ELECTRON_RUN_AS_NODE=1 corvath.exe -e "…"` cannot execute a marker — means
//    launching a GUI app on a displayless runner and deciding it "has not
//    printed anything yet", which is a timing assumption about someone else's
//    binary that nobody here has measured. Run that by hand.
//
// Usage: node scripts/verify-fuses.mjs <path to packaged binary>
//   win32   dist/win-unpacked/corvath.exe
//   linux   dist/linux-unpacked/corvath
//   darwin  dist/mac-universal/Corvath.app

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

// Copied from `@electron/fuses`' `dist/constants.js`, which is an INTERNAL path
// the package does not export. verify-fuses.test.mjs pins both against that file,
// so an upgrade that moves either fails the suite rather than leaving this script
// quietly finding zero sentinels in a healthy binary.
export const SENTINEL = 'dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX'
export const FUSE_STATE = { DISABLE: 0x30, ENABLE: 0x31, REMOVED: 0x72, INHERIT: 0x90 }

// Position on the V1 wire → name. The full list is longer; these are the ones
// `electron-builder.yml` sets, and the only ones asserted. **Position matters
// more than the name** — the wire is an array of bytes and nothing in it is
// labelled, so an index off by one silently checks a different fuse.
//
// `resetAdHocDarwinSignature` is in the YAML but is NOT on this list, because it
// is not a fuse: it tells electron-builder to re-sign the mac binary after
// flipping, which is required once any fuse changes on arm64. The unit test
// pins it in the YAML; there is nothing on the wire to read.
export const EXPECTED = [
  { index: 0, name: 'RunAsNode', state: FUSE_STATE.DISABLE },
  { index: 2, name: 'EnableNodeOptionsEnvironmentVariable', state: FUSE_STATE.DISABLE },
  { index: 3, name: 'EnableNodeCliInspectArguments', state: FUSE_STATE.DISABLE },
  // HTOO-381. A wire that lost this one ships an app that runs a changed asar.
  { index: 4, name: 'EnableEmbeddedAsarIntegrityValidation', state: FUSE_STATE.ENABLE },
  { index: 5, name: 'OnlyLoadAppFromAsar', state: FUSE_STATE.ENABLE }
]

const STATE_NAME = Object.fromEntries(Object.entries(FUSE_STATE).map(([k, v]) => [v, k]))

// A .app is a directory; the wire lives in the framework binary inside it. Same
// resolution `@electron/fuses` does, because electron-builder hands it the .app
// path and this has to read what that wrote.
export function fuseFilePath(target) {
  if (target.endsWith('.app')) {
    return resolve(
      target,
      'Contents',
      'Frameworks',
      'Electron Framework.framework',
      'Electron Framework'
    )
  }
  return target
}

// Every sentinel in the buffer, decoded. Exported so the test can drive it with
// synthetic buffers — a real artifact is hundreds of MB and does not exist on a
// machine that has not packaged one.
export function decodeFuseWires(buffer) {
  const wires = []
  const needle = Buffer.from(SENTINEL, 'utf8')
  let at = buffer.indexOf(needle)
  while (at !== -1) {
    const pos = at + needle.length
    const version = buffer[pos]
    const length = buffer[pos + 1]
    wires.push({
      offset: at,
      version,
      states: Array.from(buffer.subarray(pos + 2, pos + 2 + length))
    })
    at = buffer.indexOf(needle, at + needle.length)
  }
  return wires
}

// Pure: wires in, list of human sentences out. Empty means the artifact passed.
//
// **Zero wires is a FAILURE, not an empty pass.** That is the property that
// makes this check self-checking: a stale SENTINEL, a truncated read, or a path
// pointing at the wrong file all land here rather than reporting success over
// nothing.
export function checkWires(wires) {
  if (wires.length === 0) {
    return ['no fuse wire found — not an Electron binary, or the sentinel has moved']
  }
  const problems = []
  for (const wire of wires) {
    const where = wires.length > 1 ? ` (slice at offset ${wire.offset})` : ''
    if (wire.version !== 1) {
      problems.push(`fuse wire version ${wire.version}, expected 1${where}`)
      continue
    }
    for (const fuse of EXPECTED) {
      const actual = wire.states[fuse.index]
      if (actual === fuse.state) continue
      const found =
        actual === undefined
          ? 'off the end of the wire'
          : (STATE_NAME[actual] ?? `0x${actual.toString(16)}`)
      problems.push(`${fuse.name} is ${found}, expected ${STATE_NAME[fuse.state]}${where}`)
    }
  }
  return problems
}

function main(argv) {
  const target = argv[2]
  if (!target) {
    console.error('usage: node scripts/verify-fuses.mjs <path to packaged binary>')
    return 2
  }

  let buffer
  try {
    buffer = readFileSync(fuseFilePath(target))
  } catch (err) {
    console.error(`cannot read ${fuseFilePath(target)}: ${err.message}`)
    return 2
  }

  const wires = decodeFuseWires(buffer)
  const problems = checkWires(wires)

  // Print what was read either way. A green check that prints nothing teaches
  // nobody what it looked at, and this is the only place the wire is visible.
  for (const wire of wires) {
    const read = EXPECTED.map((f) => `${f.name}=${STATE_NAME[wire.states[f.index]] ?? '?'}`).join(
      ' '
    )
    console.log(`${target} @${wire.offset}: v${wire.version} ${read}`)
  }

  if (problems.length > 0) {
    console.error(`\nElectron fuses are wrong on ${target}:`)
    for (const p of problems) console.error(`  - ${p}`)
    return 1
  }
  console.log(
    `\nElectron fuses OK on ${target} (${wires.length} wire${wires.length === 1 ? '' : 's'}).`
  )
  return 0
}

// CLI — skipped when imported (e.g. by the test).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv))
}
