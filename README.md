# DrumVoice: Voice-Only Assistant for Drummers

## Overview

DrumVoice is a web app for drummers whose hands and feet are occupied while playing. It accepts natural-language voice commands and translates them into structured actions for a metronome and PDF sheet music viewer.

## Key Features

- Voice command parsing via Google Gemini (free tier) with a deterministic regex fallback
- Metronome controls: start/stop, set BPM, relative tempo adjustment, subdivisions, tap tempo
- Two-page spread view for sheet music with voice-controlled navigation and scheduled automatic page turns
- Graceful degradation — works fully offline via regex if the AI provider is unavailable

## Project Structure

```
drumvoice/
├── server.js              # Entry point — starts the server
├── public/
│   └── index.html         # Frontend UI and client-side voice logic
└── src/
    ├── app.js             # Express setup, middleware, routes
    ├── routes/
    │   └── commands.js    # All /api endpoints
    ├── providers/
    │   ├── base.js        # Abstract AIProvider base class
    │   ├── gemini.js      # GeminiProvider (Gemini 2.0 Flash, free tier)
    │   └── index.js       # Provider factory
    └── parser/
        ├── normalizer.js       # Text normalization and number parsing utilities
        └── PatternProcessor.js # Regex fallback parser
```

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Add your Gemini API key to `.env`:
   ```
   GEMINI_API_KEY=your_key_here
   ```
   Get a free key at [aistudio.google.com](https://aistudio.google.com). If no key is set, the app still runs using the regex fallback.

3. **Start the server**
   ```bash
   npm start
   ```

4. **Open the app**

   Visit `http://localhost:3000` in Chrome or Edge (required for Web Speech API).

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/process-command` | Parse a voice command — tries AI first, falls back to regex |
| `POST` | `/api/test` | Returns both AI and regex outputs side by side (debugging) |
| `GET`  | `/api/health` | Health check with uptime and provider status |
| `GET`  | `/api/info` | Server metadata, routes, node version |

## Voice Commands

| Command | Action |
|---------|--------|
| "start" / "stop" | Start or stop metronome |
| "120" | Set BPM to 120 |
| "faster" / "slower" | Adjust BPM by ±5 |
| "faster by 10" | Adjust BPM by a specific amount |
| "eighth notes" / "quarter notes" | Set subdivision |
| "tap" (twice) | Set tempo from voice timing |
| "next page" / "previous page" | Navigate sheet music (advances by spread) |
| "go to page 3" | Jump to a specific page |
| "flip every 4 bars" | Schedule automatic page turns |

## Adding a New AI Provider

1. Create `src/providers/yourprovider.js` extending `AIProvider` from `base.js`
2. Implement `async processCommand(command)` — return a structured intent object
3. Add a case for it in `src/providers/index.js`
4. Set `AI_PROVIDER=yourprovider` in `.env`

## License

MIT
