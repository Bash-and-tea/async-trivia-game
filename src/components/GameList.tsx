import { useState } from 'react'
import type { Game } from '../lib/github'
import type { GameState } from '../lib/events'

export interface GameSummary {
  game: Game
  /** Null for a finished round whose outcome came from the cache. */
  state: GameState | null
}

interface Props {
  summaries: readonly GameSummary[]
  viewer: string
  opponent: string
  score: { mine: number; theirs: number }
  cachedWinner: (issueNumber: number) => string | undefined
  onOpen: (issueNumber: number) => void
  onNew: (category: string) => Promise<void>
  onSignOut: () => void
}

export function GameList({
  summaries,
  viewer,
  opponent,
  score,
  cachedWinner,
  onOpen,
  onNew,
  onSignOut,
}: Props) {
  const [category, setCategory] = useState('')
  const [busy, setBusy] = useState(false)

  const trimmed = category.trim()

  async function create(event: React.FormEvent) {
    event.preventDefault()
    if (!trimmed) return
    setBusy(true)
    try {
      await onNew(trimmed)
      setCategory('')
    } finally {
      setBusy(false)
    }
  }

  function statusOf(summary: GameSummary): { text: string; tone: string } {
    const winner = summary.state?.winner ?? cachedWinner(summary.game.number)
    if (winner) {
      return { text: winner === viewer ? 'You won' : `${opponent} won`, tone: 'done' }
    }
    // A closed issue with no resignation in its log — someone closed it by
    // hand on github.com. Say so rather than inventing a winner.
    if (!summary.game.open) return { text: 'Ended', tone: 'done' }
    if (!summary.state) return { text: '', tone: 'done' }
    return summary.state.turn === viewer
      ? { text: 'Your move', tone: 'mine' }
      : { text: 'Waiting', tone: 'theirs' }
  }

  const live = summaries.filter((s) => s.game.open)
  const finished = summaries.filter((s) => !s.game.open)

  return (
    <div className="page">
      <header className="banner" style={{ marginInline: -16, marginTop: -16 }}>
        <div className="grow">
          <div className="category">Trivia</div>
          <div className="turn theirs">vs. {opponent}</div>
        </div>
        <div className="score">
          {score.mine}–{score.theirs}
        </div>
      </header>

      <form className="panel stack" onSubmit={create}>
        <div className="field">
          <label htmlFor="category">New game</label>
          <input
            id="category"
            type="text"
            value={category}
            placeholder="Bond villains, things in a hardware store…"
            onChange={(e) => setCategory(e.target.value)}
          />
          <span className="hint">You name it, so {opponent} answers first.</span>
        </div>
        <button className="primary" type="submit" disabled={!trimmed || busy}>
          {busy ? 'Starting…' : 'Start'}
        </button>
      </form>

      {live.length > 0 && (
        <ul className="games">
          {live.map((summary) => {
            const status = statusOf(summary)
            return (
              <li key={summary.game.number}>
                <button className="game-link" onClick={() => onOpen(summary.game.number)}>
                  <span className="name">{summary.game.category}</span>
                  <span className={`tag ${status.tone}`}>{status.text}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {live.length === 0 && <p className="hint">No games in progress. Start one above.</p>}

      {finished.length > 0 && (
        <>
          <h1>Finished</h1>
          <ul className="games">
            {finished.map((summary) => {
              const status = statusOf(summary)
              return (
                <li key={summary.game.number}>
                  <button className="game-link" onClick={() => onOpen(summary.game.number)}>
                    <span className="name">{summary.game.category}</span>
                    <span className={`tag ${status.tone}`}>{status.text}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <button className="link" onClick={onSignOut} style={{ alignSelf: 'flex-start' }}>
        Forget my token
      </button>
    </div>
  )
}
