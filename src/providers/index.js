// src/providers/index.js — Provider factory
// Returns the configured AI provider based on the AI_PROVIDER env var.
// Defaults to Gemini. Add new providers here as needed.
//
// To add a new provider:
//   1. Create src/providers/yourprovider.js extending AIProvider
//   2. Import it here and add a case to the switch

const GeminiProvider = require('./gemini');

function createProvider() {
    const providerName = (process.env.AI_PROVIDER || 'gemini').toLowerCase();

    switch (providerName) {
        case 'gemini':
            return new GeminiProvider();
        default:
            console.warn(`Unknown AI_PROVIDER "${providerName}", falling back to Gemini`);
            return new GeminiProvider();
    }
}

// Singleton — one provider instance shared across all requests
const provider = createProvider();

module.exports = provider;