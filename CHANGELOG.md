# Changelog

All notable user-facing changes to Corvath are recorded here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is
[Semantic Versioning](https://semver.org/).

<!--
Release process (the notes are authored HERE, not edited on GitHub after the fact):
  1. As you land a PR, add its user-facing change under ## [Unreleased]
     (Added / Changed / Fixed / Removed / Deprecated / Security).
  2. To cut a release: rename ## [Unreleased] to ## [X.Y.Z] - YYYY-MM-DD, add a
     fresh empty ## [Unreleased] above it, and bump package.json to X.Y.Z
     (npm version X.Y.Z --no-git-tag-version).
  3. Tag vX.Y.Z and push. The release workflow runs scripts/changelog-extract.mjs
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

This is the first release. Corvath is a desktop tarot companion. It draws
readings, records them, and builds the decks and spreads it draws from. Corvath
keeps all of your data on your own machine.

### Added

- **Settings** — a Settings page holds the theme picker and an About card. The
  About card names this build's version, links to hybrasyl.com and the source,
  shows the newest changelog entry, and opens the folder that holds your data.
  The theme picker moved here from the title bar.
- **Draw defaults** — Settings sets the deck, the spread, and the draw mode that
  the Draw tab starts on. You can still change each one for a single draw. If you
  delete a deck or a spread that a default names, Corvath uses the first one
  again.
- **Report an issue** — the About card opens a report dialog. Corvath shows you
  the diagnostics it will attach, and you can edit them before you send. Corvath
  removes usernames, file paths, e-mail addresses and IP addresses from the text
  first. The report opens as a new issue in your browser, and the full text also
  goes to your clipboard. Corvath keeps the errors from the last five sessions in
  a `logs` folder, and the dialog opens that folder.
- **Draw** — draw a reading against any deck. Use a saved spread, or draw a free
  run of N cards. Corvath gives you two modes. **Deal from top** turns over one
  slot at a time, and obeys the draw source that each position sets. **Fan and
  pick** fans the shuffled deck face-down, and you choose each card. Corvath
  seeds every draw, so it can reproduce a recorded reading.
- **Readings** — a journal of your readings. Each reading holds a title, a date,
  a deck, an optional spread, and free-form notes. Each card entry holds its own
  topic, question, orientation, deck meaning, and your interpretation. Corvath
  marks the readings that it drew for you. Corvath asks you to confirm before it
  deletes a reading, and it names the reading in the question. It also asks
  before a spread replaces the cards in a reading that you already wrote in.
- **Decks** — a deck builder that assumes no structure. Set the majors, the
  suits, the pip ranks, and the court ranks. Give each card a meaning, keywords,
  imported art, and a card back. Corvath ships four decks: **Rider-Waite-Smith**,
  the **Argent Tarot** (original art on the Thoth structure), the **Empyrean**
  (original art, custom court ranks), and **Hybrasyl** (the Temuairan pantheon,
  35 majors over four short suits).
- **Card meanings** — each built-in deck ships a meaning and keywords for every
  card. Corvath writes the text in the register of that deck. It does not reuse
  one set of text across the four decks. Rider-Waite-Smith also holds reversed
  meanings. You can edit all of this text. **An update never overwrites your
  edits.** Corvath records the text that it writes. A later update replaces only
  that text, and corrects the cards that you leave alone. Your own words stay.
  Your imported art, your card backs, your renames, and any card that you add to
  a built-in deck stay with them.
- **Layouts** — a visual builder for spreads. Drag the positions on a board, name
  each slot, mark the crossing cards, and set the end of the deck that each slot
  draws from. Corvath ships four spreads: Single Card, Three Card, Celtic Cross,
  and Horseshoe. A recorded reading shows its spread with the art of the drawn
  cards in place. Each card in the list below the board names the slot that it
  fills.
- **Card preview** — click a face-up card to see it large. The preview shows the
  keywords, the orientation, and the deck meaning.
- **Import and export** — Corvath imports and exports readings as JSON, and the
  export round-trips. It exports and imports a deck as a portable `.corvathdeck`
  file, which includes the art. You can therefore share a deck that you build.
- **Six themes** — four are dark fantasy: Hybrasyl, Chadul, Danaan, and
  Grinneal. Two are a corporate pair: Mundanes (light) and Dubhaimid (dark).
  Corvath draws its own title bar, which has no window frame.
- **Update notification** — Corvath looks for a newer release at launch, and
  offers you a link to it. It downloads nothing and installs nothing.
- **An installer for Windows** — a release now carries
  `corvath-<version>-setup.exe` beside the portable exe. The installer asks you
  where to put Corvath. It adds a Start menu entry and a desktop shortcut, and it
  lists Corvath in Installed apps. It installs for the current user only, so it
  needs no administrator rights. Run it again to upgrade in place. Both downloads
  read the same settings, so you can move from one to the other. An uninstall
  leaves your readings, decks and layouts on the machine.
- **macOS and Linux builds** — a release now carries a macOS `.dmg` beside the
  Windows portable exe. The `.dmg` is universal, for Apple Silicon and Intel. A
  release also carries a Linux AppImage and a `.deb` package. Corvath does not
  sign or notarize these builds yet. macOS Gatekeeper and Windows SmartScreen
  therefore warn you at the first run.
- **Branded startup on the portable build** — the portable exe unpacks itself
  before the app starts. This step took several seconds and showed you nothing.
  Corvath now shows its splash screen for that time. Startup is therefore one
  continuous sequence.

### Changed

- **A smaller download and a faster splash screen.** Corvath no longer ships its
  interface libraries two times. It also no longer decodes a 2.3 MB image to draw
  an 84-pixel logo. The packaged archive now holds about 950 files, down from
  about 38,700. The images in it total 266 KB, down from 4.7 MB.

### Fixed

- **No white flash when you close Corvath.** The window left the screen with a
  white frame or two at the end. Corvath now hides the window before it closes
  it, on every route: the close button, Alt+F4, the taskbar, and quit. The
  splash screen also no longer shows a white frame before its first paint.

### Security

- **Corvath refuses to move its window away from its own pages.** It opens a link
  in your browser only when the link is an ordinary web or mail link. It refuses
  every other kind of link: a local file path, a network share, a script URL, or
  a custom scheme that another program on your machine registers.
- **The interface runs in a sandbox.** Corvath checks every request that the
  interface makes to its privileged side. The check confirms that the request
  comes from a real Corvath window that shows the content of Corvath.
- **Corvath switches off the debug controls in the Electron runtime that it
  ships.** Nobody can therefore use the bundled binary to run other code through
  environment variables or command-line flags.
