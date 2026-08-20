import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TokenSetup } from './components/TokenSetup'
import { TurnBanner } from './components/TurnBanner'
import { ChatLog } from './components/ChatLog'
import { Composer } from './components/Composer'
import { ChallengeDialog } from './components/ChallengeDialog'
import { GameList } from './components/GameList'
import type { GameSummary } from './components/GameList'
import { closeGame, createGame, fetchViewer, listGames, listLog, postEvent } from './lib/github'
import type { Credentials, Game } from './lib/github'
import { foldGame } from './lib/events'
import type { AnswerState, GameEvent, LogEntry, StrikeReason } from './lib/events'
import { clearCredentials, loadCredentials, saveCredentials } from './lib/storage'
import { loadOutcomes, saveOutcomes, tally } from './lib/scores'
import type { Outcomes } from './lib/scores'

/** Turn changes surface within this window. Fast enough for a game played across a day. */
const GAME_POLL_MS = 20_000
const LIST_POLL_MS = 30_000

export function App() {
  const [creds, setCreds] = useState<Credentials | null>(loadCredentials)
  const [viewer, setViewer] = useState<string | null>(null)
  const [booting, setBooting] = useState(creds !== null)
  const [setupError, setSetupError] = useState<string | null>(null)

  const [summaries, setSummaries] = useState<readonly GameSummary[]>([])
  const [outcomes, setOutcomes] = useState<Outcomes>(loadOutcomes)
  const [selected, setSelected] = useState<number | null>(null)
  const [log, setLog] = useState<readonly LogEntry[]>([])
  const [flagging, setFlagging] = useState<AnswerState | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Kept in a ref so the poll effects don't need it as a dependency.
  const credsRef = useRef(creds)
  credsRef.current = creds

  const signOut = useCallback(() => {
    clearCredentials()
    setCreds(null)
    setViewer(null)
    setSelected(null)
    setSummaries([])
  }, [])

  // On reload the token is known but its owner is not.
  useEffect(() => {
    if (!creds || viewer) return
    let cancelled = false
    fetchViewer(creds.token)
      .then((login) => {
        if (!cancelled) {
          setViewer(login)
          setBooting(false)
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        // A token that no longer works should send the player back to setup
        // rather than leaving them staring at an empty screen.
        setSetupError(err instanceof Error ? err.message : String(err))
        clearCredentials()
        setCreds(null)
        setBooting(false)
      })
    return () => {
      cancelled = true
    }
  }, [creds, viewer])

  const refreshList = useCallback(async () => {
    const current = credsRef.current
    if (!current) return
    const games = await listGames(current)
    const known = loadOutcomes()
    const next = { ...known }

    const built = await Promise.all(
      games.map(async (game: Game): Promise<GameSummary> => {
        // A finished round is immutable, so its cached outcome is enough.
        if (!game.open && known[game.number]) return { game, state: null }
        const entries = await listLog(current, game.number)
        const state = foldGame(entries, game.meta)
        if (state.over && state.winner) next[game.number] = state.winner
        return { game, state }
      }),
    )

    saveOutcomes(next)
    setOutcomes(next)
    setSummaries(built)
  }, [])

  const refreshLog = useCallback(async (issueNumber: number) => {
    const current = credsRef.current
    if (!current) return
    setLog(await listLog(current, issueNumber))
  }, [])

  function report(err: unknown) {
    setError(err instanceof Error ? err.message : String(err))
  }

  // Poll the list while browsing, and the open game while playing. Refreshing
  // on focus too means a tab left open all day is current the moment you
  // look at it, without polling any harder.
  useEffect(() => {
    if (!creds || !viewer) return

    const tick = () => {
      const task = selected === null ? refreshList() : refreshLog(selected)
      task.then(() => setError(null)).catch(report)
    }

    tick()
    const interval = setInterval(tick, selected === null ? LIST_POLL_MS : GAME_POLL_MS)
    window.addEventListener('focus', tick)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', tick)
    }
  }, [creds, viewer, selected, refreshList, refreshLog])

  const summary = useMemo(
    () => summaries.find((s) => s.game.number === selected) ?? null,
    [summaries, selected],
  )

  const state = useMemo(
    () => (summary ? foldGame(log, summary.game.meta) : null),
    [log, summary],
  )

  const score = useMemo(() => tally(outcomes, viewer ?? ''), [outcomes, viewer])

  if (!creds || !viewer) {
    if (booting) return <div className="page"><p className="hint">Loading…</p></div>
    return (
      <div className="app">
        {setupError && <p className="error" style={{ padding: '16px 16px 0' }}>{setupError}</p>}
        <TokenSetup
          initial={creds ?? loadCredentials() ?? {}}
          onReady={(next, login) => {
            saveCredentials(next)
            setCreds(next)
            setViewer(login)
            setSetupError(null)
            setBooting(false)
          }}
        />
      </div>
    )
  }

  async function post(issueNumber: number, event: GameEvent) {
    const current = credsRef.current
    if (!current) return
    await postEvent(current, issueNumber, event)
    await refreshLog(issueNumber)
  }

  /**
   * Guard against a stale tab posting into a game that has moved on: re-read
   * the log and confirm the turn still belongs to this player before writing.
   */
  async function postAnswer(text: string) {
    const current = credsRef.current
    if (!current || !summary || selected === null) return
    try {
      const fresh = await listLog(current, selected)
      const freshState = foldGame(fresh, summary.game.meta)
      if (freshState.over) {
        setLog(fresh)
        setError('This round finished while you were typing.')
        return
      }
      if (freshState.turn !== viewer) {
        setLog(fresh)
        setError('Not your turn any more — the log moved on.')
        return
      }
      await post(selected, { type: 'answer', text })
      setError(null)
    } catch (err) {
      report(err)
    }
  }

  async function say(text: string) {
    if (selected === null) return
    try {
      await post(selected, { type: 'say', text })
    } catch (err) {
      report(err)
    }
  }

  async function resign() {
    const current = credsRef.current
    if (!current || selected === null) return
    try {
      await post(selected, { type: 'resign' })
      // Closing the issue is cosmetic — the resign event is what counts — so
      // a failure here must not look like the resignation failed.
      await closeGame(current, selected).catch(() => undefined)
      await refreshList()
    } catch (err) {
      report(err)
    }
  }

  async function strike(reason: StrikeReason) {
    if (selected === null || !flagging) return
    const target = flagging.id
    setFlagging(null)
    try {
      await post(selected, { type: 'strike', target, reason })
    } catch (err) {
      report(err)
    }
  }

  async function startGame(category: string) {
    const current = credsRef.current
    if (!current || !viewer) return
    try {
      // Naming the category costs you the first move.
      const number = await createGame(current, category, {
        players: [viewer, current.opponent],
        firstMover: current.opponent,
      })
      await refreshList()
      setSelected(number)
    } catch (err) {
      report(err)
    }
  }

  if (selected !== null && summary && state) {
    return (
      <div className="app">
        <TurnBanner
          category={summary.game.category}
          state={state}
          viewer={viewer}
          opponent={creds.opponent}
          score={score}
          onBack={() => {
            setSelected(null)
            setLog([])
          }}
        />
        {error && <p className="error" style={{ padding: '8px 16px 0' }}>{error}</p>}
        <ChatLog
          entries={log}
          state={state}
          viewer={viewer}
          opponent={creds.opponent}
          onFlag={setFlagging}
        />
        <Composer
          canAnswer={state.turn === viewer}
          over={state.over}
          opponent={creds.opponent}
          existing={state.activeAnswers.map((a) => a.text)}
          onAnswer={postAnswer}
          onSay={say}
          onResign={resign}
        />
        {flagging && (
          <ChallengeDialog
            answer={flagging}
            isOwn={flagging.author === viewer}
            onStrike={strike}
            onClose={() => setFlagging(null)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="app">
      {error && <p className="error" style={{ padding: '16px 16px 0' }}>{error}</p>}
      <GameList
        summaries={summaries}
        viewer={viewer}
        opponent={creds.opponent}
        score={score}
        cachedWinner={(n) => outcomes[n]}
        onOpen={(n) => {
          setSelected(n)
          setLog([])
        }}
        onNew={startGame}
        onSignOut={signOut}
      />
    </div>
  )
}
