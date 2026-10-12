# Corvath review remediation plan

> **SHIPPED — all of Phases 0-7 landed.** Kept as a record. Two corrections found when this was filed under `complete/` (2026-08-01), because a deferred note ages:
>
> - Phase 2's acceptance names `%APPDATA%\Themisco\Corvath`. That path never existed. The app writes to `%LOCALAPPDATA%\Erisco\Corvath` — a local dir, not roaming, under the Erisco vendor name settled in the 1.0 branding pass.
> - The "out of scope, do not do" list at the top is now largely DONE and must not be read as current policy: the appId change, the CI release pipeline, `.corvathdeck` export/import, and the mac/linux targets have all since shipped. Only the Game-Icons title bar is still deferred — it lives in [00a-backlog.md](../00a-backlog.md) now.

Handoff plan from the 2026-07-09 full review (template comparison, architecture-doc compliance, bug hunt, theme parity). Work through the phases in order — each phase is independently shippable and leaves the app green (`npm run typecheck`, and once Phase 0 lands, `lint:check` + `test`).

**Reference material** (consult before writing code, don't guess):

- `E:\Dark Ages Dev\Repos\Comhaigne\docs\architecture\electron-app-skeleton.md` — the house standard this plan converges on.
- `E:\Dark Ages Dev\Repos\Comhaigne\docs\architecture\mundanes-dubhaimid-themes.md` — the playbook for Phase 1 (corvath is the last app missing these themes).
- `E:\Dark Ages Dev\Repos\hyb-electron-template` — runnable snapshot of the standard.
- `E:\Dark Ages Dev\Repos\taliesin` — lean-format theme files, splash, scrollbar wiring, handlers.ts pattern, vitest config.
- `E:\Dark Ages Dev\Repos\elatha\src\renderer\src\store\settingsStore.ts` — canonical zustand settings-store pattern.

Out of scope (explicitly deferred, do not do): Game-Icons title bar, nsis+portable/mac/linux targets, appId change, CI release pipeline, `.corvathdeck` export/import.

---

## Phase 0 — Tooling baseline (do first so later phases are gated)

1. **eslint + prettier.** Copy from the template: `eslint.config.mjs` (flat config: `@electron-toolkit/eslint-config-ts` recommended → `eslint-plugin-react` flat.recommended — classic JSX runtime, do NOT add the jsx-runtime preset → `react-hooks` recommended-latest → `settings.react.version: 'detect'` → prettier last; rules: `explicit-function-return-type` off, `react/prop-types` off, `react/no-unescaped-entities` off, `no-unused-vars` with `^_` ignores, `react-hooks/exhaustive-deps` warn), `.prettierrc.yaml` (singleQuote, no semi, printWidth 100, no trailing comma), `.editorconfig`. Add the matching devDeps and `lint` / `lint:check` / `format` scripts. Fix whatever the first `lint` run flags.
2. **vitest.** Crib `taliesin/vitest.config.mjs` (dual node/jsdom projects, v8 coverage, jsdom setup file importing `@testing-library/jest-dom`). Add `test` / `test:coverage` scripts and devDeps (`vitest` ^4, `@vitest/coverage-v8`, `@testing-library/react` ^16, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom` ^29). Seed tests (node project) for the highest-risk pure code:
   - `src/main/jsonStore.ts` — atomic write, backup recovery, corrupt-primary fallback, serialized save queue surviving a failed save.
   - `src/main/store.ts` — `normalize` rejection paths, `safeSegment`, `resolveWithin` (including the Phase 4 traversal fix), seed merge (`ensureDecksSeeded` add-missing / replace-on-newer-seedVersion / leave-user-decks).
   - `src/renderer/src/lib/importReadings.ts` — all-or-nothing validation, layout position mapping.
   - `src/renderer/src/lib/deck.ts` — `rebuildMinors` preservation, `renumberMajors`.
3. **typecheck via project references.** Replace the two `--composite false` passes with `"typecheck": "tsc --build"` (the solution-style tsconfigs already exist). Add `*.tsbuildinfo` and `coverage` to `.gitignore`.
4. **Repo hygiene.** Stop ignoring `.vscode/` and commit `.vscode/settings.json` with the Action Buttons config from the skeleton doc §"vscode". Update the stale `!{.eslintignore,.eslintrc.cjs,...}` exclude in `electron-builder.yml` to the flat-config filename (mirror the template's `files` list).

**Acceptance:** `npm run typecheck && npm run lint:check && npm run test` all pass.

## Phase 1 — Theme parity: add mundanes + dubhaimid

Corvath is the only family app missing the two corporate themes. Its four existing theme files are byte-identical to taliesin's, so taliesin is the drift-free source.

1. Copy `taliesin/src/renderer/src/themes/mundanes.ts` and `dubhaimid.ts` **verbatim** (lean format: stock MUI palette keys only, inline typography, `MuiButton`/`MuiSlider` overrides, navy `#0a246a` AppBar override, `secondary.dark: '#7fb3ee'`). Do NOT use oghma/template's extended-format values — corvath has no `augmentation.ts`.
2. Wire everything that enumerates themes (missing any of these breaks silently):
   - `src/shared/types.ts:3` — widen the `ThemeName` union.
   - `src/main/store.ts:8` — add to `THEME_NAMES` (otherwise the persisted theme is coerced back to hybrasyl on every launch).
   - `src/renderer/src/themes/index.ts` — imports/exports, `themes` map, `THEME_OPTIONS` (labels: "Mundanes", "Dubhaimid").
3. Chrome integration per the themes doc §5: add `PLAIN_CHROME_THEMES: ThemeName[] = ['mundanes', 'dubhaimid']` (export from `themes/index.ts`) and branch in `TitleBar.tsx` so the corporate themes get flat chrome with legible white text/icons on the navy bar. Corvath's title bar already uses plain MUI icons, so this is color handling only — crib the color logic from `taliesin/src/renderer/src/components/TitleBar.tsx`.

**Acceptance:** both themes appear in the picker, chrome text/controls legible in both, selection persists across an app restart (proves the `THEME_NAMES` wiring).

## Phase 2 — State layer: zustand + debounced persistence

Replace the plain-hook state (`useDecks`, `useReadings`, `useLayouts`, theme state in `App.tsx`) with zustand stores. This one refactor fixes four review findings at once: save-on-every-keystroke, the redundant save fired right after load, readings reloading from disk on every tab switch, and the stale-read race when a tab bounce reloads while a save is still queued in main.

1. Add `zustand` ^5. Create `src/renderer/src/store/` with one store per domain: `settingsStore`, `readingsStore`, `decksStore`, `layoutsStore`. Pattern per `elatha/src/renderer/src/store/settingsStore.ts`:
   - `hydrate()` loads via `window.api.*` with a `hydrated` flag and a `suppressNextSave` guard so hydration doesn't bounce the file (also protects against HMR reloads persisting defaults — see themes doc §6).
   - Module-level `store.subscribe` that **debounces saves 200 ms** through IPC and skips entirely until hydrated. Flush pending saves on `beforeunload`.
2. Port the existing mutation logic (mutate-by-id, `rebuildMinors` on structural change, `renumberMajors`, `applyLayout`, `importReadings` prepend) into store actions — behavior identical, keep `updatedAt` stamping. Keep the hook files as thin selector wrappers or delete them and update call sites; either way pages/components keep their current props shape where practical.
3. Hydrate all stores once at app start (from `App.tsx`), not per-page — readings no longer remount-reload on tab switches.
4. Theme moves into `settingsStore`; `changeTheme` goes through the debounced save path.

**Acceptance:** typing continuously in a reading-notes field produces no IPC saves until 200 ms after the last keystroke (verify by watching `%APPDATA%\Themisco\Corvath` mtimes or a temporary console.log in main); launching the app does not rewrite unchanged json files; switching tabs does not reload readings from disk; existing behavior (create/edit/delete/ import, layout apply confirm) unchanged.

## Phase 3 — Boot UX: splash, app:ready reveal, hydration gate, themed scrollbars

1. **Hydration gate.** `App.tsx` renders a `CircularProgress` (or nothing) until `settingsStore.hydrated` — first real paint is already in the persisted theme. This kills the hybrasyl flash on launch.
2. **Splash + reveal handshake.** Port `taliesin/src/main/splash.ts` + `taliesin/resources/splash.html` (swap logo/title for corvath's). Main: create the splash immediately, keep the main window hidden (drop the `ready-to-show` show), reveal on an `app:ready` IPC signal sent by the renderer after hydration, with a 15 s `setTimeout` backstop that reveals anyway. Preload: add `appReady()` to `TarotApi`.
3. **Themed scrollbars.** After hydration and on every theme change, `App.tsx` pushes `--scrollbar-*` CSS variables onto `document.documentElement` from the active theme; `assets/main.css` styles `::-webkit-scrollbar*` from those variables. Crib the variable set and CSS from the template (`App.tsx` + `assets/main.css`) and taliesin's `scrollbarColors` map — corvath needs entries for all six themes.

**Acceptance:** cold launch under a dark theme shows splash → app already themed, no default-theme flash; scrollbars in the readings list / deck grid recolor when switching themes, including mundanes/dubhaimid.

## Phase 4 — Main-process hardening

1. **Zod IPC validation.** Add `zod` ^4. Schemas in `src/main/schemas/` for `Settings`, `Reading[]`, `Deck[]`, `Layout[]` and the `decks:saveImage` args. Validate at every mutating handler; on failure, throw (reject the invoke) without writing. Reuse the schemas inside the stores' `normalize` functions so load-validation stops being shallow casts.
2. **handlers.ts refactor.** Extract handler bodies from `src/main/index.ts` into `src/main/handlers.ts` as plain async `(ctx, ...args)` functions plus a `registerHandlers({ ipcMain, BrowserWindow }, ctx)` registry, per `taliesin/src/main/handlers.ts`. `index.ts` becomes a thin lifecycle shim (window/splash/protocol/paths only). Add node-project unit tests for the handlers (valid payload persists, invalid payload rejects and leaves the file untouched).
3. **Fix the path-prefix check** in `src/main/store.ts` `resolveWithin`: the current `target.startsWith(resolve(root))` admits sibling paths sharing the root as a string prefix (`deckId: '..', filename: 'decks.json'` resolves to the real decks.json and passes). Compare against `resolve(root) + sep` (or `path.relative` not starting with `..`). Add the regression test.
4. **Orphaned image cleanup.** Deleting a deck, deleting a card, and "Remove" image/back currently leave files under `<dataDir>/decks/<deckId>/` forever. Add `decks:deleteImage(deckId, cardId)` and `decks:deleteDeckImages(deckId)` IPC (same `safeSegment` discipline), and call them from the corresponding store actions. Best effort — a failed unlink must not fail the state change.
5. **Extension heuristic.** In `importCardImage`/`importDeckBack`, only treat the suffix as an extension when the filename actually contains a dot (`file.name.includes('.') ? file.name.split('.').pop()! : 'png'`).
6. **Seed-upgrade merge (small, decide-in-code).** `ensureDecksSeeded` currently replaces a built-in deck wholesale when `seedVersion` bumps, discarding user-entered meanings/ keywords. Change the replace path to a per-card merge: take the seed's structure/art, but preserve the user's `meaning`/`meaningReversed`/`keywords` for cards matched by id (majors) or suit+rank (minors) when the seed's own field is empty. Test it.

**Acceptance:** malformed `decks:save` payload rejects without touching disk; traversal regression test passes; deleting a deck removes its image directory; all Phase 0 gates still green.

## Phase 5 — Image cache-busting fix

Every keystroke in any deck field currently changes `?v=${deck.updatedAt}` on **all** card image URLs (`CardThumb.tsx:13`, `DeckEditor.tsx:44`, `CardEditor.tsx:41`), re-fetching the entire grid through the protocol handler (a disk read per image per keystroke).

Replace with per-image versioning: add `imageVersion?: number` to `DeckCard` (and `backVersion?: number` to `Deck`), bump it only in `importCardImage`/`importDeckBack`, and build URLs as `?v=${card.imageVersion ?? 0}`. Old data without the field renders with `v=0` — correct, since their files haven't been replaced. While here, add `cache-control: no-cache` to the protocol handler's response headers so Chromium revalidates rather than hard-caches when the version doesn't change.

**Acceptance:** typing in the deck-name field triggers zero image requests (verify with a counter log in `handleAssetRequest`); replacing a card's image still updates its thumb immediately; all other thumbs keep their cached bytes.

## Phase 6 — Dependency upgrades

In this order, each with a full manual smoke pass (all three tabs, theme switch, image import, drag layout positions):

1. **MUI 7 → 9** (`@mui/material`, `@mui/icons-material`). The skeleton doc notes the jump is low-impact for apps avoiding Grid/Hidden/makeStyles — corvath avoids all three. Watch for renamed deprecated icons.
2. **React 18 → 19** (+ `@types/react`/`@types/react-dom` ^19). Corvath already uses `React.JSX.Element`, so mostly a version bump; check `InputLabelProps`/`InputProps` deprecations MUI 9 may surface (prefer `slotProps`).
3. **Vite 6 → 7** + `@vitejs/plugin-react` ^5 (stay within electron-vite ^5 peer range).

**Acceptance:** typecheck/lint/tests green, dev HMR works, `npm run build:unpack` launches and loads all bundled deck art.

## Phase 7 — Small cleanups

- Delete the dead non-isolated fallback branch in `src/preload/index.ts` (template did; corvath always runs context-isolated). Keep the `window.electron` exposure; declare it in `env.d.ts` if lint complains.
- `src/renderer/src/env.d.ts`: keep in sync with the preload surface after Phase 3 adds `appReady()`.

---

## Suggested commit granularity

One commit per numbered item within a phase where practical, one PR (or push) per phase. Run `npm run typecheck && npm run lint:check && npm run test` before every commit from Phase 0 onward.
