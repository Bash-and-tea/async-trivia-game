import { useEffect, useRef } from 'react'
import type { AnswerState, GameState, LogEntry } from '../lib/events'

interface Props {
  entries: readonly LogEntry[]
  state: GameState
  viewer: string
  opponent: string
  onFlag: (answer: AnswerState) => void
}

function relativeTime(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 90) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export function ChatLog({ entries, state, viewer, opponent, onFlag }: Props) {
  const endRef = useRef<HTMLDivElement>(null)
  const answersById = new Map(state.answers.map((a) => [a.id, a]))
  const strikeable = state.activeAnswers.at(-1)

  // Follow the conversation as it grows, the way a chat client would.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [entries.length])

  function who(author: string): string {
    return author === viewer ? 'You' : opponent
  }

  return (
    <div className="log">
      {entries.length === 0 && (
        <p className="system">No answers yet. {state.turn === viewer ? 'You start.' : `${opponent} starts.`}</p>
      )}

      {entries.map((entry) => {
        const mine = entry.author === viewer
        const side = mine ? 'mine' : 'theirs'

        switch (entry.event.type) {
          case 'answer': {
            const answer = answersById.get(entry.id)
            if (!answer) return null
            const canFlag = !state.over && strikeable?.id === answer.id
            return (
              <div className={`row ${side}`} key={entry.id}>
                <div className={`bubble answer ${answer.struck ? 'struck' : ''}`}>
                  {answer.text}
                </div>
                <div className="meta">
                  {relativeTime(entry.createdAt)}
                  {canFlag && (
                    <>
                      {' · '}
                      <button className="flag" onClick={() => onFlag(answer)}>
                        {mine ? 'withdraw' : 'check this'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          }

          case 'say':
            return (
              <div className={`row ${side}`} key={entry.id}>
                <div className="bubble chat">{entry.event.text}</div>
                <div className="meta">{relativeTime(entry.createdAt)}</div>
              </div>
            )

          case 'strike': {
            const target = answersById.get(entry.event.target)
            if (!target) return null
            const withdrawn = entry.author === target.author
            return (
              <p className="system" key={entry.id}>
                {withdrawn
                  ? `${who(entry.author)} withdrew “${target.text}”`
                  : `${who(entry.author)} struck “${target.text}” — ${
                      entry.event.reason === 'repeat' ? 'already said' : 'doesn’t fit'
                    }`}
              </p>
            )
          }

          case 'resign':
            return (
              <p className="system result" key={entry.id}>
                {who(entry.author)} passed. {entry.author === viewer ? opponent : 'You'} won the round.
              </p>
            )
        }
      })}

      <div ref={endRef} />
    </div>
  )
}
