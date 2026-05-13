# Claude Code Ship Prompt — Bundle 1 + Bundle 2

> **Purpose:** Paste this entire document into a fresh Claude Code session
> to ship the hygiene commit (banner CSS + spending pivot rename + Layer
> 1 rule promotion). Self-contained — does not assume Claude Code has
> conversation context from elsewhere.
>
> **Date:** 2026-05-06
> **Source:** Audit findings in `AUDIT-FULL-2026-05-06.md`, prioritised in
> `SHIP-PLAN-2026-05-06.md`. Both companion files are in the project
> root. Architecture context lives in `ARCHITECTURE.md` (background
> only — not required for this commit).
>
> **Verified:** Every step in this prompt was dogfooded against the
> actual codebase before publishing. Expected verification numbers
> (28 warnings, 0 errors, 47/50 runtime, 41/41 tests, 25 allow entries)
> match a real run. If your run produces different numbers, surface
> the difference rather than working around it.

---

## Paste-this prompt — start

You're shipping a hygiene commit to SLYGHT. Three small fixes, single
commit, low risk, immediate visible win.

**Discipline rules for this session — non-negotiable:**

1. Read `~/.claude/projects/C--Users-admin/memory/MEMORY.md` first if it
   exists. The pins there (especially `process_discipline_no_reframes.md`
   and `regression_run_timing_discipline.md`) define how this project
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
- `SHIP-PLAN-2026-05-06.md` (why this bundle, why now)
- The exact line ranges referenced below (verify they match what's
  in your working tree)

**Working tree precondition:** clean (or only the standard
`runtime-report.json` timestamp churn). HEAD = `d0bc82e` or later. If
HEAD is meaningfully different, surface and ask before proceeding.

---

## Step 1 — Read the three target sites

Before any edits, read each of these to confirm the lines match:

```
view index.html lines 410–420   (banner HTML)
view index.html lines 9850–9860 (spending pivot row)
view guardian-static.js lines 750–760 (the Layer 1 rule)
view audit/allow-list.json (existing format)
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
appear inside `renderSpendingPivot` in the expanded-category transaction
loop.

### Expected: guardian-static.js line 752–753 (the rule)

```js
  // ─── 12. no-third-discretionary-filter-array ────────────
  {
    name: 'no-third-discretionary-filter-array',
    severity: 'warn',
    anchor: 'RC2',
```

### Expected: audit/allow-list.json structure

Object with `byRule` field, each rule having an array of entries with
`type`, `line`, `removability`, `reason`, `condition`, `used` fields.

**STOP gate:** confirm all four sites match before proceeding to Step 2.

---

## Step 2 — Apply Fix A.1 (banner button visibility)

Fix two button styles in `index.html`. These are pure CSS changes; no
logic touched, no behaviour changes.

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
`rgba(255,255,255,0.95)`, `font-size: 18px` → `16px`, `padding: 4px 8px`
→ `4px 10px`, added `border-radius: 4px`.

### A.1 verification

```
git diff index.html
```

Should show exactly two changed lines (416 and 417). No other diff
in `index.html`. If the diff shows anything else, STOP and surface.

---

## Step 3 — Apply Fix B.1 (spending pivot rename)

One-line change in `index.html`. The function `openEditTxnModal` does
not exist; the correct function is `editTransaction`.

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
`guardian-static.js` (it's a snapshot, not a source). Editing the JSON
directly does nothing. Add inline comments; the JSON regenerates on
next guardian run.

Comment format (parser regex at guardian-static.js L206):
```
// guardian-allow: <rule-name> — <reason ≥ 10 chars> (removable when <condition>)
```
or
```
// guardian-allow: <rule-name> — <reason> (permanent — see <ref>)
```

The em-dash separator can be `—` (preferred) or `-`. The comment must
sit on the line **immediately before** the violating line. Reason
can't match the vague-denylist (`/^TODO$/i`, `/^WIP$/i`, etc.).

Two parts to F.1: (a) add inline allow-comments at L3424 and L5728,
(b) promote the rule severity from `warn` to `fail`. **Order matters —
allow-list FIRST, then promote.** If you promote first, the build fails.

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

`QUICK_CATS` is a user-facing transaction-category picker list, not a
filter. The rule produces a false positive here because it overlaps
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
- **No `❌ FAIL finding(s)` section.** If FAIL appears, the allow-list
  comments aren't being honored — likely because they're on the wrong
  line (must be the line *immediately before* the violating line) or
  malformed (regex didn't match). STOP and check.

---

## Step 5 — Full validation pass

After all three fixes are applied:

### 5.a Run static guardian
```
node guardian-static.js
```
Expected: 0 errors. Warnings should be 28 (from 30; the 2 RC2 sites
are now allow-listed not warned). All other warnings unchanged.

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

### 5.d Visual regression (optional)
```
npm run visual
```
Expected: passing or any failures explicitly identifiable as the
banner-style change. Note: visual tests run against light theme; the
banner button changes will produce a baseline diff. Update baselines
only after manual phone verification (Step 6).

---

## Step 6 — Manual phone verification

Before committing, verify on the actual phone (the gap that the existing
validation stack doesn't cover).

1. Push to a personal branch (NOT main yet) or use a local serve setup.
2. On phone, force-refresh `https://xetonx.github.io/slyght/` (or the
   personal-branch GitHub Pages preview if available).
3. Verify the bills banner shows BOTH:
   - Visible × button at top-right (white-ish, not red-on-red)
   - Visible "Show me these bills" button (white text on a slightly
     opaque background, clearly readable)
4. Tap × — banner dismisses
5. Tap "Show me these bills" — MI-13 details modal opens
6. Navigate to Analysis tab → expand a category → tap a transaction row
7. Verify edit-transaction modal opens (was failing silently before B.1)

If any of these don't work, STOP and surface what fails. Don't merge.

---

## Step 7 — Commit

Single commit covering all three fixes:

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

Verification:
- guardian-static.js: 28 warnings (was 30), 0 errors
- guardian-runtime.js: 47/50 (3 known fixture-drift)
- tests/core.test.js: 41/41
- Manual phone check: banner buttons visible, dismiss works,
  show-me-these-bills opens MI-13 modal, spending-pivot row tap
  opens edit-transaction modal"
```

After the commit:

```
git log --oneline -1                # confirm commit landed
git status                          # confirm clean tree
```

---

## Step 8 — Post-ship

After commit lands and pushes to origin:

1. Update OPEN-BUGS.md:
   - Mark #11 with a note that A.1 (banner) is shipped — but #11
     itself is the Plan goal persistence bug (Class C), so #11
     stays open. Add a cross-reference note: "A.1 banner shipped;
     C.1/C.2 remain — see Bundle 3 in SHIP-PLAN-2026-05-06.md."
   - Mark #39 (MI-13 banner details button does nothing) — verify
     this was about the same banner; if so, mark resolved.
2. Surface to the user with:
   - The commit hash
   - The four verification numbers (28/0/47/41)
   - Confirmation phone check passed
   - What's next (Bundle 4 phone repros vs Bundle 3 mission spec)

**Do NOT auto-start Bundle 3 or Bundle 4 work.** Hand back to the
user.

---

## Failure-mode handling

If anything breaks during execution:

| Symptom | What to do |
|---|---|
| Step 1 line content doesn't match | STOP. Surface the actual line content. Don't edit. |
| `guardian-static.js` shows new errors after Step 4 | STOP. Verify allow-list.json was saved correctly. The two RC2 sites should be in `byRule['no-third-discretionary-filter-array']` |
| `guardian-runtime.js` shows new failures (beyond the 3 known) | STOP. Roll back changes (`git restore .`). Surface the new failure to the user. |
| Unit tests fail | STOP. Same — roll back, surface. |
| Phone shows banner buttons still invisible | Check whether GitHub Pages cache lag is the cause. Phone may need PWA cache clear. Force-refresh, wait 5–10 minutes, retry. |
| Phone shows banner buttons but tap does nothing | The onclick handlers haven't been broken (audit confirmed they exist). Most likely: cache. Same recovery as above. |

---

## What this prompt deliberately does NOT do

- Does not touch any Class C, D, or E bug. Those are separate bundles.
- Does not promote `no-hardcoded-survival-mode-string` or
  `no-hardcoded-debt-strategy-string` (would require fixing or
  allow-listing 28 sites — not in scope).
- Does not modify the Bills calendar logic (Class D.4 needs phone
  repro first).
- Does not generate any mission specs unilaterally.
- Does not auto-bump version, write release notes, or update README.

If the user asks for any of these as part of this ship, surface that
they're out of scope for the hygiene commit and ask whether to add
them as a follow-up.

---

## End of prompt
