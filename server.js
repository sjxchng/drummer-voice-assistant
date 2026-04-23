// server.js — entry point
// Starts the Express app on the configured port.
// All app logic lives in src/app.js.

require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🥁 DrumVoice running on http://localhost:${PORT}`);
    console.log(`📡 AI Provider: ${process.env.AI_PROVIDER || 'gemini'}`);
    console.log(`🔑 Gemini key configured: ${!!process.env.GEMINI_API_KEY}`);
});