# MISSION: FOUNDATION AUDIT (Phase 1 of 2)

## Read-only. No code changes. No git operations. Pure investigation.

You are auditing SLYGHT (`C:\Users\admin\slyght\index.html`, ~10,028 lines) before a
ground-up calculation-layer rebuild.

The user (John) has lost trust in the app's numbers. The dashboard, calendar,
bills tab, and AI chat all calculate financial figures independently from
the raw `S` state, and they contradict each other. Example bug currently
visible: calendar shows May 1 as needing $512 (Teachers Health debt $259
PLUS Health Insurance bill $119 — double-counted, even though the debt
covers the bill).

The fix is to introduce a **single computed model layer** between `S` and
the UI. But before we build that, we need a complete map of the disease.

## The Mum Test (design lens)

Every screen, tile, and number in this app must pass this test:

> "Could John sit his mum down at the kitchen table, point at this screen,
> and explain in one sentence what the number means, where it came from,
> and why it's correct — without flinching, caveating, or apologising?"

If a screen fails the Mum Test, it either gets fixed or it gets cut.

## What I want from you

Produce a single markdown report at `C:\Users\admin\slyght\AUDIT-FOUNDATION.md`
with the following sections. Be brutal. Be specific. Quote line numbers.
Do not soften findings to be polite. John is paying for an honest read.

---

### SECTION 1 — CALCULATION ARCHAEOLOGY

For each of the following financial figures, find EVERY place in
`index.html` and `slyght-worker/src/index.js` where it is computed,
and list them with line numbers and a 1-line description of how
each one calculates it:

1. Daily safe-to-spend (e.g. $23.82/day)
2. Days to payday
3. Liquid net worth
4. Total net worth
5. Bills due this week
6. Bills due before payday
7. Debts due before payday
8. Survival mode (survival/tight/cautious/normal)
9. Discretionary spend last 7 days
10. China holiday saved amount
11. Darwin trip saved amount
12. Mum account balance display
13. WRX value display
14. Super balance display
15. Weekly snapshot total
16. Calendar entries per date
17. The number shown on May 1 in calendar
18. The number shown on May 1 in bills tab
19. The number Jarvis quotes when asked "how much can I spend today"
20. The number on the dashboard hero "safe to spend" card

For EACH of the 20, end with a verdict:
  **AGREES** with the canonical calc, or
  **DISAGREES** (and quote the exact discrepancy)

---

### SECTION 2 — DEBT VS BILL COLLISIONS

The Teachers Health bug (debt $259 + bill $119 double-counted on May 1)
is one example. Find ALL other places where:

- A debt and a bill represent the same underlying obligation
- A debt's `delayDate` falls in the same month as a recurring bill of
  similar name/amount/category
- A paid bill is still appearing in any tile, calendar, or forecast
- A debt marked paid is still appearing somewhere

For each collision, describe:
- Where it's displayed
- What the user sees
- What the user SHOULD see
- Which calculation is the offender

---

### SECTION 3 — SOURCE-OF-TRUTH AUDIT

For every UI tile/card/section in the app, document:

| Section | Reads from | Number(s) shown | Calculation function | Trust verdict |
|---|---|---|---|---|

Trust verdict scale:
- ✅ TRUSTED — single canonical source, correct for all states
- ⚠️ FRAGILE — works but only because of coincidence, edge cases will break it
- ❌ BROKEN — known to be wrong in current state
- 👻 GHOST — calculates from stale or duplicated state

Be exhaustive. Every visible number gets a row.

---

### SECTION 4 — DEAD CODE & DUPLICATION

List:

1. Every function defined more than once (function name + line numbers)
2. Every function defined but never called (function name + line)
3. Every variable declared but never read
4. Every block of HTML rendered but hidden by CSS that's never toggled on
5. Every modal that exists in HTML but has no opener
6. Every event listener bound to elements that no longer exist
7. `console.log` statements left in production code
8. TODO / FIXME / XXX comments
9. Hardcoded values that should be reading from `S` (income, balances,
   dates, names, debts)
10. Migrations that have already run for John but still execute on every load

---

### SECTION 5 — THE FEATURE USAGE READ

For each major feature listed below, give a verdict on whether it
should STAY, SIMPLIFY, or CUT, based on:
- Code complexity vs apparent use
- Whether the calculation it performs is correct
- Whether it overlaps with another feature
- Whether it passes the Mum Test (can John explain it to his mum
  in one sentence with full confidence in the number)

Features to evaluate:
1. Dashboard hero balance card
2. Liquid net worth tile
3. Total net worth (in Plan Mode)
4. Payday progress bar
5. Survival banner
6. Weekly snapshot
7. Safe-to-spend-today card
8. Immediate debts list
9. Recent transactions
10. Calendar tab
11. Bills tab grouped view
12. Bills "this week" subview
13. Spending pivot
14. Goal tracker
15. SLYGHT Score
16. Survival forecast card
17. Daily Character Score
18. AI chat (Jarvis)
19. Plan Mode trip cards (Darwin, China)
20. Plan Mode payday allocation sliders
21. Plan Mode super card
22. Plan Mode WRX card
23. Mum account card
24. Round-up to China bucket
25. WFH toggle
26. Receipt scanner (if present)
27. Smart Select / screenshot import (if present)
28. Opal calculator (if present)
29. Mood tagging (if present)
30. Notifications (any & all)
31. Snapshot copy button
32. Bonus modal
33. Plan Modal
34. Settings tab — every field individually

For each: STAY / SIMPLIFY / CUT + one-line reason.

---

### SECTION 6 — THE COMPUTED MODEL DESIGN PROPOSAL

After the audit, propose the shape of the single computed model layer.

Specifically:

1. What function name? (e.g. `computeFinancialModel(S)` or `getModel()`)
2. When does it run? (every state change, debounced, on demand?)
3. What does it return? Write the full TypeScript-style interface
   describing every field the UI will consume. Example:
   ```
   interface FinancialModel {
     liquidNet: number
     totalNet: number
     daysToPayday: number
     safeToSpendToday: number
     survivalMode: 'survival' | 'tight' | 'cautious' | 'normal'
     billsBeforePayday: BillEntry[]    // already deduped vs debts
     debtsBeforePayday: DebtEntry[]    // already deduped vs bills
     calendarEntries: Map<DateISO, CalendarEntry>
     // ... etc — be exhaustive
   }
   ```
4. Which existing functions become OBSOLETE once this exists? List them
   for deletion.
5. What's the migration order? (which UI elements convert first, which last,
   and why)
6. Where does it live in the file? (top of `<script>`, before render
   functions, before BILLS array, etc.)
7. How do we test it? Propose 5-10 unit tests for `tests/core.test.js`
   that would catch the May 1 double-count bug if it ever returned.

---

### SECTION 7 — THE KILL LIST

Based on everything above, propose for John's review:

**Recommended deletions** (with line counts saved):
- Code that's dead
- Features that fail the Mum Test
- Duplicate calculation functions
- HTML/CSS for hidden features
- Migrations that have completed

**Recommended consolidations:**
- Pairs/groups of functions that should become one
- Tiles that show the same info in different shapes

**Recommended renames:**
- Functions whose names lie about what they do
- Variables whose names are stale (e.g. references to old features)

**Estimated total line reduction:** X lines (~Y% of codebase)

---

### SECTION 8 — THE BLAST RADIUS

If we do all the recommended changes:

1. What breaks first session if we get it wrong?
2. What's the safest order to apply the changes?
3. Which guardian checks would need updating?
4. Which unit tests would need rewriting?
5. What's the rollback plan if it goes sideways?

---

## Constraints for this audit

- **No code changes.** Read-only. If you find a bug so bad you want to
  fix it, write it in the report instead.
- **No `git add` / `commit` / `push`.**
- **Do not run guardian or tests.** Just read.
- **Do not start designing fixes outside the model layer proposal in
  Section 6.** This audit is for diagnosing, not building.
- **Quote line numbers for everything.** "Around line 4500" is not
  acceptable. "Line 4523, in `getDynamicDailyBudget()`" is.
- **Do not be diplomatic.** John has explicitly asked for a brutal read.
  Soft language wastes his $300.

## Deliverable

A single file: `C:\Users\admin\slyght\AUDIT-FOUNDATION.md`

When done, print:
```
AUDIT COMPLETE
- Sections written: 8/8
- Total findings: N
- Recommended deletions: ~X lines
- Calculation contradictions found: N
- Mum Test failures: N
- Awaiting John's review before Phase 2.
```

## Run with

```
Read C:\Users\admin\slyght\MISSION-FOUNDATION-AUDIT.md and execute it 
exactly. Read-only investigation. Produce AUDIT-FOUNDATION.md. Do NOT 
modify any code. Do NOT run guardian or tests. Do NOT git anything. 
Just read, think, and write the report.
```
