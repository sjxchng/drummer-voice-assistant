// src/providers/gemini.js — Gemini AI provider
// Calls Google's Gemini 2.0 Flash API (free tier).
// Set GEMINI_API_KEY in .env to enable.

const AIProvider = require('./base');
const fetch = global.fetch || require('node-fetch');

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const TIMEOUT_MS = 5000;

class GeminiProvider extends AIProvider {
    constructor() {
        super('gemini');
        this.apiKey = process.env.GEMINI_API_KEY;
    }

    get isConfigured() {
        return !!this.apiKey;
    }

    async processCommand(command) {
        if (!this.isConfigured) {
            throw new Error('GEMINI_API_KEY is not set');
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
            const response = await fetch(`${GEMINI_URL}?key=${this.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    system_instruction: {
                        parts: [{ text: this.systemPrompt }]
                    },
                    contents: [
                        {
                            role: 'user',
                            parts: [{ text: `Parse this drummer voice command: "${command}"` }]
                        }
                    ],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 100
                    }
                }),
                signal: controller.signal
            });

            clearTimeout(timeout);

            if (!response.ok) {
                const err = await response.text();
                throw new Error(`Gemini API error ${response.status}: ${err}`);
            }

            const data = await response.json();
            const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!raw) throw new Error('Empty response from Gemini');

            return this.parseJSON(raw);

        } catch (err) {
            clearTimeout(timeout);
            throw err;
        }
    }
}

module.exports = GeminiProvider;