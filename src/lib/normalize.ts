/**
 * Answer normalisation and near-duplicate detection.
 *
 * Duplicate checking is a *warning*, never a hard block: a category can
 * legitimately contain near-identical items ("Iowa"/"Ohio", "Bali"/"Mali"),
 * so the player always gets the final say.
 */

const LEADING_ARTICLE = /^(?:the|a|an)\s+/

/**
 * Fold an answer down to a comparable form: lowercase, no diacritics, no
 * punctuation, no leading article, single-spaced.
 */
export function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(LEADING_ARTICLE, '')
    .trim()
}

/** Standard Levenshtein edit distance, two-row variant. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  let curr = new Array<number>(b.length + 1)

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const substitution = prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, substitution)
    }
    const swap = prev
    prev = curr
    curr = swap
  }

  return prev[b.length]
}

/**
 * How many edits still counts as "you already said that", scaled by length.
 *
 * A flat threshold of 2 is far too loose on short words — it would collide
 * "Mali" with "Bali" and "cat" with "cot". Longer strings earn more slack,
 * which is where genuine typos actually live ("Massachussets").
 */
export function duplicateThreshold(length: number): number {
  if (length <= 4) return 0
  if (length <= 7) return 1
  return 2
}

/**
 * Find an existing answer that the candidate probably duplicates.
 * Returns the matching original string, or null.
 */
export function findNearDuplicate(candidate: string, existing: readonly string[]): string | null {
  const target = normalize(candidate)
  if (!target) return null

  for (const item of existing) {
    const other = normalize(item)
    if (!other) continue
    const threshold = duplicateThreshold(Math.min(target.length, other.length))
    if (levenshtein(target, other) <= threshold) return item
  }

  return null
}
