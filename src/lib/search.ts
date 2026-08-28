/**
 * Diacritic-insensitive, case-insensitive text for substring search --
 * "Maria" (typed without an accent) must still match "María" in the data.
 * NFD splits accented letters into base + combining mark, then the
 * combining marks are stripped via the Unicode property escape.
 */
export function normalizeForSearch(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
}
