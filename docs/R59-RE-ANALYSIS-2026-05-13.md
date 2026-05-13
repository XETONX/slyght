# r59 Re-Analysis — Fresh Fixture (2026-05-13)

**Context:** After r58 refreshed `state-snapshot.json` to the live phone dump (2026-05-13T10:54:56Z, bal $11.72), Layer V was re-run. This document re-reads the 42 fresh captures and separates *real* issues from *stale-fixture artefacts that have now resolved*.

---

## What dissolved with the fixture refresh

| Old finding (LAYER-V-DEEP-ANALYSIS-2026-05-13.md) | Status now |
|---|---|
| "Google Microsoft" bill name | Gone — now "Google One" |
| Settings captures (29-32) all blank | Fixed in r57 — all 4 sub-screens render |
| Payday Plan "-$688 left to allocate" | Now -$755 on fresh data — new number, same root issue (allocation < pay-amount) |

## What survived the refresh (real issues)

### 🔴 P0 — seedV18 NRMA contamination (CONFIRMED)
- **Capture:** dashboard-immediate-debts shows `NRMA KIA Insurance $1,023` with "Due 2 May" past-due flag.
- **Live phone:** NRMA is paid via Mum and NOT in `S.debts` (per `slyght_nrma_mum_flow` memory).
- **Cause:** `seedV18` migration at `index.html:13314` auto-injects NRMA on fresh localStorage if `slyght_seeded_v18` flag absent. Playwright runs fresh → flag absent → NRMA gets re-injected every capture run.
- **Fix:** Retire `seedV18` (set the flag without injecting). Captures should reflect live state, not seeded state.
- **Bundle:** 28.x or new 28.5.

### 🟡 P1 — Afterpay ghost label
- **Capture:** bills-list-monthly L1: `Afterpay - Concert Tickets (same as debt above)` with BNPL FORTNIGHTLY tag, $31.
- **State:** No Afterpay entry exists in `S.debts` (only Michael, NRMA-ghost, Mum-Bowie, Property Deposit).
- **Diagnosis:** Bill carries a `linkedDebtId` that points to a removed/migrated debt. The "(same as debt above)" suffix renders unconditionally when a link is present, even if the target doesn't exist.
- **Fix:** In bill row renderer, guard the "(same as debt above)" badge with a lookup — only show when `S.debts.find(d => d.id === bill.linkedDebtId)` resolves.

### 🟡 P1 — "Fixing testing -$564" test pollution
- **Capture:** Recent Spending list (offscreen in 03, visible in scroll captures) shows a transaction labeled "Fixing testing -$564".
- **Diagnosis:** Looks like leftover dev/debug entry in `S.txns`. Not a real spend.
- **Fix:** Add a "test-pollution sweep" diagnostic that flags suspect txn names (e.g., contains "test", "debug", "asdf"). Surface in Diagnostics screen with one-tap delete.

### 🟡 P1 — Bowie vet debt: empty notes show "Tap to edit"
- **Capture:** immediate-debts L2 right of "Borrowed from Mum for Bowie vet $218" shows literal "Tap to edit" where notes would be.
- **Compare:** Property Deposit shows actual notes preview "Managed deposit savi…"
- **Fix:** When `debt.notes` is empty, either hide that line entirely OR show muted-styled placeholder. Current "Tap to edit" in normal text-color reads like content.

### 🟢 P2 — Hero subline math sanity check
- **Capture:** dashboard-top L2: `$66 spent today · $283 in debt payments ↓ · $218 bills paid`
- **What it should mean:** today's discretionary outflow + today's debt-payment outflow + today's bill-payment outflow.
- **Open question:** What txns sum to $66 today? `$283` and `$218` are categorically tagged; the `$66` is residual discretionary. Need to verify each segment matches `groupBy(txn => txn.category)` filtered to today.
- **Action:** Add `BRAIN.audit.query({ subject: 'hero_subline', date: today })` to expose the math. Defer to bundle 29.

### 🟢 P2 — "$0 left today" footer vs Critical banner
- **Capture:** Bottom strip: `NW: +$3,153.46 · $0 left today · 2d to payday`.
- **Hero:** "CRITICAL — $11.72 left · Maximum: $0.00/day to survive · Every dollar counts right now."
- **Tension:** "$0 left today" (footer) ≠ "$11.72 left" (hero). Hero shows total balance; footer shows allocated daily budget. Both are technically correct but visually contradict.
- **Fix:** Footer copy could be "$0 today's budget" or "$11.72 total · $0/day". Investigate before rewording.

### 🟢 P2 — "Bills won't clear. You're -$19 short before payday."
- **Capture:** dashboard-top below CRITICAL banner.
- **Math:** This week $4,022 − balance $11.72 = -$4,010.28. The "-$19 short" must be after-payday math: payday + balance − bills_until_next_payday_clear.
- **Action:** Verify which projection horizon "before payday" refers to. If it's "today→payday" then -$19 = $11.72 + payday_in − bills. Document the formula in code comment near banner emit.

---

## New observations on Strategies / Diagnostics

### Strategies (cap 30)
- **Weekday $30 / Weekend $100** budgets — defines "max per day".
- **Avalanche** payoff strategy. Description: "Avalanche: pay highest interest rate first. Saves the most money long-term."
- ⚠️ Helper text rendered as `long–term` with en-dash (U+2013). Likely a unicode smart-quote pass; harmless.

### Data & Backup (cap 31)
- **Round-ups enabled → China Holiday** destination. "Adds cents from every spend to your goal."
- Last snapshot: 13 May, 10:00 pm · 1 stored. Snapshot cap concern (per `slyght_data_lifecycle_architecture`) — fixture cap is 1 entry; if a user takes a 2nd snapshot the 1st is evicted. Architecturally noted but not P1.
- Export/Import surfaces work as expected.

### Diagnostics (cap 32)
- All 16 math invariants passing.
- UX Score 95 / 5 taps this session.
- ⚠️ Soft warning: "Low scroll on pg-spend (3%) — key info may need moving higher". Pre-existing copy; not blocking.
- "Most used: 1$3✓, + Add savings (1×), × (1×)" — formatting bug. The `1$3✓` looks corrupted (probably mojibake for a button label). Worth grepping `pg-most-used` rendering code.

---

## Recommended r60+ scope (rescoped from prior plan)

After the refresh, the original r59-r63 plan is partially obsoleted. Refined order:

1. **r60 — seedV18 retirement** (P0). Stops every Layer V run from injecting NRMA. Affects fixture truth and future bug investigation accuracy.
2. **r61 — Afterpay ghost label + Bowie notes UX + test-pollution sweep** (P1 bundle).
3. **r62 — Hero subline + footer copy reconciliation** (P2 UX bundle).
4. **r63 — Diagnostics "most used" formatting bug** (small).
5. **r64+ — pull from existing bundle backlog** (Bundle 16.1, 22.x Quick Log freq, Bundle 23 cloud sync).

The **trip "your share" copy** and **-$688 / -$755 allocation gap** items from the prior analysis remain valid but are deferred to dedicated PLAN-mode work (Bundle 28.x already scoped per `slyght_bundle_28_scoped`).

---

## Confidence labels

- **Confirmed (saw bytes):** seedV18 NRMA contamination, Settings IA captures rendering, fixture date.
- **High-confidence (visual but unverified in code):** Afterpay ghost label, Bowie notes placeholder, test-pollution txn.
- **Needs code verification before fix:** Hero subline math, "Bills won't clear -$19", Diagnostics "Most used" mojibake.

Task #44 complete. Moving to task #45 — formal rescope and pick the first r60 fix (seedV18 retirement).
