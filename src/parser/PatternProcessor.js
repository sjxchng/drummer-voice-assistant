// src/parser/PatternProcessor.js — Deterministic regex fallback parser
// Used when the AI provider is unavailable or not configured.
// Handles all supported voice commands via regex pattern matching.

const { normalizeText, parseNumberToken, parseNumberPhrase, clampBpm } = require('./normalizer');

class PatternProcessor {
    /**
     * Parse a voice command string into a structured intent object.
     * @param {string} command
     * @returns {{action: string, [key: string]: any}}
     */
    processCommand(command) {
        const raw = (command || '').toString();
        const cmd = normalizeText(raw);

        // --- METRONOME: start ---
        if (/(?:\b(start|play|begin)\b.*\b(metronome|click)\b)/.test(cmd) || /\b(start|play)\b$/.test(cmd)) {
            return { action: 'startMetronome' };
        }

        // --- METRONOME: stop ---
        if (/\b(stop|pause|halt|end)\b/.test(cmd)) {
            return { action: 'stopMetronome' };
        }

        // --- BPM: explicit ("set tempo to 120", "bpm 120", "set tempo to one hundred twenty") ---
        const explicitBpm = cmd.match(/(?:\b(?:set\s+)?(?:tempo|bpm|beat)\b(?:\s*(?:to|is|at))?\s*)([\w\-\s]{1,40})/);
        if (explicitBpm?.[1]) {
            const candidate = explicitBpm[1].trim();
            const n = parseNumberToken(candidate) ?? parseNumberPhrase(candidate);
            const bpm = clampBpm(n);
            if (bpm) return { action: 'setBpm', bpm };
        }

        // --- BPM: bare number ("120") ---
        const bareNum = cmd.match(/\b(\d{2,3})\b/);
        if (bareNum && cmd.length < 10) {
            const bpm = clampBpm(parseInt(bareNum[1], 10));
            if (bpm) return { action: 'setBpm', bpm };
        }

        // --- BPM: relative increase ("faster by 10", "speed up") ---
        const increaseMatch = cmd.match(/(?:faster|increase|speed\s+up|up)\s*(?:by\s*)?([\w\-]+)/);
        if (increaseMatch?.[1]) {
            const val = parseNumberToken(increaseMatch[1]) ?? 5;
            return { action: 'adjustBpm', change: Math.round(val) };
        }
        if (/\bfaster\b/.test(cmd)) return { action: 'adjustBpm', change: 5 };

        // --- BPM: relative decrease ("slower by 5", "slow down") ---
        const decreaseMatch = cmd.match(/(?:slower|decrease|slow\s+down|down|reduce)\s*(?:by\s*)?([\w\-]+)/);
        if (decreaseMatch?.[1]) {
            const val = parseNumberToken(decreaseMatch[1]) ?? 5;
            return { action: 'adjustBpm', change: -Math.round(val) };
        }
        if (/\bslower\b/.test(cmd)) return { action: 'adjustBpm', change: -5 };

        // --- SUBDIVISIONS ---
        if (/\b(?:8th|eighths?|8ths?)\b/.test(cmd) || (/\b8\b/.test(cmd) && /\bnotes?\b/.test(cmd))) {
            return { action: 'setSubdivision', subdivision: 'eighth' };
        }
        if (/\b(?:16th|sixteenths?|16ths?)\b/.test(cmd) || (/\b16\b/.test(cmd) && /\bnotes?\b/.test(cmd))) {
            return { action: 'setSubdivision', subdivision: 'sixteenth' };
        }
        if (/\bquarter\b/.test(cmd)) return { action: 'setSubdivision', subdivision: 'quarter' };
        if (/\btriplet\b/.test(cmd)) return { action: 'setSubdivision', subdivision: 'triplet' };

        // --- PAGES: next / previous ---
        if (/next.*page/.test(cmd) || /page.*next/.test(cmd)) return { action: 'nextPage' };
        if (/previous.*page/.test(cmd) || /page.*previous/.test(cmd) || /\bback\b/.test(cmd)) {
            return { action: 'previousPage' };
        }

        // --- PAGES: go to specific page ("go to page 3", "page four") ---
        const pageMatch = cmd.match(/page\s*([\w\-]+)/);
        if (pageMatch?.[1]) {
            const pageNum = parseNumberToken(pageMatch[1]);
            if (pageNum) return { action: 'goToPage', page: pageNum };
        }

        // --- PAGES: scheduled turn ("flip every 4 bars", "turn every four measures") ---
        const scheduleMatch = cmd.match(/(?:flip|turn|page).*?(?:every|each)\s*([\w\-]+)\s*(?:bars?|measures?)/);
        if (scheduleMatch?.[1]) {
            const bars = parseNumberToken(scheduleMatch[1]);
            if (bars) return { action: 'schedulePageTurn', bars };
        }

        // --- TAP TEMPO ---
        if (/\btap\b/.test(cmd)) return { action: 'tap' };

        return { action: 'unknown', command: raw };
    }
}

module.exports = PatternProcessor;