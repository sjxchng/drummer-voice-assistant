// src/parser/normalizer.js — Text normalization and number parsing utilities
// Used by PatternProcessor to clean input and convert word numbers to integers.

const WORD_NUMBER_MAP = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
    twenty: 20, thirty: 30, forty: 40, fifty: 50,
    sixty: 60, seventy: 70, eighty: 80, ninety: 90
};

/**
 * Lowercase, strip punctuation, collapse whitespace, convert ordinals.
 * "3rd" → "3", "Go faster!" → "go faster"
 * @param {string} input
 * @returns {string}
 */
function normalizeText(input) {
    if (!input || typeof input !== 'string') return '';
    return input
        .toLowerCase()
        .replace(/(\d+)(st|nd|rd|th)\b/g, '$1')   // ordinals: 3rd → 3
        .replace(/[^\w\d\-\s]/g, ' ')              // strip punctuation
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Parse a multi-word number phrase like "one hundred twenty" → 120.
 * Returns null if any token is unrecognized.
 * @param {string} phrase
 * @returns {number|null}
 */
function parseNumberPhrase(phrase) {
    if (!phrase || typeof phrase !== 'string') return null;
    const tokens = phrase.toLowerCase().replace(/-/g, ' ').split(/\s+/).filter(Boolean);
    let total = 0;
    let current = 0;

    for (const t of tokens) {
        if (t === 'and') continue;
        if (WORD_NUMBER_MAP.hasOwnProperty(t)) { current += WORD_NUMBER_MAP[t]; continue; }
        if (t === 'hundred') { current = (current || 1) * 100; continue; }
        if (t === 'thousand') { total += (current || 1) * 1000; current = 0; continue; }
        if (/^\d+$/.test(t)) { current += parseInt(t, 10); continue; }
        return null; // unrecognized token
    }

    total += current;
    return total > 0 ? total : null;
}

/**
 * Parse a single token that is either a digit string or a word number.
 * Also handles multi-word phrases passed as a single string.
 * @param {string} token
 * @returns {number|null}
 */
function parseNumberToken(token) {
    if (!token) return null;
    token = token.trim();

    // Pure digit
    if (/^\d+$/.test(token)) return parseInt(token, 10);

    // Multi-word phrase (e.g. "one hundred twenty")
    if (/\s+/.test(token)) return parseNumberPhrase(token);

    // Single word number (e.g. "four")
    const normalized = token.replace(/-/g, ' ').toLowerCase();
    if (WORD_NUMBER_MAP.hasOwnProperty(normalized)) return WORD_NUMBER_MAP[normalized];

    return null;
}

/**
 * Clamp BPM to a safe range (40–300).
 * Returns null if input is not a valid number.
 * @param {number} n
 * @returns {number|null}
 */
function clampBpm(n) {
    if (typeof n !== 'number' || Number.isNaN(n)) return null;
    return Math.max(40, Math.min(300, Math.round(n)));
}

module.exports = { normalizeText, parseNumberPhrase, parseNumberToken, clampBpm };