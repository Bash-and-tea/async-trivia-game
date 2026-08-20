/**
 * The entire backend. GitHub Pages serves static files only, so shared state
 * lives in the GitHub API: one private-repo issue per game, one comment per
 * event. Staying inside GitHub's IP range is also what makes this reachable
 * from both players' corporate VPNs.
 */

import { decodeEvent, decodeMeta, encodeEvent, encodeMeta } from './events'
import type { GameEvent, GameMeta, LogEntry } from './events'

const API = 'https://api.github.com'

export interface Credentials {
  token: string
  owner: string
  repo: string
  /** The other player's GitHub login. */
  opponent: string
}

export interface Game {
  number: number
  category: string
  meta: GameMeta
  open: boolean
  updatedAt: string
}

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'GitHubError'
  }
}

/** Turn an HTTP failure into something a player can actually act on. */
function describe(status: number, repo: string): string {
  switch (status) {
    case 401:
      return 'That token was rejected. It may be expired, revoked, or mistyped.'
    case 403:
      return `Token lacks permission for ${repo}. It needs Issues: read and write.`
    case 404:
      return `Cannot see ${repo}. Check the name, and that the token is scoped to it.`
    case 410:
      return `Issues are disabled on ${repo}. Enable them in the repository settings.`
    default:
      return `GitHub returned ${status}.`
  }
}

async function request<T>(
  creds: Pick<Credentials, 'token'>,
  path: string,
  init: RequestInit = {},
  repoLabel = 'the data repo',
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${creds.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    })
  } catch {
    // Worth distinguishing: on a corporate VPN this is the likely failure.
    throw new GitHubError('Could not reach api.github.com. Check your connection.', 0)
  }

  if (!response.ok) {
    throw new GitHubError(describe(response.status, repoLabel), response.status)
  }

  return (await response.json()) as T
}

function repoLabel(creds: Credentials): string {
  return `${creds.owner}/${creds.repo}`
}

/** Resolve who the token belongs to. This is the whole identity system. */
export async function fetchViewer(token: string): Promise<string> {
  const user = await request<{ login: string }>({ token }, '/user')
  return user.login
}

interface RawIssue {
  number: number
  title: string
  body: string | null
  state: string
  updated_at: string
  pull_request?: unknown
}

export async function listGames(creds: Credentials): Promise<Game[]> {
  const issues = await request<RawIssue[]>(
    creds,
    `/repos/${creds.owner}/${creds.repo}/issues?state=all&per_page=50&sort=created&direction=desc`,
    {},
    repoLabel(creds),
  )

  const games: Game[] = []
  for (const issue of issues) {
    if (issue.pull_request) continue
    const meta = decodeMeta(issue.body ?? '')
    // An issue without parseable metadata was not created by this app.
    if (!meta) continue
    games.push({
      number: issue.number,
      category: issue.title,
      meta,
      open: issue.state === 'open',
      updatedAt: issue.updated_at,
    })
  }
  return games
}

interface RawComment {
  id: number
  body: string | null
  created_at: string
  user: { login: string } | null
}

/** Fetch the full log, following pagination so long rounds stay correct. */
export async function listLog(creds: Credentials, issueNumber: number): Promise<LogEntry[]> {
  const entries: LogEntry[] = []

  for (let page = 1; ; page++) {
    const comments = await request<RawComment[]>(
      creds,
      `/repos/${creds.owner}/${creds.repo}/issues/${issueNumber}/comments?per_page=100&page=${page}`,
      {},
      repoLabel(creds),
    )

    for (const comment of comments) {
      const event = decodeEvent(comment.body ?? '')
      // Comments written by hand on github.com are simply not events.
      if (!event || !comment.user) continue
      entries.push({
        id: comment.id,
        author: comment.user.login,
        createdAt: comment.created_at,
        event,
      })
    }

    if (comments.length < 100) return entries
  }
}

export async function createGame(
  creds: Credentials,
  category: string,
  meta: GameMeta,
): Promise<number> {
  const issue = await request<{ number: number }>(
    creds,
    `/repos/${creds.owner}/${creds.repo}/issues`,
    { method: 'POST', body: JSON.stringify({ title: category, body: encodeMeta(meta) }) },
    repoLabel(creds),
  )
  return issue.number
}

export async function postEvent(
  creds: Credentials,
  issueNumber: number,
  event: GameEvent,
): Promise<void> {
  await request(
    creds,
    `/repos/${creds.owner}/${creds.repo}/issues/${issueNumber}/comments`,
    { method: 'POST', body: JSON.stringify({ body: encodeEvent(event) }) },
    repoLabel(creds),
  )
}

export async function closeGame(creds: Credentials, issueNumber: number): Promise<void> {
  await request(
    creds,
    `/repos/${creds.owner}/${creds.repo}/issues/${issueNumber}`,
    { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: 'completed' }) },
    repoLabel(creds),
  )
}
