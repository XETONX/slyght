# Claude Code Ship Prompt — Bundle 1 + Bundle 2 (v2)

> **Purpose:** Paste this entire document into a Claude Code session
> in `C:\Users\admin\slyght` to ship the hygiene commit (banner CSS +
> spending pivot rename + Layer 1 rule promotion). Self-contained.
>
> **Date:** 2026-05-06
> **Companion files** (in project root, may have `_1` suffix on second
> upload — that's a naming artifact, not a content variant):
> - `AUDIT-FULL-2026-05-06.md` — bug inventory, six classes
> - `SHIP-PLAN-2026-05-06.md` (or `_1.md`) — re-prioritised release plan
> - `INTERACTION-AUDIT-2026-05-06.md` — Plan mode + bills banner audit
> - `STEP-3-DIVERGENCE-MAP-2026-05-06.md` — parallel-impl inventory
> - `ARCHITECTURE.md` — target layered architecture (background only)
>
> **Verified:** Every step in this prompt was dogfooded against the
> actual codebase before publishing. Expected verification numbers
> (28 warnings, 0 errors, 47/50 runtime, 41/41 tests, 25 allow
> entries) match a real run. If your run produces different numbers,
> surface the difference rather than working around it.
>
> **Verification reality:** SLYGHT runs as a phone PWA with
> phone-local storage. Desktop browser has stale/empty `slyght_v5`
> and cannot reproduce: real banner triggering (needs actual
> paid-early bills), real spending-pivot data (needs real txns),
> iOS Safari rendering, PWA service-worker behavior, or CDN cache.
> **There is no useful pre-deploy verification step beyond the
> guardian/test gates.** Phone-verify happens post-deploy.

---

## Paste-this prompt — start

You're shipping a hygiene commit to SLYGHT. Three small fixes, single
commit, low risk, immediate visible win on phone post-deploy.

**Discipline rules for this session — non-negotiable:**

1. Read `~/.claude/projects/C--Users-admin/memory/MEMORY.md` first if
   it exists. The pins there (especially
   `process_discipline_no_reframes.md` and
   `regression_run_timing_discipline.md`) define how this project
   operates. Honour them.
2. **Surface, don't reframe.** If anything during execution doesn't
   match what's specified below, STOP and surface to the user. Don't
   silently work around it.
3. **Don't ship related-surface commits during regression runs.** If
   there's a regression run in progress, wait for it to complete or
   ask before proceeding.
4. **Each step has its own verification gate.** Don't skip them.
5. After every step, the working tree should be clean except for the
   intended diff. Verify with `git status`.

**Required reading before any code changes:**

- `AUDIT-FULL-2026-05-06.md` (full bug context)
- `SHIP-PLAN-2026-05-06.md` or `SHIP-PLAN-2026-05-06_1.md` (whichever
  exists — `_1` is an upload-artifact naming variant, content is
  identical)
- The exact line ranges referenced below (verify they match what's
  in your working tree)

**Working tree precondition:** clean (or only the standard
`runtime-report.json` timestamp churn, plus the audit/ship-plan/
prompt/architecture files as untracked — those get committed as
docs in Step 8). HEAD = `d0bc82e` or later. If HEAD is meaningfully
different, surface and ask before proceeding.

---

## Step 1 — Read the three target sites

Before any edits, read each of these to confirm the lines match:

```
view index.html lines 410–420   (banner HTML)
view index.html lines 9850–9860 (spending pivot row)
view guardian-static.js lines 750–760 (the Layer 1 rule)
view audit/allow-list.json (existing format — read-only, do NOT edit
                            this file directly; see Step 4)
```

The current state should match these excerpts. If they don't,
**STOP and ask the user.** Do not edit lines that don't match.

### Expected: index.html line 416 (the "Show me these bills" button)

```html
      <button onclick="MathInvariants.showDetails(document.getElementById('math-invariant-banner').dataset.rule)" style="display:inline-block;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.25);color:inherit;font-size:11px;cursor:pointer;padding:3px 9px;border-radius:4px;font-weight:600;margin-left:6px">Show me these bills</button>
```

### Expected: index.html line 417 (the × dismiss button)

```html
      <button onclick="MathInvariants.dismiss(document.getElementById('math-invariant-banner').dataset.rule)" aria-label="Dismiss" style="position:absolute;right:8px;top:6px;background:none;border:none;color:inherit;font-size:18px;line-height:1;cursor:pointer;padding:4px 8px">×</button>
```

### Expected: index.html line 9856 (spending pivot row)

The line containing `onclick="openEditTxnModal('+txnIdx+')"`. Should
appear inside `renderSpendingPivot` in the expanded-category
transaction loop.

### Expected: guardian-static.js line 752–753 (the rule)

```js
  // ─── 12. no-third-discretionary-filter-array ────────────
  {
    name: 'no-third-discretionary-filter-array',
    severity: 'warn',
    anchor: 'RC2',
```

**STOP gate:** confirm all four sites match before proceeding to
Step 2.

---

## Step 2 — Apply Fix A.1 (banner button visibility)

Fix two button styles in `index.html`. These are pure CSS changes;
no logic touched, no behaviour changes.

### A.1.a — Replace line 416 button style

Find this exact line in `index.html` (line 416):

```html
      <button onclick="MathInvariants.showDetails(document.getElementById('math-invariant-banner').dataset.rule)" style="display:inline-block;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.25);color:inherit;font-size:11px;cursor:pointer;padding:3px 9px;border-radius:4px;font-weight:600;margin-left:6px">Show me these bills</button>
```

Replace with:

```html
      <button onclick="MathInvariants.showDetails(document.getElementById('math-invariant-banner').dataset.rule)" style="display:inline-block;background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.4);color:rgba(255,255,255,0.95);font-size:11px;cursor:pointer;padding:3px 9px;border-radius:4px;font-weight:600;margin-left:6px">Show me these bills</button>
```

**What changed:** `background` opacity 0.12 → 0.18, `border` opacity
0.25 → 0.4, `color: inherit` → `rgba(255,255,255,0.95)`. Three values
in one inline style attribute.

### A.1.b — Replace line 417 button style

Find this exact line:

```html
      <button onclick="MathInvariants.dismiss(document.getElementById('math-invariant-banner').dataset.rule)" aria-label="Dismiss" style="position:absolute;right:8px;top:6px;background:none;border:none;color:inherit;font-size:18px;line-height:1;cursor:pointer;padding:4px 8px">×</button>
```

Replace with:

```html
      <button onclick="MathInvariants.dismiss(document.getElementById('math-invariant-banner').dataset.rule)" aria-label="Dismiss" style="position:absolute;right:8px;top:6px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.25);color:rgba(255,255,255,0.95);font-size:16px;line-height:1;cursor:pointer;padding:4px 10px;border-radius:4px">×</button>
```

**What changed:** `background: none` → `rgba(255,255,255,0.1)`, added
`border: 1px solid rgba(255,255,255,0.25)`, `color: inherit` →
`rgba(255,255,255,0.95)`, `font-size: 18px` → `16px`,
`padding: 4px 8px` → `4px 10px`, added `border-radius: 4px`.

### A.1 verification

```
git diff index.html
```

Should show exactly two changed lines (416 and 417). No other diff
in `index.html`. If the diff shows anything else, STOP and surface.

---

## Step 3 — Apply Fix B.1 (spending pivot rename)

One-line change in `index.html`. The function `openEditTxnModal`
does not exist; the correct function is `editTransaction`.

### B.1 — Rename the function call at line 9856

Find this line (it appears once in the file):

```js
          html += '<div onclick="openEditTxnModal('+txnIdx+')" style="display:flex;align-items:center;gap:10px;padding:8px 0;cursor:pointer;min-height:44px;border-bottom:'+(idx<row.txns.length-1?'1px solid var(--border)':'none')+'">';
```

Replace `openEditTxnModal` with `editTransaction`:

```js
          html += '<div onclick="editTransaction('+txnIdx+')" style="display:flex;align-items:center;gap:10px;padding:8px 0;cursor:pointer;min-height:44px;border-bottom:'+(idx<row.txns.length-1?'1px solid var(--border)':'none')+'">';
```

### B.1 verification

```
grep -n openEditTxnModal index.html
```

Must return zero matches. If any matches remain, STOP — there might
be more sites than the audit found.

```
grep -c editTransaction index.html
```

Should show one more match than before this fix (was 3, should be 4
across L3086 def, L3660 use, L5698 use, L9856 new use).

---

## Step 4 — Apply Fix F.1 (Layer 1 rule promotion)

**Important — how SLYGHT's allow-list actually works:**

The allow-list is **inline `// guardian-allow:` comments at violation
sites**. The file `audit/allow-list.json` is **auto-generated** by
`guardian-static.js` (it's a snapshot, not a source). Editing the
JSON directly does nothing. Add inline comments; the JSON regenerates
on next guardian run.

Comment format (parser regex at guardian-static.js L206):
```
// guardian-allow: <rule-name> — <reason ≥ 10 chars> (removable when <condition>)
```
or
```
// guardian-allow: <rule-name> — <reason> (permanent — see <ref>)
```

The em-dash separator can be `—` (preferred) or `-`. The comment
must sit on the line **immediately before** the violating line.
Reason can't match the vague-denylist (`/^TODO$/i`, `/^WIP$/i`, etc.).

Two parts to F.1: (a) add inline allow-comments at L3424 and L5728,
(b) promote the rule severity from `warn` to `fail`. **Order matters
— allow-list FIRST, then promote.** If you promote first, the build
fails.

### F.1.a — Add inline allow-comment before L3424 (renderSurvivalForecast)

Find this block in `index.html` (around line 3422–3424):

```js
        const d = new Date(t.ts);
        const weekAgo = new Date(Date.now() - 7*86400000);
        const NON_DISC = ['Debt repayment','Savings','Loan','Income','Bills'];
```

Add a new line BETWEEN `const weekAgo` and `const NON_DISC`:

```js
        const d = new Date(t.ts);
        const weekAgo = new Date(Date.now() - 7*86400000);
        // guardian-allow: no-third-discretionary-filter-array — renderSurvivalForecast inline 5-cat filter feeds the meal-prep cut-suggestion figure; matches divergence-map A9 (removable when survival-forecast cuts logic migrates to consume getDiscretionaryByCategory(weekAgo, now) per BILLS_VM integration)
        const NON_DISC = ['Debt repayment','Savings','Loan','Income','Bills'];
```

### F.1.b — Add inline allow-comment before L5728 (QUICK_CATS, false positive)

`QUICK_CATS` is a user-facing transaction-category picker list, not
a filter. The rule produces a false positive here because it overlaps
with the canonical filter categories. Allow-list with an explanatory
reason.

Find this block in `index.html` (around L5727–5728):

```js
  // UX 6: Render category chips
  const QUICK_CATS = ['Food / Coffee','Transport / Fuel','Shopping','Bills','Entertainment','Health','Debt repayment','Savings','Income / Refund \u2191','Other'];
```

Add a new line BETWEEN the `// UX 6` comment and `const QUICK_CATS`:

```js
  // UX 6: Render category chips
  // guardian-allow: no-third-discretionary-filter-array — QUICK_CATS is the user-facing transaction-category picker chip list, not a discretionary-spend filter. Overlap with canonical NON_SPEND_CATS is incidental (UI shows 'Bills', 'Savings' etc. as logging options) (removable when rule is refined to distinguish UI category lists from inline filter arrays)
  const QUICK_CATS = ['Food / Coffee','Transport / Fuel','Shopping','Bills','Entertainment','Health','Debt repayment','Savings','Income / Refund \u2191','Other'];
```

### F.1.c — Promote rule severity in guardian-static.js

Find at approximately line 752–753:

```js
  // ─── 12. no-third-discretionary-filter-array ────────────
  {
    name: 'no-third-discretionary-filter-array',
    severity: 'warn',
    anchor: 'RC2',
```

Change `'warn'` to `'fail'`:

```js
  // ─── 12. no-third-discretionary-filter-array ────────────
  {
    name: 'no-third-discretionary-filter-array',
    severity: 'fail',
    anchor: 'RC2',
```

### F.1.d — Do NOT manually edit `audit/allow-list.json`

The file regenerates automatically when guardian-static runs. After
Step 5, it should show `totalAllows: 25` (was 23, plus the two new
entries) and a `no-third-discretionary-filter-array` array under
`byRule` with two entries. The line numbers may shift by 1 because
the inline comments push subsequent lines down — that's expected and
correct.

### F.1 verification

```
node guardian-static.js
```

Expected:
- Exit code 0
- `Allow-list: 25 entries (0 unused)` (was 23 before)
- `28 WARN finding(s)` (the two RC2 sites move out of the count)
- **No `❌ FAIL finding(s)` section.** If FAIL appears, the
  allow-list comments aren't being honored — likely because they're
  on the wrong line (must be the line *immediately before* the
  violating line) or malformed (regex didn't match). STOP and check.

---

## Step 5 — Full validation pass (the only meaningful pre-commit gate)

After all three fixes are applied, run all three engines. These run
against fixtures, not phone data, so they're meaningful regardless
of the phone-storage gap.

### 5.a Run static guardian
```
node guardian-static.js
```
Expected: exit 0, 0 errors, 28 warnings (was 30; the 2 RC2 sites
are now allow-listed not warned), allow-list 25 entries (was 23).
All other warnings unchanged.

### 5.b Run runtime guardian
```
node guardian-runtime.js
```
Expected: 47/50 passing. The 3 known fixture-drift items per HANDOFF:
`Owed to Mum has viaRent:true`, `paydayReceived = true`, `Mark Pet
Insurance paid`. **No other failures.** If anything else fails,
STOP — that's a regression introduced by these changes.

### 5.c Run unit tests
```
node tests/core.test.js
```
Expected: `41 passed, 0 failed`. Any change is a regression.

### 5.d Quick sanity greps
```
grep -c openEditTxnModal index.html        # expected: 0
grep -c editTransaction index.html         # expected: 4
grep "color:inherit" index.html | head -5  # expected: no banner-button matches
```

**Why no desktop serve / no local browser check:** SLYGHT's storage
is phone-local. Desktop browser has stale or empty `slyght_v5` and
cannot reproduce the banner trigger condition (real paid-early
bills), real spending-pivot data, iOS Safari rendering, PWA service-
worker behavior, or CDN cache. A local serve would only confirm
"file loads" — `git diff` already tells us that. Skip the local
serve. Real verification is on phone post-deploy.

**STOP gate:** all of 5.a–5.d must pass. If anything fails, STOP and
surface — do NOT commit.

---

## Step 6 — Commit and push to main

The fixes are atomic and risk is near-zero. Phone-verify happens
post-deploy. If phone reveals an issue, revert is one commit.

```
git add index.html guardian-static.js audit/allow-list.json
git status                          # verify only those three files
git diff --cached                   # final review of all changes
git commit -m "fix(hygiene): banner button visibility, spending-pivot rename, RC2 promotion

- A.1: Banner × and 'Show me these bills' buttons now use explicit
  white-ish colors instead of color:inherit, fixing red-on-red
  invisibility on the dark-red banner background. Mission #45a closed.
- B.1: renderSpendingPivot transaction row in expanded category was
  calling undefined openEditTxnModal(); switched to editTransaction()
  to match the function used at L3660 and L5698. Silent-fail row tap
  is now functional.
- F.1: Promoted no-third-discretionary-filter-array (RC2) from WARN
  to FAIL. The two existing violations (L3424, L5728) added to
  audit/allow-list.json with transitional removability — they migrate
  when their respective surfaces consume canonical helpers. New
  inline category-filter arrays are now blocked at commit time.

Verification (pre-commit):
- guardian-static.js: 28 warnings (was 30), 0 errors, exit 0
- guardian-runtime.js: 47/50 (3 known fixture-drift)
- tests/core.test.js: 41/41

Phone-verify happens post-deploy via GitHub Pages (5-10 min lag)."
git push origin main
```

After push:

```
git log --oneline -1                # confirm commit landed
git status                          # confirm clean tree minus the still-untracked audit docs
```

Tell the user: commit pushed, awaiting GH Pages deploy (5–10 min)
before phone-verify can begin.

---

## Step 7 — Phone verification (post-deploy, the real gate)

After the push, GitHub Pages takes 5–10 minutes to deploy. Tell the
user when to verify on phone. Do not auto-proceed to Step 8 until
they report back.

User's phone-verify checklist:

1. Force-refresh the SLYGHT PWA on phone, OR close the app completely
   and reopen, OR clear PWA cache via browser settings. Goal: ensure
   phone is loading the latest deployed CSS, not cached old banner
   styles.
2. Wait for the bills banner to appear (it appears whenever there
   are paid-early bills tracked — should be visible currently if
   recent state has any).
3. Verify the banner shows BOTH:
   - Visible × button at top-right (white-ish, clearly tappable, NOT
     red-on-red)
   - Visible "Show me these bills" button (white text on a slightly
     opaque background, clearly readable)
4. Tap × — banner dismisses.
5. Re-trigger banner if needed (re-mark a bill as paid early, or
   wait for next render). Tap "Show me these bills" — MI-13 details
   modal should open.
6. Navigate to Analysis tab → expand any spending category → tap a
   transaction row → verify edit-transaction modal opens (was
   silently failing before B.1).

User reports back: PASS or FAIL with details.

If PASS → proceed to Step 8.

If FAIL:
```
git revert HEAD --no-edit
git push origin main
```
Surface to the user: revert pushed, Bundle 1 backed out, ready to
investigate the failure mode. Don't auto-retry.

---

## Step 8 — Docs commit (only if Step 7 passed)

Bundle the audit work into a separate docs commit so it's tracked
in git history without polluting the hygiene commit. Matches the
project pattern from `d4643e2` (docs-only commits).

```
git add AUDIT-FULL-2026-05-06.md \
        SHIP-PLAN-2026-05-06*.md \
        INTERACTION-AUDIT-2026-05-06.md \
        CLAUDE-CODE-SHIP-PROMPT.md \
        STEP-3-DIVERGENCE-MAP-2026-05-06.md \
        ARCHITECTURE.md \
        BILLS_VM-REFERENCE.md \
        bills-vm-reference.js \
        bills-vm-test-runner.js \
        bills-vm-output-sample.json
git status                          # verify only docs files
git commit -m "docs(audit): 2026-05-06 deep audit, ship plan, architecture, BILLS_VM reference

Consolidates today's audit work and architecture deliverables, all
developed during 2026-05-06 strategic-review session via claude.ai
with full code access:

- AUDIT-FULL: deep bug audit across codebase, six bug classes
  catalogued (CSS visibility, stale fn refs, persistence splits,
  repro-needed, architectural divergences, Layer 1 promotions).
  Anchors Bundle 1 ship and Bundle 2-5 plan.
- SHIP-PLAN: re-prioritised release plan with five bundles, decision
  tree.
- INTERACTION-AUDIT: Plan mode handler-existence sweep + bills banner
  CSS diagnosis + spending-pivot dead-row finding (Bug B.1). Three
  concrete bugs with code-level evidence.
- CLAUDE-CODE-SHIP-PROMPT: paste-ready execute-prompt for Bundle 1.
  Dogfooded against codebase before publishing — every step verified.
- STEP-3-DIVERGENCE-MAP: parallel-implementation inventory
  consolidating PROJECT-EXTRACT 4.4 + OPEN-BUGS items + new findings
  (PREDICTOR NW inline at L8255, calWeekSpent gap, B1/B2 labelling
  distinction).
- ARCHITECTURE: target layered architecture spec
  (S -> MODEL -> per-tab VMs -> BRAIN -> AGENT). Layer contracts,
  migration map, MVVM pattern reference.
- BILLS_VM-REFERENCE: worked-example reference implementation +
  test runner + sample JSON output. Architecture composes against
  real fixture; all 9 compliance checks pass."
git push origin main
```

After push:

```
git log --oneline -2                # both commits visible
git status                          # working tree fully clean
```

---

## Step 9 — Post-ship update

After Step 8 lands:

1. Update `OPEN-BUGS.md`:
   - Add a note to #11 (Plan Mode "Add savings"): "Mission #45a banner
     visibility (A.1) shipped 2026-05-06. The Plan-mode persistence
     bug (#11 itself) remains — see Bundle 3 in
     SHIP-PLAN-2026-05-06.md, Class C in AUDIT-FULL-2026-05-06.md."
   - If #39 (MI-13 banner buttons) exists separately and was about
     the same banner, mark resolved with reference to A.1.
   - Optionally add: a new entry for B.1 (spending pivot dead row)
     marked resolved on the same commit, for completeness.
2. Surface to the user with:
   - Both commit hashes
   - The four pre-commit verification numbers (28/0/47/41)
   - Confirmation phone check passed
   - What's next (Bundle 4 phone repros vs Bundle 3 mission spec vs
     Bundle 5 architecture work)

**Do NOT auto-start Bundle 3 or Bundle 4 work.** Hand back to the
user.

---

## Failure-mode handling

If anything breaks during execution:

| Symptom | What to do |
|---|---|
| Step 1 line content doesn't match | STOP. Surface the actual line content. Don't edit. |
| `guardian-static.js` shows new errors after Step 4 | STOP. Verify the inline `// guardian-allow:` comments are on the line *immediately before* the violating lines, with the em-dash separator (`—` preferred or `-`), reason ≥ 10 chars, and not matching vague-denylist (`/^TODO$/i`, etc.). |
| `guardian-runtime.js` shows new failures (beyond the 3 known) | STOP. Roll back changes (`git restore .`). Surface the new failure to the user. |
| Unit tests fail | STOP. Same — roll back, surface. |
| Phone shows banner buttons still invisible | Try force-refresh PWA on phone (or close + reopen). If still invisible after deploy + force-refresh, may indicate iOS Safari is overriding the inline color values somehow — investigate with the user before reverting. |
| Phone shows banner buttons but tap does nothing | The onclick handlers haven't been broken (audit confirmed they exist). Most likely: cache. Force-refresh + retry. If still failing, revert. |
| User reports phone-verify FAIL with no clear diagnosis | Revert Bundle 1 commit (`git revert HEAD --no-edit; git push`), do NOT also revert the docs commit if it landed. Surface to user that revert is in. |

---

## What this prompt deliberately does NOT do

- Does not touch any Class C, D, or E bug. Those are separate bundles
  (Bundle 3 persistence, Bundle 4 phone repros, Bundle 5 architecture).
- Does not promote `no-hardcoded-survival-mode-string` or
  `no-hardcoded-debt-strategy-string` (would require fixing or
  allow-listing 28 sites — not in scope).
- Does not modify the Bills calendar logic (Class D.4 needs phone
  repro first).
- Does not generate any mission specs unilaterally.
- Does not auto-bump version, write release notes, or update README.
- Does not run any local browser / serve step (no value given
  phone-local storage; see Step 5 note).

If the user asks for any of these as part of this ship, surface that
they're out of scope for the hygiene commit and ask whether to add
them as a follow-up.

---

## End of prompt
