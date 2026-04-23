// src/routes/commands.js — Voice command API routes
// POST /api/process-command  — main endpoint used by the frontend
// POST /api/test             — compare AI vs regex output (debugging)
// GET  /api/health           — basic health check
// GET  /api/info             — server metadata

const express = require('express');
const router = express.Router();
const pkg = require('../../package.json');
const provider = require('../providers');
const PatternProcessor = require('../parser/PatternProcessor');

const patternProcessor = new PatternProcessor();
const serverStart = new Date();

// POST /api/process-command
// Tries the AI provider first. Falls back to PatternProcessor on any error.
router.post('/process-command', async (req, res) => {
    const { command } = req.body;

    if (!command || typeof command !== 'string') {
        return res.status(400).json({ error: 'Valid command string required', provider: 'error' });
    }

    console.log(`Processing: "${command}"`);

    try {
        const result = await provider.processCommand(command);
        console.log(`AI result (${provider.name}):`, result);
        return res.json({ ...result, provider: provider.name, confidence: 'high' });
    } catch (err) {
        console.log(`AI failed (${provider.name}): ${err.message} — falling back to regex`);
        const result = patternProcessor.processCommand(command);
        console.log('Pattern result:', result);
        return res.json({
            ...result,
            provider: 'regex',
            confidence: result.action === 'unknown' ? 'low' : 'medium'
        });
    }
});

// POST /api/test — debug endpoint: returns both AI and regex results side by side
router.post('/test', async (req, res) => {
    const { command } = req.body;
    let aiResult = null;
    let aiError = null;

    try {
        aiResult = await provider.processCommand(command);
    } catch (err) {
        aiError = err.message;
    }

    const patternResult = patternProcessor.processCommand(command);

    res.json({
        command,
        ai: { provider: provider.name, result: aiResult, error: aiError },
        pattern: patternResult,
        timestamp: new Date().toISOString()
    });
});

// GET /api/health
router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        provider: provider.name,
        providerConfigured: !!process.env.GEMINI_API_KEY,
        uptime: process.uptime()
    });
});

// GET /api/info
router.get('/info', (req, res) => {
    res.json({
        name: pkg.name || 'drumvoice',
        version: pkg.version || '1.0.0',
        provider: provider.name,
        providerConfigured: !!process.env.GEMINI_API_KEY,
        startTime: serverStart.toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        nodeVersion: process.version,
        routes: [
            { method: 'POST', path: '/api/process-command' },
            { method: 'POST', path: '/api/test' },
            { method: 'GET',  path: '/api/health' },
            { method: 'GET',  path: '/api/info' }
        ]
    });
});

module.exports = router;