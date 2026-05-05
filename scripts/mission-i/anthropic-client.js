// Mission I — raw fetch wrapper for Anthropic Messages API with tool-use.
// Mirrors the existing in-app pattern at index.html:6555 (fetch-only, no SDK).
// Single source of truth for all Mission I API calls.

const https = require('https');

const API_HOST = 'api.anthropic.com';
const API_PATH = '/v1/messages';
const API_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

// Token pricing per million tokens (Sonnet 4). Update if tier changes.
const PRICE = {
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
};

function readApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  // Fallback: parse .env at repo root (one level up from scripts/mission-i)
  const fs = require('fs');
  const path = require('path');
  const envPath = path.resolve(__dirname, '../../.env');
  if (fs.existsSync(envPath)) {
    const txt = fs.readFileSync(envPath, 'utf8');
    const m = txt.match(/^ANTHROPIC_API_KEY\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  throw new Error('ANTHROPIC_API_KEY not set. Add to .env at repo root or export as env var.');
}

// Rate-limit awareness. Anthropic enforces input-tokens-per-minute per org.
// Tier 1 default: 30K input tokens/min for sonnet. Track a rolling 60s
// window of input-token usage; sleep before the call if we'd blow the cap.
// Also retry once on 429 with the server-suggested retry-after.

const RATE_LIMIT_INPUT_PER_MIN = 30000;
const RATE_LIMIT_HEADROOM = 4000; // safety margin so we don't graze the limit
const RATE_BUDGET = RATE_LIMIT_INPUT_PER_MIN - RATE_LIMIT_HEADROOM;
const tokenWindow = []; // [{ ts: number, tokens: number }]

function pruneWindow() {
  const cutoff = Date.now() - 60000;
  while (tokenWindow.length && tokenWindow[0].ts < cutoff) tokenWindow.shift();
}
function windowSum() { pruneWindow(); return tokenWindow.reduce((s, e) => s + e.tokens, 0); }
function recordWindow(tokens) { tokenWindow.push({ ts: Date.now(), tokens }); }

async function waitForBudget(estTokens) {
  // Sleep until window has room for estTokens.
  while (true) {
    pruneWindow();
    const used = tokenWindow.reduce((s, e) => s + e.tokens, 0);
    if (used + estTokens <= RATE_BUDGET) return;
    // Wait until oldest entry rolls out of the 60s window.
    const oldest = tokenWindow[0];
    if (!oldest) return; // empty window but estTokens > budget — let the API reject
    const sleepMs = Math.max(500, oldest.ts + 60000 - Date.now() + 250);
    await new Promise(r => setTimeout(r, sleepMs));
  }
}

function rawRequest(apiKey, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: API_HOST,
      port: 443,
      path: API_PATH,
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, raw });
      });
    });
    req.on('error', reject);
    req.setTimeout(180000, () => { req.destroy(new Error('API request timeout (180s)')); });
    req.write(body);
    req.end();
  });
}

// Single API call. Returns the full response object.
// Throttles based on rolling 60s input-token window. Retries once on 429.
async function callApi({ model = DEFAULT_MODEL, system, messages, tools, max_tokens = 2048, temperature = 0.7 }) {
  const apiKey = readApiKey();
  const body = JSON.stringify({ model, max_tokens, temperature, system, messages, tools });

  // Estimate this call's input tokens. Body length / 4 is a coarse but
  // serviceable approximation — better to over-estimate (sleep more).
  const estTokens = Math.ceil(body.length / 3.5);

  await waitForBudget(estTokens);

  let attempt = 0;
  while (true) {
    attempt++;
    const { statusCode, headers, raw } = await rawRequest(apiKey, body);
    if (statusCode === 200) {
      const parsed = JSON.parse(raw);
      const actualInput = parsed.usage?.input_tokens || estTokens;
      recordWindow(actualInput);
      return parsed;
    }
    if (statusCode === 429 && attempt === 1) {
      // Respect retry-after header; fall back to 30s.
      const retryAfter = parseFloat(headers['retry-after']) || 30;
      console.warn(`[anthropic] 429 rate-limit; sleeping ${retryAfter}s before retry`);
      await new Promise(r => setTimeout(r, (retryAfter + 1) * 1000));
      // Reset our local window optimistically — server clock-of-record is canonical.
      tokenWindow.length = 0;
      continue;
    }
    let parsed;
    try { parsed = JSON.parse(raw); } catch (_) { parsed = null; }
    throw new Error(`API ${statusCode}: ${parsed?.error?.message || raw.slice(0, 300)}`);
  }
}

function tokensCost(model, inputTokens, outputTokens) {
  const p = PRICE[model] || PRICE[DEFAULT_MODEL];
  return (inputTokens * p.input + outputTokens * p.output) / 1e6;
}

module.exports = { callApi, tokensCost, DEFAULT_MODEL, readApiKey };
