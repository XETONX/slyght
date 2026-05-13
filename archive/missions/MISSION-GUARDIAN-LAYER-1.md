# MISSION: GUARDIAN — LAYER 1 (STATIC)

## ⚠️ Read this before any code

Read `MISSION-GUARDIAN.md` first for the four-shape diagnostic, the
three-layer architecture, and the cross-cutting constraints. This
file specifies Layer 1 only.

Layer 1 is **AST-based static analysis** that runs locally before
every commit/push. It enforces discipline rules anchored to specific
bugs we've shipped. Hard gates from day one — but with an explicit
override mechanism so deviations are named, not silenced.

This layer ships as a single commit. Either before, after, or in
parallel with Layer 2. No dependency on Layer 2 or Layer 3.

---

## DESIRED OUTCOME

After this mission ships, three new things exist:

1. **`guardian-static.js`** at the project root — a Node script that
   parses `index.html`'s script blob with `acorn`, walks the AST,
   evaluates each rule in the catalog, and exits non-zero on any
   `fail` severity. Wired into `package.json` `test` and a git
   pre-push hook.

2. **`audit/allow-list.json`** — a manifest tracking every
   `// guardian-allow: <rule> — <justification>` comment in the
   codebase. Auto-generated. Visible debt.

3. **A reduction in the parallel-implementation surface** — when
   `guardian-static.js` first runs against the current tree, it will
   identify violations that exist today (the still-inline filters in
   `renderTrend`, `renderCatBreakdown`, line 4960; the 25+ direct
   `S.bal` mutation sites). These get either fixed or
   `guardian-allow`'d with justification. The first run is the
   triage pass.

After this ships, future commits cannot introduce a parallel
implementation of a canonical helper without an explicit allow
comment.

---

## WHAT TO BUILD

### Part 1 — `guardian-static.js`

Single Node script at project root. Dependencies: `acorn` (~50 KB,
pure JS, no native compilation). Add to `package.json` devDeps.

Structure:

```js
const fs = require('fs');
const acorn = require('acorn');
const walk = require('acorn-walk'); // small companion for tree walking

const html = fs.readFileSync('index.html', 'utf8');
const scriptMatches = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
const allScript = scriptMatches.map(m => m[1]).join('\n// ── script boundary ──\n');

let ast;
try {
  ast = acorn.parse(allScript, {
    ecmaVersion: 2022, sourceType: 'script', locations: true
  });
} catch (e) {
  console.error('❌ AST parse failed: ' + e.message);
  process.exit(1);
}

// Collect allow comments BEFORE running rules
const allowList = collectAllowComments(allScript);

// Run rules
const findings = [];
for (const rule of RULES) {
  const violations = rule.check(ast, allScript);
  for (const v of violations) {
    if (allowList.has(rule.name + ':' + v.line)) continue; // suppressed
    findings.push({ rule: rule.name, severity: rule.severity, ...v });
  }
}

// Output + exit
writeAllowListManifest(allowList);
printFindings(findings);
process.exit(findings.some(f => f.severity === 'fail') ? 1 : 0);
```

### Part 2 — Rule catalog

Each rule is `{ name, severity, anchor, check(ast, source) }`. The
`anchor` field references the specific bug it would have caught — both
for documentation and for reverse-traceability when someone asks "why
does this rule exist?"

| Rule name | Severity | Anchored to | What it checks |
|---|---|---|---|
| `no-direct-paidbills-access` | fail | RC11 | Any `MemberExpression` where `S.paidBills[...]` appears outside the canonical helpers (`paidBillKey`, `isThisMonthlyBillPaid`). Exception: the `S.paidBills` declaration in `let S = {...}` and migration code. |
| `no-inline-paidbills-key-construction` | fail | RC11 | Any string concatenation matching the pattern `<num-or-expr>-<num-or-expr>-<str>-<num-or-expr>` outside `paidBillKey`. AST: walk `BinaryExpression` with `+` operator and string template-like shape. |
| `no-bare-non-income-filter-on-txns` | fail | RC2, OPEN-BUGS #6 | Filter callbacks against `S.txns` whose body is `t => !t.income` with NO further category filter. Exception: inside canonical helpers (`getTxnSpent`, `computeSpentInRange`, `getDiscretionaryByCategory`, `getDiscretionarySpend`). |
| `no-render-fn-mutates-state` | fail | architectural (one sanctioned exception) | Any `function render*` that contains an `AssignmentExpression` to `S.X` or a method call mutating `S.X` (push, splice, etc.). Exception list: `renderAll` month-end snapshot writer (lines 3030–3047), and `// guardian-allow` per case. **Kept at fail because the architecture has exactly one sanctioned exception. If this rule isn't enforceable, "renders are pure" is aspirational, not a rule.** |
| `no-hardcoded-bill-name` | fail | RC3 | String literals matching any name in `BILLS[].name` outside the `BILLS = [...]` declaration AND outside `tests/` directory. Forces "look up the actual bill name" pattern. |
| `nw-renderers-consume-MODEL.liquidNet` | fail | (moved from Layer 2) | The renderers writing to `strip-networth` and `nw-val` (and any future NW display target) must read directly from `MODEL.liquidNet`. No inline computation of net worth in render code. AST: in any `function render*` writing to a NW DOM target, the only NW source is `MODEL.liquidNet` (or a destructure thereof). Exception via `// guardian-allow` only. |
| `no-hardcoded-survival-mode-string` | warn | future-proofing (no shipped bug) | String literals matching `'critical' \| 'survival' \| 'tight' \| 'cautious' \| 'normal'` outside the canonical declaration. Forces a `SURVIVAL_MODES` constant. **Warn because no shipped bug anchors it; promotes to fail if one fires.** |
| `no-hardcoded-debt-strategy-string` | warn | future-proofing (no shipped bug) | String literals matching `'avalanche' \| 'snowball'` outside the canonical declaration. **Warn because no shipped bug anchors it.** |
| `dom-id-must-exist` | fail | dead-render detection | Every `$('id')` and `getElementById('id')` call resolves to an `id="..."` in the static HTML portion of `index.html`. **Replaces and extends the existing UI Guardian's orphan-ID check** by parsing the static HTML, not just regex. |
| `auditor-record-no-trivial-pass` | fail | RC10 | The `AUDITOR.record` function body must NOT compute `ok` as `expected !== null ? Math.abs((after - before) - expected) < 0.02 : true` for action names matching `*_FAIL` or known-failure markers (`CONSISTENCY_FAIL`, `NaN_DETECTED`, `JS_ERROR`, etc.). Looks for the literal `< 0.02` formula combined with the trivial-pass case. |
| `tdz-safe-engine-access` | fail | 56896d8 | Any reference to `PLAN.X` (or `MODEL.X` if `MODEL` is later const-declared) earlier in source order than the engine's `const` declaration must be inside try/catch or explicitly TDZ-guarded. |
| `copy-export-strips-secrets` | fail | security | The `copyExport` function body must contain `delete` calls for both `apiKey` AND `chatHistory`. Existing Core Guardian has this; Layer 1 promotes it to AST-checked. |
| `no-third-discretionary-filter-array` | warn | RC2 | The codebase has two named filters: `_NON_SPEND_CATS` (Set, line 1421) and `EXCLUDED_CATS` (Array, in `getDiscretionarySpend` line 1781). Any third top-level array literal containing 3+ category strings (e.g. `['Debt repayment', 'Savings', 'Loan']`) is flagged. |
| `magic-key-format-only-via-helper` | fail | RC11 | Any string template ` `${y}-${m+1}-${name}-${day}` ` shape outside `paidBillKey`. Same intent as `no-inline-paidbills-key-construction` but caught at template-literal level too. |
| `no-getmonthlysurplus` | fail | historical (deleted helper) | The function name `getMonthlySurplus` does not exist. Legacy lint preserved from Core Guardian. |
| `no-real-pin-constant` | fail | security | The literal `REAL_PIN` does not appear anywhere in source. Legacy lint. |
| `daysleft-uses-math-max-1` | fail | division-by-zero severity (no shipped bug, but high impact if it fires) | `daysLeft` function body contains `Math.max(1, ...)`. **Kept at fail because if it ever fires, `getMaxDay` returns `Infinity` and propagates everywhere — severity outweighs unfired status.** |

Each rule's `check` function returns a list of `{line, column, evidence}` objects.

### Part 3 — `// guardian-allow:` override mechanism

Syntax:

```js
// guardian-allow: rule-name — reason (removable when condition)
const violatingLine = computeSomethingTheRuleFlags();
```

The comment must appear on the line directly preceding the violation.
**Required format:**

```
// guardian-allow: <rule-name> — <reason> (removable when <condition>)
```

OR for permanent deviations:

```
// guardian-allow: <rule-name> — <reason> (permanent — see <link/comment-ref>)
```

Both halves are required:
- `<reason>`: why this code legitimately violates the rule (≥ 10 chars,
  must reference a specific cause)
- `(removable when <condition>)` OR `(permanent — see <ref>)`: forces
  the developer to either name a follow-up commitment or explicitly
  mark the deviation as architecturally permanent

The script rejects allow comments missing the parenthesized clause
("justification missing condition") AND rejects vague reasons like
"needs to work" or "WIP" (regex match against a deny-list of weak
phrases). Forces every override to be either a dated promise or a
documented architectural decision.

The script processes allow comments by:

1. Pre-scanning the source for all `// guardian-allow:` comments,
   recording `{ rule, line, justification }`.
2. When evaluating rules, suppressing any finding whose
   `(rule, line)` matches an allow comment.
3. Writing the full allow list to `audit/allow-list.json` after
   every run — the manifest the team reviews periodically.

The manifest format:

```json
{
  "lastGenerated": "2026-05-05T14:23:01Z",
  "totalAllows": 7,
  "byRule": {
    "no-render-fn-mutates-state": [
      { "line": 3030, "justification": "renderAll month-end snapshot — sanctioned exception per architectural rule" },
      ...
    ]
  }
}
```

The manifest is committed. Reviewers track whether justifications
still hold over time. **Allow count growing without justification
review = visible debt.**

### Part 4 — Integration

`package.json` updates:

```json
"scripts": {
  "guardian-static": "node guardian-static.js",
  "guardian": "node guardian-all.js && node guardian-static.js",
  "test": "node guardian-all.js && node guardian-static.js && node tests/core.test.js"
}
```

(The four existing guardians keep running. Layer 1 augments them.)

Pre-push hook (optional but recommended):

```bash
# .git/hooks/pre-push (developer-installed; not committed)
#!/bin/sh
node guardian-static.js || { echo "Guardian Layer 1 failed — fix violations or add // guardian-allow with justification"; exit 1; }
```

A `scripts/install-hooks.sh` helper that sets up the pre-push hook on
demand. Not auto-installed (developer choice).

### Part 5 — First-run triage

When `guardian-static.js` first runs against the current tree, it
will surface real violations that exist today:

- `no-bare-non-income-filter-on-txns` will fire on `renderTrend`,
  `renderCatBreakdown`, line 4960 (per OPEN-BUGS #6)
- `no-render-fn-mutates-state` will fire on `renderAll`'s snapshot
  writer (sanctioned — gets `// guardian-allow`)
- `no-direct-paidbills-access` should fire **zero times** (Bundle B
  unified all 13 sites) — verifying this is the regression check
- `dom-id-must-exist` may fire on `renderPaydayPlan`,
  `renderCharacterScore`, `renderLtTiles`, `renderWrxTracker`,
  `renderMumCard`, `renderDashboardMetrics` — confirms what
  ANALYSIS-DEEP-PASS named as dead

The triage pass is part of the mission: **for each first-run finding,
either fix the code or add a `// guardian-allow` with justification.**
The state on which Layer 1 ships is the state where the manifest is
populated and accurate.

---

## WORK PLAN

### Step 1 — Investigation (15 min)

Read every rule in the catalog above. Confirm the AST patterns are
realistic. Run a sample acorn parse on `index.html`'s script blob to
verify it parses cleanly (no syntax errors blocking AST construction).
Print a summary of total nodes, function count, top-level constants
parsed. **Stop and surface if AST parsing fails** — would need to
investigate which exact JS feature is breaking.

### Step 2 — Build the script skeleton (45 min)

Implement `guardian-static.js` with:
- Script extraction from `index.html`
- AST construction + error handling
- Rule loop driver
- Allow-comment scanner + suppression logic
- Findings printer + exit code logic
- `audit/allow-list.json` writer

Don't add real rules yet — use 1-2 trivial test rules to verify the
plumbing works end-to-end.

### Step 3 — Implement the rule catalog (90 min)

Add each rule from Part 2. Per rule:
1. Write the `check()` function.
2. Run against the current tree.
3. Confirm violations are exactly what's expected (cross-reference
   with the audit findings in PROJECT-EXTRACT and OPEN-BUGS).
4. If a rule has > 30% false-positive rate, refine the AST pattern
   or downgrade severity to `warn`.

### Step 4 — Triage first-run violations (60 min)

For each violation surfaced by the first full run:
- If it's genuinely a bug we should fix → fix in this commit (small
  fixes only — anything > 5 lines defers to a follow-up mission)
- If it's sanctioned → add `// guardian-allow: <rule> — <justification>`
- If it's a false positive → refine the rule

Generate the initial `audit/allow-list.json`. Verify the manifest is
clean and complete.

### Step 5 — Wire into package.json + add install-hooks helper (15 min)

Update `package.json` scripts. Create `scripts/install-hooks.sh`
(small, ~10 lines). Don't auto-install hooks.

### Step 6 — Verify (30 min)

Run all 4 existing guardians + `guardian-static.js` + `tests/core.test.js`.
All green. Run a simulated bad-commit scenario (write a file with a
deliberate violation, confirm Layer 1 catches it, confirm allow-comment
suppresses it).

### Step 7 — Commit + push

Single commit. Push to main. GitHub Pages deploy proceeds (Layer 1
runs locally, doesn't gate the deploy itself yet).

---

## CONSTRAINTS

- **No regressions to:** 56896d8, c800400, 5c6e219, 4a8cfba, 3c9b684,
  7351f9e, a8952c9, ae2bbef
- **`acorn` is the only new dependency.** No babel, no eslint, no
  bundler. Pure Node + small AST parser.
- **First-run violations get fixed or allow-listed in this commit.**
  Don't ship Layer 1 with unaddressed findings — defeats the gate.
- **Allow comments must include justification ≥ 10 chars.** Empty
  allows are not allowed.
- **The four existing guardians keep running.** Layer 1 doesn't
  delete them. They cover structural surface (manifest links, DOM
  shape, etc.) Layer 1 doesn't.
- **Single commit.** Reversibility.

---

## PUSH BACK IF

- AST parse of `index.html` fails — investigate which JS feature is
  unsupported by `acorn` ecmaVersion 2022 before continuing
- A rule turns out to have > 50% false positives during Step 3 — the
  rule needs redesign before shipping
- The first-run triage uncovers > 30 violations — some of those are
  real bugs that warrant their own missions; surface and re-scope
- A pattern emerges that's a Shape 1/2/3/4 bug class but doesn't fit
  any rule in the catalog — name it and add a new rule (or surface
  for the next mission)
- The `// guardian-allow` mechanism is being abused (e.g. > 10
  allows for a single rule means the rule is wrong, not the code) —
  surface and refine the rule

---

## VERIFICATION BLOCK FORMAT

```
═══════════════════════════════════════════════════════════════
GUARDIAN LAYER 1 SHIPPED to xetonx.github.io/slyght

Commit: <hash>
Tests: NN/NN passing
Guardians: 4/4 (existing) + 1/1 (Layer 1) — all green

LAYER 1 SUMMARY:
- guardian-static.js shipped, NN rules in catalog
- audit/allow-list.json populated with N allow comments
- First-run triage: N violations found, M fixed in commit, K allow-listed
- Pre-push hook helper: scripts/install-hooks.sh (not auto-installed)

RULES IN CATALOG (severity, anchor):
- [list each rule with severity and bug it would have caught]

ALLOW LIST (initial):
- [list each allow with rule name, line, and one-line justification]

═══════════════════════════════════════════════════════════════
DEVELOPER VERIFICATION:

1. Run `npm run guardian-static` → exits 0
2. Add a deliberate `S.paidBills['fake-key'] = true` somewhere
   outside canonical helpers
3. Re-run → exits 1 with `no-direct-paidbills-access` finding,
   line + evidence printed
4. Add `// guardian-allow: no-direct-paidbills-access — testing
   override mechanism` directly above the line
5. Re-run → exits 0, allow-list.json updated with the new entry
6. Remove the test code

═══════════════════════════════════════════════════════════════
```

---

## RUN WITH

```
Read C:\Users\admin\slyght\MISSION-GUARDIAN.md, then
C:\Users\admin\slyght\MISSION-GUARDIAN-LAYER-1.md, and execute.

Start with Step 1 (investigation). Confirm the AST parses cleanly
and surface any rules that need refinement before building the
script. STOP after Step 1, print findings, wait for confirmation
before Step 2.

This mission ships the static-analysis layer of the Guardian system.
Single commit. Hard gate. Override via // guardian-allow.
```
