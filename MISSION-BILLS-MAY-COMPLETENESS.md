# MISSION: ADD A BILL MAY COMPLETENESS (Mission B Follow-up)

## Why this mission exists

During Mission B Step 1 (commit 8af37c8), Opus could not reproduce 
John's "April more populated than May" perception against the 
default BILLS schema. With default BILLS, May actually shows 
*more* bills than April (15 vs 14 — yearly NRMA + quarterly 
Teachers Health add to monthly base). Opus pushed back, deferred 
#4/#18 to follow-up contingent on fresh state.

Fixture refresh (commit 264ffa0) provides John's real BILLS 
schema: 14 entries vs default 16. Specifically John has:
- **Removed:** Fuel, Food at Work, Afterpay instalment, Parking 
  CBD Secure, Pet Food (5 deletions)
- **Added:** Google Microsoft (1 addition)

This mission investigates #4/#18 against that real schema.

## The hypothesis space

Three possibilities for what John saw:

**(a) Real bug in Add A Bill render** — the view filters bills 
in some month-conditional way that excludes some entries from May 
display. Possible filter sources:
- `isBillDueThisMonth` (used by `MODEL.billsThisMonth`)
- A render-side filter inside the modal/list view
- A bill-recurrence interpretation that hides non-due-this-month 
  bills

**(b) Real bug in BILLS schema** — bills got deleted via a flow 
that ran without proper confirmation. Five entries removed from 
default schema; John may not remember deleting all of them. 
Particularly suspicious: "Pet Food" (recurring food cost), 
"Parking CBD Secure" (regular work expense). Could there be a 
delete flow that fires accidentally?

**(c) Perception inversion** — John remembers April as fuller 
because of the dramatic March-end financial pressure (Car Rego 
yearly, Property Deposit catastrophic), conflating "felt 
intense" with "more bills shown." May has fewer dramatic 
one-offs. May might genuinely *appear* lighter at a glance even 
if entry-counts are similar.

The investigation needs to distinguish these.

## Required reading before starting

1. The fresh `state-snapshot.json` — full BILLS array as currently 
   configured
2. Find every render path that displays "the bills list":
   - Bills tab list view (renderBillsGrouped or similar)
   - Add A Bill modal (if it shows existing bills, not just an 
     add form)
   - Any "edit bills" view where John would see the schema
   - Plan Mode bill displays
3. PROJECT-EXTRACT-2026-05-05.md § 4.1 — `MODEL.billsThisMonth`, 
   `getExpandedBills`, `isBillDueThisMonth`
4. Bill deletion flow — search for `BILLS.splice`, `delete BILLS`, 
   `BILLS.filter` to identify how bills get removed and whether 
   confirmations gate it
5. STATE-AUDIT-2026-05-05.md — reread the BILLS deletion findings 
   and any related anomalies

## What to do

### Step 1A — Identify the actual view John meant

The original bug report said "Add A Bill view in May shows fewer 
bills than April." But "Add A Bill" is technically a modal for 
*creating* a new bill — it shouldn't show existing bills at all. 
So which view did John actually see?

Candidates:
1. **Bills tab list view** — main view of monthly bills, grouped 
   by tag. Most likely candidate.
2. **Settings → My Financial Data → BILLS list** — raw schema 
   editor where every BILLS entry shows
3. **Plan Mode** — payday allocation showing upcoming bills
4. **Add A Bill modal preview** — if the modal lists what 
   currently exists for context

Opus: examine each view's render output against current fixture. 
For each view, list what's visible in May vs what's visible in 
April (mock April by setting clock to Apr 5 same year).

Output: which view actually has the discrepancy, OR none does.

### Step 1B — If a view has discrepancy, identify the cause

If Step 1A finds a real April/May difference, drill into the 
specific render function. Identify:
- The exact filter or transformation that produces the difference
- Whether it's intentional (e.g., "show only due-this-month bills" 
  is a UX choice) or a bug
- Whether the user has a way to override (a "show all" toggle)
- Whether the difference matches John's "fewer in May" 
  description, or the opposite

### Step 1C — Investigate BILLS deletion flow (regardless of 1A outcome)

Independent of whether #4/#18 reproduces, investigate the 
BILLS deletion mechanism. The 5 deletions (Fuel, Food at Work, 
Afterpay instalment, Parking CBD Secure, Pet Food) may have been 
intentional — but the flow that allows them needs verification.

Search for:
- Where `BILLS.splice` or equivalent deletion happens
- Whether deletion requires user confirmation (modal? swipe? long 
  press?)
- Whether bulk-delete or migrate-and-delete flows exist
- Any code path that mutates BILLS without explicit user action

If deletion flow is robust (confirm dialog before each delete), 
then the 5 deletions were intentional and we just confirm with 
John. If flow is fragile (e.g., a swipe-to-delete with no confirm, 
or a migration that nukes entries), that's a *separate* real bug 
worth surfacing as a new OPEN-BUGS entry.

### Step 1D — Walk John's mental model

If Step 1A finds NO discrepancy in any view, the answer is likely 
(c) perception inversion. The investigation surfaces:
- Stats from current BILLS: count, total monthly recurring, 
  highest single bill
- Equivalent stats if we mock the April schema (or reconstruct 
  from monthlyHistory)
- A short note: "May actually has [N] entries totaling [$X], 
  April had [M] entries totaling [$Y]. The perception of 'April 
  more populated' likely comes from [reasoning]."

Don't fix anything in this case. Just surface the data and 
update OPEN-BUGS #4/#18 to "investigation closed: perception 
inversion, no code bug."

### Step 1 deliverables

- Identification of the specific view John meant (or none has 
  the discrepancy)
- If discrepancy exists: root cause analysis + proposed fix
- BILLS deletion flow audit + verdict (robust vs needs-fix)
- If no discrepancy: stats showing current state vs perceived 
  state, recommendation to close #4/#18 as perception
- New OPEN-BUGS entries surfaced if BILLS deletion flow is 
  fragile

STOP for John's review.

### Step 2 — Implement (if Step 1 finds real bug)

Three possible scopes:

**(a) View-filter fix** — if a render filter is too aggressive, 
adjust it. Likely small change, single commit.

**(b) Deletion-flow hardening** — if BILLS deletion lacks 
confirmation, add it. Pattern from Mission B's withMarkPaidGate 
applies — confirm dialog before destructive actions.

**(c) Both** — if both surface, ship as separate commits or one 
combined commit depending on overlap.

If Step 1 finds (c) perception inversion, skip Step 2 entirely 
and proceed to Step 4 (close OPEN-BUGS, no code change).

### Step 3 — Verify

```
npm run guardian-static    → exit 0
npm test                   → 36/36 (or +1 if a test was added 
                              for the fix)
npm run visual             → 4/4 OR diffs accepted via 
                              visual:update
npm run guardian           → all gates green
```

On phone: walk Bills tab, confirm all 14 BILLS entries visible 
where expected. If a "show all" toggle was added, test it works.

### Step 4 — Commit

If real bug found:
```
fix(bills): [specific fix description]

[Investigation findings — what was actually wrong]

[Fix details]

[If deletion flow hardened: confirm dialog now required for 
BILLS removal, matches Mission B's mark-paid pattern]

Closes OPEN-BUGS #4, #18.
[Any new OPEN-BUGS entries from deletion-flow audit]
```

If no bug found (perception inversion):
```
docs(open-bugs): close #4/#18 — investigation found no code bug

Mission B follow-up investigation: John's "April more populated 
than May" perception does not match render output. May shows 
[N] bills, April shows [M] bills. Likely cause: April had 
dramatic one-off events (Car Rego yearly + Property Deposit 
catastrophic) creating perception of intensity.

No render filter, no schema mutation, no deletion-flow bug 
surfaced. BILLS deletion flow audit: [robust/needs-fix].

Closing #4/#18 as resolved-no-bug. State audit updated.
```

Push immediately.

## Constraints

- **No regressions** to any prior commit
- **Single commit** per fix (or no commit if perception inversion)
- **36 tests must pass** (+1 if test added for view-filter fix)
- **Layer 1 must exit 0** (currently 16 active rules)
- **Layer V — visual diffs only if a render change shipped**

## Push back if

- The view John meant isn't identifiable from any render path — 
  surface and ask
- The investigation finds a different bug class than #4/#18 
  framed (e.g., a sort order issue, not a count issue)
- Deletion flow audit surfaces multiple bug classes — separate 
  follow-up missions might be more appropriate than one commit
- Step 1's stats turn out to actually support John's perception 
  (e.g., May has 9 bills shown, April had 13 — opposite of 
  Mission B's default-schema math) — surface and reframe

## Estimate

Small to medium. If perception inversion: investigation only, 
no code, ~15 min. If real bug: investigation + small fix + 
verification, ~45 min.

## Run with

```
Read C:\Users\admin\slyght\MISSION-BILLS-MAY-COMPLETENESS.md 
and execute.

Step 1 first — four sub-investigations:
  1A: identify the view John actually meant (Bills tab? Add A 
      Bill modal? Settings BILLS editor? Plan Mode?)
  1B: if a view has the discrepancy, drill into root cause
  1C: audit BILLS deletion flow regardless of 1A outcome
  1D: if no discrepancy, surface stats explaining perception
Print findings, STOP for John's review before any code.

Now investigating against fresh fixture — John's real BILLS 
schema (14 entries, 5 deletions from default, 1 addition). 
Mission B Step 1 deferred this pending real state; that 
state is now committed.

Outcomes possible: (a) real render-filter bug to fix, 
(b) BILLS deletion-flow needing hardening, (c) perception 
inversion, no code change. Step 1 distinguishes.

Single commit if fix needed; OPEN-BUGS update only if 
perception inversion.
```
