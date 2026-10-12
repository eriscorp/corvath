import { existsSync, promises } from 'fs'
import { mkdir, mkdtemp, readdir, rm, symlink, utimes, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MIN_AGE_MS, ownUnpackDir, sweepPortableLeftovers } from '../portableSweep'

/**
 * The portable sweep (HTOO-494), over a fake `%TEMP%`.
 *
 * Every folder here is built the way the NSIS stub lays one out:
 * `nsXXXX.tmp\app\corvath.exe` with `app\resources\app.asar`, beside the package.
 * The rules under test are a safety case, so most of these say what the sweep
 * must NOT delete.
 */

const NOW = Date.UTC(2026, 8, 28, 12, 0, 0)
const OLD = NOW - MIN_AGE_MS - 60_000
const EXE = 'corvath.exe'

let temp: string

async function unpack(
  name: string,
  options: { exe?: string; asar?: boolean; mtime?: number } = {}
): Promise<string> {
  const dir = join(temp, name)
  await mkdir(join(dir, 'app', 'resources'), { recursive: true })
  await writeFile(join(dir, 'app', options.exe ?? EXE), 'exe')
  if (options.asar !== false) await writeFile(join(dir, 'app', 'resources', 'app.asar'), 'asar')
  await writeFile(join(dir, 'app-64.7z'), 'package')
  const stamp = new Date(options.mtime ?? OLD)
  await utimes(dir, stamp, stamp)
  return dir
}

function run(
  extra: Partial<Parameters<typeof sweepPortableLeftovers>[0]> = {}
): ReturnType<typeof sweepPortableLeftovers> {
  return sweepPortableLeftovers({
    execPath: join(temp, 'nsOWN1.tmp', 'app', EXE),
    isPortable: true,
    now: NOW,
    // Required (portableSweep.ts says why). Node's fs has no asar patch, so it
    // stands in for original-fs here.
    fs: promises,
    ...extra
  })
}

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'corvath-sweep-'))
  // This process's own folder, and old enough to be swept if it were not ours.
  await unpack('nsOWN1.tmp')
})

afterEach(async () => {
  await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

describe('ownUnpackDir', () => {
  it('finds the ns*.tmp folder above app\\corvath.exe', () => {
    expect(ownUnpackDir(join('C:', 'T', 'nsm78D5.tmp', 'app', EXE))).toBe(
      join('C:', 'T', 'nsm78D5.tmp')
    )
    // The hex digit count varies, so the pattern must not fix it.
    expect(ownUnpackDir(join('C:', 'T', 'nskBBD.tmp', 'app', EXE))).toBe(
      join('C:', 'T', 'nskBBD.tmp')
    )
  })

  it('returns null for any other layout, so the sweep does nothing', () => {
    // An installed copy and a dev run. Neither is under a stub's folder.
    expect(ownUnpackDir(join('C:', 'Program Files', 'Corvath', EXE))).toBeNull()
    expect(
      ownUnpackDir(join('E:', 'corvath', 'node_modules', 'electron', 'dist', 'electron.exe'))
    ).toBeNull()
  })
})

describe('sweepPortableLeftovers', () => {
  it('removes an old leftover of this app', async () => {
    const leak = await unpack('nsA1B2.tmp')
    const result = await run()
    expect(result.removed).toEqual([leak])
    expect(existsSync(leak)).toBe(false)
  })

  it('never touches its own folder, even when it is old', async () => {
    await run()
    expect(existsSync(join(temp, 'nsOWN1.tmp', 'app', EXE))).toBe(true)
  })

  it('will not compile without an fs, so no caller gets the patched one', async () => {
    // The pin is the @ts-expect-error: `npm run typecheck` fails here if `fs`
    // becomes optional again. isPortable is false, so the call returns at once.
    // @ts-expect-error -- `fs` is required (portableSweep.ts header).
    const result = await sweepPortableLeftovers({ execPath: EXE, isPortable: false })
    expect(result).toEqual({ removed: [], skipped: [] })
  })

  it('does nothing when the stub did not launch us', async () => {
    const leak = await unpack('nsA1B2.tmp')
    const result = await run({ isPortable: false })
    expect(result.removed).toEqual([])
    expect(existsSync(leak)).toBe(true)
  })

  it('does nothing when it cannot identify its own folder, and reports it', async () => {
    // It cannot prove it is not about to delete itself, so it stops. The report
    // is the only sign that a new electron-builder layout has stopped the sweep.
    const leak = await unpack('nsA1B2.tmp')
    const errors: string[] = []
    const result = await run({
      execPath: join(temp, 'Corvath', EXE),
      onError: (message) => errors.push(message)
    })
    expect(result.removed).toEqual([])
    expect(existsSync(leak)).toBe(true)
    expect(errors).toEqual([expect.stringMatching(/unexpected portable layout/)])
  })

  it('keeps a recent folder, because a second launch may still be unpacking', async () => {
    const fresh = await unpack('nsA1B2.tmp', { mtime: NOW - 60_000 })
    const result = await run()
    expect(result.skipped).toEqual([fresh])
    expect(existsSync(fresh)).toBe(true)
  })

  it('keeps a folder whose rename is refused, because that means it is in use', async () => {
    // Windows refuses the rename while a running copy's exe is mapped (EBUSY)
    // or the stub holds the folder (EPERM). Measured on the real exe.
    const live = await unpack('nsA1B2.tmp')
    const result = await run({
      fs: {
        ...promises,
        rename: async () => {
          throw Object.assign(new Error('busy'), { code: 'EBUSY' })
        }
      }
    })
    expect(result.skipped).toEqual([live])
    expect(result.removed).toEqual([])
    expect(existsSync(join(live, 'app', EXE))).toBe(true)
  })

  it('never touches a path ending in app.asar', async () => {
    // Electron's patched fs opens any `app.asar` it is asked about and keeps the
    // handle, and Windows then refuses the rename because this process holds the
    // file. Oghma's first packaged build skipped every real leftover that way
    // while its tests passed under plain Node. This fs fails the way Electron's
    // would, so a check that stats or opens the archive fails here.
    const leak = await unpack('nsA1B2.tmp')
    const asarTouched: string[] = []
    const guard = <T extends (...args: never[]) => unknown>(fn: T): T =>
      ((...args: never[]) => {
        const path = String(args[0])
        if (/app\.asar$/i.test(path)) {
          asarTouched.push(path)
          throw new Error('opened as an archive')
        }
        return fn(...args)
      }) as T
    const result = await run({
      fs: {
        readdir: guard(promises.readdir as never),
        lstat: guard(promises.lstat as never),
        rename: guard(promises.rename as never),
        rm: promises.rm
      }
    })
    expect(asarTouched).toEqual([])
    expect(result.removed).toEqual([leak])
  })

  it("leaves another app's unpack folder alone", async () => {
    const other = await unpack('nsC3D4.tmp', { exe: 'creidhne.exe' })
    await run()
    expect(existsSync(other)).toBe(true)
  })

  it('leaves a folder with our exe name and no app.asar alone', async () => {
    const notOurs = await unpack('nsC3D4.tmp', { asar: false })
    await run()
    expect(existsSync(notOurs)).toBe(true)
  })

  it('leaves folders that do not have the NSIS name alone', async () => {
    const named = await unpack('corvath-backup')
    const other = await unpack('2Xk9cQ1pZ7yLmN4vB8dR3sT6wHf')
    await run()
    expect(existsSync(named)).toBe(true)
    expect(existsSync(other)).toBe(true)
  })

  it('does not follow a link that has the NSIS name', async () => {
    const target = await unpack('real-target')
    await symlink(target, join(temp, 'nsLINK.tmp'), 'junction')
    await run()
    expect(existsSync(join(target, 'app', EXE))).toBe(true)
  })

  it('finishes a sweep that stopped after its rename', async () => {
    await unpack('nsE5F6.tmp.corvath-sweep')
    const result = await run()
    expect(result.removed).toEqual([join(temp, 'nsE5F6.tmp.corvath-sweep')])
    expect((await readdir(temp)).sort()).toEqual(['nsOWN1.tmp'])
  })

  it('removes a stale claimed folder before it renames a leftover onto that name', async () => {
    // A stale `nsA1B2.tmp.corvath-sweep` blocks the rename of a new
    // `nsA1B2.tmp`, and a refused rename reads as "in use". So the stale one
    // goes first (epona's case).
    await unpack('nsA1B2.tmp.corvath-sweep')
    const leak = await unpack('nsA1B2.tmp')
    const result = await run()
    expect(result.removed).toContain(leak)
    expect(result.skipped).toEqual([])
    expect((await readdir(temp)).sort()).toEqual(['nsOWN1.tmp'])
  })

  it('reports a failure and does not throw', async () => {
    const errors: string[] = []
    const missing = join(temp, 'no-such-temp')
    const result = await run({
      execPath: join(missing, 'nsOWN1.tmp', 'app', EXE),
      onError: (message) => errors.push(message)
    })
    expect(result).toEqual({ removed: [], skipped: [] })
    expect(errors[0]).toMatch(/cannot read/)
  })
})
