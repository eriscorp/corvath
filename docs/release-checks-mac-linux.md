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

On Windows the suite is 666 passed and 0 skipped. No unit test in Corvath depends on the OS, so expect the same count here. Report the exact numbers, and name any test that fails or skips.

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

- **macOS:** 25 passed. That includes the four tests in `e2e/app-menu.spec.js`, which runs on macOS only: the installed menu with no Reload and an empty title bar, Check for Updates…, Go and the grey Export All Readings… with nothing run over a dialog, and About Corvath and What's New.
- **Linux:** 21 passed and 4 skipped. The skips are `app-menu.spec.js`.
- On Windows the result is also 21 passed and 4 skipped.

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

### A5. The packaged app gets past the asar check (macOS) — HTOO-381

With the asar integrity fuse on, a damaged package exits with no window and no message. The only signs of the failure are a non-zero exit and `ASAR Integrity Violation` on stderr, so start the binary from the terminal. Point it at a temp folder so that it does not write the real data:

```bash
T=$(mktemp -d)
LOCALAPPDATA="$T" dist/mac-universal/Corvath.app/Contents/MacOS/Corvath 2>"$T/stderr.txt" &
P=$!; for i in $(seq 1 10); do kill -0 $P 2>/dev/null || break; sleep 1; done
kill -0 $P 2>/dev/null && { echo "RUNNING after 10s"; kill $P; } || { wait $P; echo "EXITED $?"; }
grep -i integrity "$T/stderr.txt"
```

Expected: `RUNNING after 10s`, and no integrity line. The deck art is in `bundled/`, which is outside the asar (`asarUnpack`), so the fuse does not check it. B1 then checks what the window shows.

## Part B: checks a person does

Use the packaged app from A4 for B1 and B3. Use `npm run dev` or the packaged app for the others. Ask the person to do each step and tell you what they saw.

### B1. The packaged app starts (both OS) — HTOO-381

Open `dist/mac-universal/Corvath.app` on macOS, or run `dist/linux-unpacked/corvath` on Linux. **Expected:** the splash, then the main window, with the deck art on the Decks page.

### B2. The title bar (macOS)

On each of the six themes (Settings → Appearance):

1. The stoplights sit centred in the bar, from top to bottom. The bar is 40 px and the lights are at `{ x: 12, y: 12 }`. That position is calculated, not seen.
2. Nothing else is in the bar: no logo, no "Corvath", no minimise, maximise or close buttons.
3. A drag on the bar moves the window. A double-click on the bar zooms the window.

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

### B4. The chrome on Linux (Linux) — HTOO-553, HTOO-572

1. **The splash:** the spinner under the logo is a round ring, not an oval. (The font falls back from Segoe UI on Linux. The spinner and the logo have `flex-shrink: 0` against that, HTOO-553.)
2. **The window corners:** since Electron 43 a frameless window can have rounded corners where the desktop supports them. Say whether the corners are round or square, and whether anything looks clipped.
3. **The title bar buttons:** minimise, maximise (twice, to restore) and close each work.
4. **The title bar on each of the six themes** (Settings → Appearance). Danaan and Grinneal have dark text on the bar. That text is engraved, with a thin light edge below and to the right. Hybrasyl and Chadul have light text. Mundanes and Dubhaimid are flat. On each theme the bar text and the three button glyphs are easy to read. (HTOO-572)
5. **The taskbar and the switcher** show Corvath's icon, not a generic one. This needs the installed `.deb` or the AppImage, not `npm run dev`. (HTOO-63)

## For this round (2026-10-11)

Write this section again for each round: what applies, and what is already done.

All of A1 to A5 and B1 to B4 apply. They are what Corvath owes after the house standards sweep of 2026-10-11 (Electron 44, the LOCALAPPDATA fix, the asar integrity fuse, the canonical palettes, the macOS title bar and menu).

Done on Windows, and not on this page:

- **The theme check** of chips, tabs, filled buttons, the engraved bars and the theme picker (HTOO-355, HTOO-572). Sabrael checked it by eye on 2026-10-11.
- **No blank Setup window** when the portable exe closes (HTOO-466). Sabrael checked it by eye on 2026-10-11.
- **The portable sweep and the single-instance lock** (HTOO-494, HTOO-351). They are Windows only, and they were checked on the packaged portable exe.
- **Remote Desktop** (HTOO-325). Taken as passed without a real RDP session: a fault there is rare, and a report from a user is the trigger to set one up.

Not on this page:

- **The Dock check** (`macos-chrome.md` §6). Corvath runs no git, so the launch-env modules do not apply.
- **Signing.** The Windows signing and the macOS notarization run only in the release workflow, on a tag.
