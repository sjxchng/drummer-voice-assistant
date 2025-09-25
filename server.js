// server.js - Backend for DrumVoice
//
// This file implements a small Express server that exposes a few API endpoints
// used by the front-end in `public/`. The primary responsibility is to accept
// natural-language voice commands from the UI, try to parse them with an AI
// provider (Cohere), and fall back to a deterministic regex-based parser when
// the AI is unavailable or returns non-JSON.

// Environment variables:
const express = require('express'); // Express web server framework
const cors = require('cors'); // Enable CORS for all routes (Cross-Origin Resource Sharing allows frontend JS to call backend APIs)
const path = require('path'); // Utilities for handling and transforming file paths
require('dotenv').config(); // Load environment variables from .env file
const fetch = global.fetch || require('node-fetch'); // Fetch API for making HTTP requests (node-fetch for Node.js)
const pkg = require('./package.json'); // used for metadata in /api/info

const app = express(); // Create Express application
const PORT = process.env.PORT || 3000; // Port to listen on (default 3000)

// Record the time the server started so /api/info can report uptime/start
const serverStart = new Date(); // Timestamp when server started

// Basic middlewares
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Simple request logger: prints method, path, and body size / params.
app.use((req, res, next) => {
    const now = new Date().toISOString();
    const bodySummary = req.body && Object.keys(req.body).length ? JSON.stringify(req.body) : '';
    console.log(`[${now}] ${req.method} ${req.path} ${bodySummary}`);
    next();
});

// Simple AI processor using Cohere
class DrumVoiceAI {
    constructor() {
        this.apiKey = process.env.COHERE_API_KEY;
        this.provider = 'cohere';

        // System prompt optimized for drummer commands
        this.systemPrompt = `You are a voice command parser for drummers. Parse natural language into JSON actions.

ACTIONS you can return:
- setBpm: {"action": "setBpm", "bpm": number}
- adjustBpm: {"action": "adjustBpm", "change": number} (positive or negative)  
- startMetronome: {"action": "startMetronome"}
- stopMetronome: {"action": "stopMetronome"}
- setSubdivision: {"action": "setSubdivision", "subdivision": "quarter|eighth|triplet|sixteenth"}
- nextPage: {"action": "nextPage"}
- previousPage: {"action": "previousPage"}
- goToPage: {"action": "goToPage", "page": number}
- schedulePageTurn: {"action": "schedulePageTurn", "bars": number}

EXAMPLES:
"start" → {"action": "startMetronome"}
"120" → {"action": "setBpm", "bpm": 120}
"faster" → {"action": "adjustBpm", "change": 5}
"slower" → {"action": "adjustBpm", "change": -5}
"next page" → {"action": "nextPage"}
"eighth notes" → {"action": "setSubdivision", "subdivision": "eighth"}
"flip every 4 bars" → {"action": "schedulePageTurn", "bars": 4}

ONLY respond with valid JSON. No explanations.`;
    }

    async processCommand(command) {
        if (!this.apiKey) {
            throw new Error('No Cohere API key configured');
        }

        try {
            const response = await fetch('https://api.cohere.ai/v1/chat', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'command-r',
                    message: `Parse: "${command}"`,
                    preamble: this.systemPrompt,
                    max_tokens: 100,
                    temperature: 0.1,
                    stream: false
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Cohere API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            const aiResponse = data.text.trim();

            // Try to parse JSON from AI response
            try {
                return JSON.parse(aiResponse);
            } catch (parseError) {
                // If direct parsing fails, try to extract JSON
                const jsonMatch = aiResponse.match(/\{[^}]*\}/);
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[0]);
                }
                throw new Error('Could not extract valid JSON from AI response');
            }

        } catch (error) {
            console.error('AI processing error:', error);
            throw error;
        }
    }
}

// Reliable regex fallback processor (improved)
// Includes normalization helpers, small word->number conversion, BPM clamping,
// extended subdivision recognition, and relative numeric adjustments.

// Basic normalization: lower-case, remove punctuation (keep hyphens and digits),
// collapse spaces, and convert ordinals like "3rd" -> "3".
function normalizeText(input) {
    if (!input || typeof input !== 'string') return '';
    let s = input.toLowerCase();
    // Convert ordinal suffixes 1st/2nd/3rd/4th -> 1/2/3/4
    s = s.replace(/(\d+)(st|nd|rd|th)\b/g, '$1');
    // Keep letters, numbers, hyphens and spaces; convert other punctuation to space
    s = s.replace(/[^\w\d\-\s]/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
}

// Small word->number for common words (1..99) - enough for pages/bars and small adjustments
const WORD_NUMBER_MAP = {
    zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10,
    eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19,
    twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90
};

function wordToNumber(token) {
    if (!token || typeof token !== 'string') return null;
    token = token.replace(/\-/g, ' ').trim();
    // try direct map
    if (WORD_NUMBER_MAP.hasOwnProperty(token)) return WORD_NUMBER_MAP[token];
    // handle compounds like 'twenty one'
    const parts = token.split(/\s+/).map(p=>p.trim()).filter(Boolean);
    if (parts.length === 2 && WORD_NUMBER_MAP.hasOwnProperty(parts[0]) && WORD_NUMBER_MAP.hasOwnProperty(parts[1])) {
        return WORD_NUMBER_MAP[parts[0]] + WORD_NUMBER_MAP[parts[1]];
    }
    return null;
}

function parseNumberToken(token) {
    if (!token) return null;
    token = token.trim();
    if (/^\d+$/.test(token)) return parseInt(token, 10);
    // If phrase contains spaces ("one hundred twenty"), try phrase parsing
    if (/\s+/.test(token)) {
        const p = parseNumberPhrase(token);
        if (p !== null) return p;
    }
    const w = wordToNumber(token);
    return w !== null ? w : null;
}

// Parse multi-word number phrases like "one hundred twenty" (supports up to thousands)
function parseNumberPhrase(phrase) {
    if (!phrase || typeof phrase !== 'string') return null;
    const toks = phrase.toLowerCase().replace(/\-/g, ' ').split(/\s+/).filter(Boolean);
    let total = 0;
    let current = 0;
    for (const t of toks) {
        if (t === 'and') continue; // ignore filler
        if (WORD_NUMBER_MAP.hasOwnProperty(t)) {
            current += WORD_NUMBER_MAP[t];
            continue;
        }
        if (t === 'hundred') {
            current = (current || 1) * 100;
            continue;
        }
        if (t === 'thousand') {
            current = (current || 1) * 1000;
            total += current;
            current = 0;
            continue;
        }
        if (/^\d+$/.test(t)) {
            current += parseInt(t, 10);
            continue;
        }
        // unknown token - bail
        return null;
    }
    total += current;
    return total || null;
}

function clampBpm(n) {
    if (typeof n !== 'number' || Number.isNaN(n)) return null;
    const min = 40; // allow low tempos (drum practice) but clamp extremes
    const max = 300;
    return Math.max(min, Math.min(max, Math.round(n)));
}

class PatternProcessor {
    processCommand(command) {
        const raw = (command || '').toString();
        const cmd = normalizeText(raw);

            // QUICK CHECK: If the phrase contains explicit timer/countdown words, handle timer intents first
            if (/\b(timer|countdown)\b/.test(cmd) || /set\s+(?:a\s+)?(?:timer|countdown)/.test(cmd)) {
                // TIMER: set duration (e.g., "set timer for 2 minutes", "set a 90 second timer")
                const setTimerMatch = cmd.match(/set\s+(?:a\s+)?(?:timer|countdown)\s+(?:for\s+)?(.+)/);
                if (setTimerMatch && setTimerMatch[1]) {
                    const msCandidate = setTimerMatch[1].trim();
                    const mmss = msCandidate.match(/^(\d{1,3}):(\d{1,2})$/);
                    if (mmss) {
                        const m = parseInt(mmss[1], 10);
                        const s = parseInt(mmss[2], 10);
                        const ms = (m * 60 + s) * 1000;
                        const startNow = /\b(start|kick\s*off|begin|go)\b/.test(cmd);
                        return { action: 'setTimer', ms, start: startNow };
                    }
                    const sMatch = msCandidate.match(/(\d+)\s*s(ec(ond)?s?)?/);
                    const mMatch = msCandidate.match(/(\d+)\s*m(in(ute)?s?)?/);
                    if (sMatch) {
                        const ms = parseInt(sMatch[1], 10) * 1000;
                        return { action: 'setTimer', ms, start: /\b(start|kick\s*off|begin|go)\b/.test(cmd) };
                    }
                    if (mMatch) {
                        const ms = parseInt(mMatch[1], 10) * 60 * 1000;
                        return { action: 'setTimer', ms, start: /\b(start|kick\s*off|begin|go)\b/.test(cmd) };
                    }
                    const plainNum = parseNumberToken(msCandidate);
                    if (plainNum) return { action: 'setTimer', ms: plainNum * 1000, start: /\b(start|kick\s*off|begin|go)\b/.test(cmd) };
                }

                // TIMER controls - start/resume/pause/cancel and synonyms
                if (/(?:^(?:start|begin|go)\b).*?(?:timer|countdown)?/.test(cmd) || /(?:start|begin)\s+(timer|countdown)/.test(cmd) || /kick\s*off\s*(?:the\s*)?(?:timer|countdown)?/.test(cmd)) {
                    if (/\b(timer|countdown)\b/.test(cmd) || /kick\s*off/.test(cmd)) return { action: 'startTimer' };
                }
                if (/(?:resume|continue)\s+(?:timer|countdown)/.test(cmd) || /resume\s+timer/.test(cmd)) return { action: 'resumeTimer' };
                if (/(?:pause|hold)\s+(?:timer|countdown)/.test(cmd) || /pause\s+timer/.test(cmd)) return { action: 'pauseTimer' };
                if (/(?:cancel|stop|clear)\s+(?:timer|countdown)/.test(cmd) || /cancel\s+timer/.test(cmd)) return { action: 'cancelTimer' };
                if (/how (?:much )?time (?:is )?left/.test(cmd) || /time left/.test(cmd)) return { action: 'timeLeft' };
            }

        // METRONOME - start
        if (/(?:\b(start|play|begin)\b.*\b(metronome|click)\b)/.test(cmd) || /\b(start|play)\b$/.test(cmd)) {
            return { action: 'startMetronome' };
        }
        // METRONOME - stop
        if (/\b(stop|pause|halt|end)\b/.test(cmd)) {
            return { action: 'stopMetronome' };
        }

        // BPM - explicit ("tempo 120", "bpm 120", "set tempo to 120", or words)
            // Capture possibly multi-word numeric phrases after 'tempo' (e.g. 'set tempo to one hundred twenty')
            const explicitBpm = cmd.match(/(?:\b(?:set\s+)?(?:tempo|bpm|beat)\b(?:\s*(?:to|is|at))?\s*)([\w\-\s]{1,40})/);
        if (explicitBpm && explicitBpm[1]) {
                const candidate = explicitBpm[1].trim();
                const n = parseNumberToken(candidate) ?? parseNumberPhrase(candidate);
            const bpm = clampBpm(n);
            if (bpm) return { action: 'setBpm', bpm };
        }

        // BPM - bare numeric short commands like "120"
        const bareNum = cmd.match(/\b(\d{2,3})\b/);
        if (bareNum && cmd.length < 10) {
            const bpm = clampBpm(parseInt(bareNum[1], 10));
            if (bpm) return { action: 'setBpm', bpm };
        }

        // Relative tempo with numeric amount: "faster by 10", "increase tempo by 5"
        const increaseMatch = cmd.match(/(?:faster|increase|speed\s+up|up)\s*(?:by\s*)?([\w\-]+)/);
        if (increaseMatch && increaseMatch[1]) {
            const val = parseNumberToken(increaseMatch[1]) ?? 5;
            return { action: 'adjustBpm', change: Math.round(val) };
        }
        const decreaseMatch = cmd.match(/(?:slower|decrease|slow\s+down|down|reduce)\s*(?:by\s*)?([\w\-]+)/);
        if (decreaseMatch && decreaseMatch[1]) {
            const val = parseNumberToken(decreaseMatch[1]) ?? 5;
            return { action: 'adjustBpm', change: -Math.round(val) };
        }
        // Simple faster/slower without number -> +/-5
        if (/\bfaster\b/.test(cmd)) return { action: 'adjustBpm', change: 5 };
        if (/\bslower\b/.test(cmd)) return { action: 'adjustBpm', change: -5 };

        // Subdivisions: support numeric abbreviations like 8th/16th, words and plurals, and numeric tokens followed by 'note(s)'
        if (/\b(?:8th|eighths?|8ths?)\b/.test(cmd) || (/\b8\b/.test(cmd) && /\bnotes?\b/.test(cmd))) return { action: 'setSubdivision', subdivision: 'eighth' };
        if (/\b(?:16th|sixteenths?|16ths?)\b/.test(cmd) || (/\b16\b/.test(cmd) && /\bnotes?\b/.test(cmd))) return { action: 'setSubdivision', subdivision: 'sixteenth' };
        if (/\bquarter\b/.test(cmd)) return { action: 'setSubdivision', subdivision: 'quarter' };
        if (/\btriplet\b/.test(cmd)) return { action: 'setSubdivision', subdivision: 'triplet' };

        // Pages: next / previous
        if (/next.*page/.test(cmd) || /page.*next/.test(cmd)) {
            return { action: 'nextPage' };
        }
        if (/previous.*page/.test(cmd) || /page.*previous/.test(cmd) || /\bback\b/.test(cmd)) {
            return { action: 'previousPage' };
        }

        // Go to page N (accept digits or words)
        const pageMatch = cmd.match(/page\s*([\w\-]+)/);
        if (pageMatch && pageMatch[1]) {
            const pageNum = parseNumberToken(pageMatch[1]);
            if (pageNum) return { action: 'goToPage', page: pageNum };
        }

        // Flip every N bars/measures - accept word numbers too
        const scheduleMatch = cmd.match(/(?:flip|turn|page).*?(?:every|each)\s*([\w\-]+)\s*(?:bars?|measures?)/);
        if (scheduleMatch && scheduleMatch[1]) {
            const bars = parseNumberToken(scheduleMatch[1]);
            if (bars) return { action: 'schedulePageTurn', bars };
        }

        // Tap tempo
        if (/\btap\b/.test(cmd)) {
            return { action: 'tap' };
        }

        // TIMER: set duration (e.g., "set timer for 2 minutes", "set a 90 second timer")
        const setTimerMatch = cmd.match(/set\s+(?:a\s+)?(?:timer|countdown)\s+(?:for\s+)?(.+)/);
        if (setTimerMatch && setTimerMatch[1]) {
            const msCandidate = setTimerMatch[1].trim();
            // Try to parse numeric tokens like '90s' or '2:00' or word numbers
            // Simple mm:ss or seconds/minutes parsing - reuse num parsing for plain seconds
            const mmss = msCandidate.match(/^(\d{1,3}):(\d{1,2})$/);
            if (mmss) {
                const m = parseInt(mmss[1], 10);
                const s = parseInt(mmss[2], 10);
                const ms = (m * 60 + s) * 1000;
                const startNow = /\b(start|kick\s*off|begin|go)\b/.test(cmd);
                return { action: 'setTimer', ms, start: startNow };
            }
            const sMatch = msCandidate.match(/(\d+)\s*s(ec(ond)?s?)?/);
            const mMatch = msCandidate.match(/(\d+)\s*m(in(ute)?s?)?/);
            if (sMatch) {
                const ms = parseInt(sMatch[1], 10) * 1000;
                return { action: 'setTimer', ms, start: /\b(start|kick\s*off|begin|go)\b/.test(cmd) };
            }
            if (mMatch) {
                const ms = parseInt(mMatch[1], 10) * 60 * 1000;
                return { action: 'setTimer', ms, start: /\b(start|kick\s*off|begin|go)\b/.test(cmd) };
            }
            const plainNum = parseNumberToken(msCandidate);
            if (plainNum) return { action: 'setTimer', ms: plainNum * 1000, start: /\b(start|kick\s*off|begin|go)\b/.test(cmd) };
        }

        // TIMER controls - start/resume/pause/cancel and synonyms
        if (/(?:^(?:start|begin|go)\b).*?(?:timer|countdown)?/.test(cmd) || /(?:start|begin)\s+(timer|countdown)/.test(cmd) || /kick\s*off\s*(?:the\s*)?(?:timer|countdown)?/.test(cmd)) {
            // If explicit mention of timer or countdown is present, treat as start.
            if (/\b(timer|countdown)\b/.test(cmd) || /kick\s*off/.test(cmd)) return { action: 'startTimer' };
        }
        if (/(?:resume|continue)\s+(?:timer|countdown)/.test(cmd) || /resume\s+timer/.test(cmd)) return { action: 'resumeTimer' };
        if (/(?:pause|hold)\s+(?:timer|countdown)/.test(cmd) || /pause\s+timer/.test(cmd)) return { action: 'pauseTimer' };
        if (/(?:cancel|stop|clear)\s+(?:timer|countdown)/.test(cmd) || /cancel\s+timer/.test(cmd)) return { action: 'cancelTimer' };
        if (/how (?:much )?time (?:is )?left/.test(cmd) || /time left/.test(cmd)) return { action: 'timeLeft' };

        return { action: 'unknown', command: raw };
    }
}

// Initialize processors
const aiProcessor = new DrumVoiceAI();
const patternProcessor = new PatternProcessor();

// Main API endpoint
app.post('/api/process-command', async (req, res) => {
    const { command } = req.body;

    if (!command || typeof command !== 'string') {
        return res.status(400).json({
            error: 'Valid command string required',
            provider: 'error'
        });
    }

    console.log(`Processing: "${command}"`);

    try {
        // Try AI processing first
        const aiResult = await aiProcessor.processCommand(command);
        console.log('AI result:', aiResult);

        res.json({
            ...aiResult,
            provider: 'cohere',
            confidence: 'high'
        });

    } catch (error) {
        console.log('AI failed, using patterns:', error.message);

        // Fallback to pattern matching
        const patternResult = patternProcessor.processCommand(command);
        console.log('Pattern result:', patternResult);

        res.json({
            ...patternResult,
            provider: 'regex',
            confidence: patternResult.action === 'unknown' ? 'low' : 'medium'
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        provider: aiProcessor.provider,
        hasApiKey: !!aiProcessor.apiKey,
        uptime: process.uptime()
    });
});

// Test endpoint for debugging
app.post('/api/test', async (req, res) => {
    const { command } = req.body;

    let aiResult = null;
    let aiError = null;

    try {
        aiResult = await aiProcessor.processCommand(command);
    } catch (error) {
        aiError = error.message;
    }

    const patternResult = patternProcessor.processCommand(command);

    res.json({
        command,
        ai: {
            result: aiResult,
            error: aiError
        },
        pattern: patternResult,
        timestamp: new Date().toISOString()
    });
});

// Informational endpoint: returns metadata useful for debugging and explanation
app.get('/api/info', (req, res) => {
    res.json({
        name: pkg.name || 'drumvoice',
        version: pkg.version || '0.0.0',
        description: pkg.description || '',
        dependencies: pkg.dependencies || {},
        scripts: pkg.scripts || {},
        routes: [
            { method: 'GET', path: '/' },
            { method: 'POST', path: '/api/process-command' },
            { method: 'POST', path: '/api/test' },
            { method: 'GET', path: '/api/health' },
            { method: 'GET', path: '/api/info' }
        ],
        provider: aiProcessor.provider,
        hasCohereKey: !!aiProcessor.apiKey,
        startTime: serverStart.toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        nodeVersion: process.version
    });
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({
        error: 'Internal server error',
        provider: 'error'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🥁 DrumVoice Server running on port ${PORT}`);
    console.log(`� Package: ${pkg.name}@${pkg.version} (${pkg.description || 'no description'})`);
    console.log(`�📡 AI Provider: ${aiProcessor.provider}`);
    console.log(`🔑 Cohere API Key configured: ${!!aiProcessor.apiKey}`);
    console.log(`⏱ Server start: ${serverStart.toISOString()}`);
    console.log(`🌐 Frontend: http://localhost:${PORT}`);
    console.log(`🧪 Test endpoint: http://localhost:${PORT}/api/test`);
});

module.exports = app;