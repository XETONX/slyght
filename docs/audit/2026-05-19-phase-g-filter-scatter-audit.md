# Phase G — Filter-scatter audit (investigation only)

**Date:** 2026-05-19
**Status:** Investigation. NO CODE CHANGE. Phase G implementation changes user-visible numbers (wrong → right delta), which is John's values judgment per the autonomous-scope contract. This doc maps the divergence + proposes a unified helper for John to sign off.
**Bundles closed transitively:** OPEN-BUGS #6B + #7 + #8 + #17 (four bugs collapse to one root cause).

---

## Root cause

slyght has **at least four subtly different "discretionary spend" filters** scattered across renderers + analysis helpers. Each looks correct in isolation but produces different numbers for the same conceptual question. John has surfaced the cross-tile coherence issue most visibly as #17 ("three renderers, three different values for today's spend").

The canonical helper `computeSpentInRange(fromTs, toTs)` at `index.html:3403` already exists. It encodes the strict-discretionary semantics:

```js
!t.income && !_NON_SPEND_CATS.has(t.cat) && !t._isCorrection && !t._isRoundup
```

But **15+ surfaces bypass it and re-filter inline**, with subtle variations that diverge.

---

## Filter variants observed in the wild

Catalog of the distinct filter shapes in `index.html`:

### Variant A — strict_discretionary (canonical)
```js
!t.income && !_NON_SPEND_CATS.has(t.cat) && !t._isCorrection && !t._isRoundup
```
**Used by:** `computeSpentInRange` (`:3403`), `getDiscretionaryByCategory` (`:3446`), `todayTxnsCanonical` (`:3485`), `computeSpentToday` (`:3463`), `getTodaySpent` (`:3468`), `getDiscretionarySpend` (`:3450`)
**Semantics:** "what's discretionary spend I could cut"

### Variant B — all_outflows
```js
!t.income && !t._isCorrection && !t._isRoundup
```
**Used by:** `getAllOutflowsByCategory` (`:3428`), the post-paid-cascade tile (`:2982`), MI-15 sanity check (`:9559`), one diagnostics inventory (`:23898`)
**Semantics:** "every dollar that left the account" — INCLUDES Bills, Debt repayment, Savings, Transfer, Loan, CC Payment
**Where it appears:** sometimes-intentional (Analysis "where did my money go"), sometimes-bug (MAX-PER-DAY may be reading the wider filter and inflating numbers — OPEN-BUGS #8 candidate)

### Variant C — strict_discretionary_with_fallback (`||'Other'`)
```js
!t.income && !_NON_SPEND_CATS.has(t.cat || 'Other')
```
**Used by:** `:5835` (renderTrend?), `:5836`, `:5910`, `:14442` (`mtdDiscretionary`), `:17073`, `:17107`, `:17114`, `:17247`, `:18093`
**Semantics:** "what's discretionary" — but **drops the !_isCorrection + !_isRoundup guards** in some sites.
**Drift:** corrections + round-ups now COUNT toward "discretionary" in 9 surfaces. Specific impact:
- Round-up siblings ($0.40, $0.60, etc) silently inflate the discretionary total by ~$0.50 per logged expense
- Balance corrections (negative or positive deltas from reconciliation) drop into a category bucket and skew it
- Over a month of usage with weekly reconciliation, the drift compounds to tens of dollars

### Variant D — half_canonical (drops _isRoundup, keeps _isCorrection check)
```js
!t.income && !_NON_SPEND_CATS.has(t.cat||'Other') && !t._isCorrection
```
**Used by:** `:5835`/`:5836` (`renderCatBreakdown`?), `:5910` (Trend)
**Semantics:** "discretionary, excluding corrections"
**Drift vs Variant A:** counts round-up siblings ($0.30-$0.70 each). For a user who logs 20+ expenses/month with round-ups enabled (John's pattern), this overstates discretionary by ~$10/month per pollution site.

### Variant E — non-spend-cats inverted (the post-paid-cascade pattern at `:2984`)
```js
allTodayTxns.filter(t => _NON_SPEND_CATS && _NON_SPEND_CATS.has(t.cat || ''))
```
**Used by:** `:2985`
**Semantics:** "today's BILLS-paid total" — used to compute the post-paid hero subtitle. Inverse of variant A; ALWAYS uses _NON_SPEND_CATS but on `t.cat || ''` (not `|| 'Other'`).
**Drift vs A:** legitimate use case but the empty-string fallback differs from variant C's `||'Other'`. Means a txn with `t.cat = ''` matches differently across surfaces.

---

## Mapped to OPEN-BUGS

### #6 part-B — Strict `_NON_SPEND_CATS` migration for Essential vs Discretionary classifier
**Symptom:** Analysis tab's Essential vs Discretionary tile uses one classifier; other surfaces use another. User sees different category boundaries on different screens.
**Root:** Variants A/C/D coexist. Variant C drops the `_isCorrection`/`_isRoundup` guards inconsistently.
**Resolution:** all Analysis-tier surfaces route through `BRAIN.txn.filterDiscretionary(...)`.

### #7 — `renderCutSliders` all-time vs monthly baseline
**Symptom:** Cut sliders ("you could save $X if you cut Y") use an all-time discretionary baseline, but the displayed monthly target uses a cycle-bound figure. Numbers don't reconcile.
**Root:** `renderCutSliders` calls `getDiscretionaryByCategory` (variant A) WITHOUT a `fromTs` bound, defaulting to all-time. Then renders against a per-cycle target.
**Resolution:** pass canonical `(cycleStart, now)` range. Same call site, one-line fix once the unified helper is canonical.

### #8 — Dashboard "running over/under pace" lax filter
**Symptom:** Dashboard pace tile flags overspend even on heavy bill-payment days when no real discretionary spike happened.
**Root:** the pace computation uses variant B (`all_outflows`) which counts Bills/Debts as "spending." Bill payments push the pace tile into "over."
**Resolution:** switch to variant A semantics — pace measures discretionary only.

### #17 — Cross-tile "today's spend" coherence (three renderers, three values)
**Symptom:** Dashboard footer says "$24 today" · hero subtitle says "$78 today" · Analysis today-tile says "$54 today." Same time, different numbers.
**Root:** Footer uses `getTodayDiscretionarySpend` (variant A — clean). Hero post-paid uses the `:2982` pattern (variant B — counts bills) + the `:2985` pattern (variant E — counts bills explicitly as a sub-total). Analysis uses variant C with `||'Other'` fallback in one place.
**Resolution:** unified helper with explicit "include-bills" / "exclude-bills" mode parameter.

---

## Proposed unified helper (for Phase G implementation)

Add to `BRAIN.transaction` (the existing bubble):

```js
// Canonical txn filter — one source of truth for spend-window queries.
// Replaces 15+ inline filter expressions with a single semantically-clear
// API. Mode parameter encodes the four standard interpretations:
//
//   'discretionary'  — !income · !_NON_SPEND_CATS · !_isCorrection · !_isRoundup
//                      (cuttable spending; matches computeSpentInRange semantics;
//                       drives "today's spend" / pace / cut sliders / discretionary
//                       breakdown)
//   'all-outflows'   — !income · !_isCorrection · !_isRoundup
//                      (every dollar that left the account; drives Analysis
//                       "where did my money go" breakdown; includes Bills /
//                       Debt repayment / Savings / Transfer / Loan / CC Pay)
//   'bills-only'     — !income · _NON_SPEND_CATS.has(cat) · !_isCorrection · !_isRoundup
//                      (just the Bills/Loan/CC tier; used by hero post-paid
//                       subtitle to break out "bills paid today")
//   'all-debits'     — !income · !_isCorrection
//                      (includes round-ups; rare — only the audit/forensic
//                       "every recorded debit" surfaces should use this)
//
// Filters by ts range optionally. Default range = all time.
//
// Single point of truth for the four interpretations means future invariants
// can reason about which surface uses which mode (and a Guardian rule can
// flag inline-filter regressions).
filterTxns({ mode, fromTs, toTs }) {
  const from = (typeof fromTs === 'number') ? fromTs : 0;
  const to = (typeof toTs === 'number') ? toTs : Date.now();
  const txns = (S.txns || []).filter(t => t && t.ts >= from && t.ts <= to);
  switch (mode) {
    case 'discretionary':
      return txns.filter(t => !t.income && !_NON_SPEND_CATS.has(t.cat) && !t._isCorrection && !t._isRoundup);
    case 'all-outflows':
      return txns.filter(t => !t.income && !t._isCorrection && !t._isRoundup);
    case 'bills-only':
      return txns.filter(t => !t.income && _NON_SPEND_CATS.has(t.cat) && !t._isCorrection && !t._isRoundup);
    case 'all-debits':
      return txns.filter(t => !t.income && !t._isCorrection);
    default:
      throw new Error('filterTxns: unknown mode ' + mode);
  }
},

// Sum helper — chain pattern for the common case
sumTxns({ mode, fromTs, toTs }) {
  return this.filterTxns({ mode, fromTs, toTs }).reduce((s, t) => s + (+t.amt || 0), 0);
},
```

**Migration scope:** ~15 inline filter sites. Each becomes a one-line replacement. LOC impact: -200 lines (cumulatively) of duplicated filter expressions; +60 lines (writer + smoke).

**Guardian rule (anti-pattern, anchor INV-pending):** `no-inline-discretionary-filter` — scans for `!t.income.*!_NON_SPEND_CATS` patterns OUTSIDE the canonical helpers, flags as violation. Same anti-pattern shape as `no-async-roundup` (Bundle 33.x INV-31).

---

## Numbers John might see change

Phase G implementation will change displayed values on AT LEAST these surfaces:

1. **Dashboard "today's spend"** — currently inflated by ~$0.30-$2 from round-up sibling counting (variant C/D pollution). Will drop slightly after Phase G.
2. **Dashboard pace tile** — currently inflated by bill/debt payments on heavy bill days (variant B). Will drop significantly on bill-pay days.
3. **Analysis Cut sliders** — currently use all-time baseline. Will use cycle-bound (per-cycle math becomes coherent).
4. **Analysis Essentials vs Discretionary** — currently inconsistent across surfaces. Will reconcile to one source.
5. **MTD Discretionary (chat prompt + AI context)** — uses variant C with `||'Other'` fallback. Will use canonical filter.

These are all **fixing wrong → right**, not arbitrary changes. But John's values judgment per the autonomous-scope contract is: any change to user-visible numbers gets surfaced first.

---

## Phase G Implementation plan (when John approves)

1. **Pass 1.a (writer + smoke)** — add `BRAIN.transaction.filterTxns` + `sumTxns` to BRAIN.transaction. Smoke spec covers 4 modes + range filtering. Behavioral neutral (no consumer migrates yet). ~45 min.

2. **Pass 1.b (Guardian rule)** — add `no-inline-discretionary-filter` anti-pattern rule. Scan + report. Start the rule as **warning-severity** so existing 15+ sites don't block commits. Each migration commit downgrades that site's specific guardian-allow until the last site lands, then promote rule to `fail`. ~30 min.

3. **Passes 1.c-1.o (per-site migrations)** — one commit per surface. ~15 sites · ~5-10 min each. Each migration:
   - Replace inline filter with `BRAIN.transaction.filterTxns({mode, fromTs, toTs})` call
   - Surface-by-surface phone-verify (since each changes numbers)
   - Guardian rule reports decreasing violations as sites migrate

4. **Pass 2 (rule promote)** — when 0 inline-filter violations remain, promote the Guardian rule from `warn` to `fail` severity. Locks in the discipline.

5. **Invariant addition** — INV-34 candidate: "all txn-window spend queries route through `BRAIN.transaction.filterTxns` with explicit mode." Substrate-grounded; Guardian rule provides the enforcement.

**Total estimated wall-clock:** 4-6 hours across 1-2 sessions. Significant per-site phone-verify burden because each migration changes a number John sees.

---

## Risk register

- **R1:** Changing Dashboard pace tile to discretionary-only may surface that John's actual discretionary pace is HIGHER than the existing inflated number suggested. The bill-payment inflation was effectively masking the real signal. UX implication: the pace tile may become more frequently amber/red post-Phase-G. This is correct (the signal works), but feels worse.
- **R2:** Round-up sibling exclusion from variants C/D drops totals by $0.50-$2/day. Minor but visible. Some surfaces may need a "$0.50 less than yesterday's display" disclaimer in audit-log if the change is jarring.
- **R3:** Migration order matters — if some sites migrate to canonical filter while others stay on variant C, the cross-tile coherence problem WORSENS temporarily (sites disagree more, not less). Must commit per surface AND complete the migration before publishing each commit's deploy.

**Mitigation:** sequence the migrations within ONE session, defer push until all 15 sites are migrated. Single git tag for the cutover. Then announce to John: "Numbers may shift slightly on these N surfaces — here's what changed and why."

---

## Decision needed from John

1. **Approve the unified-helper shape?** (A/B/C/D modes — or refine the taxonomy)
2. **Approve the migration cadence?** (one big cutover commit · or trickle-migrate over multiple sessions with cross-tile-coherence temporarily worse)
3. **Approve the new invariant INV-34?** (locks in the canonical filter discipline post-migration)
4. **Approve the warning → fail promotion path for the Guardian rule?**

If approved, Phase G ships as a multi-commit bundle (likely Bundle 33.0 or 32.9). If pushed back, this audit remains the canonical reference document for future filter work; the divergence stays in place until then.

---

**End of Phase G audit. No code shipped. Waiting on John's values call.**
