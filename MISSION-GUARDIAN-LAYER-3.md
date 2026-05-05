# MISSION: GUARDIAN — LAYER 3 (AUDIT)

## ⚠️ Read this before any code

Read `MISSION-GUARDIAN.md` first for the four-shape diagnostic, the
three-layer architecture, and the cross-cutting constraints. This
file specifies Layer 3 only.

Layer 3 is **`audit/opus-review.js`** — a Node script that calls the
Anthropic API with a diff plus a curated context bundle, asks Opus
4.7 to review for the bug classes that rules and invariants can't
catch (semantic mistakes, subtle reasoning, mislabeled UI, missing
edge cases), and returns structured findings.

This layer ships **last** in the Guardian system. It depends on
Layers 1 and 2 being in production — its context bundle includes
"what the static analyzer flagged" and "what the in-browser
invariants caught" as part of its reasoning input.

---

## DESIRED OUTCOME

After this mission ships:

1. **`audit/opus-review.js`** — a Node script invokable from CI,
   pre-push, or directly. Uses `@anthropic-ai/sdk`. Reads a diff,
   loads a context bundle, calls Opus 4.7 with prompt caching enabled
   on the bundle, returns structured findings.

2. **`audit/context-bundle.js`** — a script that pre-computes the
   stable context (canonical helper definitions, recent bug list,
   relevant smoke-test sections, OPEN-BUGS, the four-shape
   diagnostic) into `audit/context.bundle.json`. Rebuilt
   automatically when canonical files change.

3. **GitHub Action `.github/workflows/audit.yml`** — runs
   `audit/opus-review.js` on every push to `main`, posts findings as
   commit comments. **Warn-only mode for first 2 weeks** —
   findings are visible but never block deploy. After 2-week
   calibration, hard-gate on `fail` severity.

4. **A 2-week calibration period log** — every audit's findings get
   tracked: accepted (real bug), dismissed (false positive),
   noted (not actionable but useful). After 2 weeks the
   accept/dismiss ratio informs whether to promote to hard-gate.

---

## WHY OPUS 4.7 SPECIFICALLY

Layer 3 catches the bug classes Layers 1 and 2 cannot:
- **Mislabeled UI copy** (RC1, RC3) — number is from helper X but
  rendered text says concept Y. Requires reading code AND copy AND
  reasoning about the user-visible meaning.
- **Wrong helper chosen** (RC4) — the right helper exists, the
  caller picked the wrong one. Requires understanding "which
  question is this rendering trying to answer."
- **Math missing a component** (RC8) — the formula is locally right.
  Requires reasoning about whether the formula accounts for every
  cash flow that affects the number.
- **Comments that claim invariants the code doesn't uphold** —
  catches drift between docs and behavior.

These need a model that can reason about intent and code
simultaneously. Opus 4.7 is the right tier; Haiku would miss the
subtler reasoning, Sonnet would be borderline. Cost analysis is
favorable (see Cost Budget below).

---

## WHAT TO BUILD

### Part 1 — Project structure

```
audit/
├── opus-review.js         # main script
├── context-bundle.js      # pre-computes the bundle
├── context.bundle.json    # checked-in artifact (rebuilt on canonical changes)
├── audit-log.jsonl        # append-only log of every audit run
└── prompt-template.md     # system prompt + reviewer instructions
```

`audit/audit-log.jsonl` and `audit/context.bundle.json` are
committed. The log is the calibration record; the bundle is the
reproducibility anchor.

### Part 2 — `audit/context-bundle.js`

A Node script that compiles the stable context Opus needs for every
audit. Output: `audit/context.bundle.json`.

Inputs (read at bundle-build time):
- The canonical helper definitions extracted from `index.html` —
  every fn whose name appears in the canonical helpers table from
  PROJECT-EXTRACT § 4.1, with full source body
- Constants `_NON_SPEND_CATS`, `EXCLUDED_CATS`, `BILLS` array
- `OPEN-BUGS.md` (current state)
- `SMOKE-TEST.md` (full content)
- `MISSION-GUARDIAN.md` § "WHY THIS EXISTS — THE FOUR-SHAPE DIAGNOSTIC"
- `MISSION-REALITY-CHECK.md` § "WHY THIS EXISTS" + RC1–RC11 summary
- The list of locked-in commits (no-regressions list)

The script greps `index.html` for the canonical helper definitions
by name, slices their bodies, packages with metadata. Total bundle
size target: **6,000–8,000 input tokens** (well under 10K budget).

Bundle rebuild trigger: a `audit/.bundle-fingerprint` file storing
the SHA256 of the canonical inputs. When `node audit/context-bundle.js`
runs, it recomputes the fingerprint; if changed, regenerates.

Run as part of the audit script's startup (cheap if no rebuild
needed).

### Part 3 — `audit/prompt-template.md`

The system prompt for Opus. Structure:

```
ROLE: You are reviewing a diff to slyght/index.html before deploy.
The app is a personal finance tool deployed to xetonx.github.io/slyght.
Read the canonical helpers below. Read the diff. Find bugs that match
these classes:

1. **Mislabeled UI copy** — a number computed from helper X is rendered
   with text describing concept Y, where X and Y don't match.
   Example anchor: RC1 (cycle math) — `getTxnSpent` (all-time non-income
   sum) was rendered as "$X this cycle".

2. **Wrong helper chosen** — multiple legitimate helpers exist; the
   caller picked the one whose semantics don't match the rendering's
   question. Example anchor: RC4 — `getAvgDailySpend` (long historical
   window) used where the question is "current pace."

3. **Math missing a component** — formula is locally correct but
   doesn't account for a cash flow that affects the user-visible
   number. Example anchor: RC8 — borrow recommendation doesn't subtract
   the salary that lands inside the days-window.

4. **Comment-doc drift** — comments claim an invariant the code
   doesn't uphold; or rule names like `// RC11:` reference work that
   has been undone.

OUTPUT FORMAT (strict JSON):
{
  "findings": [
    {
      "rule": "<one of: mislabeled-copy | wrong-helper | missing-component | comment-drift | other>",
      "severity": "fail" | "warn",
      "file": "index.html",
      "line": <integer>,
      "evidence": "<short code snippet from the diff>",
      "reasoning": "<2-3 sentence explanation>",
      "suggestion": "<concrete one-line fix>"
    }
  ],
  "verdict": "pass" | "warn" | "fail",
  "confidence": <0.0–1.0>
}

A `fail` finding will block the deploy (after the 2-week calibration).
A `warn` finding posts a comment but doesn't block.

**Skepticism is the default.** If you cannot articulate WHICH of the
four shapes a piece of code might violate AND why, that's a `warn`
finding describing what you don't know — not a pass. Approving "this
looks fine" without explicit reasoning is the failure mode of an
audit. False-warns cost one human review; missed bugs cost a deploy.

Specifically: if the diff touches a canonical helper or a render
function and you cannot trace every consumer + every state field
affected, output a `warn` describing that uncertainty.

**You are the last reviewer before deploy.** There is no second pair
of eyes after you. Default to surfacing concerns any responsible
reviewer would surface. The audit is not optional safety net — it
IS the safety net.

If the diff is purely cosmetic (CSS, copy, formatting) with no math
or state mutation, return `{"findings": [], "verdict": "pass",
"confidence": 1.0}` quickly. That's the only fast-pass case.

CONTEXT FOLLOWS:
[bundle.json contents — canonical helpers, constants, smoke test,
open bugs, recent bugs RC1–RC11]

DIFF FOLLOWS:
[git diff main..HEAD output]
```

### Part 4 — `audit/opus-review.js`

The main script. ~200 lines.

```js
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const { execSync } = require('child_process');

// --- CLI ---
// audit/opus-review.js --mode=push|ci|local [--diff=<file>] [--base=main]
const argv = parseArgs(process.argv.slice(2));
const mode = argv.mode || 'local';

// --- Diff source ---
let diff;
if (argv.diff) {
  diff = fs.readFileSync(argv.diff, 'utf8');
} else {
  diff = execSync(`git diff ${argv.base || 'main'}..HEAD -- index.html`, {
    encoding: 'utf8'
  });
}

if (!diff.trim()) {
  console.log('No diff to audit.');
  process.exit(0);
}

// --- Context bundle ---
require('./context-bundle.js'); // rebuild if needed
const bundle = JSON.parse(fs.readFileSync('audit/context.bundle.json', 'utf8'));
const promptTemplate = fs.readFileSync('audit/prompt-template.md', 'utf8');

// --- Anthropic call with prompt caching ---
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const response = await client.messages.create({
  model: 'claude-opus-4-7',
  max_tokens: 2000,
  system: [
    {
      type: 'text',
      text: promptTemplate,
      cache_control: { type: 'ephemeral' }  // cache the system prompt
    },
    {
      type: 'text',
      text: 'CONTEXT BUNDLE:\n' + JSON.stringify(bundle, null, 2),
      cache_control: { type: 'ephemeral' }  // cache the bundle
    }
  ],
  messages: [
    { role: 'user', content: 'DIFF:\n' + diff }
  ]
});

// --- Parse findings ---
const text = response.content[0].text;
let findings;
try {
  // Extract JSON from response (model may wrap with markdown fence)
  const json = extractJson(text);
  findings = JSON.parse(json);
} catch (e) {
  console.error('❌ Could not parse audit output as JSON');
  console.error(text);
  process.exit(2); // 2 = parse error, not a finding-failure
}

// --- Log ---
appendToAuditLog({
  ts: new Date().toISOString(),
  mode,
  base: argv.base || 'main',
  diffSize: diff.length,
  inputTokens: response.usage.input_tokens,
  cacheReadTokens: response.usage.cache_read_input_tokens || 0,
  outputTokens: response.usage.output_tokens,
  findings: findings.findings,
  verdict: findings.verdict
});

// --- Output ---
printFindings(findings, mode);

// --- Exit code ---
const calibrationActive = isWithinCalibrationPeriod();
const hasFail = findings.findings.some(f => f.severity === 'fail');

if (mode === 'ci') {
  if (calibrationActive) {
    process.exit(0); // warn-only — never block during calibration
  }
  process.exit(hasFail ? 1 : 0);
} else {
  // local / push mode — print only, never block
  process.exit(0);
}
```

Key behaviors:

- **Prompt caching:** both the system prompt template AND the
  context bundle are marked `cache_control: ephemeral`. This means
  on a 5-minute window, repeated calls hit the cache at 10% of
  normal input cost. (See cost budget.)

- **Mode-specific behavior:**
  - `local` — runs from developer machine, never exits non-zero
    (never blocks anything; pure feedback)
  - `push` — same as local, but with slightly different output
    formatting (designed for terminal output during pre-push)
  - `ci` — runs in GitHub Action; respects calibration period
    (warn-only first 2 weeks); after calibration, exits 1 on
    `fail` severity → blocks deploy

- **Calibration window:** stored in `audit/calibration-end.txt` —
  a timestamp written when this mission first ships. The script
  reads this to decide whether to enforce. After the date,
  hard-gate is active.

- **Audit log:** `audit/audit-log.jsonl` accumulates every run for
  retrospective analysis. After calibration period, manually review
  to compute false-positive rate.

### Part 5 — GitHub Action `.github/workflows/audit.yml`

Runs **before** the existing `pages.yml` deploy. If audit fails
(post-calibration), `pages.yml` doesn't run.

```yaml
name: Guardian Layer 3 Audit
on:
  push:
    branches: [main]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2  # need previous commit for diff
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm install @anthropic-ai/sdk
      - name: Run Opus audit
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: node audit/opus-review.js --mode=ci --base=HEAD~1
      - name: Post findings as commit comment
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const log = fs.readFileSync('audit/audit-log.jsonl', 'utf8')
              .trim().split('\n').pop();
            const result = JSON.parse(log);
            // Post a comment summarizing findings
            // ... (issue/commit comment via github API)
```

The `pages.yml` deploy job adds `needs: audit` so it only runs
post-success. **During calibration period**, audit always returns 0
even on findings, so deploy proceeds either way; comments still post.

### Part 6 — Calibration tracking

Manual but systematic:

After every audit during the 2-week period, John (or whoever's
shipping) marks each finding:
- ✅ Real bug — would have wanted this caught
- ❌ False positive — not actually a bug
- ➖ Note — useful info but not actionable

Stored in `audit/calibration-review.md` as a running log:

```
## 2026-05-12 ae2bbef
Findings: 2
- mislabeled-copy line 4520 — ✅ real (caught a typo'd label)
- wrong-helper line 9265 — ❌ false (helper is correct, audit
  misread the question)

## 2026-05-13 1234abc
Findings: 0

# ─────────────────────────────────────────────────────
# BUGS CAUGHT POST-DEPLOY NOT FLAGGED BY AUDIT
# ─────────────────────────────────────────────────────

## 2026-05-12 — Bundle B regression
- audit run: ae2bbef
- what audit said: "no findings"
- what audit should have caught: <description>
- root cause: prompt gap | context gap | model limitation
- corrective action: <what to update in prompt or context bundle>
```

Two parallel sections. The findings section captures TP/FP rate. The
missed-bugs section captures coverage gaps — bugs caught by John or
by Layer 2 banner that audit had a chance to flag and didn't.
Without this section, we'd promote to hard-gate based on TP/FP alone,
blind to whether the model is missing whole bug classes.

**Review cadence:**

- **Weekly during the 2-week calibration period** — every Monday,
  walk both sections. Tally accept rate. Triage every missed-bug
  entry to one of: prompt gap, context gap, model limitation.
  Update the prompt or context bundle accordingly.
- **Monthly thereafter** — same review, lower frequency once the
  signal is established.
- **Triage SLA: 7 days from entry.** Every missed-bug entry must
  have a corrective action recorded within 7 days. Stale entries
  signal the calibration isn't being reviewed and the audit's
  signal is degrading.

After 2 weeks: tally accept rate. If ≥ 50% true-positive rate AND
zero unaddressed missed-bug entries, promote to hard-gate. If
either condition fails, refine and extend calibration.

---

## COST BUDGET (CONFIRMED)

Opus 4.7 pricing (verified May 2026 web search):
- Input: $5 per 1M tokens
- Output: $25 per 1M tokens
- Prompt caching: cached input read at $0.50 per 1M tokens (10% of
  base)

Per-audit shape:
- System + bundle (cached after first call in 5-min window):
  ~7,000 tokens input, ~$0.0035 first call, ~$0.0035 cached reads
- Diff (uncached): ~500–3,000 tokens input, ~$0.0025–$0.015
- Output: ~500–1,000 tokens, ~$0.0125–$0.025

**Per-call cost: $0.018–$0.045 (cache hit) or $0.05–$0.18 (cache miss).**

Monthly at 25 pushes (most within cache windows during a session):
- Without caching: $1.25–$4.50
- With caching (~70% cache hit rate during active development): **$0.50–$1.50**

**Acceptable budget: < $2/month total Guardian operating cost.**

Hard cap: if monthly cost exceeds $5, surface for re-budget.
Spending is logged via the API response usage metadata in
`audit/audit-log.jsonl`.

---

## WORK PLAN

### Step 1 — Investigation (15 min)

Read every part above. Confirm:

- `@anthropic-ai/sdk` Node SDK version supports prompt caching with
  `cache_control: { type: 'ephemeral' }`
- **Model + price verification:** fetch
  `https://docs.anthropic.com/en/docs/about-claude/models` (or web
  search "Anthropic latest Opus model ID May 2026"). Print the
  current state in this exact format:

  ```
  Current model: <id>, pricing: $<input>/$<output> per M tokens
  Cached input: $<cached> per M tokens
  Vs. budgeted: Opus 4.7 at $5/$25 per M tokens, $0.50 cached
  ```

  Decision matrix based on the printout:
  - Same model ID + same pricing as budget → proceed with `claude-opus-4-7`
  - Newer Opus (e.g. 4.8) at same pricing → decide stay vs. upgrade,
    document in commit message
  - Newer Opus at different pricing → re-baseline cost section before
    proceeding; surface the new monthly estimate
  - Pricing changed for Opus 4.7 → re-baseline cost section, surface
    decision to stay on 4.7 or downgrade to Sonnet
  - Opus 4.7 deprecated → mandatory upgrade decision; surface

- `ANTHROPIC_API_KEY` can be set as a GitHub secret

Surface anything ambiguous. Do NOT proceed past Step 1 without the
model+price printout in hand.

### Step 2 — Build `context-bundle.js` (45 min)

Implement the bundle-building script. Verify the output JSON is
well-formed and ~6–8K tokens. Commit `audit/context.bundle.json` to
the repo (it's a build artifact, but small enough to be useful as a
diff anchor).

### Step 3 — Build `prompt-template.md` (30 min)

Write the system prompt. Test by hand: paste prompt + small synthetic
diff into Claude.ai or via the API directly, confirm output is parseable
JSON in the expected shape.

### Step 4 — Build `opus-review.js` (90 min)

Implement the main script. CLI parsing, diff source resolution,
context bundle load, Anthropic call with caching, JSON extraction,
findings output, audit log append, mode-specific exit codes.

Test in `local` mode against:
- A clean diff (no findings expected)
- A deliberately bad diff (e.g. add `S.txns.filter(t => !t.income)`
  inline somewhere) — confirm finding fires
- A no-op diff (CSS only) — confirm fast pass

### Step 5 — GitHub Action wiring (30 min)

Create `.github/workflows/audit.yml`. Add `needs: audit` to
`.github/workflows/pages.yml`'s deploy job. Set `ANTHROPIC_API_KEY`
as a repo secret.

Test by pushing a small change and confirming the action runs.

### Step 6 — Calibration tracking (15 min)

Initialize `audit/calibration-end.txt` with a timestamp 2 weeks from
shipping. Initialize `audit/calibration-review.md` with the format
template. Add to package.json scripts: `audit-review` (just
`cat audit/calibration-review.md`).

### Step 7 — Verify

- Run `npm run audit` on current HEAD → confirm script works
- Push a no-op commit → confirm GitHub Action runs and comments
- Push a deliberately-bad commit → confirm finding posted, deploy
  still proceeds (calibration mode)
- Read `audit/audit-log.jsonl` → confirm cost data captured

### Step 8 — Commit + push

Single commit. Push to main. The action runs against itself (the
diff that adds the action) — should produce zero findings.

---

## CONSTRAINTS

- **No regressions to:** 56896d8, c800400, 5c6e219, 4a8cfba, 3c9b684,
  7351f9e, a8952c9, ae2bbef, plus any Layer 1 / Layer 2 commits
- **Layers 1 and 2 must be in production before this ships.**
- **Warn-only for first 2 weeks** — never blocks deploy during
  calibration regardless of findings
- **Prompt caching enabled** on system prompt and context bundle
  — non-negotiable for cost budget
- **Cost cap: $5/month** — if exceeded, surface immediately
- **`ANTHROPIC_API_KEY` is a GitHub repo secret** — never committed
  to the repo, never logged, never in audit-log.jsonl
- **Audit log captures usage metadata** — input/output/cache token
  counts on every call, for cost tracking and retrospective
- **Single commit.** Reversibility.

---

## PUSH BACK IF

- Anthropic SDK doesn't yet support prompt caching in the way the
  spec assumes — surface and either find a workaround or shrink
  context to fit non-cached pricing
- The current Opus model ID has changed (e.g. shipped Opus 4.8) —
  surface and decide whether to use the latest or stay on 4.7
- The 2-week calibration period reveals < 30% true-positive rate —
  audit isn't earning its keep; either improve the prompt or
  consider deprecating Layer 3
- The cost exceeds $5/month at any point — surface and re-scope
  (smaller context bundle, fewer audits per month, switch to
  Sonnet for routine and Opus for flagged-only)
- Audit findings start gaming the system (e.g. always returning
  the same generic finding regardless of diff) — likely a prompt
  issue; iterate the prompt
- The GitHub Action becomes flaky (rate limits, secrets issues,
  network) — separate troubleshooting; document in the action

---

## VERIFICATION BLOCK FORMAT

```
═══════════════════════════════════════════════════════════════
GUARDIAN LAYER 3 SHIPPED to xetonx.github.io/slyght

Commit: <hash>
Tests: NN/NN passing
Guardians: 4/4 (existing) + 2/2 (Layer 1 + Layer 2) — all green
Layer 3 calibration: ACTIVE (ends 2026-05-DD)

LAYER 3 SUMMARY:
- audit/opus-review.js shipped (Node script, ~200 lines)
- audit/context-bundle.js + context.bundle.json (NN tokens)
- audit/prompt-template.md (~XX lines)
- .github/workflows/audit.yml wired into pages.yml deploy
- ANTHROPIC_API_KEY secret configured
- Calibration period: 2 weeks warn-only

INITIAL TEST RUN:
- Audit against current HEAD → N findings
- Audit against synthetic-bad diff → confirmed finding fires
- Audit against CSS-only diff → fast pass (cache hit)
- Estimated monthly cost: $X.XX (based on first audit + cache analysis)

═══════════════════════════════════════════════════════════════
DEVELOPER VERIFICATION:

1. Run `npm run audit` on current branch → exits 0, findings printed
2. Push a small change → GitHub Action runs within 60s
3. Check audit-log.jsonl → entry appended with usage metadata
4. Check commit page on GitHub → audit comment posted with findings
5. Check pages deploy → still proceeds (calibration mode)
6. Manually corrupt: add `S.paidBills['fake']=true` outside helper,
   commit + push → audit catches it, deploy still proceeds (warn),
   finding logged, comment posted

After 2 weeks:
7. `cat audit/calibration-review.md` → review accept/dismiss tally
8. If TP rate ≥ 50%, edit calibration-end.txt to past date
   → next audit hard-gates on `fail` severity

═══════════════════════════════════════════════════════════════
```

---

## RUN WITH

```
Read C:\Users\admin\slyght\MISSION-GUARDIAN.md, then
C:\Users\admin\slyght\MISSION-GUARDIAN-LAYER-3.md, and execute.

This mission ships LAST in the Guardian system. Do NOT start unless
both Layer 1 and Layer 2 are in production.

Start with Step 1 (investigation). Verify SDK + model ID + secret
mechanism. STOP after Step 1, surface anything ambiguous.

Single commit. Warn-only mode for 2 weeks. Cost-budgeted.
```
