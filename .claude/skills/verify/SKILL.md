---
name: verify
description: Build, launch, and drive the Corvath Electron app over CDP to observe a change working end-to-end.
---

# Verifying Corvath

Corvath is an Electron + React + MUI app. To observe a change, launch the real app with `--remote-debugging-port` and drive it over the Chrome DevTools Protocol. Node 24 has a global `WebSocket` and `fetch`, so a CDP driver needs no deps.

**Reach for `npm run e2e` first when a Playwright spec would do.** `e2e/` has a launch harness (hermetic temp profile, splash-skipping, relaunch-for-persistence) and specs for boot/settings/themes. CDP is for the cases it doesn't cover: eyeballing pixels, one-off exploration, and driving a flow you don't want to commit a spec for.

## Build and launch

```bash
npm run build          # produces out/main/index.js
```

```powershell
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue   # see gotchas
$env:LOCALAPPDATA = "<scratch>\profile"                              # throwaway profile
& ".\node_modules\.bin\electron.cmd" . --remote-debugging-port=9222 --no-sandbox
```

Then `GET http://127.0.0.1:9222/json/list`, take the `page` target whose url is not the splash, and connect to its `webSocketDebuggerUrl`. `Runtime.evaluate` for reads, `Input.dispatchMouseEvent` for clicks, `Page.captureScreenshot` for pixels.

## Gotchas that will cost you an hour

- **`ELECTRON_RUN_AS_NODE=1` is inherited** when Claude Code runs inside the VS Code extension. Electron then runs as plain Node and dies with `Cannot read properties of undefined (reading 'isPackaged')`. Unset it first.
- **`Browser.getWindowForTarget` / `setWindowBounds` are not available** on Electron page targets. Resize with `Emulation.setDeviceMetricsOverride` — it sets the renderer viewport, which is what layout responds to anyway.
- **Isolate the profile via `LOCALAPPDATA`.** `src/main/index.ts` resolves userData as `%LOCALAPPDATA%/Erisco/Corvath`. Pointing `LOCALAPPDATA` at a temp dir gives a clean install _and_ keeps you out of the user's real readings and decks. Always do this — never drive the app against the real profile.
- **Every store file is wrapped as `{ version, <key> }`** (`decks.json` → `{version, decks: [...]}`, `layouts.json` → `{version, layouts: [...]}`). A bare array is silently rejected by `normalize` and falls back to defaults.
- **`ensureLayoutsSeeded` only seeds when layouts.json is _absent_** (`store.ts` — an `exists()` guard, unlike decks which re-add missing built-ins by id). So a hand-seeded layouts.json must also contain any built-in spreads you want, or you get none. A malformed layouts.json yields zero layouts permanently.

## Selectors that work

There are a few test ids (added for the e2e harness, which waits on `app-root`): `app-root` (carries `data-theme`), `app-hydrating`, `title-bar`, `theme-select` (the theme picker's radio group on Settings) and `theme-option-<name>` (one card per theme; click it to switch). Everything else is MUI markup; these hold up:

- Tabs: `button[role="tab"]` — order is Readings, Draw, Decks, Layouts.
- Selects: `.MuiSelect-select` (click to open, then `li[role="option"]`).
- Sidebar lists: `.MuiListItemButton-root`.
- Cards (`DrawCard`): a `div` with `perspective: 700px`. Width distinguishes them — 150px in the slot tray, 88px in the fan pile.
  - `spent` (already picked / pinned) renders as `opacity: 0.35`.
  - `flipped` (face showing) is a `rotateY(180deg)` on the first child.
- Fan DOM order is row-major, so the Nth `perspective:700px` 88px div is fan index N. Index 0 is the top of the deck, index 77 the bottom.

## Flows worth driving

- **Draw / Fan & pick** is the richest surface. Seed a layout with `source: 'top'|'bottom'` on some positions (no built-in spread sets `source`), pick the spread, toggle Fan & pick, Shuffle & Draw. Pinned slots should arrive pre-filled and their fan cards spent at indices `[0, n-1]`.
- **Deck seeding** shows on the Decks tab against a fresh profile.
- **Spread board art** (reading view) — the fiddliest case is a _reversed_ card in a _rotated_ crossing position: `LayoutBoard` rotates the tile by `position.rotation` and the `<img>` inside it by 180° when reversed, so the two compose (a reversed Celtic Cross challenge card reads as 270°). To set one up deterministically, seed `readings.json` directly rather than drawing: read the position ids out of the seeded `layouts.json`, then write entries keyed by `positionId` with `orientation: 'reversed'` on the `rotation: 90` one. Assert on `getComputedStyle(img).transform` — `matrix(-1, 0, 0, -1, 0, 0)` is the 180° — and check `naturalWidth > 0` to prove the art loaded rather than silently falling back.
- **Width/layout** — `Emulation.setDeviceMetricsOverride` to 1920x1080 and to the 940 minWidth, then compare `documentElement.scrollWidth` to `clientWidth`. `main.css` sets `body { overflow: hidden }`, so horizontal overflow silently clips instead of showing a scrollbar — measure, don't eyeball.
