/**
 * A name compared with text that the user typed: a deck's or a card's name
 * against the name a reading holds, or a layout's name against an import.
 *
 * A name can hold decomposed Unicode (NFD), where é is e + U+0301. macOS
 * stores file names that way, and text copied from Finder keeps that form.
 * Text typed in Corvath is composed (NFC). The two forms look the same and
 * compare unequal, so a reading could show "No matching card in this deck"
 * for a card that is in the deck. Both sides are composed before the compare
 * (macos-chrome.md §8 in the document repo). The stored names do not change.
 */
export function nameKey(name: string): string {
  return name.normalize('NFC')
}

/** True when two names are the same text, in either Unicode form. */
export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false
  return nameKey(a) === nameKey(b)
}
