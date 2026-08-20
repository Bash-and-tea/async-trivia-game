/**
 * Running score across rounds.
 *
 * A finished round can never change, so its outcome is cached in the browser
 * and never re-fetched. Without this, showing a score would mean pulling the
 * full log of every game ever played on each load.
 */

const KEY = 'async-trivia:outcomes'

/** Issue number -> winning login. */
export type Outcomes = Record<string, string>

export function loadOutcomes(): Outcomes {
  const raw = localStorage.getItem(KEY)
  if (!raw) return {}
  try {
    const value = JSON.parse(raw) as unknown
    if (typeof value !== 'object' || value === null) return {}
    const result: Outcomes = {}
    for (const [key, winner] of Object.entries(value)) {
      if (typeof winner === 'string') result[key] = winner
    }
    return result
  } catch {
    return {}
  }
}

export function saveOutcomes(outcomes: Outcomes): void {
  localStorage.setItem(KEY, JSON.stringify(outcomes))
}

export function tally(outcomes: Outcomes, viewer: string): { mine: number; theirs: number } {
  let mine = 0
  let theirs = 0
  for (const winner of Object.values(outcomes)) {
    if (winner === viewer) mine++
    else theirs++
  }
  return { mine, theirs }
}
