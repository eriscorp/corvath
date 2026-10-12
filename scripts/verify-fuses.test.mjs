import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import {
  checkWires,
  decodeFuseWires,
  EXPECTED,
  FUSE_STATE,
  fuseFilePath,
  SENTINEL
} from './verify-fuses.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

/** Build a buffer with `count` fuse wires in it, so the multi-slice path is real. */
function fakeBinary(states, { count = 1, version = 1 } = {}) {
  const parts = []
  for (let i = 0; i < count; i++) {
    parts.push(Buffer.from('padding'.repeat(4)))
    parts.push(Buffer.from(SENTINEL, 'utf8'))
    parts.push(Buffer.from([version, states.length, ...states]))
  }
  return Buffer.concat(parts)
}

/** A wire where every fuse is what electron-builder.yml asks for. */
const healthyStates = () => {
  const states = new Array(8).fill(FUSE_STATE.INHERIT)
  for (const f of EXPECTED) states[f.index] = f.state
  return states
}

describe('constants stay pinned to @electron/fuses', () => {
  // These are copied out of an INTERNAL path the package does not export. If an
  // upgrade moves them, this reds — rather than leaving the script to find zero
  // sentinels in a perfectly healthy binary and call it a missing fuse wire.
  const constants = require('@electron/fuses/dist/constants.js')

  it('uses the sentinel the packer actually writes', () => {
    expect(SENTINEL).toBe(constants.SENTINEL)
  })

  it('uses the same state bytes', () => {
    expect(FUSE_STATE.DISABLE).toBe(constants.FuseState.DISABLE)
    expect(FUSE_STATE.ENABLE).toBe(constants.FuseState.ENABLE)
    expect(FUSE_STATE.REMOVED).toBe(constants.FuseState.REMOVED)
    expect(FUSE_STATE.INHERIT).toBe(constants.FuseState.INHERIT)
  })

  it('names each asserted fuse at the position the package gives it', () => {
    // The wire is unlabelled bytes, so a position that drifts silently asserts
    // the wrong fuse. This ties our indices to upstream's FuseV1Options.
    const { FuseV1Options } = require('@electron/fuses')
    for (const fuse of EXPECTED) {
      expect(FuseV1Options[fuse.index]).toBe(fuse.name)
    }
  })
})

describe('electron-builder.yml still asks for the fuses we verify', () => {
  // The config-shape half of HTOO-403: cheap, needs no build, and runs on every
  // `npm run validate`. Deleting a fuse from the YAML
  // reds the suite here; the packaged-binary read in release.yml is the other
  // half and can only run where an artifact exists.
  const yml = readFileSync(join(repoRoot, 'electron-builder.yml'), 'utf8')
  const block = /^electronFuses:\n((?:[ \t]+.*\n)+)/m.exec(yml)?.[1] ?? ''
  const declared = Object.fromEntries(
    block
      .split('\n')
      .map((l) => /^\s+([A-Za-z]+):\s*(true|false)/.exec(l))
      .filter(Boolean)
      .map((m) => [m[1], m[2] === 'true'])
  )

  it('declares an electronFuses block at all', () => {
    expect(Object.keys(declared).length).toBeGreaterThan(0)
  })

  it.each([
    ['runAsNode', false],
    ['enableNodeCliInspectArguments', false],
    ['enableNodeOptionsEnvironmentVariable', false],
    ['onlyLoadAppFromAsar', true],
    // HTOO-381: required, not only allowed. Removing it from the YAML reds here.
    ['enableEmbeddedAsarIntegrityValidation', true],
    // Not a fuse and not on the wire — it re-signs the mac binary after
    // flipping, which arm64 requires. Pinned here because nothing else can.
    ['resetAdHocDarwinSignature', true]
  ])('declares %s = %s', (name, value) => {
    expect(declared[name]).toBe(value)
  })

  it('verifies every boolean fuse the YAML declares, except the signing option', () => {
    // Guards the gap this pair of checks could otherwise develop: a fuse added
    // to the YAML that the binary check never looks at would read as verified.
    const onTheWire = new Set(EXPECTED.map((f) => f.name.toLowerCase()))
    const unchecked = Object.keys(declared)
      .filter((k) => k !== 'resetAdHocDarwinSignature')
      .filter((k) => !onTheWire.has(k.toLowerCase()))
    expect(unchecked).toEqual([])
  })
})

describe('decodeFuseWires', () => {
  it('finds one wire in a single-arch binary', () => {
    const wires = decodeFuseWires(fakeBinary(healthyStates()))
    expect(wires).toHaveLength(1)
    expect(wires[0].version).toBe(1)
    expect(wires[0].states[0]).toBe(FUSE_STATE.DISABLE)
  })

  it('finds BOTH wires in a universal binary', () => {
    // The reason this script exists rather than getCurrentFuseWire, which reads
    // only the first. Corvath's dmg is arch: universal.
    expect(decodeFuseWires(fakeBinary(healthyStates(), { count: 2 }))).toHaveLength(2)
  })

  it('finds nothing in a buffer with no sentinel', () => {
    expect(decodeFuseWires(Buffer.from('not an electron binary'))).toEqual([])
  })
})

describe('checkWires', () => {
  it('passes a healthy wire', () => {
    expect(checkWires(decodeFuseWires(fakeBinary(healthyStates())))).toEqual([])
  })

  it('passes when every slice of a universal binary is healthy', () => {
    expect(checkWires(decodeFuseWires(fakeBinary(healthyStates(), { count: 2 })))).toEqual([])
  })

  it('FAILS on zero wires rather than reporting an empty pass', () => {
    // The self-checking property: a stale sentinel or a wrong path lands here
    // instead of quietly succeeding over nothing.
    expect(checkWires([])).toEqual([
      'no fuse wire found — not an Electron binary, or the sentinel has moved'
    ])
  })

  it('names every wrong fuse when the block is dropped from the config', () => {
    // With no `electronFuses`, the binary ships Electron's defaults: RunAsNode,
    // NodeOptions and NodeCliInspect on, EmbeddedAsarIntegrityValidation and
    // OnlyLoadAppFromAsar off. All five are named, not only the first.
    const states = healthyStates()
    states[0] = FUSE_STATE.ENABLE
    states[2] = FUSE_STATE.ENABLE
    states[3] = FUSE_STATE.ENABLE
    states[4] = FUSE_STATE.DISABLE
    states[5] = FUSE_STATE.DISABLE
    const problems = checkWires(decodeFuseWires(fakeBinary(states)))
    expect(problems).toHaveLength(5)
    expect(problems).toContain('EnableEmbeddedAsarIntegrityValidation is DISABLE, expected ENABLE')
  })

  it('names the fuse that is wrong', () => {
    const states = healthyStates()
    states[0] = FUSE_STATE.ENABLE // RunAsNode back on
    const problems = checkWires(decodeFuseWires(fakeBinary(states)))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('RunAsNode is ENABLE, expected DISABLE')
  })

  it('catches a bad fuse in only ONE slice of a universal binary', () => {
    // The failure getCurrentFuseWire cannot see: x64 fine, arm64 not.
    const good = fakeBinary(healthyStates())
    const badStates = healthyStates()
    badStates[5] = FUSE_STATE.DISABLE // OnlyLoadAppFromAsar off
    const problems = checkWires(decodeFuseWires(Buffer.concat([good, fakeBinary(badStates)])))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('OnlyLoadAppFromAsar is DISABLE, expected ENABLE')
    expect(problems[0]).toContain('slice at offset')
  })

  it('rejects a wire version it does not understand', () => {
    const problems = checkWires(decodeFuseWires(fakeBinary(healthyStates(), { version: 2 })))
    expect(problems).toEqual(['fuse wire version 2, expected 1'])
  })

  it('reports a fuse that runs off the end of a short wire', () => {
    const problems = checkWires(decodeFuseWires(fakeBinary([FUSE_STATE.DISABLE])))
    expect(problems.some((p) => p.includes('off the end of the wire'))).toBe(true)
  })

  it('names both fuses past the end of a four-fuse wire', () => {
    // An Electron too old to carry index 4 and 5 must say so for each, not pass.
    const problems = checkWires(decodeFuseWires(fakeBinary(healthyStates().slice(0, 4))))
    expect(problems).toEqual([
      'EnableEmbeddedAsarIntegrityValidation is off the end of the wire, expected ENABLE',
      'OnlyLoadAppFromAsar is off the end of the wire, expected ENABLE'
    ])
  })
})

describe('fuseFilePath', () => {
  it('reaches into the framework binary inside a .app', () => {
    expect(fuseFilePath('/x/Corvath.app')).toMatch(
      /Corvath\.app[\\/]Contents[\\/]Frameworks[\\/]Electron Framework\.framework[\\/]Electron Framework$/
    )
  })

  it('leaves a plain executable path alone', () => {
    expect(fuseFilePath('dist/win-unpacked/corvath.exe')).toBe('dist/win-unpacked/corvath.exe')
  })
})
