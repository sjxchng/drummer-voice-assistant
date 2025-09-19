// Quick test for PatternProcessor helpers
const WORD_NUMBER_MAP = {
  zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10,
  eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19,
  twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90
};
function wordToNumber(token) {
  if (!token || typeof token !== 'string') return null;
  token = token.replace(/\-/g, ' ').trim();
  if (WORD_NUMBER_MAP.hasOwnProperty(token)) return WORD_NUMBER_MAP[token];
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
  const w = wordToNumber(token);
  return w !== null ? w : null;
}
function normalizeText(input) {
  if (!input || typeof input !== 'string') return '';
  let s = input.toLowerCase();
  s = s.replace(/(\d+)(st|nd|rd|th)\b/g, '$1');
  s = s.replace(/[^\w\d\-\s]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

const samples = ['120', 'go to page three', 'flip every four bars', '8th notes', 'set tempo to one hundred twenty', 'faster by ten'];
for (const sample of samples) {
  const n = normalizeText(sample);
  const pageMatch = n.match(/page\s*([\w\-]+)/);
  const scheduleMatch = n.match(/(?:flip|turn|page).*?(?:every|each)\s*([\w\-]+)\s*(?:bars?|measures?)/);
  console.log('sample:', sample);
  console.log('  normalized:', n);
  console.log('  pageMatch:', pageMatch ? pageMatch[1] : null, '->', pageMatch ? parseNumberToken(pageMatch[1]) : null);
  console.log('  scheduleMatch:', scheduleMatch ? scheduleMatch[1] : null, '->', scheduleMatch ? parseNumberToken(scheduleMatch[1]) : null);
  const bareNumMatch = n.match(/\b(\d{2,3})\b/);
  const explicitMatch = n.match(/(?:\b(?:set\s+)?(?:tempo|bpm|beat)\b(?:\s*(?:to|is|at))?\s*)([\w\-]+)/);
  const increaseMatch = n.match(/(?:faster|increase|speed\s+up|up)\s*(?:by\s*)?([\w\-]+)/);
  const decreaseMatch = n.match(/(?:slower|decrease|slow\s+down|down|reduce)\s*(?:by\s*)?([\w\-]+)/);
  console.log('  bareNum:', bareNumMatch ? bareNumMatch[1] : null);
  console.log('  explicitBpm match:', explicitMatch ? explicitMatch[1] : null);
  console.log('  increaseMatch:', increaseMatch ? increaseMatch[1] : null);
  console.log('  decreaseMatch:', decreaseMatch ? decreaseMatch[1] : null);
  console.log('---');
}
