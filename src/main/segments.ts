/**
 * Path segments for the deck images folder (HTOO-697).
 *
 * A deck id and a card id each become one folder or file name under
 * `<data>/decks`. They come from the renderer and from decks.json, so main
 * cleans them here, before any path is joined.
 *
 * No electron and no fs import: the schemas and the store both use this file,
 * and the node test project loads it directly.
 */

/** Keep only filesystem-safe characters, so a renderer id cannot hold a separator. */
export function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '')
}

/**
 * The cleaned segment, or null when the segment cannot name a child.
 *
 * `safeSegment` keeps dots. An empty segment and `.` name the folder itself,
 * and `..` names its parent. Windows also drops trailing dots from a name, so
 * `...` names the folder itself too. All of these are refused: a deck id of
 * `..` made `deleteDeckImages` remove the whole data folder.
 */
export function cleanSegment(value: string): string | null {
  const s = safeSegment(value)
  return /^\.*$/.test(s) ? null : s
}
