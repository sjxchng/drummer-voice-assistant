// server.js - Simple, reliable backend for DrumVoice
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const fetch = global.fetch || require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

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

// Reliable regex fallback processor
class PatternProcessor {
  processCommand(command) {
    const cmd = command.toLowerCase().trim();

    // METRONOME
    if (/\b(start|play|begin)\b.*\b(metronome|click)\b|\b(start|play)\b$/.test(cmd)) {
      return { action: 'startMetronome' };
    }
    if (/\b(stop|pause|halt|end)\b/.test(cmd)) {
      return { action: 'stopMetronome' };
    }

    // BPM (numbers alone or with keywords)
    const bpmMatch = cmd.match(/(\d{2,3})/);
    if (bpmMatch && (/\b(bpm|tempo|beat)\b/.test(cmd) || cmd.length < 10)) {
      return { action: 'setBpm', bpm: parseInt(bpmMatch[1], 10) };
    }

    // Relative tempo
    if (/\bfaster\b/.test(cmd))  return { action: 'adjustBpm', change: 5 };
    if (/\bslower\b/.test(cmd))  return { action: 'adjustBpm', change: -5 };

    // Subdivisions
    if (/quarter/.test(cmd))    return { action: 'setSubdivision', subdivision: 'quarter' };
    if (/eighth/.test(cmd))     return { action: 'setSubdivision', subdivision: 'eighth' };
    if (/triplet/.test(cmd))    return { action: 'setSubdivision', subdivision: 'triplet' };
    if (/sixteenth/.test(cmd))  return { action: 'setSubdivision', subdivision: 'sixteenth' };

    // Pages
    if (/next.*page/.test(cmd) || /page.*next/.test(cmd)) {
      return { action: 'nextPage' };
    }
    if (/previous.*page/.test(cmd) || /page.*previous/.test(cmd) || /\bback\b/.test(cmd)) {
      return { action: 'previousPage' };
    }

    // Go to page N
    const pageMatch = cmd.match(/page\s*(\d+)/);
    if (pageMatch) {
      return { action: 'goToPage', page: parseInt(pageMatch[1], 10) };
    }

    // Flip every N bars/measures
    const scheduleMatch = cmd.match(/\b(?:flip|turn|page).*?(?:every|each)\s*(\d+)\s*(?:bars?|measures?)\b/);
    if (scheduleMatch) {
      return { action: 'schedulePageTurn', bars: parseInt(scheduleMatch[1], 10) };
    }

    // Tap tempo
    if (/\btap\b/.test(cmd)) {
      return { action: 'tap' };
    }

    return { action: 'unknown', command };
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
    console.log(`📡 AI Provider: ${aiProcessor.provider}`);
    console.log(`🔑 API Key configured: ${!!aiProcessor.apiKey}`);
    console.log(`🌐 Frontend: http://localhost:${PORT}`);
    console.log(`🧪 Test endpoint: http://localhost:${PORT}/api/test`);
});

module.exports = app;