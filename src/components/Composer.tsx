import { useState } from 'react'
import { findNearDuplicate } from '../lib/normalize'

interface Props {
  canAnswer: boolean
  over: boolean
  opponent: string
  /** Active answers in this round, for the repeat warning. */
  existing: readonly string[]
  onAnswer: (text: string) => Promise<void>
  onSay: (text: string) => Promise<void>
  onResign: () => Promise<void>
}

export function Composer({ canAnswer, over, opponent, existing, onAnswer, onSay, onResign }: Props) {
  const [text, setText] = useState('')
  const [duplicate, setDuplicate] = useState<string | null>(null)
  const [confirmingResign, setConfirmingResign] = useState(false)
  const [busy, setBusy] = useState(false)

  const trimmed = text.trim()

  async function run(action: () => Promise<void>) {
    setBusy(true)
    try {
      await action()
      setText('')
      setDuplicate(null)
    } finally {
      setBusy(false)
    }
  }

  function submitAnswer() {
    if (!trimmed) return
    // Warn once, then let the player insist — near-identical items can both
    // be legitimate, so this must never be a hard block.
    if (!duplicate) {
      const match = findNearDuplicate(trimmed, existing)
      if (match) {
        setDuplicate(match)
        return
      }
    }
    void run(() => onAnswer(trimmed))
  }

  if (over) {
    return (
      <div className="composer">
        <p className="hint">This round is finished.</p>
      </div>
    )
  }

  const placeholder = canAnswer
    ? 'Name one…'
    : `Waiting on ${opponent} — you can still chat`

  return (
    <div className="composer">
      {duplicate && (
        <p className="warn">
          Looks like “{duplicate}” again. Send anyway if you meant something different.
        </p>
      )}

      <div className="fields">
        <input
          type="text"
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value)
            setDuplicate(null)
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || busy) return
            if (canAnswer) submitAnswer()
            else if (trimmed) void run(() => onSay(trimmed))
          }}
        />
      </div>

      <div className="actions">
        {canAnswer && (
          <button className="primary" disabled={!trimmed || busy} onClick={submitAnswer}>
            {duplicate ? 'Send anyway' : 'Answer'}
          </button>
        )}
        <button disabled={!trimmed || busy} onClick={() => void run(() => onSay(trimmed))}>
          Say
        </button>

        <span className="spacer" />

        {confirmingResign ? (
          <>
            <button className="danger" disabled={busy} onClick={() => void run(onResign)}>
              Yes, I’m out
            </button>
            <button onClick={() => setConfirmingResign(false)}>Cancel</button>
          </>
        ) : (
          <button className="danger" onClick={() => setConfirmingResign(true)}>
            Pass
          </button>
        )}
      </div>
    </div>
  )
}
