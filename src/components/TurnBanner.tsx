import type { GameState } from '../lib/events'

interface Props {
  category: string
  state: GameState
  viewer: string
  opponent: string
  score: { mine: number; theirs: number }
  onBack: () => void
}

export function TurnBanner({ category, state, viewer, opponent, score, onBack }: Props) {
  let label: string
  let tone: string

  if (state.over) {
    label = state.winner === viewer ? 'You won this round' : `${opponent} won this round`
    tone = 'over'
  } else if (state.turn === viewer) {
    label = state.pendingStrike ? 'Your answer was struck — try another' : 'Your move'
    tone = 'mine'
  } else {
    label = state.pendingStrike ? `${opponent} is retrying` : `Waiting on ${opponent}`
    tone = 'theirs'
  }

  return (
    <header className="banner">
      <button onClick={onBack} aria-label="Back to all games">←</button>
      <div className="grow">
        <div className="category">{category}</div>
        <div className={`turn ${tone}`}>{label}</div>
      </div>
      <div className="score">
        {score.mine}–{score.theirs}
      </div>
    </header>
  )
}
