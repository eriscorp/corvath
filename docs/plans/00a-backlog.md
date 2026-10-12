# Backlog — the deferral register

Everything deliberately not being done now, and why. A register accrues for the life of the project, so it lives here rather than inside any one WP's branch.

Three kinds of entry: **parked behind a trigger** (do it when X happens), **owed elsewhere** (belongs to another repo), and **non-goals** (decided against; do not re-propose without a new reason).

## Parked behind a trigger

| Item | Trigger | Notes |
| --- | --- | --- |
| ~~Seed-vs-user-edit precedence~~ | ~~Any change to a built-in deck's meanings~~ **— fixed 2026-08-14** | Done (HTOO-231), and **not by the fix this row proposed.** The row said "a per-card merge that only fills fields the user left empty". That would freeze every card at its current text forever: now that the decks ship full text, no field is ever empty, so no future correction could reach an existing install. The real fix is per-field provenance — see `mergeSeedDeck` in `src/main/store.ts`. Kept as a record that a plausible fix failed in the opposite direction to the bug. |
| macOS signing + notarization | An Apple Developer account exists | `electron-builder.yml` has `mac.notarize: false` and the CI job passes `CSC_LINK` / `APPLE_*` through as optional secrets. Flip `notarize` to true and add the secrets; the job already builds an unsigned dmg today, so nothing else changes. |
| Windows code signing | SSL.com eSigner credentials exist | The release job's two signing steps (Temurin 17, then CodeSignTool v1.3.2 for both exes, each read back as `Valid`; HTOO-517) are guarded: with no `ES_*` secrets the job warns and ships unsigned exes rather than failing. SmartScreen warns on first run until then. When the secrets exist, remove the guard so a run without them fails, and swap the guard case in `scripts/release-signing.test.mjs` for the template's "signs unconditionally" case. The first tag run with the secrets is the first real test of the sign step. |
| ~~nsis installer target~~ | ~~A reason to ship an installer~~ **— done 2026-08-14** | Shipped. `win.target` carries `nsis` and `portable`, assisted and per-user, per HTOO-373's house decision. `scripts/release-artifacts.test.mjs` pins the targets against the release globs. Row kept rather than deleted: it is why the `nsis` block sat unused for months while reading as ready. |
| Raising the coverage floors | The zustand stores pick up unit tests | The floors in `vitest.config.mjs` are ratcheted just under actual so the suite guards against regression rather than stating an aspiration. The untested bulk is the UI layer, covered by `e2e/` instead. |
| ~~Default deck / spread / draw mode~~ | ~~Re-picking the same one becomes annoying~~ **— done 2026-08-15** | Shipped (HTOO-408). Sabrael took all three on 2026-08-15, so the trigger never had to fire. They are ids, not names, so a rename cannot silently drop a default, and a deleted deck or spread reads as "no default" rather than leaving a dangling picker. **The two traps this row warned about were both real and both handled:** the schema field went in first, and `lib/settingsFields.ts` screens every value before it reaches the store — one field main rejects would reject the whole document, theme included. |
| ~~Draw-tab e2e specs~~ | ~~The draw UI stops changing shape~~ **— done 2026-08-15** | Done (HTOO-233), and the trigger was the wrong one. Waiting for the UI to "stop changing shape" is what left the tab uncovered indefinitely; the specs assert behaviour (a slot fills, a row fits, a reading reaches disk) rather than layout, so they survive the shape changing. Row kept as a caution against writing a trigger that can never fire. |

## Owed elsewhere

| Item | Where it belongs |
| --- | --- |
| Deck art pipeline scripts | Corvath keeps `scripts/build-argent-art.mjs` and `scripts/build-hybrasyl-art.mjs` locally because the source art is not in the repo. If a third deck needs the same treatment, generalise them rather than adding a third copy. |

### House standards corvath owes

Audited against every `Electron`-labelled card in the tracker on **2026-08-14**. Each of these is a house card that names its own adopters; corvath's state is recorded as a comment on the card, and the pickup is listed here so it is visible from inside this repo. **None of them blocks `v1.0.0`.**

| Card | State in corvath |
| --- | --- |
| **HTOO-236** — `.gitattributes` (`eol=lf`) | **Owed.** No `.gitattributes`. `npm run format` is `prettier --write .`, which normalises to LF, so any CRLF file is rewritten whole on the next format run. `.vscode/settings.json` is valid strict JSON here, so corvath does **not** carry the template's trailing-comma defect. Pickup: the file, `git add --renormalize .` as its own commit, then `npm run format`. |
| **HTOO-325** — Remote Desktop → software rendering | **Owed.** No `SESSIONNAME` check and no `disableHardwareAcceleration()`. About ten lines, pre-`ready`, beside the existing `app.setPath('userData', …)`. |
| **HTOO-351** — single-instance lock | **Owed.** No `requestSingleInstanceLock()`. Two copies share one `%LOCALAPPDATA%/Erisco/Corvath` and the last writer wins — corvath debounces store writes, so this is a real way to lose a reading. Now more likely than it was: the NSIS installer means a user can have an installed copy _and_ a portable one. |
| ~~**HTOO-393** hole 2~~ — a new page is covered by nothing | **Done 2026-08-15 (HTOO-408).** `e2e/nav-pages.spec.js` walks every destination and every page carries a page-level `data-testid`. The spec **parses `NAV_ITEMS` out of `NavBar.tsx`** rather than keeping its own list — a hand-maintained copy stops matching the app exactly when a new page needs covering, which is this hole one layer up. Proved red by making the new Settings page throw on render. |
| ~~**Fuse verification**~~ (HTOO-167 / HTOO-303 / HTOO-374 shape) | **Done 2026-08-15 (HTOO-403).** `scripts/verify-fuses.mjs`, ported from taliesin's, runs in `release.yml` against `dist/win-unpacked/corvath.exe` and the Linux unpacked binary — **before** signing, which rewrites the exe. The macOS job had no read until 2026-10-11 (HTOO-374); it now reads both slices of `dist/mac-universal/Corvath.app` before the upload. It scans **every** sentinel rather than using `getCurrentFuseWire`, which reads only the first and would leave half a universal mac binary unread. The config half is a unit test, so a deleted fuse reds `npm run validate` without needing a build. Proved both halves red by flipping `runAsNode` and repackaging. |
| ~~**HTOO-381 / HTOO-399**~~ — `enableEmbeddedAsarIntegrityValidation` | **Done 2026-10-11 (HTOO-381).** The fuse is on, `verify-fuses.mjs` asserts index 4 in all three release jobs, and the CHANGELOG header starts the packaged build before the tag. **It covers the code, not the art:** `bundled/` (83 MB) is `asarUnpack`ed, so `app.asar` is about 7 MB, and Electron does not check unpacked files. A packaged launch timed before and after shows no difference. |

Not applicable: **HTOO-287** (Dark Ages filename case sensitivity — corvath ships no DA assets), **HTOO-292** (Creidhne/Taliesin companion launching), **HTOO-382** (a public version manifest for private apps — corvath's `updateCheck.ts` reads the GitHub releases API directly).

Already compliant: **HTOO-38** and **HTOO-63** (R-008, landed 2026-08-14), **HTOO-65** (update notification — but see the snackbar defect card), **HTOO-390** (the local gate: `npm run validate`, `.githooks/pre-push`, `scripts/validate-linux.mjs`, `ci.yml` on `workflow_dispatch` only), **HTOO-393** hole 1 (the renderer uses no Node globals as values — measured over 44 files, with a planted control to prove the check detects).

## Non-goals

| Item | Why not |
| --- | --- |
| Game-Icons title bar | The house skeleton offers it; corvath uses its own branded logo in the title bar instead. Deferred at the 2026-07-09 review and still declined. |
| electron-updater / auto-download | Decided against — notification only. An unsigned personal app auto-replacing its own binary is worse than a link to the release page. |
| Roaming (`%APPDATA%`) data | All data is local by design. A tarot journal with bundled art is not something to sync onto a domain profile. |
| A server / sync backend | Corvath is local-only. Deck export/import is the sharing story. |
