import { describe, expect, it } from 'vitest'
import {
  decodeEvent,
  decodeMeta,
  encodeEvent,
  encodeMeta,
  foldGame,
  strikeableAnswer,
  type GameEvent,
  type GameMeta,
  type LogEntry,
} from './events'

const KAT = 'kat'
const SAM = 'sam'
const meta: GameMeta = { players: [KAT, SAM], firstMover: SAM }

let nextId = 1
function entry(author: string, event: GameEvent): LogEntry {
  return { id: nextId++, author, createdAt: '2026-08-20T10:00:00Z', event }
}
function answer(author: string, text: string): LogEntry {
  return entry(author, { type: 'answer', text })
}

describe('encode / decode round trip', () => {
  it('round-trips every event type', () => {
    const events: GameEvent[] = [
      { type: 'answer', text: 'Le Chiffre' },
      { type: 'say', text: 'that was a stretch' },
      { type: 'strike', target: 42, reason: 'challenge' },
      { type: 'strike', target: 7, reason: 'repeat' },
      { type: 'resign' },
    ]
    for (const event of events) {
      expect(decodeEvent(encodeEvent(event))).toEqual(event)
    }
  })

  it('keeps the answer readable outside the payload', () => {
    expect(encodeEvent({ type: 'answer', text: 'Jaws' })).toContain('**Jaws**')
  })

  it('round-trips meta', () => {
    expect(decodeMeta(encodeMeta(meta))).toEqual(meta)
  })
})

describe('decodeEvent rejects malformed input', () => {
  it('returns null with no payload', () => {
    expect(decodeEvent('just a plain comment')).toBeNull()
  })

  it('returns null on invalid JSON', () => {
    expect(decodeEvent('```json\n{nope}\n```')).toBeNull()
  })

  it('returns null on an unknown type', () => {
    expect(decodeEvent('```json\n{"type":"nuke"}\n```')).toBeNull()
  })

  it('returns null on an empty answer', () => {
    expect(decodeEvent('```json\n{"type":"answer","text":"  "}\n```')).toBeNull()
  })

  it('returns null on a strike with a bad reason', () => {
    expect(decodeEvent('```json\n{"type":"strike","target":1,"reason":"vibes"}\n```')).toBeNull()
  })
})

describe('foldGame turn order', () => {
  it('gives the first move to whoever did not name the category', () => {
    expect(foldGame([], meta).turn).toBe(SAM)
  })

  it('alternates after each answer', () => {
    const log = [answer(SAM, 'Jaws')]
    expect(foldGame(log, meta).turn).toBe(KAT)
    log.push(answer(KAT, 'Oddjob'))
    expect(foldGame(log, meta).turn).toBe(SAM)
  })

  it('ignores chat when deciding whose turn it is', () => {
    const log = [answer(SAM, 'Jaws'), entry(SAM, { type: 'say', text: 'your move' })]
    expect(foldGame(log, meta).turn).toBe(KAT)
  })
})

describe('foldGame strikes', () => {
  it('returns the turn to the struck player and does not score', () => {
    const jaws = answer(SAM, 'Jaws')
    const log = [jaws, entry(KAT, { type: 'strike', target: jaws.id, reason: 'challenge' })]
    const state = foldGame(log, meta)

    expect(state.turn).toBe(SAM)
    expect(state.over).toBe(false)
    expect(state.winner).toBeNull()
    expect(state.activeAnswers).toHaveLength(0)
    expect(state.answers[0].struck).toBe(true)
    expect(state.answers[0].struckBy).toBe(KAT)
  })

  it('clears the strike once the struck player answers again', () => {
    const jaws = answer(SAM, 'Jaws')
    const log = [
      jaws,
      entry(KAT, { type: 'strike', target: jaws.id, reason: 'challenge' }),
      answer(SAM, 'Oddjob'),
    ]
    const state = foldGame(log, meta)

    expect(state.pendingStrike).toBeNull()
    expect(state.turn).toBe(KAT)
    expect(state.activeAnswers.map((a) => a.text)).toEqual(['Oddjob'])
  })

  it('does not clear the strike when the wrong player answers', () => {
    const jaws = answer(SAM, 'Jaws')
    const log = [
      jaws,
      entry(KAT, { type: 'strike', target: jaws.id, reason: 'challenge' }),
      answer(KAT, 'Nick Nack'),
    ]
    expect(foldGame(log, meta).turn).toBe(SAM)
  })

  it('supports withdrawing your own answer', () => {
    const jaws = answer(SAM, 'Jaws')
    const log = [jaws, entry(SAM, { type: 'strike', target: jaws.id, reason: 'challenge' })]
    const state = foldGame(log, meta)

    expect(state.turn).toBe(SAM)
    expect(state.answers[0].struckBy).toBe(SAM)
  })

  it('ignores a strike against an unknown answer', () => {
    const log = [answer(SAM, 'Jaws'), entry(KAT, { type: 'strike', target: 9999, reason: 'repeat' })]
    const state = foldGame(log, meta)

    expect(state.pendingStrike).toBeNull()
    expect(state.turn).toBe(KAT)
  })

  it('ignores a second strike against an already-struck answer', () => {
    const jaws = answer(SAM, 'Jaws')
    const log = [
      jaws,
      entry(KAT, { type: 'strike', target: jaws.id, reason: 'challenge' }),
      entry(KAT, { type: 'strike', target: jaws.id, reason: 'repeat' }),
    ]
    const state = foldGame(log, meta)

    expect(state.answers[0].strikeReason).toBe('challenge')
    expect(state.turn).toBe(SAM)
  })

  it('falls back to the first mover when every answer has been struck', () => {
    const jaws = answer(SAM, 'Jaws')
    const log = [
      jaws,
      entry(KAT, { type: 'strike', target: jaws.id, reason: 'challenge' }),
      answer(SAM, 'Oddjob'),
    ]
    const struck = foldGame(log, meta)
    expect(struck.activeAnswers).toHaveLength(1)
  })
})

describe('foldGame resignation', () => {
  it('ends the round and scores for the opponent', () => {
    const log = [answer(SAM, 'Jaws'), entry(KAT, { type: 'resign' })]
    const state = foldGame(log, meta)

    expect(state.over).toBe(true)
    expect(state.resignedBy).toBe(KAT)
    expect(state.winner).toBe(SAM)
    expect(state.turn).toBeNull()
  })

  it('ignores anything logged after the resignation', () => {
    const log = [
      answer(SAM, 'Jaws'),
      entry(KAT, { type: 'resign' }),
      answer(KAT, 'Oddjob'),
    ]
    const state = foldGame(log, meta)

    expect(state.winner).toBe(SAM)
    expect(state.activeAnswers.map((a) => a.text)).toEqual(['Jaws'])
  })
})

describe('strikeableAnswer', () => {
  it('is null before anyone has answered', () => {
    expect(strikeableAnswer(foldGame([], meta))).toBeNull()
  })

  it('is the most recent active answer', () => {
    const log = [answer(SAM, 'Jaws'), answer(KAT, 'Oddjob')]
    expect(strikeableAnswer(foldGame(log, meta))?.text).toBe('Oddjob')
  })

  it('skips past an answer that was already struck', () => {
    const oddjob = answer(KAT, 'Oddjob')
    const log = [
      answer(SAM, 'Jaws'),
      oddjob,
      entry(SAM, { type: 'strike', target: oddjob.id, reason: 'challenge' }),
    ]
    expect(strikeableAnswer(foldGame(log, meta))?.text).toBe('Jaws')
  })
})
