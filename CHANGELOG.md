# Changelog

All notable user-facing changes to Corvath are recorded here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is [Semantic Versioning](https://semver.org/).

<!--
Release process (the notes are authored HERE, not edited on GitHub after the fact):
  1. As you land a PR, add its user-facing change under ## [Unreleased]
     (Added / Changed / Fixed / Removed / Deprecated / Security).
  2. To cut a release: rename ## [Unreleased] to ## [X.Y.Z] - YYYY-MM-DD, add a
     fresh empty ## [Unreleased] above it, and bump package.json to X.Y.Z
     (npm version X.Y.Z --no-git-tag-version).
  3. Start the packaged build before you tag: npm run build:win, then open both
     exes in dist/ and confirm that each opens its window. The asar integrity fuse
     makes a changed or damaged package exit with no window and no message, so a
     package that nobody started is not known to work (HTOO-381).
     npm run verify:fuses -- dist/win-unpacked/corvath.exe reads the fuses off it.
  4. Tag vX.Y.Z and push. The release workflow runs scripts/changelog-extract.mjs
     to pull THIS version's section into the GitHub release body, then appends the
     auto-generated PR list below it.
Keep entries user-facing — internal refactors/tests show up in the appended auto list.

Write entries in ASD-STE100 Simplified Technical English (asd-ste100.org), like the rest of the
documentation in this repo:
  - One idea per sentence. Keep sentences below about 25 words.
  - Present tense, active voice. Name the actor: "Corvath records the seed", not "the seed
    is recorded".
  - One term for one thing, through the whole file. Do not reach for a synonym for variety.
  - No idioms, no metaphor, no rhetorical asides. Give the fault, then the behaviour now.
Keep the section order of Keep a Changelog: Added, Changed, Deprecated, Removed, Fixed, Security.
One heading of each kind per version.
-->

## [Unreleased]

This is the first release. Corvath is a desktop tarot companion. It draws readings, records them, and builds the decks and spreads it draws from. Corvath keeps all of your data on your own machine.

### Added

- **Settings** — a Settings page holds the theme picker and an About card. The About card names this build's version, links to hybrasyl.com and the source, shows the newest changelog entry, and opens the folder that holds your data. The theme picker moved here from the title bar.
- **Draw defaults** — Settings sets the deck, the spread, and the draw mode that the Draw tab starts on. You can still change each one for a single draw. If you delete a deck or a spread that a default names, Corvath uses the first one again.
- **Report an issue** — the About card opens a report dialog. Corvath shows you the diagnostics it will attach, and you can edit them before you send. Corvath removes usernames, file paths, e-mail addresses and IP addresses from the text first. The report opens as a new issue in your browser, and the full text also goes to your clipboard. Corvath keeps the errors from the last five sessions in a `logs` folder, and the dialog opens that folder.
- **Draw** — draw a reading against any deck. Use a saved spread, or draw a free run of N cards. Corvath gives you two modes. **Deal from top** turns over one slot at a time, and obeys the draw source that each position sets. **Fan and pick** fans the shuffled deck face-down, and you choose each card. Corvath seeds every draw, so it can reproduce a recorded reading.
- **Readings** — a journal of your readings. Each reading holds a title, a date, a deck, an optional spread, and free-form notes. Each card entry holds its own topic, question, orientation, deck meaning, and your interpretation. Corvath marks the readings that it drew for you. Corvath asks you to confirm before it deletes a reading, and it names the reading in the question. It also asks before a spread replaces the cards in a reading that you already wrote in.
- **Decks** — a deck builder that assumes no structure. Set the majors, the suits, the pip ranks, and the court ranks. Give each card a meaning, keywords, imported art, and a card back. Corvath ships four decks: **Rider-Waite-Smith**, the **Argent Tarot** (original art on the Thoth structure), the **Empyrean** (original art, custom court ranks), and **Hybrasyl** (the Temuairan pantheon, 35 majors over four short suits).
- **Card meanings** — each built-in deck ships a meaning and keywords for every card. Corvath writes the text in the register of that deck. It does not reuse one set of text across the four decks. Rider-Waite-Smith also holds reversed meanings. You can edit all of this text. **An update never overwrites your edits.** Corvath records the text that it writes. A later update replaces only that text, and corrects the cards that you leave alone. Your own words stay. Your imported art, your card backs, your renames, and any card that you add to a built-in deck stay with them.
- **Layouts** — a visual builder for spreads. Drag the positions on a board, name each slot, mark the crossing cards, and set the end of the deck that each slot draws from. Corvath ships four spreads: Single Card, Three Card, Celtic Cross, and Horseshoe. A recorded reading shows its spread with the art of the drawn cards in place. Each card in the list below the board names the slot that it fills.
- **Card preview** — click a face-up card to see it large. The preview shows the keywords, the orientation, and the deck meaning.
- **Import and export** — Corvath imports and exports readings as JSON, and the export round-trips. It exports and imports a deck as a portable `.corvathdeck` file, which includes the art. You can therefore share a deck that you build.
- **Six themes** — four are dark fantasy: Hybrasyl, Chadul, Danaan, and Grinneal. Two are a corporate pair: Mundanes (light) and Dubhaimid (dark). Corvath draws its own title bar, which has no window frame.
- **Update notification** — Corvath looks for a newer release at launch, and offers you a link to it. It downloads nothing and installs nothing.
- **Remote Desktop** — over a Remote Desktop session, Corvath uses software rendering, because the session has no GPU. Corvath also turns off the panel blur of the four fantasy themes while software rendering is on. Windows does not report a session that you reconnect to over Remote Desktop. For that case, set `CORVATH_DISABLE_GPU=1` before you start Corvath. `CORVATH_DISABLE_GPU=0` turns hardware rendering back on. The README tells you more.
- **An installer for Windows** — a release now carries `corvath-<version>-setup.exe` beside the portable exe. The installer asks you where to put Corvath. It adds a Start menu entry and a desktop shortcut, and it lists Corvath in Installed apps. It installs for the current user only, so it needs no administrator rights. Run it again to upgrade in place. Both downloads read the same settings, so you can move from one to the other. An uninstall leaves your readings, decks and layouts on the machine.
- **macOS and Linux builds** — a release now carries a macOS `.dmg` beside the Windows portable exe. The `.dmg` is universal, for Apple Silicon and Intel. A release also carries a Linux AppImage and a `.deb` package. Corvath does not sign or notarize these builds yet. macOS Gatekeeper and Windows SmartScreen therefore warn you at the first run.

### Changed

- **A smaller download and a faster splash screen.** Corvath no longer ships its interface libraries two times. It also no longer decodes a 2.3 MB image to draw an 84-pixel logo. The packaged archive now holds about 950 files, down from about 38,700. The images in it total 266 KB, down from 4.7 MB.
- **Corvath now runs on Electron 44.** It needs macOS 13 or later and a 64-bit system.

### Fixed

- **A second launch brings the open Corvath window forward.** Before, a second launch opened a second copy of Corvath on the same data. The two copies then saved over each other, and a reading could be lost. Now the second launch stops at once, and the window that is already open comes to the front, also when it is minimised.
- **A second start of the portable exe no longer shows a "Corvath cannot be closed" box.** Each start of the portable exe now unpacks into a folder of its own, so a second start cannot overwrite the files of the copy that runs. The second start then brings the open window forward.
- **The portable exe removes the folders that it left in your temp folder.** When the portable exe is stopped before Corvath closes, its unpack folder stays in `%TEMP%`, and it can be several hundred MB. The next start of the portable exe removes such folders after 30 seconds. It removes only folders of Corvath that are older than 10 minutes and that no running copy uses.
- **The portable exe no longer shows a blank window after you close Corvath.** The portable exe now shows no image while it unpacks. You see a busy cursor for some seconds before the Corvath splash screen.
- **No white flash when you close Corvath.** The window left the screen with a white frame or two at the end. Corvath now hides the window before it closes it, on every route: the close button, Alt+F4, the taskbar, and quit. The splash screen also no longer shows a white frame before its first paint.
- **The export and import dialogs open in a useful folder.** They open in the folder you used last in this session, or else in your Documents folder. Before, they opened in Downloads.
- **Report an issue tells you when the copy fails.** Corvath now waits for the copy to the clipboard before it opens the issue page. If the copy fails, Corvath still opens the page, and the message tells you to copy the report yourself.

### Security

- **Corvath refuses to move its window away from its own pages.** It opens a link in your browser only when the link is an ordinary web or mail link. It refuses every other kind of link: a local file path, a network share, a script URL, or a custom scheme that another program on your machine registers.
- **The interface runs in a sandbox.** Corvath checks every request that the interface makes to its privileged side. The check confirms that the request comes from a real Corvath window that shows the content of Corvath.
- **Corvath switches off the debug controls in the Electron runtime that it ships.** Nobody can therefore use the bundled binary to run other code through environment variables or command-line flags.
- **Corvath does not start when its program files are changed.** On Windows and macOS, Corvath checks its program code against a hash that the build records. If the code does not agree, Corvath stops before it opens a window. This check does not include the deck art.
- **The development content policy cannot reach a packaged Corvath.** The relaxed content policy that the development server needs was chosen from the `NODE_ENV` variable, and a shell can set that variable. Corvath now chooses it only when it loads its window from the development server.
