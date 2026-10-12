import { describe, expect, it, vi } from 'vitest'
import type { IpcMain } from 'electron'
import { appIdentity } from '../../shared/appIdentity'
import { MANIFEST_SCHEMA } from '../../shared/updateVersion'
import { checkForUpdate, registerHandlers, type HandlerContext } from '../handlers'
import type { Stores } from '../store'
import type { PickerDialog } from '../pickerStart'

/**
 * Corvath's wiring of the update check (HTOO-65, HTOO-382). The module's own
 * behaviour is covered by `shared/__tests__/updateVersion.test.ts` and
 * `main/__tests__/updateCheck.test.ts`, copied from the template. What only
 * corvath can prove is that the handler gives the module **corvath's** identity
 * and **corvath's** running version. Each case here fails if a field of
 * `appIdentity` is wrong, and no test that ships with the module can see that.
 * Midir's port found that every adopter needs this file (balor's, adapted).
 */

const entry = (version: string, url: string): unknown => ({
  schema: MANIFEST_SCHEMA,
  apps: { [appIdentity.updateKey]: { version, url } }
})

function ctxWith(body: unknown, version = '1.0.0'): HandlerContext {
  return {
    store: {} as Stores,
    appVersion: () => version,
    fetchImpl: vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
  }
}

describe('checkForUpdate (corvath wiring)', () => {
  it('reads corvath’s own key, not another app’s', async () => {
    expect(appIdentity.updateKey).toBe('corvath')
    // The live manifest on 2026-10-11 has seven apps and no corvath: corvath
    // has not released. Another app being newer is not news about corvath.
    const result = await checkForUpdate(
      ctxWith({
        schema: MANIFEST_SCHEMA,
        apps: {
          taliesin: {
            version: '2.14.0',
            url: 'https://github.com/hybrasyl/taliesin/releases/tag/v2.14.0'
          }
        }
      })
    )
    expect(result).toEqual({ ok: false, reason: 'no-entry' })
  })

  it('compares against the running version from ctx.appVersion', async () => {
    const url = `${appIdentity.releaseUrlPrefix}tag/v1.1.0`
    expect(await checkForUpdate(ctxWith(entry('1.1.0', url), '1.0.0'))).toEqual({
      ok: true,
      update: { version: '1.1.0', url }
    })
    // The same build already runs it, so there is nothing to say.
    expect(await checkForUpdate(ctxWith(entry('1.1.0', url), '1.1.0'))).toEqual({
      ok: true,
      update: null
    })
  })

  it('takes the release URL that release.yml publishes to', async () => {
    // The repo moved from Caeldeth/corvath to eriscorp/corvath. A prefix left on
    // the old owner refuses every real entry as bad-url.
    const result = await checkForUpdate(
      ctxWith(entry('1.1.0', 'https://github.com/eriscorp/corvath/releases/tag/v1.1.0'))
    )
    expect(result).toEqual({
      ok: true,
      update: { version: '1.1.0', url: 'https://github.com/eriscorp/corvath/releases/tag/v1.1.0' }
    })
  })

  it('refuses a release URL that is not under corvath’s own releases path', async () => {
    // The manifest is in a repository other maintainers can write.
    for (const url of [
      'https://github.com/Caeldeth/corvath/releases/tag/v1.1.0',
      'https://github.com/hybrasyl/corvath/releases/tag/v1.1.0',
      'https://github.com/eriscorp/corvath/releases/../../balor/releases/tag/v1.1.0'
    ]) {
      expect(await checkForUpdate(ctxWith(entry('1.1.0', url)))).toEqual({
        ok: false,
        reason: 'bad-url'
      })
    }
  })

  it('is on app:checkForUpdate, and takes nothing from the renderer', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const ipcMain = {
      handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn),
      on: () => undefined,
      once: () => undefined
    } as unknown as IpcMain
    const url = `${appIdentity.releaseUrlPrefix}tag/v1.1.0`
    registerHandlers(
      { ipcMain, BrowserWindow: {} as never, dialog: {} as PickerDialog },
      ctxWith(entry('1.1.0', url), '1.0.0')
    )
    const handler = handlers.get('app:checkForUpdate')
    expect(handler).toBeDefined()
    // A renderer that sends a version cannot change what main compares.
    expect(await handler!({}, '0.0.1')).toEqual({ ok: true, update: { version: '1.1.0', url } })
  })
})
