# Corvath

A small Electron desktop app for recording tarot readings. Each **reading** is a session (title, date, deck, optional spread) containing a list of **cards** — each with a topic, a question, the drawn card, and orientation. A card's meaning is sourced (read-only) from that card's definition in the deck, and each reading has a free-form **notes** section for the overall interpretation. Readings can be **imported** from JSON (file or paste) — handy for bringing in readings authored elsewhere.

A **deck builder** (Decks tab) defines the decks: structure-agnostic, so it handles standard decks (Rider-Waite-Smith — seeded with full public-domain JPG art + card back), the **Argent Tarot** (an original-art deck on the Thoth structure, bundled under `bundled/decks/argent/`), the **Empyrean** deck (an original Thoth-adjacent deck with custom court ranks that ships with full 78-card WebP art plus a card back under `bundled/decks/empyrean/`), and custom ones like the Hybrasyl deck with an arbitrary number of major arcana and custom suit/court names. Each card can hold meanings, keywords, and an imported image, and a deck can have a card back (bundled art is served read-only and overridden by any image you import). Built-in decks carry a `seedVersion`, so a shipped deck update replaces the older copy on startup without disturbing your own decks. The recorder's deck field offers the builder's deck names.

A **layout builder** (Layouts tab) defines spreads on a visual board: drag positions to arrange them, name each slot, and mark crossing cards. Single Card, Three Card, Celtic Cross, and Horseshoe ship seeded. Picking a layout in the recorder auto-fills one entry per position and shows the spread diagram with the drawn cards.

Built with **electron-vite + React + TypeScript + MUI**, sharing the Hybrasyl theme system (Hybrasyl / Danaan / Chadul / Grinneal) used across the other Dark Ages tools.

## Stack

- electron-vite (`src/main`, `src/preload`, `src/renderer`)
- React 19 + TypeScript
- MUI v9 with the shared Hybrasyl themes (`src/renderer/src/themes`)
- Cinzel / Cinzel Decorative / Crimson Pro fonts via `@fontsource`

## Data

Readings, decks, and settings are stored as JSON under the local app-data directory, `%LOCALAPPDATA%/Erisco/Corvath/` on Windows:

- `readings.json` — `{ version: 1, readings: Reading[] }`
- `decks.json` — `{ version: 1, decks: Deck[] }`
- `layouts.json` — `{ version: 1, layouts: Layout[] }`
- `settings.json` — `{ theme }`
- `decks/<deckId>/` — imported card images, served to the UI via the `corvath-asset://` protocol

Writes are crash-safe: each file is written to a `.tmp` sibling and atomically renamed over the primary, the previous version is rotated to a `.bak.json`, and a corrupt primary is automatically recovered from its backup on next load.

The disposable Electron cache (`userData`) lives in the same directory.

## Scripts

```sh
npm run dev        # launch in development (HMR)
npm run build      # type-check-free production build into out/
npm run typecheck  # tsc for main + renderer
npm run build:win  # package a Windows installer (electron-builder)
```

## Remote Desktop

Over RDP, Corvath drops to software rendering on its own. A remote session has no GPU, and Chromium's GPU compositing path is what makes window dragging lag and the app idle at about 10% CPU there. Corvath also turns off the panel blur of the four fantasy themes while software rendering is on, because that blur is expensive without a GPU. Nothing to set; Corvath reads the session type at launch.

**It cannot see a reconnected session.** Windows records the session type at logon and never revises it, so a console session that you later connect to over RDP still reports itself as local. If dragging lags over RDP, set `CORVATH_DISABLE_GPU=1` in the environment before you launch. The same variable answers the other way: `CORVATH_DISABLE_GPU=0` forces hardware rendering back on if the detection is ever wrong on your machine. Any other non-empty value means on.

## Troubleshooting

Run the tools through npm (`npm run dev`, `npm run build`) — `electron-vite` is a local dependency and isn't on your `PATH` as a bare command.

If `npm run dev` builds but no window appears, check for a leaked `ELECTRON_RUN_AS_NODE=1` in your shell (some Electron-hosted terminals set it). It makes Electron run as plain Node. Clear it and retry: `Remove-Item Env:ELECTRON_RUN_AS_NODE; npm run dev` (PowerShell) or `unset ELECTRON_RUN_AS_NODE && npm run dev` (bash).
