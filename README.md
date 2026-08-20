# async-trivia-game

Two-player, turn-based trivia played across a work day. You take turns naming
items in a category; the interface is a chat log, so it is obvious at a glance
whose move it is.

Hosted on GitHub Pages with the GitHub API as its only backend, which keeps
every request inside an IP range that corporate VPNs generally already permit.

See [SPEC.md](SPEC.md) for the rules, architecture, and the reasoning behind
both.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173/async-trivia-game/
npm test           # game rules and normalisation
npm run build      # typecheck + production bundle
```

## Deploy

Pushing to `main` builds and publishes via `.github/workflows/deploy.yml`.
Set **Settings → Pages → Source** to **GitHub Actions** first.

## First run

The app needs a private data repository holding one issue per game. See
§7 of the spec for the full checklist — briefly:

1. Create a private `trivia-log` repo in the organisation, issues enabled.
2. Enable Pages on this repo, source `GitHub Actions`.
3. Each player mints a fine-grained token scoped to `trivia-log` with
   **Issues: read and write**, and pastes it into the app once.

The token is held in that browser's `localStorage` and is sent only to
`api.github.com`. Scope it to the data repo and nothing else.
