# E2E (Playwright + Electron)

End-to-end specs that drive the **built** app via Playwright's `_electron` launcher — the house standard for cross-boundary behavior Vitest can't reach (disk round-trips, real window geometry, full themed renders). Full rationale + patterns: `Comhaigne/docs/architecture/e2e-playwright-electron.md`.

## Running

```bash
npm run e2e        # builds (electron-vite) then runs all specs
npm run e2e:only   # runs specs against the existing out/ build
```

**Not local-only.** `ci.yml` runs an `e2e` job on `windows-latest` — a Windows runner has a desktop session, so no xvfb wrapper is needed. Note `ci.yml` is `workflow_dispatch` only (HTOO-390), so the everyday gate is `npm run validate`, run by hand before a push; run `npm run e2e` by hand before anything touching boot, settings, themes or the draw tab.

## What's here

- **`helpers.js`** — the reusable harness:
  - `launchApp({ seedSettings?, seedDecks?, seedLayouts?, seedReadings?, localAppData? })` — launches the built app, strips `ELECTRON_RUN_AS_NODE`, and redirects `%LOCALAPPDATA%` to a temp dir so runs are hermetic. Reuse `localAppData` across two launches to test persistence. The `seed*` options pre-write a store so a spec can reach state the shipped data cannot — `seedLayouts` exists because no built-in layout sets a position `source`, which makes `planFan`'s pinned-slot path unreachable otherwise. It launches `args: ['.']` with `cwd: repoRoot`, **not** `out/main/index.js`: given a file, Electron never reads the repo `package.json`, so `app.getVersion()` and `app.getAppPath()` both differ from a packaged build (house E2E doc §3.5).
  - `getMainWindow(app, { bridge? })` — skips the splash and returns the real main window. It finds it by the `window.electron` toolkit bridge (present on every sibling's preload, absent on the splash), so it needs **no per-app change**. Override `bridge` only if you both rename `window.api` _and_ drop the toolkit bridge.
  - `readGeometry(app, page, selector?)` — native window bounds + a DOM element's on-screen left edge, for measuring layout/offsets (see the offset-spec pattern in the house doc).
- **`app-boot.spec.js`** — smoke: splash → main window revealed → hydrated UI on screen, all four tabs present, and the built-in decks/layouts seeded on a first run.
- **`settings-persistence.spec.js`** — change theme → wait for the write to hit disk → relaunch same userData → assert it hydrated. The full renderer → IPC → disk → reload loop.
- **`theme-switch.spec.js`** — cycle all six themes; each must apply (`data-theme`), repaint, and raise no `pageerror`. Catches a theme wired into the picker but missing from the themes map or main's `THEME_NAMES`, which otherwise fails silently.
- **`legacy-profile-migration.spec.js`** — HTOO-231. Boots once to get a real seeded `decks.json`, strips every `seedFingerprints` to reproduce a pre-provenance install, then proves the backfill stamps only what is provably unedited and that a later bump delivers corrections without touching anything the user authored.
- **`draw.spec.js`** — HTOO-233. Both draw modes, the fan row-fit measurement, the pinned-slot path (via `seedLayouts`), and the save handoff into Readings and onto disk.

## Testids the harness depends on

`getMainWindow` waits for `[data-testid="app-root"]`, so these must stay put:

- `app-root` (+ its `data-theme`) and `app-hydrating` — `src/renderer/src/App.tsx`.
- `title-bar` and `theme-select` — `src/renderer/src/components/TitleBar.tsx`.
- `draw-slot` (+ `data-slot-index` / `data-flipped` / `data-card-name`), `fan-card` (+ `data-fan-index` / `data-spent`), `fan-row` (+ `data-row-step`) and `draw-mode-deal` / `draw-mode-fan` — `src/renderer/src/pages/Draw.tsx`. The tray and fan are otherwise anonymous `div`s whose state is expressed only as a transform or an opacity.

## Gotcha specific to the fan

A fan card is deliberately overlapped by its right-hand neighbour, so only its leftmost `step` px are hittable and the element's centre belongs to whichever card is painted over it. Click with an explicit `position: { x: 4, y: 60 }`, as `draw.spec.js` does.

## Gotchas

1. `ELECTRON_RUN_AS_NODE` set in env → Electron boots as plain Node and crashes at `app.setPath`. `launchApp` strips it.
2. Splash window → `firstWindow()` can grab it. `getMainWindow` selects by the preload bridge.
3. Main window is hidden until the renderer signals `app:ready` → wait for `isVisible()`.
4. Test the **built** app; rebuild after any `src/` change (`npm run e2e` does `build &&` first).
