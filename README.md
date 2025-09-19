DrumVoice — Voice-Only Assistant for Drummers

Overview

DrumVoice is a small web app (frontend in `public/`) plus an Express backend (`server.js`) that accepts natural-language voice commands and translates them into structured actions for a metronome and PDF page-turning.

Key features

- Voice command parsing with an AI provider (Cohere) and a deterministic regex fallback.
- Metronome controls (start/stop, set BPM, subdivisions).
- PDF viewer with voice-controlled page navigation and scheduled page turns.
- Developer-friendly `/api/info` endpoint that reports server metadata for debugging and explanation.

Files of interest

- `server.js` — Express server. Endpoints:
  - `POST /api/process-command` — Accepts { command: string } and returns a parsed intent.
  - `POST /api/test` — Returns both AI and pattern parser outputs for a given command (useful for debugging).
  - `GET /api/health` — Basic health check with uptime and whether a Cohere key is configured.
  - `GET /api/info` — New informational endpoint that returns package metadata, routes, start time, uptime, node version, and whether a Cohere API key is present.
  - `GET /` — Serves `public/index.html`.

- `public/index.html` — Frontend UI + client-side logic (`VoiceOnlyDrumAssistant`) that:
  - Captures voice via Web Speech API.
  - Sends recognized phrases to `/api/process-command`.
  - Falls back to local regex parsing when the server or AI is unavailable.
  - Controls metronome audio, PDF rendering (using pdf.js), and live console logs in the UI.

How to run locally

1. Install dependencies

   Use your terminal (zsh):

   npm install

2. Configure (optional)

   If you want AI parsing via Cohere, add a `.env` file with:

   COHERE_API_KEY=your_cohere_api_key_here

   If no key is present, the server will still run and the frontend will fall back to regex parsing.

3. Start the server

   npm start

4. Open the frontend

   Visit http://localhost:3000 in a Chromium-based browser (Chrome or Edge recommended for the Web Speech API).

Useful debugging

- Visit `http://localhost:3000/api/info` to see runtime metadata and which routes are available.
- Visit `http://localhost:3000/api/test` and POST JSON { "command": "120" } to compare AI vs pattern parsing.

Notes & next steps

- The server logs incoming requests and prints package/version/start time on startup. This provides a quick explanation of what is running and why.
- Consider adding unit tests for the `PatternProcessor` logic and CI checks for linting.

License

MIT
