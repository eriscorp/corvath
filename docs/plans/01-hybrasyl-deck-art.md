# WP1 — Hybrasyl deck art

**The only thing blocking the `v1.0.0` tag.** Everything else for 1.0 has shipped; see [00-overview.md](00-overview.md).

## Problem

The Hybrasyl deck's _structure_ ships and every one of its 83 cards has a meaning and keywords, but no art is drawn. Cards fall back to the name placeholder, so the deck reads as unfinished next to the three that have art (`bundled/decks/` holds `argent`, `empyrean` and `rws` — no `hybrasyl`).

`imageExt` and `back` are deliberately unset on the `hybrasyl` spec in [src/main/seedDecks.ts:213](../../src/main/seedDecks.ts). That is not an oversight: with them set, every card claims an image file that does not exist.

## What the deck is

35 majors over four short suits (eight pips + four courts each). The majors' **order is load-bearing** and must not be rearranged: it is the Octagram — four pantheons of eight, each running the same compass (N/Fire, NW/Life, W/Earth, SW/Arcane, S/Water, SE/Metal, E/Wind, NE/Void), then the three primordials. So `maj-0`, `maj-8`, `maj-16` and `maj-24` are all North — the same fire expressed, in truth, inverted and corrupted. The meanings in `src/main/seedMeanings/hybrasyl.ts` name each card's direction, so a reorder silently falsifies them.

Suits are Swords / Staves / Coins / Cups; courts are Mentor / Guide / Speaker / Dreamer. Upright-only, like Argent and Empyrean.

## Steps

1. **Draw the art.** 83 cards + a card back. This is the actual work and the reason this WP is open; everything below is mechanical.
2. **Drop the PNGs** in `F:\Downloads\Tarot Images\Hybrasyl Tarot`, or point `HYBRASYL_SRC` at wherever they live. The directory does not exist yet.
   - Majors are named for the card (`Deoch.png` → `maj-0.webp`).
   - Minors are `<Suit> - <Rank>.png`.
   - The back is `back.png`.
3. **Run the converter:** `node scripts/build-hybrasyl-art.mjs`. It maps the source names to the deterministic card ids `seedDecks.ts` generates and writes webp into `bundled/decks/hybrasyl/`. Needs ImageMagick (`MAGICK=` overrides the binary path).
4. **Turn the art on** in the `hybrasyl` spec: add `imageExt: 'webp'` and `back: 'back.webp'`, and bump `seedVersion` from **3** to 4 so existing installs pick the art up.
5. **Check the seed-overwrite trap before bumping.** `preferSeedString` in `src/main/store.ts` makes a non-empty seed value beat a user's edit on a `seedVersion` bump. This bump ships art, not text, so it is safe _as long as the meanings are not also edited in the same change_. If they are, a user's own text is silently overwritten — see [00a-backlog.md](00a-backlog.md).

## Acceptance

- `bundled/decks/hybrasyl/` holds 84 files (83 cards + `back.webp`).
- A fresh profile shows the Hybrasyl deck with art on every card and no name placeholders — easiest to check by launching with `%LOCALAPPDATA%` pointed at a temp dir, as `e2e/` does.
- An existing profile picks the art up on the `seedVersion` bump without losing user decks.
- `npm run typecheck && npm run lint:check && npm run test` green; `npm run e2e` green.
- The packaged size grows by roughly the art's own weight — `bundled/**` is `asarUnpack`ed and already 83 MB, so confirm the portable exe is still a size you want to ship.

## Then cut 1.0

Promote `## [Unreleased]` in `CHANGELOG.md` to `## [1.0.0] - <date>`, tag `v1.0.0`, push.
