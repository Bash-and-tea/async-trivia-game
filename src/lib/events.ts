/**
 * The game log and the fold that turns it into game state.
 *
 * Every event is one GitHub issue comment. State is NEVER stored — it is
 * recomputed from the log on every poll, which is what makes it impossible
 * for the two clients to drift apart. The log is the only truth.
 */

export type StrikeReason = 'challenge' | 'repeat'

export type GameEvent =
  | { type: 'answer'; text: string }
  | { type: 'strike'; target: number; reason: StrikeReason }
  | { type: 'resign' }
  | { type: 'say'; text: string }

/** One comment, parsed. `id` is the GitHub comment id. */
export interface LogEntry {
  id: number
  author: string
  createdAt: string
  event: GameEvent
}

/** Stored in the issue body when the game is created. */
export interface GameMeta {
  players: [string, string]
  /** The player who did NOT name the category, and so answers first. */
  firstMover: string
}

export interface AnswerState {
  id: number
  author: string
  text: string
  createdAt: string
  struck: boolean
  struckBy: string | null
  strikeReason: StrikeReason | null
}

export interface PendingStrike {
  strikeId: number
  targetId: number
  /** The player who must now answer again. */
  owedBy: string
  reason: StrikeReason
}

export interface GameState {
  answers: AnswerState[]
  activeAnswers: AnswerState[]
  pendingStrike: PendingStrike | null
  /** Login whose move it is, or null once the round is over. */
  turn: string | null
  over: boolean
  winner: string | null
  resignedBy: string | null
}

const FENCE = /```json\s*\n([\s\S]*?)\n```/

function isStrikeReason(value: unknown): value is StrikeReason {
  return value === 'challenge' || value === 'repeat'
}

/** Parse a comment body into an event, or null if it isn't one we understand. */
export function decodeEvent(body: string): GameEvent | null {
  const match = FENCE.exec(body)
  if (!match) return null

  let raw: unknown
  try {
    raw = JSON.parse(match[1])
  } catch {
    return null
  }

  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>

  switch (value.type) {
    case 'answer':
      return typeof value.text === 'string' && value.text.trim()
        ? { type: 'answer', text: value.text }
        : null
    case 'say':
      return typeof value.text === 'string' && value.text.trim()
        ? { type: 'say', text: value.text }
        : null
    case 'strike':
      return typeof value.target === 'number' && isStrikeReason(value.reason)
        ? { type: 'strike', target: value.target, reason: value.reason }
        : null
    case 'resign':
      return { type: 'resign' }
    default:
      return null
  }
}

/**
 * Render an event as a comment body: a human-readable line so the thread
 * stays legible on github.com, plus the machine payload.
 */
export function encodeEvent(event: GameEvent): string {
  const payload = '```json\n' + JSON.stringify(event) + '\n```'

  switch (event.type) {
    case 'answer':
      return `**${event.text}**\n\n${payload}`
    case 'say':
      return `${event.text}\n\n${payload}`
    case 'strike':
      return `_Struck the previous answer — ${event.reason}._\n\n${payload}`
    case 'resign':
      return `_Resigned._\n\n${payload}`
  }
}

export function encodeMeta(meta: GameMeta): string {
  return (
    `Trivia game between @${meta.players[0]} and @${meta.players[1]}. ` +
    `@${meta.firstMover} answers first.\n\n` +
    '```json\n' +
    JSON.stringify(meta) +
    '\n```'
  )
}

export function decodeMeta(body: string): GameMeta | null {
  const match = FENCE.exec(body)
  if (!match) return null

  let raw: unknown
  try {
    raw = JSON.parse(match[1])
  } catch {
    return null
  }

  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>
  const players = value.players

  if (
    !Array.isArray(players) ||
    players.length !== 2 ||
    !players.every((p): p is string => typeof p === 'string') ||
    typeof value.firstMover !== 'string'
  ) {
    return null
  }

  return { players: [players[0], players[1]], firstMover: value.firstMover }
}

export function opponentOf(login: string, meta: GameMeta): string {
  return meta.players[0] === login ? meta.players[1] : meta.players[0]
}

/**
 * Fold the log into state.
 *
 * Turn resolution, in order of precedence:
 *   1. someone resigned        -> round over, the other player wins
 *   2. an unresolved strike    -> the struck player owes a replacement answer
 *   3. otherwise               -> whoever did not write the last active answer
 *   4. no active answers yet   -> the first mover
 */
export function foldGame(entries: readonly LogEntry[], meta: GameMeta): GameState {
  const answers: AnswerState[] = []
  const byId = new Map<number, AnswerState>()
  let pendingStrike: PendingStrike | null = null
  let resignedBy: string | null = null

  for (const entry of entries) {
    // Nothing after a resignation can change the outcome.
    if (resignedBy) break

    switch (entry.event.type) {
      case 'answer': {
        // A replacement answer from the player who owed one clears the strike.
        if (pendingStrike && pendingStrike.owedBy === entry.author) {
          pendingStrike = null
        }
        const answer: AnswerState = {
          id: entry.id,
          author: entry.author,
          text: entry.event.text,
          createdAt: entry.createdAt,
          struck: false,
          struckBy: null,
          strikeReason: null,
        }
        answers.push(answer)
        byId.set(answer.id, answer)
        break
      }

      case 'strike': {
        const target = byId.get(entry.event.target)
        // Ignore strikes against unknown or already-struck answers, so a
        // duplicated request can never corrupt the log.
        if (!target || target.struck) break
        target.struck = true
        target.struckBy = entry.author
        target.strikeReason = entry.event.reason
        pendingStrike = {
          strikeId: entry.id,
          targetId: target.id,
          owedBy: target.author,
          reason: entry.event.reason,
        }
        break
      }

      case 'resign':
        resignedBy = entry.author
        break

      case 'say':
        break
    }
  }

  const activeAnswers = answers.filter((a) => !a.struck)

  let turn: string | null
  if (resignedBy) {
    turn = null
  } else if (pendingStrike) {
    turn = pendingStrike.owedBy
  } else if (activeAnswers.length === 0) {
    turn = meta.firstMover
  } else {
    turn = opponentOf(activeAnswers[activeAnswers.length - 1].author, meta)
  }

  return {
    answers,
    activeAnswers,
    pendingStrike,
    turn,
    over: resignedBy !== null,
    winner: resignedBy ? opponentOf(resignedBy, meta) : null,
    resignedBy,
  }
}

/**
 * The only answer currently in play: the most recent active one, whoever
 * wrote it. Striking the opponent's is a challenge; striking your own is a
 * withdrawal. Restricting strikes to a single answer keeps "whose turn is it"
 * unambiguous — a strike against an older answer would leave the turn order
 * undefined once play had already moved on.
 */
export function strikeableAnswer(state: GameState): AnswerState | null {
  return state.activeAnswers.length > 0
    ? state.activeAnswers[state.activeAnswers.length - 1]
    : null
}

/** A strike by the answer's own author is a withdrawal, not a challenge. */
export function isWithdrawal(answer: AnswerState): boolean {
  return answer.struck && answer.struckBy === answer.author
}
