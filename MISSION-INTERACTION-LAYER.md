# MISSION: AI AGENT AS TEST USER (Mission I — Layer I)

## Why this mission exists

Layers 1, 2, V cover code, state, and pixel drift. None of them 
catch bugs only visible by *using* the app:
- Buttons that do nothing when tapped (#11 Add Savings, the 
  preexisting broken Export button)
- Modals that open empty
- Action sequences that fail silently
- Interaction flows where steps work in isolation but break together
- "Tap X then Y produces wrong result" class bugs

These are the bugs John finds by walking the phone. Layer I 
automates that walk. An AI agent (Claude Vision via API + 
Playwright) executes structured scenarios, observes screens 
between actions, reports anomalies.

**This mission ships the bug-finding loop, not the bug-fixing 
loop.** Findings become OPEN-BUGS entries or mission specs. 
Fixes still ship through the established Step 1 → STOP → Step 2 
discipline. The agent accelerates discovery, not autonomy.

## Required reading before starting

1. Mission V's playwright.config.js — same browser, same viewport
   (S23 Ultra 412×915 DPR 3), same time-locking, same fixture 
   loading
2. PROJECT-EXTRACT-2026-05-05.md — to understand what surfaces 
   exist and what user actions are typically performed
3. The Claude API patterns already used in index.html (chat 
   integration) — for cost/auth patterns
4. STATE-AUDIT-2026-05-05.md — for known anomalies the agent 
   shouldn't re-report (Settings fullPage truncation, MI-13 
   firing on 6 paid-early — both are known and correct)

## Scope philosophy

This mission ships the **foundation** for Layer I:
- Infrastructure: agent runner, scenario format, report format
- 3 starter scenarios that cover the most-used flows
- Single command to run all scenarios + generate report
- Cost-bounded (~$5-15 per full run)

This mission does NOT ship:
- Per-commit gating (too expensive, too slow)
- Comprehensive scenario coverage (3 scenarios, not 20)
- Bug fixing (agent reports, we scope, we fix)
- Continuous monitoring (run on demand)

Future Layer I follow-ups extend with more scenarios, CI 
integration, parallel execution. Tonight's scope is "prove the 
loop works."

## What to do

### Step 1 — Investigation (no code, STOP gate)

Three sub-investigations.

#### 1A — Tooling and integration choices

**Anthropic API integration approach.** The agent loop needs:
- Vision API call per "what do I see" decision
- Tool use (function calling) for "what action to take"
- Cost tracking per scenario

Options:
- Direct API calls in Node.js via @anthropic-ai/sdk
- LangChain or similar abstraction layer (adds complexity)
- Roll-your-own minimal wrapper

Propose: which approach, why. Authentication: where does API 
key live (env var, file, prompt at runtime)? How are costs 
tracked and bounded?

**Vision model choice.** Claude Vision via:
- claude-sonnet-4-6 (balance of capability + cost)
- claude-opus-4-7 (highest capability, ~5x cost)
- claude-haiku-4-5 (fastest, cheapest, may miss subtle issues)

Propose: which model for which step. Likely sonnet for the main 
loop, opus only when sonnet flags something ambiguous and we 
want a deeper second look.

#### 1B — Scenario format design

Scenarios need to be:
- Human-readable (so you and I can write/review them without 
  inspecting code)
- Machine-parseable (so the runner can execute them)
- Composable (one scenario can reference another's setup)

Propose a format. Likely YAML or markdown-with-frontmatter. 
Example structure to evaluate:

```yaml
scenario: add-transaction
description: User adds an expense transaction and verifies it appears
preconditions:
  - fixture: state-snapshot.json
  - clock: 2026-05-05T22:00:00+10:00
steps:
  - action: navigate
    target: dashboard
  - action: tap
    target: "Add transaction button (green plus, bottom center)"
  - action: observe
    expect: "Add transaction modal is open"
  - action: fill
    field: "amount"
    value: "12.50"
  - action: fill
    field: "note"
    value: "Test coffee"
  - action: tap
    target: "Save button"
  - action: observe
    expect: "Transaction added; balance updated; modal closed"
postconditions:
  - txn_count_increased_by: 1
  - balance_decreased_by: 12.50
```

Surface alternatives. The "target" descriptions are natural 
language because the agent uses vision to find them; if Opus 
prefers selector-based targeting, surface that tradeoff.

#### 1C — Report format and findings ontology

Reports need to capture:
- Per-scenario success/fail
- Per-step status (passed, failed, surprising)
- Visual evidence (screenshot at each step, saved to disk)
- Findings categorized: hard failures (action did not produce 
  expected result), soft findings (something looked off but 
  scenario completed), suggestions (UX observations)

Propose a findings ontology. Example:
- **HARD_FAIL** — scenario broken, action did not work
- **SOFT_FINDING** — scenario completed but something visible 
  looked wrong
- **UX_SUGGESTION** — works correctly but agent has feedback
- **KNOWN_ANOMALY** — matches a STATE-AUDIT or OPEN-BUGS entry, 
  surfaced but not flagged as new

Reports go to `test-reports/interaction-YYYY-MM-DD-HHMMSS.md`. 
Markdown. Each finding includes screenshot reference + agent's 
reasoning + suggested next-step.

#### 1D — Initial 3 scenarios

Pick 3 scenarios that cover the most-used flows AND are most 
likely to surface real bugs. My nominations:

1. **add-transaction** — most-used action, covers add modal + 
   balance update + dashboard refresh + round-up bucket increment
2. **mark-bill-paid** — Mission B's gating, covers confirm 
   dialog + state mutation + visual update + Layer 2 invariant 
   firing if paid early
3. **export-state** — Mission EXPORT's surface, covers download 
   button + file generation + Mission EXPORT's broken button 
   alias path

Each scenario surfaces a different class of potential bug. 
Together they exercise the most common interaction surfaces.

Surface alternatives if Opus thinks 3 different scenarios are 
better starters. The criteria: high-frequency-of-use, 
multi-step, exercises state mutation, has known fragility 
points.

### Step 1 deliverables

- Tooling decision (Anthropic SDK + model choice)
- Scenario format spec
- Report format spec + findings ontology
- 3 initial scenario specs (full step lists)
- Cost projection per scenario and per full run
- Authentication approach for API key

STOP for John's review. **This Step 1 is heavier than usual** 
because design decisions cascade. Take time.

### Step 2 — Build infrastructure (after approval)

In order:

1. `test-runner.js` — main runner script
   - Loads scenario YAML
   - Spins up Playwright with Mission V's config
   - Loads fixture, locks clock, blocks SW, etc.
   - For each step:
     - Capture screenshot
     - Send to Claude Vision API with current scenario context
     - Parse agent's response (action to take, observations)
     - Execute action via Playwright
     - Loop
   - On scenario end: collect findings, write report
   
2. `test-scenarios/` directory with 3 starter scenarios

3. `test-reports/` directory (gitignored except for example)

4. `npm run test:interaction` — runs all scenarios
   `npm run test:interaction -- --scenario=add-transaction` — 
   single

5. Cost tracking: log API token usage per scenario, total per 
   run, alert if cost exceeds threshold (e.g., $20)

After each major component, run guardian-static + tests to 
confirm no regression to existing infrastructure.

### Step 3 — Execute initial run

Run all 3 scenarios. Generate first report. Review with John.

The first run is the proof-of-concept moment. Either:
- Findings are noise (everything works, agent finds nothing) — 
  validate scenarios are exercising real surfaces, not just 
  walking past bugs
- Findings include known-good (matches STATE-AUDIT/OPEN-BUGS) — 
  agent is correctly identifying things we've already seen
- Findings include unknowns — these become new OPEN-BUGS or 
  scoped missions

Ideally the first run finds something we didn't know. If 
nothing surfaces, surface concern that scenarios may be too 
shallow.

### Step 4 — Verify

```
npm run guardian-static    → exit 0 (16 rules unchanged)
npm test                   → 40/40 passing
npm run visual             → 4/4 passing (no UI change)
npm run test:interaction   → 3 scenarios complete, report 
                              generated, findings reviewed
```

Manual verification:
- Open generated report in editor; readable, useful?
- Screenshots exist for each step?
- Cost projection matches actual API spend?

### Step 5 — Commit and push

Single commit (or 2 if the infrastructure + scenarios naturally 
split):

```
feat(test): Layer I — AI agent test user infrastructure

[Tooling: Anthropic SDK + chosen model + auth approach]
[Scenario format: chosen format + example]
[Report format: chosen format + findings ontology]

Initial scenarios:
- add-transaction
- mark-bill-paid
- export-state

Run via: npm run test:interaction
Single scenario: npm run test:interaction -- --scenario=NAME

Cost: ~$X per full run, ~$Y per scenario.

First run findings: [summary of findings, link to report]

Closes (reduces to monitor): #37 Mission I foundation.

Future Layer I follow-ups: more scenarios, CI integration, 
parallel execution, longer-running soak scenarios.
```

Push immediately.

## Constraints

- **No regressions** to Layers 1, 2, V
- **35+ tests must still pass** (no new tests required, this is 
  test infrastructure)
- **Layer 1 must exit 0**, 16 rules unchanged
- **API key handling must be safe** — never logged, never 
  committed, env var or runtime prompt only
- **Cost-bounded** — single full run capped at $25 (alert + 
  abort if exceeded)
- **Agent has read-only access to John's data** — fixture is 
  copied, never modified. Agent cannot push state to phone.
- **Reports stay local** — gitignored except for one example. No 
  auto-publishing of findings anywhere.

## Push back if

- Anthropic SDK integration has gotchas not anticipated
- Scenario format design is harder than expected — surface 
  alternatives
- Cost projection comes back higher than $25/run (cap), need 
  to scope down
- Vision API misidentifies UI elements consistently (the agent 
  can't reliably see where buttons are) — surface, may need 
  selector-based targeting fallback
- 3 scenarios isn't enough to demonstrate value — propose 
  scope adjustment
- The runner architecture surfaces concerns about determinism 
  (different runs producing different paths through the same 
  scenario) — surface, may need stricter guardrails

## Estimate

Medium-large. Likely the biggest mission of any single session. 
Investigation in Step 1 has real design choices. Step 2 is 
substantial integration work. Step 3+4 are verification.

If Step 1 surfaces that scope is too big for one mission, 
propose splitting:
- Mission I-foundation: infrastructure + 1 scenario
- Mission I-coverage: 2 more scenarios + report polish

## Run with

```
Read C:\Users\admin\slyght\MISSION-INTERACTION-LAYER.md and 
execute.

Step 1 first — four sub-investigations:
  1A: tooling and integration (Anthropic SDK, model choice, 
      auth approach)
  1B: scenario format design (YAML / markdown / other)
  1C: report format and findings ontology
  1D: 3 initial scenarios (add-transaction, mark-bill-paid, 
      export-state — or alternatives if better)
Print findings as decision matrix, STOP for John's review.

This is the highest-leverage gate left to build for SLYGHT's 
bug profile. Layer I — AI agent USES the app, reports findings. 
Catches interaction-dependent bugs (broken buttons, empty 
modals, action sequences) that Layers 1, 2, V cannot catch.

Bug-FINDING loop, not bug-FIXING loop. Findings → OPEN-BUGS or 
scoped missions → fixes ship through normal Step 1 STOP discipline.

Cost-bounded: ~$5-15 per full run, ~$25 hard cap. Single 
mission. Push immediately after Step 1 confirmation + Step 2-5 
implementation.

Take time on Step 1 — design decisions cascade. Surface scope 
adjustments if needed.
```
