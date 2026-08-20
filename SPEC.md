# Async Trivia — Design Spec

A two-player, turn-based trivia game played over the course of a work day.
Players alternate naming items that belong to a category. The interface is a
chat log: each answer is a message, and it should be obvious at a glance whose
turn it is.

Designed to be reachable from behind corporate VPNs by living entirely inside
GitHub's IP ranges.

---

## 1. Rules

1. Either player starts a **New Game** by naming a free-text category
   (e.g. "Bond villains", "things in a hardware store", "words with a silent K").
2. The player who *did not* name the category answers first.
3. Players alternate naming one item per turn.
4. Answers are **auto-approved**. There is no validation gate — honor system.
5. Either player may **strike** their opponent's most recent answer, for one of
   two reasons:
   - **Challenge** — "I don't think that's real / that doesn't fit."
   - **Repeat** — "You already said that."
   A strike is not a loss. The struck answer is removed from play and the player
   who wrote it simply **answers again**.
6. A player may also strike **their own** most recent answer (a withdrawal), with
   the same effect.
7. **The only way to lose a round is to resign.** When a player passes, the round
   ends and the opponent scores a point.
8. **No clock.** There is no time pressure at any point.

Score is a running tally of rounds won, carried across all games.

### Why strikes don't end rounds

Because a strike costs the striker nothing and the struck player nothing but a
retry, there is no incentive to challenge frivolously and no need for an
adjudicator. This removes the deadlock case entirely — "we disagree and neither
will budge" cannot happen, because the disputed answer is simply replaced.

---

## 2. Fact-checking

Striking is a two-step flow so evidence comes before judgment:

1. Player clicks the flag affordance on the opponent's answer.
2. A dialog opens showing **Wikipedia OpenSearch** results for the term, plus a
   button to open a full web search in a new tab.
3. Player chooses **Strike it** or **Never mind, it stands.**

"Never mind" writes nothing to the log — the answer stands and play continues.

**Wikipedia OpenSearch** (`https://en.wikipedia.org/w/api.php?action=opensearch`)
is free, needs no API key, sends `Access-Control-Allow-Origin: *`, and its search
ranking absorbs spelling variation for free. Both players have confirmed
reachability.

### Repeat detection

Checked client-side at submit time, before posting, so the player is warned
rather than caught:

- Normalize: lowercase, strip punctuation and diacritics, drop leading articles
  (`the`, `a`, `an`), collapse whitespace.
- Compare against every active answer in the round by Levenshtein distance ≤ 2,
  so `Massachussets` trips against `Massachusetts`.
- On a hit, warn and require confirmation — never hard-block, since a category
  may legitimately contain near-identical items.

Anything that slips through is handled by a strike with reason `repeat`.

---

## 3. Architecture

GitHub Pages is **static hosting only** — no server, no database, no API routes.
The shared state therefore lives in the GitHub API itself, which keeps every
request inside an IP range both VPNs already permit.

### Two repositories

| Repo | Visibility | Contents |
| --- | --- | --- |
| `async-trivia-game` | **public** | The Vite app + Pages deploy workflow |
| `trivia-log` | **private** | No code. Issues only — the game data |

The site repo must be public for Pages to serve on a free plan, and a Pages site
is publicly reachable regardless of plan. Privacy therefore comes from putting
the *data* in a separate private repo, which the API reads happily with a token.

> **Both repos should be owned by a free GitHub organization**, not a personal
> account. Fine-grained personal access tokens can only be scoped to repositories
> owned by the token's creator or by an org they belong to. If `trivia-log` were
> owned by one player personally, the other — a mere collaborator — could not
> mint a fine-grained token for it and would need a classic PAT with full `repo`
> scope, granting access to every repository they can reach. An org makes
> correctly-scoped tokens available to both players. Free orgs include unlimited
> private repos.

### Issues as the datastore

One **issue per game** in `trivia-log`:

- **Issue title** — the category.
- **Issue body** — game metadata (players, who moves first, status).
- **Each comment** — one event in the game log.
- **Issue open/closed** — round in progress vs. finished.

Chosen over committing a JSON state file because:

- Writing state into the deployed branch would retrigger a Pages rebuild on
  every single turn — slow, noisy, and wasteful.
- Comments already carry IDs, authors, and timestamps, which is exactly the
  shape a turn log needs.
- The log stays human-readable and hand-repairable on github.com if the app
  ever breaks.
- Rate limits are a non-issue: 5,000 authenticated requests/hour against a
  20-second poll is roughly 180/hour.

### Event log

Each comment carries a fenced JSON block, so the thread renders legibly on
github.com as well as in the app. Four event types:

```json
{ "type": "answer", "text": "Le Chiffre" }
{ "type": "strike",  "target": 1234567, "reason": "challenge" }
{ "type": "resign" }
{ "type": "say",     "text": "ok that one was a stretch" }
```

`say` is free-text chat that does not affect game state — it keeps the log
feeling like a conversation rather than a bare move list, and covers the
honor-system cases the formal rules don't (e.g. catching a repeat several turns
after the fact).

Author and timestamp come from the comment itself; no need to duplicate them
into the payload.

### Derived state

Game state is a **fold over the event log** — never stored, always recomputed.
This makes the log the single source of truth and eliminates any possibility of
state drift between the two clients.

```
resign present            -> round over; winner is the other player
unresolved strike present -> turn belongs to the author of the struck answer
otherwise                 -> turn belongs to whoever did not write the last
                             active answer
empty log                 -> turn belongs to whoever did not name the category
```

A strike is *unresolved* until its author posts a replacement `answer`.

### Concurrency

Strict turn alternation means the two clients cannot legitimately write at the
same time. The remaining risk is a stale client double-posting, guarded by
re-fetching the comment list immediately before any write and refusing to post
if the derived turn is no longer the local player's.

### Auth

No login system. Each player pastes a fine-grained PAT once, held in
`localStorage`. `GET /user` resolves who they are, so identity and turn
ownership fall out for free.

Token scope: **Issues (read + write)** and **Metadata (read)** on `trivia-log`
only.

> **Known trade-off:** the token sits in browser `localStorage`, readable by any
> script running on the page. For a two-person game on a repo containing nothing
> but trivia answers, with a narrowly-scoped and instantly-revocable token, this
> is an acceptable trade — but it is a real one, and it is why the token must
> never be scoped more broadly than the data repo.

---

## 4. Stack

**Vite + React + TypeScript.** A real component model, a small self-contained
build, and a short deploy workflow.

- **Not Next.js.** Its value — server components, API routes, SSR — is
  unusable on static Pages. It would add `basePath` friction for the
  `/async-trivia-game/` subpath and extra build machinery in exchange for
  nothing.
- **Not Three.js.** A chat log does not need a 3D renderer, and a large bundle
  is the wrong bet on a locked-down corporate laptop. Visual polish comes from
  CSS transitions on strikes and round wins.

All assets ship from the Pages origin — no CDN, no external fonts, no runtime
dependency on anything outside `api.github.com` and `en.wikipedia.org`.

Polling every 20s. Turn changes appear within that window rather than instantly,
which is invisible in a game played across a work day and avoids needing any
always-on infrastructure.

---

## 5. Interface

A single column, sized for a browser tab parked next to real work.

**Sticky header** — whose turn it is ("Your move" / "Waiting on Kat"), the
category, and the running score. Legible at a glance without reading the log.

**Chat log** — answers as alternating-sided message bubbles, oldest at top,
scrolled to the bottom on load. Struck answers remain visible but rendered
struck-through and dimmed, so the round's history stays honest. Strikes and
resignations render as centered system banners rather than bubbles.

**Composer** — a single text input, pinned to the bottom, disabled with an
explanatory placeholder when it isn't your turn. A resign control sits beside
it, behind a confirmation step.

**Setup screen** — shown when no token is stored: a field for the PAT and a
link to the pre-filled GitHub token-creation page with the right scopes.

---

## 6. Layout

```
async-trivia-game/
├── .github/workflows/deploy.yml
├── index.html
├── vite.config.ts              base: '/async-trivia-game/'
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── lib/
    │   ├── github.ts           issues + comments client
    │   ├── wikipedia.ts        OpenSearch fact check
    │   ├── events.ts           event types, parse, fold to state
    │   └── normalize.ts        normalization + Levenshtein
    └── components/
        ├── TokenSetup.tsx
        ├── TurnBanner.tsx
        ├── ChatLog.tsx
        ├── Composer.tsx
        └── ChallengeDialog.tsx
```

---

## 7. Setup checklist

Manual steps, done once, before the app is usable:

1. Create a free GitHub organization; transfer or recreate
   `async-trivia-game` under it.
2. Create `trivia-log` in the org — **private**, issues enabled, no code.
3. Invite the co-owner to the org with write access to both repos.
4. Enable Pages on `async-trivia-game` (source: GitHub Actions).
5. Each player mints a fine-grained PAT scoped to `trivia-log`
   (Issues: read/write, Metadata: read) and pastes it into the app once.

---

## 8. Deliberately excluded

- Push notifications — a banner in the log is enough.
- Any time limit or shot clock.
- Adjudicated challenges — retry-on-strike removes the need.
- Categories checked into the repo — they're made up per game.
- Accounts, sessions, or password handling.
