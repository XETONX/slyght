# Claude Code Ship Prompt — Bundles 9 + 10

## Standing Discipline (applies to every step)

**Pre-authorised decisions — do NOT surface, just resolve:**
- Build artifacts (`audit/allow-list.json`, `runtime-report.json`) → `git checkout --` them
- Guardian rule fires on canonical helper itself → inline `guardian-allow: <rule>` with `(permanent — ...)` tag
- Tests fail because assertion targeted removed code → comment out assertion, note in handoff ERRORS line
- Cron trigger conflicts → swap unused slot, don't add (free-tier ceiling = 5)

**Surface required (STOP and ask):**
- Unmigrated parallel store discovered mid-session
- Money-math behavior change (balance/NW/debt totals)
- Anything ambiguous about user intent
- Adjacent bubble migration debt — log don't fix (passive antibiotic mode)

**Handoff format v2 (terse):**
```
=== HANDOFF ===
COMMIT: <hash> <subject>
HEAD: <old> → <new>
DIFF: <file>: +N/-M
VERIFY: static <result>, runtime <p>/<t>, tests <p>/<t>
DEVIATIONS: <one-line per deviation, "none" if clean>
ERRORS: <STOP-and-discuss items + unexpected fires, "none" if clean>
VERIFY-CHANNEL: phone | laptop | skip
TESTS: <terse list — must-pass items + criteria>
=== END ===
```

---

## Step 0 — Read the architecture spec, give feedback

A new file `BRAIN_ARCHITECTURE.md` is included in this session's
context. Read it. It documents the layer model, bubble inventory,
migration pattern, naming conventions, and discipline rules — most
of which you and the user have already established in code, this
just writes them down.

**At end of the spec are 5 open questions seeking your read.** After
this prompt's commits ship, surface your feedback on those 5
questions in the final handoff. Do not modify the spec mid-session —
the user reviews your feedback first, then locks v1.

The spec is the north star for Bundle 10 and beyond. Refer to it
when seeding `BRAIN.dashboard` in Step 2.

---

## Step 1 — Bundle 9 (Housekeeping)

Single commit. ~15 min. No phone-verify (no user-visible change).

### 1.1 Pre-flight

```
git status
git log --oneline -5
git pull origin main
```

HEAD `f9a2b2d` (Bundle 8). Working tree clean (discard artifacts per
standing discipline).

### 1.2 Close resolved OPEN-BUGS entries

For each entry below, update Status field. Do NOT delete entries.

**#2 — Projected to run out off-by-one**
Status: `fixed (Bundle 5 — commit 2ce9765)`

**#4 — "+ Add Debt" button broken**
User confirmed working 2026-05-11. Status:
`cannot-reproduce (Bundle 7.2.x cycle organically resolved; user added Borrowed-from-Michael $500 successfully 2026-05-11)`

**#14 — NW notification spam**
Status: `fixed (Bundle 7.2 — notification removed entirely; semantics never matched user expectation; commit 95cdcac)`

**#23 — MI-13 fires on auto-debit pattern**
Status: `fixed (Bundle 7 commit b28c631 — _scheduledAutoDebit flag + 3-way mark-paid modal; Bundle 7.2.3 strengthened with _txnMatchesBillStrict + _billUnmarkLog respecting user un-marks)`

**#40 — Bill modal "Already paid" button does nothing**
Status: `fixed (Bundle 7.2.2 — routes through Quick Log; commit 6c133f2)`

### 1.3 Delete the 3 dead `.saved` writes

CC's Bundle 8 handoff flagged these as cleanup candidates. They're
harmless (PLAN.saveTrip/saveGoal strip them at storage boundary)
but they confuse future grep-audits of `\.saved\s*=`.

**Audit first:**
```
grep -n "trip\.saved\s*=\|goal\.saved\s*=\|apGoal\.saved\s*=" index.html
```

Should return 3 matches. For each, delete the line. Surrounding
context tells you whether anything else depends on it (shouldn't).
If anything depends — surface, don't delete.

### 1.4 Document structured paidBills shape

Find the canonical reader. Content-search:
```
grep -n "function isPaidBillKeyTruthy" index.html
```

Above it, add a multi-line comment documenting the shape contract:

```js
// paidBills entry shape contract (post Bundle 7.2.4):
//   Legacy:    S.paidBills[key] === true
//   Structured: S.paidBills[key] === {
//     paid: true,
//     ts: number,           // when marker was created
//     _txnTs?: number,      // back-ref to paired S.txns entry for reversible undo
//     _scheduledAutoDebit?: true   // flag so MI-13 ignores this future-dated entry
//   }
// isPaidBillKeyTruthy accepts both. isPaidBillAutoDebit checks the flag.
// state-shape-paidbills invariant validates the shape on every render (Bundle 7.1).
```

### 1.5 Add architecture doc to repo root

Move `BRAIN_ARCHITECTURE.md` from session context to repo root.
This makes it discoverable by future CC sessions.

```
# CC will have BRAIN_ARCHITECTURE.md provided in session context.
# Save it to: C:\Users\admin\slyght\BRAIN_ARCHITECTURE.md
```

Add a reference to it at the top of `index.html` (right after the
`<!DOCTYPE html>` line) as an HTML comment:

```html
<!--
  SLYGHT Architecture: see BRAIN_ARCHITECTURE.md in repo root.
  Bubbles report to BRAIN. BRAIN is the single source of truth.
  No direct S mutation outside canonical BRAIN.<bubble>.<verb>() helpers.
-->
```

### 1.6 Validation + commit

```
node guardian-static.js
node guardian-runtime.js
node tests/core.test.js
```

Commit:
```
git add index.html OPEN-BUGS.md BRAIN_ARCHITECTURE.md
git commit -m "chore(9): close resolved bugs + drop dead writes + document BRAIN architecture

Housekeeping bundle ahead of BRAIN.dashboard work:

- OPEN-BUGS status updated: #2, #4, #14, #23, #40 marked
  fixed/cannot-reproduce with commit refs
- Removed 3 dead trip.saved/goal.saved/apGoal.saved direct writes
  flagged by Bundle 8 (PLAN.saveTrip/saveGoal strip them at storage
  boundary — harmless but confused future grep audits)
- paidBills structured-entry shape documented inline above
  isPaidBillKeyTruthy (legacy true + {paid, ts, _txnTs?,
  _scheduledAutoDebit?})
- BRAIN_ARCHITECTURE.md added to repo root as north star spec for
  layered architecture. Bubble inventory, migration pattern, source
  tag vocabulary, strangler antibiotic discipline.

No behavior change. No phone-verify required.
Verification: static <r>, runtime <p>/<t>, tests <p>/<t>."
git push origin main
```

---

## Step 2 — Bundle 10 (BRAIN.dashboard seed via today-spend coherence)

Single commit. ~45 min. Phone-verify required (user-visible numbers).

### 2.1 OPEN-BUGS #17 context

User's reported repro from 2026-05-05:
- Footer strip: "$22 today"
- Dashboard alert: "Over by $44 today"
- Analysis tab: "$74.09"

Same concept, three numbers, each authoritative. Root: each
renderer computes its own version with a slightly different filter.

### 2.2 Audit — find all "today's spend" render sites

```
grep -n "spent today\|spentToday\|today.*spent\|today.*spend\|todaySpent" index.html
grep -n "getTodaySpent\|computeSpentToday\|getTodayDiscretionarySpend" index.html
grep -n "strip-maxday\|cal-day-amt\|MODEL.todaySpent" index.html
```

**Surface findings in this format:**
```
RENDERER 1: <function name> at L<line>
  Computation: <what it calls or computes inline>
  Display: <where it shows up — footer / dashboard tile / analysis>

RENDERER 2: ...
```

Expect 3-5 sites. Likely:
- Footer strip (`strip-maxday` or sibling)
- Dashboard "Over by $X today" alert
- Analysis pivot today-row
- Possibly a "$X spent today" hero copy line
- MODEL.todaySpent (cached computation)

**STOP after audit.** Wait for user to confirm canonical behavior
before migrating.

### 2.3 Seed `BRAIN.dashboard`

`BRAIN.savings` and `BRAIN.audit` exist (Bundle 8). Add a new
sibling: `BRAIN.dashboard`.

Find where BRAIN is defined (around L10665 per Bundle 8 handoff).
Add adjacent to existing bubbles:

```js
BRAIN.dashboard = {
  // Bundle 10: canonical "today's discretionary spend" for ALL
  // surfaces (footer strip, dashboard alert, analysis today-row,
  // hero copy). Single function eliminates the three-tile drift
  // documented in OPEN-BUGS #17.
  //
  // Delegates to existing canonical computeSpentToday() which uses
  // computeSpentInRange + _NON_SPEND_CATS filter (excludes income,
  // bills/transfer/savings/loans/CC payments, corrections, roundups).
  //
  // Optional now param for testing with frozen time.
  todaySpend(now) {
    return (typeof computeSpentToday === 'function')
      ? computeSpentToday(now)
      : 0;
  },

  // Cycle total — for "$X this cycle" hero fallback.
  cycleSpend() {
    return (typeof MODEL !== 'undefined' && MODEL && typeof MODEL.cycleSpent === 'number')
      ? MODEL.cycleSpent
      : 0;
  },

  // Week total — for "Running $X over pace this week" alert.
  weekSpend() {
    return (typeof MODEL !== 'undefined' && MODEL && typeof MODEL.weekSpent === 'number')
      ? MODEL.weekSpent
      : 0;
  }
};
```

### 2.4 Migrate render sites

For each renderer surfaced in 2.2, replace its today-spend
computation with `BRAIN.dashboard.todaySpend()`. Surface proposed
changes per site before applying:

```
Site X: <function> at L<line>
  Before: <existing line>
  After:  const todaySpent = BRAIN.dashboard.todaySpend();
```

User reviews list, gives go-ahead, then apply.

**Do NOT migrate** sites that intentionally use different filters
(e.g., `getTodayDiscretionarySpend` alias for "Over by" alert if it
ever diverges in scope). If a site has a legitimate reason to differ,
leave it AND document the divergence in a comment.

### 2.5 Add guardian rule

Edit `guardian-static.js`. Add a rule parallel to
`no-direct-bucket-saved-write`:

```js
{
  name: 'no-inline-todayspend-computation',
  anchor: 'arch-barrier-bundle-10',
  tier: 'fail',
  description: 'Inline today-spend computation forbidden — use BRAIN.dashboard.todaySpend()',
  // Detect inline filters that look like today-spend computation
  // (Date setHours(0,0,0,0) + ts >= start filter pattern)
  pattern: /setHours\s*\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)[\s\S]{0,200}t\.ts\s*>=/,
  // allow inline guardian-allow comments
}
```

Surface the rule definition to user before adding — pattern may need
refinement to avoid false positives in `computeSpentInRange` itself
(which is the canonical implementation under BRAIN.dashboard).

After rule in place:
```
node guardian-static.js
```

Expected: any unmigrated sites trip the rule. Migrated sites either
use `BRAIN.dashboard.todaySpend()` or have inline `guardian-allow:`
for specific reasons. If false positives — surface, refine pattern.

### 2.6 Validation + commit

```
node guardian-static.js
node guardian-runtime.js
node tests/core.test.js
```

Commit:
```
git add index.html guardian-static.js
git commit -m "arch(10): BRAIN.dashboard seed + canonical todaySpend()

Second BRAIN bubble seeded (after BRAIN.savings in Bundle 8). Fixes
OPEN-BUGS #17 three-tile today-spend coherence drift.

BRAIN.dashboard.todaySpend():
- Single source of truth for 'today's discretionary spend' across
  footer strip, dashboard 'Over by X today' alert, Analysis pivot,
  and hero copy.
- Delegates to existing canonical computeSpentToday() — no new math,
  just one entry point.
- N renderers migrated: <list with line numbers>

BRAIN.dashboard.cycleSpend() and weekSpend():
- Companion readers for hero fallback + 'over pace this week'.
- Delegate to MODEL cached values.

no-inline-todayspend-computation guardian rule:
- Static check fails on inline setHours(0,0,0,0) + ts>=start filter
  patterns outside BRAIN.dashboard or guardian-allow.
- Future renderers can't accidentally fork the computation.

OPEN-BUGS #17 closed in this commit.

Verification: static <r>, runtime <p>/<t>, tests <p>/<t>.
Phone-verify: footer, dashboard alert, analysis all show same
today-spend number."
git push origin main
```

### 2.7 Phone-verify

| # | Test | Criteria |
|---|------|----------|
| 10.A | Footer strip "$X today" | Matches dashboard "$X spent today" hero |
| 10.B | Dashboard alert "Over by $X today" (if firing) | Numeric value matches 10.A's "spent today" |
| 10.C | Analysis tab today-row | Matches 10.A |
| 10.D | Round-up logged on a fresh txn | "today's spend" does NOT change (round-ups excluded per existing filter) |
| 10.E | Debt repayment logged | "today's spend" does NOT change (debt repayment excluded) |

A/B/C must all show the same number. D and E confirm the filter
still excludes the right categories. Any divergence → surface.

---

## Step 3 — Final Handoff

Single combined handoff covering both Bundle 9 and Bundle 10. Use
the v2 format defined in Standing Discipline.

**Additionally surface BRAIN_ARCHITECTURE.md feedback** as a
separate block at end of handoff:

```
=== BRAIN_ARCHITECTURE.md FEEDBACK ===
Q1 (Bubble boundaries): <your read>
Q2 (Free-standing modules — PLAN/MODEL/NOTIFY/CHARACTER): <your read>
Q3 (Cross-bubble communication — direct vs events): <your read>
Q4 (Audit log retention — 500 cap, shard or not): <your read>
Q5 (Migration ordering — Bills first or Transaction first): <your read>
GENERAL: <anything else you'd change about the spec>
=== END FEEDBACK ===
```

User reviews feedback, then locks the spec.

---

## End of prompt
