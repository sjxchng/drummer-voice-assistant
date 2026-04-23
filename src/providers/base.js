// src/providers/base.js — Abstract AI provider base class
// All AI providers must extend this class and implement processCommand().
// This allows swapping providers (Gemini, OpenAI, Cohere, etc.)
// without touching route or app logic.

class AIProvider {
    constructor(name) {
        if (new.target === AIProvider) {
            throw new Error('AIProvider is abstract and cannot be instantiated directly.');
        }
        this.name = name;
    }

    /**
     * Parse a natural language voice command into a structured intent object.
     * @param {string} command - Raw voice command string
     * @returns {Promise<{action: string, [key: string]: any}>}
     * @throws {Error} If the provider is unavailable or returns unparseable output
     */
    async processCommand(command) {
        throw new Error(`${this.name}.processCommand() is not implemented.`);
    }

    /**
     * Shared system prompt for all providers.
     * Describes the expected JSON output format and examples.
     */
    get systemPrompt() {
        return `You are a voice command parser for drummers. Parse natural language into a JSON action object.

ACTIONS:
- {"action": "setBpm", "bpm": number}
- {"action": "adjustBpm", "change": number}  (positive = faster, negative = slower)
- {"action": "startMetronome"}
- {"action": "stopMetronome"}
- {"action": "setSubdivision", "subdivision": "quarter|eighth|triplet|sixteenth"}
- {"action": "nextPage"}
- {"action": "previousPage"}
- {"action": "goToPage", "page": number}
- {"action": "schedulePageTurn", "bars": number}
- {"action": "tap"}

EXAMPLES:
"start" → {"action": "startMetronome"}
"120" → {"action": "setBpm", "bpm": 120}
"go a bit faster" → {"action": "adjustBpm", "change": 5}
"slow down by 10" → {"action": "adjustBpm", "change": -10}
"next page" → {"action": "nextPage"}
"eighth notes" → {"action": "setSubdivision", "subdivision": "eighth"}
"flip every 4 bars" → {"action": "schedulePageTurn", "bars": 4}
"tap" → {"action": "tap"}

Respond ONLY with valid JSON. No explanation, no markdown, no backticks.`;
    }

    /**
     * Try to extract a JSON object from a raw string response.
     * Handles cases where the model wraps JSON in markdown code blocks.
     * @param {string} raw
     * @returns {object}
     */
    parseJSON(raw) {
        if (!raw) throw new Error('Empty response');
        const cleaned = raw.replace(/```json|```/g, '').trim();
        try {
            return JSON.parse(cleaned);
        } catch {
            const match = cleaned.match(/\{[^}]*\}/);
            if (match) return JSON.parse(match[0]);
            throw new Error(`Could not parse JSON from: ${raw}`);
        }
    }
}

module.exports = AIProvider;