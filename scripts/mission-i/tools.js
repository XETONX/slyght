// Mission I — Playwright tool implementations.
// Each tool returns a JSON-serializable result. Errors are returned as
// { error: '...' } objects, never thrown — the agent loop needs to keep
// going on tool failures (those ARE findings).

const fs = require('fs');
const path = require('path');

// Tool schema for the Anthropic API (input_schema per tool).
const TOOL_DEFS = [
  {
    name: 'take_screenshot',
    description: 'Capture the current visible state of the app. Returns a screenshot ID and PNG dimensions. The image is automatically attached to your next turn so you can see what the user sees.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'click',
    description: 'Tap a visible element. Pass either visible text (e.g. "Mark Paid") or a CSS selector (e.g. "#dash-bal"). Text matches are case-insensitive and prefer exact > substring. Reports success or the failure reason.',
    input_schema: {
      type: 'object',
      properties: { target: { type: 'string', description: 'visible text or CSS selector' } },
      required: ['target'],
    },
  },
  {
    name: 'type',
    description: 'Find an input by its label, placeholder, or selector and type a value into it.',
    input_schema: {
      type: 'object',
      properties: {
        field: { type: 'string', description: 'label text, placeholder, or selector' },
        value: { type: 'string' },
      },
      required: ['field', 'value'],
    },
  },
  {
    name: 'navigate_tab',
    description: 'Switch to a top-level tab. name in {dash, cal, spend, chat, settings}. Calls goPage internally.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', enum: ['dash', 'cal', 'spend', 'chat', 'settings'] } },
      required: ['name'],
    },
  },
  {
    name: 'scroll',
    description: 'Scroll the page or a scrollable container. direction in {up, down}. pixels: positive integer.',
    input_schema: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down'] },
        pixels: { type: 'integer', minimum: 1, maximum: 5000 },
      },
      required: ['direction', 'pixels'],
    },
  },
  {
    name: 'read_state',
    description: 'Read a value from the app state (S object) or BILLS array. Use this to verify your claims against ground truth. path examples: "bal", "paidBills", "txns.length", "BILLS[0].name", "debts". Returns the value as JSON.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
  {
    name: 'report_finding',
    description: 'Record a finding for the report. severity: hard_fail (real bug), soft_finding (concern but defensible), ux_suggestion (improvement), known_anomaly (matches existing OPEN-BUGS / STATE-AUDIT entry).',
    input_schema: {
      type: 'object',
      properties: {
        severity: { type: 'string', enum: ['hard_fail', 'soft_finding', 'ux_suggestion', 'known_anomaly'] },
        summary: { type: 'string', description: 'one-line description' },
        evidence: { type: 'string', description: 'detailed evidence: screenshot reference, state values, exact text observed, reproduction steps' },
      },
      required: ['severity', 'summary', 'evidence'],
    },
  },
  {
    name: 'done',
    description: 'End the session. reason: short explanation (task complete, gave up, stuck after 3 attempts on something, etc.).',
    input_schema: {
      type: 'object',
      properties: { reason: { type: 'string' } },
      required: ['reason'],
    },
  },
];

// State for accumulated findings + screenshot manifest, per-persona-run.
class RunContext {
  constructor({ outDir, actor }) {
    this.outDir = outDir;
    this.actor = actor;
    this.findings = [];
    this.actions = [];                  // jsonl-style audit trail
    this.screenshots = [];              // { id, path, ts }
    this.screenshotCount = 0;
    this.consecutiveFailures = new Map(); // for the "3 attempts" rule
    fs.mkdirSync(outDir, { recursive: true });
  }
  recordAction(name, input, result) {
    this.actions.push({ ts: new Date().toISOString(), name, input, result });
  }
  trackFailure(toolName, target) {
    const key = toolName + ':' + target;
    const n = (this.consecutiveFailures.get(key) || 0) + 1;
    this.consecutiveFailures.set(key, n);
    return n;
  }
  resetFailure(toolName, target) {
    this.consecutiveFailures.delete(toolName + ':' + target);
  }
}

// Execute a single tool call. Returns the JSON-serializable result.
// page: Playwright Page. ctx: RunContext.
async function executeTool({ page, ctx, toolName, input }) {
  let result;
  try {
    switch (toolName) {
      case 'take_screenshot':
        result = await tool_screenshot(page, ctx);
        break;
      case 'click':
        result = await tool_click(page, ctx, input.target);
        break;
      case 'type':
        result = await tool_type(page, ctx, input.field, input.value);
        break;
      case 'navigate_tab':
        result = await tool_navigate_tab(page, ctx, input.name);
        break;
      case 'scroll':
        result = await tool_scroll(page, ctx, input.direction, input.pixels);
        break;
      case 'read_state':
        result = await tool_read_state(page, ctx, input.path);
        break;
      case 'report_finding':
        result = tool_report_finding(ctx, input.severity, input.summary, input.evidence);
        break;
      case 'done':
        result = { ended: true, reason: input.reason };
        break;
      default:
        result = { error: 'unknown tool: ' + toolName };
    }
  } catch (e) {
    result = { error: e.message || String(e) };
  }
  ctx.recordAction(toolName, input, result);
  return result;
}

async function tool_screenshot(page, ctx) {
  const id = 'shot-' + String(++ctx.screenshotCount).padStart(3, '0');
  const filePath = path.join(ctx.outDir, id + '.png');
  await page.screenshot({ path: filePath, fullPage: false });
  const buf = fs.readFileSync(filePath);
  ctx.screenshots.push({ id, path: filePath, ts: new Date().toISOString(), bytes: buf.length });
  // Return PNG bytes as base64 so the agent loop can attach as image content.
  return { ok: true, id, base64: buf.toString('base64'), mediaType: 'image/png' };
}

async function tool_click(page, ctx, target) {
  // Strategy: try text-first localization. Fall back to selector.
  try {
    // 1. Exact text match (case-insensitive)
    const textLocator = page.getByText(target, { exact: false }).first();
    if (await textLocator.isVisible({ timeout: 1500 }).catch(() => false)) {
      await textLocator.click({ timeout: 3000 });
      ctx.resetFailure('click', target);
      return { ok: true, strategy: 'text', target };
    }
  } catch (_) {}

  try {
    // 2. CSS selector
    const selLocator = page.locator(target).first();
    if (await selLocator.isVisible({ timeout: 1500 }).catch(() => false)) {
      await selLocator.click({ timeout: 3000 });
      ctx.resetFailure('click', target);
      return { ok: true, strategy: 'selector', target };
    }
  } catch (_) {}

  try {
    // 3. Role-based (button/link/etc.) text match
    const roleLocator = page.getByRole('button', { name: new RegExp(escapeRegex(target), 'i') }).first();
    if (await roleLocator.isVisible({ timeout: 1500 }).catch(() => false)) {
      await roleLocator.click({ timeout: 3000 });
      ctx.resetFailure('click', target);
      return { ok: true, strategy: 'role', target };
    }
  } catch (_) {}

  const failures = ctx.trackFailure('click', target);
  return { error: 'element not found: ' + target, attempts: failures, hint: failures >= 3 ? 'You have failed to find this element 3+ times. Per the common preamble, report this as soft_finding (element-not-findable) and call done() — do not grind further.' : undefined };
}

async function tool_type(page, ctx, field, value) {
  // Strategy: find input by label, then by placeholder, then by selector.
  const tries = [
    () => page.getByLabel(new RegExp(escapeRegex(field), 'i')).first(),
    () => page.getByPlaceholder(new RegExp(escapeRegex(field), 'i')).first(),
    () => page.locator(field).first(),
  ];
  for (const tryFn of tries) {
    try {
      const loc = tryFn();
      if (await loc.isVisible({ timeout: 1500 }).catch(() => false)) {
        await loc.fill(value, { timeout: 3000 });
        ctx.resetFailure('type', field);
        return { ok: true, field, value };
      }
    } catch (_) {}
  }
  const failures = ctx.trackFailure('type', field);
  return { error: 'input not found: ' + field, attempts: failures };
}

async function tool_navigate_tab(page, ctx, name) {
  const id = 'pg-' + name;
  await page.evaluate((pageId) => {
    if (typeof goPage === 'function') goPage(pageId);
    else {
      const target = document.getElementById(pageId);
      if (target) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        target.classList.add('active');
      }
    }
  }, id);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  return { ok: true, tab: name };
}

async function tool_scroll(page, ctx, direction, pixels) {
  const dy = direction === 'up' ? -pixels : pixels;
  await page.evaluate((y) => window.scrollBy({ top: y, behavior: 'instant' }), dy);
  return { ok: true, direction, pixels };
}

async function tool_read_state(page, ctx, statePath) {
  const value = await page.evaluate((p) => {
    try {
      // Walk the path against S, BILLS, MODEL, or other globals.
      const root =
        p.startsWith('BILLS') ? BILLS :
        p.startsWith('MODEL') ? MODEL :
        p.startsWith('S.') || p.startsWith('S[') ? S :
        S; // bare path defaults to S
      // Strip the root prefix if present
      let path = p;
      if (path.startsWith('S.')) path = path.slice(2);
      else if (path === 'S') return S ? Object.keys(S) : null;
      else if (path.startsWith('BILLS')) path = path.slice(5).replace(/^\./, '');
      else if (path.startsWith('MODEL.')) path = path.slice(6);
      // Walk dotted path with simple [N] index support
      const parts = path.split(/\.(?![^\[]*\])/).filter(x => x.length);
      let cur = root;
      for (const part of parts) {
        if (cur == null) return { error: 'null at path before ' + part };
        const m = part.match(/^([^\[]+)(?:\[(\d+)\])?$/);
        if (!m) return { error: 'cannot parse path part: ' + part };
        const key = m[1];
        const idx = m[2] !== undefined ? parseInt(m[2], 10) : null;
        if (key === 'length' && Array.isArray(cur)) return cur.length;
        cur = cur[key];
        if (idx !== null && cur != null) cur = cur[idx];
      }
      // Truncate huge objects/arrays to keep tool output sensible
      if (Array.isArray(cur) && cur.length > 20) return { __truncated: true, length: cur.length, preview: cur.slice(0, 5) };
      if (cur && typeof cur === 'object') {
        const keys = Object.keys(cur);
        if (keys.length > 30) return { __truncated: true, keyCount: keys.length, keys: keys.slice(0, 20) };
      }
      return cur;
    } catch (e) {
      return { error: e.message };
    }
  }, statePath);
  return { ok: true, path: statePath, value };
}

function tool_report_finding(ctx, severity, summary, evidence) {
  const finding = { ts: new Date().toISOString(), severity, summary, evidence, actor: ctx.actor };
  ctx.findings.push(finding);
  return { ok: true, recorded: finding };
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

module.exports = { TOOL_DEFS, RunContext, executeTool };
