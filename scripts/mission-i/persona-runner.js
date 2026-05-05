// Mission I — per-persona agent loop.
// Loads persona system prompt + scenario goal, spins up Playwright,
// runs the tool-use loop until done() / max-turns / cap-hit.

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { callApi, DEFAULT_MODEL } = require('./anthropic-client');
const { TOOL_DEFS, RunContext, executeTool } = require('./tools');

const FROZEN_ISO = '2026-05-05T22:00:00+10:00'; // matches Mission V
const VIEWPORT = { width: 412, height: 915 };
const DEVICE_SCALE_FACTOR = 3;
const MAX_TURNS = 30;
const FIXTURE_PATH = path.resolve(__dirname, '../../state-snapshot.json');

function buildSlyghtV5(fx) {
  const S = Object.assign({}, fx.S || {});
  if (fx.paidBills && !S.paidBills) S.paidBills = fx.paidBills;
  return { S, BILLS: fx.BILLS || [] };
}

async function bootApp(page, context) {
  await page.clock.install({ time: new Date(FROZEN_ISO) });
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
  await context.addInitScript((args) => {
    try { localStorage.setItem('slyght_v5', JSON.stringify(args.seed)); } catch (_) {}
    ['v11', 'v12', 'v13', 'v14', 'v15', 'v16', 'v17', 'v18'].forEach(v =>
      { try { localStorage.setItem('slyght_seeded_' + v, '1'); } catch (_) {} });
    try { localStorage.setItem('slyght_bills_reset_month', args.monthKey); } catch (_) {}
  }, { seed: buildSlyghtV5(fixture), monthKey: '2026-5' });
  await page.goto('http://localhost:4567/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page.waitForSelector('#splash-screen', { state: 'hidden', timeout: 5000 }).catch(() => {});
  await page.addStyleTag({ content: `*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; } *, input, textarea { caret-color: transparent !important; }` });
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}

// Convert tool result to API-friendly tool_result content.
// Special-case screenshot: attach base64 image so the model sees it.
function toolResultToContent(toolUseId, result) {
  if (result && result.base64 && result.mediaType) {
    return {
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: [
        { type: 'text', text: 'screenshot id=' + result.id },
        { type: 'image', source: { type: 'base64', media_type: result.mediaType, data: result.base64 } },
      ],
    };
  }
  // Compact the result so the model context stays lean
  const compact = { ...result };
  return {
    type: 'tool_result',
    tool_use_id: toolUseId,
    content: [{ type: 'text', text: JSON.stringify(compact) }],
  };
}

// History truncation. The agent loop sends full message history per turn,
// and tool_result blocks can carry base64 image data (~1500 tokens each).
// Without truncation, per-turn input grows linearly with screenshot count
// and quickly blows the 30K/min input-token rate limit. We keep only the
// last KEEP_LAST_IMAGES images as actual image blocks; older images get
// replaced in-place with text placeholders. Mutates messages array.
const KEEP_LAST_IMAGES = 2;
function truncateHistoryImages(messages) {
  let imagesFound = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!Array.isArray(msg.content)) continue;
    for (const block of msg.content) {
      if (block.type !== 'tool_result' || !Array.isArray(block.content)) continue;
      for (let k = 0; k < block.content.length; k++) {
        const inner = block.content[k];
        if (inner.type === 'image') {
          imagesFound++;
          if (imagesFound > KEEP_LAST_IMAGES) {
            block.content[k] = { type: 'text', text: '[earlier screenshot — pruned from context to save tokens]' };
          }
        }
      }
    }
  }
}

async function runPersona({
  personaName,
  scenarioName,
  systemPrompt,
  userGoal,
  costTracker,
  outDir,
  dryRun = false,
  verbose = true,
}) {
  const actor = personaName + ':' + scenarioName;
  const log = (...args) => verbose && console.log(`[${actor}]`, ...args);
  log('start');

  if (dryRun) {
    log('DRY RUN — skipping Playwright + API calls');
    return { actor, turns: 0, findings: [], reason: 'dry-run', cost: 0 };
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    serviceWorkers: 'block',
    locale: 'en-AU',
    timezoneId: 'Australia/Sydney',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (/serviceWorker|sw\.js|Failed to register/i.test(text)) return;
    if (/Failed to load resource|net::ERR_/i.test(text)) return;
    errors.push('[console.error] ' + text);
  });

  await bootApp(page, context);
  const ctx = new RunContext({ outDir: path.join(outDir, actor.replace(':', '_')), actor });

  const messages = [
    { role: 'user', content: [{ type: 'text', text: userGoal }] },
  ];

  let turns = 0;
  let endReason = 'max-turns';
  try {
    while (turns < MAX_TURNS) {
      turns++;
      log(`turn ${turns}`);

      // Cap check before the call
      try { costTracker.assertWithinCaps(actor, 'persona'); }
      catch (e) { endReason = 'cap-exceeded: ' + e.message; break; }

      // Trim image history before the call so per-turn input stays bounded.
      truncateHistoryImages(messages);

      const resp = await callApi({
        model: DEFAULT_MODEL,
        system: systemPrompt,
        messages,
        tools: TOOL_DEFS,
        max_tokens: 1500,
      });
      costTracker.record(actor, DEFAULT_MODEL, resp.usage?.input_tokens || 0, resp.usage?.output_tokens || 0);

      // Append assistant message verbatim so multi-turn context is correct.
      messages.push({ role: 'assistant', content: resp.content });

      const stopReason = resp.stop_reason;
      const toolUses = (resp.content || []).filter(b => b.type === 'tool_use');

      if (toolUses.length === 0) {
        // Model didn't call any tools — likely just text. Treat as graceful end.
        endReason = 'model-end-turn-no-tool';
        break;
      }

      // Execute every tool_use block, collect tool_result blocks
      const toolResultsContent = [];
      let doneCalled = false;
      let doneReason = '';
      for (const tu of toolUses) {
        const result = await executeTool({ page, ctx, toolName: tu.name, input: tu.input });
        toolResultsContent.push(toolResultToContent(tu.id, result));
        if (tu.name === 'done') { doneCalled = true; doneReason = tu.input?.reason || 'done'; }
      }
      messages.push({ role: 'user', content: toolResultsContent });

      if (doneCalled) { endReason = 'done: ' + doneReason; break; }
      if (stopReason === 'end_turn') { endReason = 'end-turn'; break; }
    }
  } catch (e) {
    endReason = 'error: ' + (e.message || String(e));
    log('ERROR', endReason);
  }

  await browser.close();

  const result = {
    actor,
    persona: personaName,
    scenario: scenarioName,
    turns,
    endReason,
    findings: ctx.findings,
    actions: ctx.actions,
    screenshots: ctx.screenshots.map(s => ({ id: s.id, path: path.relative(outDir, s.path) })),
    pageErrors: errors,
    cost: costTracker.summary().byActor[actor] || { usd: 0, turns: 0 },
  };

  // Persist transcript for Super Brain
  const transcriptPath = path.join(ctx.outDir, 'transcript.json');
  fs.writeFileSync(transcriptPath, JSON.stringify({ actor, messages, result }, null, 2));
  log('end:', endReason, '|', ctx.findings.length, 'findings,', turns, 'turns');
  return result;
}

module.exports = { runPersona };
