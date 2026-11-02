# Mac and Linux checks

This page is for an agent that runs on the Mac or the Linux box. The Windows checks are done on the Windows dev box during the work. This page covers what only macOS or Linux can show.

It is a copy of the template's `docs/release-checks-mac-linux.md`, written again for Corvath: the names, the counts, the cards, and the last section.

Each check names the tracker card it reports to. The tracker is in the document repo (`tracker/issues/HTOO/`). Follow the writing conventions in that repo's `AGENTS.md`: commit straight to `main`, one commit per card, message `tracker: HTOO-<n> comment`, stage only paths under `tracker/`, set `updated` to the real time, and push at once.

## Before you start

1. Pull `main` and do a clean install:

   ```bash
   git checkout main && git pull --ff-only
   npm ci
   ```

2. Make sure that the Electron binary is present. `npm ci` runs `install-electron` through `postinstall`. If `node_modules/electron/dist` is missing, run `npx install-electron`.
3. `npm install-scripts ls` must print `No packages with unreviewed install scripts.` On macOS this is where a missing `fsevents` approval shows, because `fsevents` installs on macOS only. Report anything that it lists. Do not approve it yourself. (HTOO-542)
4. Make sure that `ELECTRON_RUN_AS_NODE` is not set. Some agent shells set it, and then Electron runs as plain Node. Run `unset ELECTRON_RUN_AS_NODE` in each shell that builds or runs e2e.
5. Use Node 24 (`.nvmrc`).
6. Quit any running copy of Corvath. A3 hashes the real data folder, and a running copy changes files there.

## How to report

- Record each result as a comment on the card that the check names. Give the date, the OS and its version, the commit (`git rev-parse --short HEAD`), the command, and what you saw.
- No card tracks Corvath's macOS title bar and menu (B2, B3). Record those results in Corvath's row of `docs/architecture/macos-chrome.md` §10 in the document repo: add "checked on a Mac, <date>, <commit>", or the fault.
- Do not change a card's status or a coverage row yourself. Sabrael does that after the results are in.
- Some checks need a person to look at the window. You cannot see the window, so ask the person at the machine to do those steps, and record their answer.

## When a check fails

**You fix it. Do not send the failure back to the Windows box.** Only this machine can show the failure and prove the fix, so a hand-back costs a round trip for each attempt. Do these steps in this order:

1. **Report the failure first.** Write a comment on the card that the check names. Copy the exact output, and give the OS, its version and the commit. Push it before you start the fix. Then the record is correct even if the fix takes a long time or does not succeed.
2. **Find the cause and fix it.** The cause can be in the test or in the app:
   - A test that is wrong on this OS (a path, a timing, a platform assumption): fix the test.
   - An app fault that only this OS shows: fix the app, and add or change a test so that the fault cannot come back without a red test.
   - Do not make a test pass by skipping it on this OS, by widening a timeout with no measurement, or by weakening what it asserts. If you think that the check itself is wrong, stop and ask Sabrael.

   Work on a new branch from `main` (never from another feature branch), one commit per fix, and open a PR against `main`.

3. **Run the gate on this machine.** Run A1, and run again the check that failed. When the fix changes code that also runs on Windows, say so in the PR. Sabrael then runs the Windows gate before the merge.
4. **Report the fix.** Write a second comment on the same card: the cause, the PR, the commit, and the new result of the check.

Ask Sabrael, not the Windows agent, only when the fix needs a decision: a change to what the app does, or to what a card asks for.

## Part A: commands the agent runs

### A1. The gate (both OS)

```bash
npm run validate && npm run build && grep -o 'require("[^"]*")' out/preload/index.js
```

Every step must pass. The `grep` must print `require("electron")` only. The preload is sandboxed, and a sandboxed preload can load only `electron` (HTOO-54). Report the test count.

The suite is 1198 passed and 0 skipped (2026-11-02, after the splash and window-button tests). No unit test in Corvath depends on the OS, so expect the same count on each machine. Report the exact numbers, and name any test that fails or skips.

### A2 and A3. e2e on Electron 44, and the real data stays the same (both OS) — HTOO-553, HTOO-543

A2 runs the e2e suite (HTOO-553). A3 proves that the suite does not touch the real data folder (HTOO-543): the e2e helper redirects `LOCALAPPDATA` to a temp folder, main reads `LOCALAPPDATA` on every platform, and `assertIsolated` fails a launch whose `userData` is not under the temp folder. One e2e run serves both, and it rebuilds the app first, so do not run it twice.

The real data folder:

| OS    | Data folder                                     |
| ----- | ----------------------------------------------- |
| macOS | `~/Library/Application Support/Erisco/Corvath/` |
| Linux | `~/.config/Erisco/Corvath/`                     |

```bash
unset ELECTRON_RUN_AS_NODE
S="<data folder from the table>"
T=$(mktemp -d)
ls -d "$S"          # say in the report whether it exists
find "$S" -type f -exec sha256sum {} + 2>/dev/null | sort > "$T/before.txt"
npm run e2e
find "$S" -type f -exec sha256sum {} + 2>/dev/null | sort > "$T/after.txt"
cmp "$T/before.txt" "$T/after.txt" && echo UNCHANGED
ls -d "$S"          # a folder that did not exist before must not exist now
```

If `sha256sum` is missing, use `shasum -a 256`.

Expected for A2:

- **macOS:** 27 passed. That includes the four tests in `e2e/app-menu.spec.js`, which runs on macOS only: the installed menu with no Reload and an empty title bar, Check for Updates…, Go and the grey Export All Readings… with nothing run over a dialog, and About Corvath and What's New.
- **Linux:** 23 passed and 4 skipped. The skips are `app-menu.spec.js`.
- On Windows the result is also 23 passed and 4 skipped.

A different total means that a spec was added or was not collected. Say so in the report. An `e2e isolation failed` error is an A3 failure: report it on HTOO-543.

e2e opens and closes its own windows. It needs a desktop session but no clicks. On a Linux box with no display, use `xvfb-run -a npm run e2e`.

Expected for A3: `UNCHANGED`, and no new folder.

### A4. The fuses on a packaged build (both OS) — HTOO-374, HTOO-381

On macOS, build an unsigned universal app, without notarization:

```bash
npm run build
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --dir --universal -c.mac.notarize=false
npm run verify:fuses -- dist/mac-universal/Corvath.app
```

`--universal` is required. `--dir` replaces the configured targets, and without an arch flag it builds only the host's architecture (`dist/mac-arm64/` on Apple Silicon), which has one wire.

Expected: OK with 2 wires, one for each slice (x64 and arm64). If the Mac has no Developer ID certificate, electron-builder prints `skipped macOS application code signing`. That is expected.

On Linux:

```bash
npm run build
npx electron-builder --linux --dir
npm run verify:fuses -- dist/linux-unpacked/corvath
```

Expected: one wire, OK. The reader checks all five fuses on Linux too. electron-builder sets the asar integrity fuse there, and Linux does not enforce it.

### A5. The packaged app gets past the asar check and starts (both OS) — HTOO-381

With the asar integrity fuse on, a damaged package exits with no window and no message. The only signs of the failure are a non-zero exit and `ASAR Integrity Violation` on stderr, so start the binary from the terminal. Point it at a temp folder so that it does not write the real data. On Linux, use `dist/linux-unpacked/corvath` for the binary. The e2e suite runs the app from `out/`, not the package, so this is the only automated check that the packaged app starts on each OS.

```bash
T=$(mktemp -d)
BIN=dist/mac-universal/Corvath.app/Contents/MacOS/Corvath   # Linux: dist/linux-unpacked/corvath
LOCALAPPDATA="$T" "$BIN" 2>"$T/stderr.txt" &
P=$!; for i in $(seq 1 10); do kill -0 $P 2>/dev/null || break; sleep 1; done
kill -0 $P 2>/dev/null && { echo "RUNNING after 10s"; kill $P; } || { wait $P; echo "EXITED $?"; }
grep -i integrity "$T/stderr.txt"
```

Expected: `RUNNING after 10s`, and no integrity line. The deck art is in `bundled/`, which is outside the asar (`asarUnpack`), so the fuse does not check it. B1 then checks that the window shows it.

## Part B: checks a person does

Use the packaged app from A4 for B1 and B3. Use `npm run dev` or the packaged app for B2. Ask the person to do each step and tell you what they saw.

### B1. The packaged app shows the deck art (both OS) — HTOO-381

Open `dist/mac-universal/Corvath.app` on macOS, or run `dist/linux-unpacked/corvath` on Linux, and open the Decks page. **Expected:** each deck shows its art. No test reads the art from `bundled/` in a packaged app; A5 covers the start itself.

### B2. The title bar (macOS)

On each of the eight themes (Settings → Appearance):

1. The stoplights sit centred in the bar, from top to bottom. The bar is 36 px (the house title-bar module) and the lights are at `{ x: 12, y: 10 }`. That position is calculated, not seen. (HTOO-572)
2. Nothing else is in the bar: no logo, no "Corvath", no minimise, maximise or close buttons.
3. A drag on the bar moves the window. A double-click on the bar zooms the window.
4. The nav bar under the title bar has a different colour from the title bar. Each page name on it is easy to read, and the open page has a ring. (HTOO-629)

### B3. The menu and the keys (macOS)

1. **The menu bar** of the packaged app shows "Corvath". (`npm run dev` shows "Electron" there. That is expected, not a fault.)
2. **The menus** are Corvath, File, Edit, View, Go, Window and Help. No menu has Reload or Force Reload, and ⌘R does nothing.
3. **The Corvath menu** reads "Hide Corvath" and "Quit Corvath", not "corvath".
4. **The grey items:** with no reading saved, **File → Export All Readings…** is grey.
5. **Nothing over a dialog:** open a dialog (for example **Help → Report an Issue…**), then press ⌘2. The page behind the dialog does not change.
6. **The keys:** ⌘1 to ⌘4 open Readings, Draw, Decks and Layouts. ⌘, opens Settings. ⌘N starts a new reading.
7. **Corvath → Check for Updates…** opens Settings, and a line under the **Check for updates** button on the About card says that Corvath is up to date, names a newer version, or says why it could not check.
8. **Help → What's New** opens the What's New dialog.
9. **File → Close Window** (⌘W) closes the window, and the app stays in the Dock. A click on the Dock icon opens a new window in the saved theme. Do this twice within 15 seconds: each window opens, and none shows unpainted.
10. **⌘Q** quits the app.
11. **The file pickers:** with at least one reading saved, use **File → Export All Readings…** and save the file in `~/Documents`. Then open **File → Import Readings…** and cancel it. No privacy prompt appears for the second picker. (The picker checks that the last folder still exists before it opens there.)

### B4. The chrome on Linux: retired

Sabrael retired the Linux chrome checks on 2026-11-02, after they passed in the November round. Tests cover each one, and A1 runs them:

- **The round splash spinner** (HTOO-553): `src/main/__tests__/splash.test.ts` pins `flex-shrink: 0` on the spinner and the logo, and the spinner's equal width and height and `border-radius: 50%`.
- **The title bar buttons:** `TitleBar.test.tsx` checks that each button calls its window control, and `src/main/__tests__/handlers-window.test.ts` what main does with it: minimise minimises, maximise maximises and a second press restores, and close closes the window that sent it.
- **The title bar and the nav bar on the eight themes** (HTOO-572, HTOO-629): `chromeContrast.test.tsx` (the bar text and glyphs, the outline or the flat bar, the hover and close-hover colours, the nav-bar buttons), `tertiary.test.ts` (the nav bar differs from the title bar) and `NavBar.test.tsx` (the open page's ring). `e2e/theme-switch.spec.js` applies all eight in the real app.
- **The taskbar icon** (HTOO-63): #93's fix holds, and `scripts/icons.test.mjs` pins the hicolor set and the config that installs it.

The window-corner note was an observation, not a check, and goes with them.

## For this round (2026-11-01)

Write this section again for each round: what applies, and what is already done.

All of A1 to A5 and B1 to B4 applied. The November 2026 release changed what each check covers:

- **Electron 44.10.0** (HTOO-607), from 44.7.0. A1 to A5 and B1 ran again on the new runtime: the gate, e2e, the real data folder, the fuses and the asar check.
- **Eight themes**, with Shattered and Untamed (HTOO-572, the template at `58fa416`). B2 and the old B4.4 covered each of the eight.
- **The nav bar** (HTOO-629). The page tabs became the house nav bar on `tertiary.main`. B2.4 and the old B4.4 checked it.

**Done on the Mac** (macOS 27.0.1, Apple Silicon, `7c3f3ba`, 2026-11-02): A1 (1192 passed), A2 (27 passed), A3, A4, A5 and B1 to B3 pass, and nothing failed. B2 covered the eight themes and the nav bar. The results are on the cards that each check names, on HTOO-230, and in Corvath's row of `macos-chrome.md` §10.

**Done on Linux** (Linux Mint 22.3, `b878577`, 2026-11-02): A1 (1192 passed; the preload requires only `electron`), A2 (23 passed, 4 skipped), A3 (UNCHANGED), A4 (fuses OK, 1 wire) and A5 (RUNNING after 10s, no integrity line) pass. Sabrael's checks at the machine, on `dist/linux-unpacked/corvath`, pass: B1 with the deck art, and all of the old B4 on the eight themes. B4 is then retired (above). The splash and window-button tests added with it bring A1 to 1198. The results are on the cards that each check names and on HTOO-230.

Nothing is owed on either machine. There is no tag this round: `v1.0.0` waits for HTOO-232.

Done on Windows, and not on this page:

- **The theme check** of the eight themes, the nav bar, the disabled buttons and the grey list icons (HTOO-572, HTOO-629, HTOO-639). Sabrael checked it by eye on 2026-11-01.
- **The gate and e2e on Electron 44.10.0.** `npm run validate`: 1192 passed. `npm run e2e`: 23 passed, 4 skipped (the macOS menu).

Not on this page:

- **The Dock check** (`macos-chrome.md` §6). Corvath runs no git, so the launch-env modules do not apply.
- **Signing.** The Windows signing and the macOS notarization run only in the release workflow, on a tag.
- **The October round** (2026-10-11 and 2026-10-12) passed on both machines with nothing owed. Its results are on the cards that each check names, on HTOO-63, and in Corvath's row of `macos-chrome.md` §10.
