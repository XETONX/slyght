# MISSION: BILL STATE LIFECYCLE (Mission B)

## Why this mission exists

John walked the phone after Layer 2 shipped (commit 9a316d3) and 
identified bill-related issues that Layer 2's MI-13 invariant is 
now actively firing on. Five OPEN-BUGS scope into this mission:

- **#1** — Bills can be marked "paid" before their day-of-month 
  hits. Current state has KIA Loan (day 15) marked paid on May 5. 
  No gating prevents this. MI-13 fires correctly.
- **#4** — Add A Bill view in May shows fewer bills than April. 
  Either the BILLS schema has an issue, or 
  `isBillDueThisMonth`/expansion logic filters too aggressively for 
  current month. Root cause unknown.
- **#5** — Calendar shows monthly bills as dots but doesn't show 
  immediate debts (Afterpay $94 due 14 May, Borrowed from Michael 
  $500 due 16 May). The dots in calendar are amount-aggregations 
  per day, but specifically debts aren't surfaced.
- **#18** — Same as #4 (Add A Bill May completeness). Logged 
  separately during Mission D investigation.
- **#20** — Same as #5 (calendar immediate-debt markers). Logged 
  separately.

After this mission ships:
- Bills cannot be marked paid before their day-of-month
- Add A Bill view shows all recurring bills correctly for current 
  month (root cause of #4 identified and fixed)
- Calendar surfaces immediate debts as distinct markers from 
  monthly bills
- MI-13 stops firing on legitimate KIA Loan paid-early state 
  (because the underlying capability — pay early — is now gated, 
  and existing data either gets a confirm prompt or stays as-is 
  per investigation)
- Mission V baselines regenerate to reflect new dashboard/calendar 
  state (the MI-13 banner disappears, calendar shows new markers)

## Required reading before starting

1. PROJECT-EXTRACT-2026-05-05.md § 4.1 (canonical helpers — 
   `paidBillKey`, `isThisMonthlyBillPaid`, `getBillsDue`, 
   `getExpandedBills`, `isBillDueThisMonth`)
2. OPEN-BUGS.md entries #1, #4, #5, #18, #20
3. Existing Layer 2 invariants — especially MI-13 
   `paidbills-key-not-future`
4. Existing render functions for: monthly bills list (Bills tab), 
   calendar grid, Add A Bill view, mark-paid action handler
5. PROJECT-EXTRACT-2026-05-05.md § 3 (state schema for `S.BILLS`, 
   `S.paidBills`, `S.debts`)

## What to do

### Step 1 — Investigation (no code, STOP gate)

Three sub-investigations, one per bug cluster.

#### 1A — Mark-paid gating (#1)

Locate the mark-paid handler. Where in the code does the user 
action "mark this bill paid" land? Likely a click handler on a 
checkbox/button in the Bills tab list, possibly also in a swipe 
action or modal.

For each invocation site, identify:
- Function name and line number
- What state mutation it performs (likely `S.paidBills[paidBillKey(name, day)] = true`)
- Whether any current logic gates the action (probably none — 
  that's #1)

Propose the gating logic. The mission's preliminary spec was:
```
canMarkPaid(bill) === today.getDate() >= bill.day
```

But: this assumes monthly recurrence. What about quarterly bills 
(`freq: 'quarterly'`)? Annual bills (Pet Insurance — Bowtie 
appears yearly in some configs)? Yia yia gift (one-off)? Bills 
where `bill.day` falls in *next* month (rent paid in advance for 
the following month)?

Investigate the BILLS schema. List every `freq` value present. 
Propose gating logic that handles each case correctly. STOP for 
John's review on edge cases.

UX question to surface: when user taps "mark paid" on a bill that 
fails the gate (e.g., KIA Loan day 15 on May 5), what happens? 
Three options:
- (a) Reject silently (button does nothing, possibly a toast)
- (b) Confirm dialog: "This bill isn't due until day 15. Pay 
  early?" → yes proceeds, no cancels
- (c) Block hard with explanation: "Cannot mark paid before due date"

The current state has KIA Loan day-15 paid early, suggesting John 
sometimes does pay early intentionally. **Option (b) is the 
recommended default** — preserves the user's ability to pay 
early, makes it explicit, prevents accidents. Confirm during 
investigation.

#### 1B — Add A Bill view completeness (#4, #18)

Open the Add A Bill view (or "edit bills" view, wherever the BILLS 
list is rendered for editing). Identify the render function.

Compare what's rendered for May (current month) vs April. Capture 
specifically: which bills appear in the April list? Which appear 
in May? What's the diff?

Dig into the render logic:
- Does it filter by month at all? If so, why and how?
- Is there an `isBillDueThisMonth` call that excludes some bills?
- Does the BILLS array itself differ — i.e., were bills added or 
  removed in some way that's date-conditional?
- Are recurring bills with `freq: 'quarterly'` or `freq: 'annual'` 
  hidden in months they're not due?

Propose root cause. Three plausible categories:
- (i) BILLS schema mutation across months (real bug, fix data flow)
- (ii) Render filter too aggressive (real bug, fix filter logic)
- (iii) Intentional "show only due-this-month" filter that John 
  wants disabled (UX decision, change rendering)

Propose fix path based on root cause. Surface for John before 
implementing.

#### 1C — Calendar immediate-debt markers (#5, #20)

Locate the calendar render function (`buildCalendarEntries` per 
PROJECT-EXTRACT, or whatever produces the dots in the calendar 
grid).

Currently each day-cell shows: monthly bills due that day with 
amount and a colored dot. Investigate:
- Does the calendar already iterate over `S.debts`?
- If yes, where do the entries land (and why aren't they 
  visible)?
- If no, what's the cleanest insertion point to add immediate 
  debts as additional markers?

Propose marker design. Two reasonable options:
- (a) Different color/icon for debts vs bills (e.g., 🔴 dot for 
  bill, 🔥 dot for debt, or color differentiation)
- (b) Same dot, single legend entry covers both ("due this day")

I lean (a) — debts and bills are conceptually different (one is 
recurring obligation, the other is one-off owed money). Surfacing 
them differently helps the user prioritize. Confirm during 
investigation.

Edge case to investigate: the `viaRent` debts (Property Deposit 
via Mum, Borrowed from Michael with `viaRent: true`) — should 
these appear on calendar at all? They're not really "debts due on 
a specific day" in the same sense. Check the existing code's 
treatment, propose.

### Step 1 deliverables

After all three sub-investigations complete:

1. Print findings table covering all three areas
2. Propose specific implementation plans for each
3. Flag any cross-cutting concerns (e.g., does the mark-paid 
   gating change affect MI-13's firing? Yes — once gating is in 
   place, future paid-early actions get either rejected or 
   confirmed, but existing paid-early state from before the gate 
   stays. MI-13 would still fire on existing paid-early data 
   until John resolves it via UI. Surface this.)
4. STOP for John's review

### Step 2 — Implement (after Step 1 approval)

In order, smallest blast radius first:

1. **Calendar immediate-debt markers** (lowest risk — purely 
   additive rendering)
2. **Add A Bill completeness** (renderer change, no state 
   mutation)
3. **Mark-paid gating** (highest risk — adds confirm dialog, 
   changes user action flow)

After each change:
```
npm run guardian-static
npm test
npm run visual    # likely shows expected diffs; review
```

Visual diffs are expected on calendar (new markers) and 
potentially Bills tab (if MI-13 banner state changes due to data 
not changing — which it shouldn't from this commit alone). Treat 
diffs as expected, run `npm run visual:update`, commit baselines 
along with the change.

### Step 3 — Verify

```
npm run guardian-static    → exit 0
npm test                   → 35/35 passing
npm run visual             → 4/4 passing OR diffs reviewed and 
                              accepted via visual:update
npm run guardian           → all gates green
```

On phone after deploy:
- Bills tab: try to mark KIA Loan paid (already paid, but try a 
  different paid-early bill if any). Confirm dialog appears 
  (option b)
- Bills tab: try to mark a bill paid that's already past its due 
  date. Should proceed without confirm
- Add A Bill: confirm all recurring bills now visible
- Calendar: confirm Afterpay $94 (May 14), Borrowed from Michael 
  $500 (May 16) appear with distinct markers from monthly bills
- Settings → Math Health: MI-13 may still fire on existing KIA 
  Loan paid-early state — that's correct (gating prevents future 
  paid-early; doesn't retroactively unfix existing data)

If MI-13 still fires on existing data, decide: leave as-is 
(legitimate paid-early), or unmark via a UI action (separate 
session).

### Step 4 — Commit and push

Single commit:

```
fix(bills): paid-before-due gating + add-bill completeness + calendar debt markers

#1 — Bills cannot be marked paid before their day-of-month. New 
canMarkPaid() helper applied at all mark-paid invocation sites. 
Confirm dialog: "This bill isn't due until day X. Pay early?" 
(option b — preserves user's ability to pay early, makes it 
explicit, prevents accidents).

#4/#18 — Add A Bill view completeness fixed. Root cause was 
[ROOT_CAUSE_FROM_INVESTIGATION]. All recurring bills now visible 
in current month.

#5/#20 — Calendar surfaces immediate debts (S.debts) as distinct 
markers from monthly bills. Bills use existing red dot; immediate 
debts use [MARKER_FROM_INVESTIGATION]. viaRent debts excluded per 
existing pattern (or included with own marker — investigation 
output).

MI-13 stops firing on future paid-early actions (gated). Existing 
paid-early data persists in S.paidBills until user takes UI 
action — that's correct, gating is forward-looking.

Visual baselines regenerated for dashboard, bills, calendar.
```

Push immediately.

## Constraints

- **No regressions** to any prior commit
- **Single commit** for all three fixes (or 2 if natural — 
  e.g., investigation surfaces that mark-paid gating is more 
  complex than expected, ship calendar+add-bill first, mark-paid 
  separate)
- **35 tests must still pass**
- **Layer 1 must still exit 0** with same allow-list count (or 
  +1 if a new canonical helper is added — surface)
- **Layer 2 invariants must still all pass** on real state — 
  except MI-13 which may still fire on existing paid-early data
- **Visual diffs allowed but must be reviewed inline** — accept 
  via visual:update, commit baselines in same commit
- **No new helper extracted to lib/** — that's the deferred 
  refactor (OPEN-BUGS #10), don't fold in here

## Push back if

- Mark-paid gating turns out to need more freq-types than the 
  spec anticipates (annual, quarterly, irregular)
- Add A Bill root cause is something different from the three 
  categories listed — surface
- Calendar refactor would change the existing `buildCalendarEntries` 
  helper's contract (other consumers might break)
- A fix has a wider blast radius than expected
- Total scope creeps past expected complexity

## Estimate

Three small fixes. Investigation in Step 1 is the bulk — once root 
causes identified, implementation is mechanical. Surface honestly 
if any of the three turns out to be larger than expected.

## Run with

```
Read C:\Users\admin\slyght\MISSION-BILL-STATE.md and execute.

Step 1 first — three sub-investigations (mark-paid gating, Add A 
Bill completeness, calendar immediate-debt markers). Propose 
specific implementation plans with edge cases identified. Print 
findings table. STOP for John's review before any code.

This mission fixes 5 OPEN-BUGS (#1, #4, #5, #18, #20) and 
resolves MI-13's firing class going forward. Existing paid-early 
state stays as-is — gating is forward-looking.

Verify gates per Mission V hotfix: npm run visual must pass 
(or diffs reviewed and accepted). Visual baselines regenerate 
in same commit if rendering changes.

Single commit. Push immediately. Verification on phone.
```
