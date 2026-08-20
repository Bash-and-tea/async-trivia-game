import { useEffect, useState } from 'react'
import { lookup, webSearchUrl } from '../lib/wikipedia'
import type { WikiResult } from '../lib/wikipedia'
import type { AnswerState, StrikeReason } from '../lib/events'

interface Props {
  answer: AnswerState
  isOwn: boolean
  onStrike: (reason: StrikeReason) => void
  onClose: () => void
}

/**
 * Evidence before judgment: the player sees what Wikipedia knows before
 * deciding. Because a strike only costs the answerer a retry, "never mind"
 * is a real option rather than a concession.
 */
export function ChallengeDialog({ answer, isOwn, onStrike, onClose }: Props) {
  const [results, setResults] = useState<WikiResult[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    lookup(answer.text, controller.signal)
      .then(setResults)
      .catch((err: unknown) => {
        // AbortError just means the dialog closed first.
        if (err instanceof Error && err.name === 'AbortError') return
        setFailed(true)
      })
    return () => controller.abort()
  }, [answer.text])

  return (
    <div className="dialog-backdrop" onClick={onClose} role="presentation">
      <div
        className="dialog stack"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Check ${answer.text}`}
      >
        <h2>{answer.text}</h2>

        {!results && !failed && <p className="hint">Checking Wikipedia…</p>}

        {failed && (
          <p className="hint">
            Could not reach Wikipedia from this network. Use the web search below instead.
          </p>
        )}

        {results && results.length === 0 && (
          <p className="hint">
            Wikipedia has no article by that name. That is weak evidence, not proof — plenty of
            real things have no article.
          </p>
        )}

        {results && results.length > 0 && (
          <ul className="results">
            {results.map((result) => (
              <li key={result.url}>
                <a href={result.url} target="_blank" rel="noreferrer">
                  {result.title}
                </a>
                {result.description && <div className="desc">{result.description}</div>}
              </li>
            ))}
          </ul>
        )}

        <a href={webSearchUrl(answer.text)} target="_blank" rel="noreferrer">
          Search the web instead →
        </a>

        <div className="row-buttons">
          {isOwn ? (
            <button className="danger" onClick={() => onStrike('challenge')}>
              Withdraw it
            </button>
          ) : (
            <>
              <button className="danger" onClick={() => onStrike('challenge')}>
                Strike — doesn’t fit
              </button>
              <button className="danger" onClick={() => onStrike('repeat')}>
                Strike — repeat
              </button>
            </>
          )}
          <button className="spacer primary" onClick={onClose}>
            Never mind
          </button>
        </div>
      </div>
    </div>
  )
}
