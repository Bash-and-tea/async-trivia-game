import { useState } from 'react'
import { fetchViewer, listGames, GitHubError } from '../lib/github'
import type { Credentials } from '../lib/github'

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new'

interface Props {
  initial: Partial<Credentials>
  onReady: (creds: Credentials, viewer: string) => void
}

export function TokenSetup({ initial, onReady }: Props) {
  const [token, setToken] = useState(initial.token ?? '')
  const [owner, setOwner] = useState(initial.owner ?? 'daddy-and-kitten')
  const [repo, setRepo] = useState(initial.repo ?? 'trivia-log')
  const [opponent, setOpponent] = useState(initial.opponent ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const creds: Credentials = {
      token: token.trim(),
      owner: owner.trim(),
      repo: repo.trim(),
      opponent: opponent.trim().replace(/^@/, ''),
    }

    try {
      // Prove the token works and the data repo is reachable before storing
      // anything, so a typo surfaces here rather than mid-game.
      const viewer = await fetchViewer(creds.token)
      if (viewer.toLowerCase() === creds.opponent.toLowerCase()) {
        throw new Error('That is your own login. Enter the other player instead.')
      }
      await listGames(creds)
      onReady(creds, viewer)
    } catch (err) {
      setError(err instanceof GitHubError || err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <h1>Set up</h1>
      <form className="panel stack" onSubmit={submit}>
        <div className="field">
          <label htmlFor="token">Access token</label>
          <input
            id="token"
            type="password"
            value={token}
            autoComplete="off"
            placeholder="github_pat_…"
            onChange={(e) => setToken(e.target.value)}
            required
          />
          <span className="hint">
            A fine-grained token with <strong>Issues: read and write</strong> on the data repo
            only. <a href={TOKEN_URL} target="_blank" rel="noreferrer">Create one</a>. It is
            stored in this browser and never sent anywhere but GitHub.
          </span>
        </div>

        <div className="field">
          <label htmlFor="owner">Data repo owner</label>
          <input id="owner" type="text" value={owner} onChange={(e) => setOwner(e.target.value)} required />
        </div>

        <div className="field">
          <label htmlFor="repo">Data repo name</label>
          <input id="repo" type="text" value={repo} onChange={(e) => setRepo(e.target.value)} required />
          <span className="hint">The private repo holding the games. Issues must be enabled.</span>
        </div>

        <div className="field">
          <label htmlFor="opponent">Opponent’s GitHub login</label>
          <input
            id="opponent"
            type="text"
            value={opponent}
            placeholder="their-username"
            onChange={(e) => setOpponent(e.target.value)}
            required
          />
        </div>

        {error && <p className="error">{error}</p>}

        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Checking…' : 'Start playing'}
        </button>
      </form>
    </div>
  )
}
