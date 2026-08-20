import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The Pages site is served from https://<owner>.github.io/async-trivia-game/,
// so every asset URL needs the repo name prefix. This holds whether the repo
// lives under the personal account or the organisation.
export default defineConfig({
  base: '/async-trivia-game/',
  plugins: [react()],
})
