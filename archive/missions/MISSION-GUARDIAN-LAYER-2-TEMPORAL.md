# MISSION: LAYER 2 TEMPORAL INVARIANTS (Mission D)

## Why this mission exists

Layer 2 currently has 9 active invariants covering state-shape (NaN 
balance, txn array shape, paidBills value shape) and math-shape 
(cycle spend bounded, borrow recommendation sane, roundup direction, 
tomorrow bill matches state, alert coherence, consistency-fail not 
marked ok).

What it doesn't cover: **temporal coherence.** When the phone walk 
on May 5 surfaced 11 new bugs (#11-#21), at least 4 of them were 
date/time-shaped:

- **#1**: Bills marked paid before their day-of-month hits — temporal validation
- **#2/#3**: Forecast doesn't net upcoming payday salary — temporal forecast event
- **#4**: Add A Bill missing May bills (April more populated) — date/recurrence calc
- **#5**: Calendar not showing immediate debts on their due dates — date-based marker

The bugs were visible because the math is mostly state-shape and 
math-shape, but very little of it validates "is this state's 
*temporal* coherence right?" — questions like:

- Is this transaction's timestamp inside a reasonable window?
- Does a paidBills key encode a month/day that has already passed?
- Are recurrence intervals consistent with last-paid?
- Do all renderers compute "days to payday" identically?
- Is timezone interpretation consistent?

This mission adds 5 new invariants to the MathInvariants namespace, 
all temporal in nature, all anchored to a specific class of bug 
from May 5's screenshots.

After this mission ships:
- 14 active Layer 2 invariants (up from 9)
- Missions E, B, C ship through the new temporal gates
- Future bugs of these classes get caught at the runtime layer

## Required reading before starting

1. Current MathInvariants namespace at index.html (~250 lines)
2. MISSION-GUARDIAN-LAYER-2.md (architecture for adding invariants)
3. OPEN-BUGS.md entries #1, #2, #3, #4, #5
4. State export from May 5 (state-snapshot.json or current localStorage)

## Decisions already made (do not re-ask)

**Severity tiers** match existing Layer 2:
- `warn` — dismissible per-session
- `fail` — dismissible once, escalates to non-dismissible card on 
  second violation in same session
- `critical` — non-dismissible immediately

**Performance budget**: ≤ 5ms per renderAll for ALL invariants 
combined (existing 9 + new 5). Current Layer 2 measured 0.010ms 
median; adding 5 more O(small N) checks should stay well under 
budget.

**Wrapping**: each invariant in try/catch; never crashes renderAll.

**Session counters**: reuse the existing `S._invariantViolationCounts` 
mechanism. No schema changes.

## The 5 invariants

### MI-12-no-future-dated-txns (fail)

**Anchor**: not yet a shipped bug, but possible if any code path 
allows manual ts entry or if importing a corrupt export.

**Assertion**: every txn in S.txns has `ts ≤ Date.now() + 1 hour` 
(clock skew tolerance).

**Why it matters**: future-dated txns silently break filters that 
clamp by date range, especially the cycle/payday math. A txn dated 
May 20 right now would not appear in any "this cycle" calc until 
May 20, then suddenly appear, mid-cycle.

**Implementation**: 
```js
const future = (S.txns||[]).filter(t => t.ts > Date.now() + 3600000);
return future.length === 0 || violation(`${future.length} future-dated txn(s)`, { ids: future.map(t => t.id || t.ts) });
```

**Tier**: fail. Real data corruption, but recoverable (user can edit 
the txn).

### MI-13-paidbills-key-not-future (fail)

**Anchor**: OPEN-BUGS #1 directly — bills marked paid before their 
day-of-month hits.

**Assertion**: every key in `S.paidBills` encodes a day that is ≤ 
today's date for the current month, OR encodes a past month.

paidBills key format (per Bundle B's `paidBillKey` canonical helper): 
`${y}-${m+1}-${name}-${day}` — e.g., `"2026-5-Pet Insurance — Bowtie-8"`

**Implementation**:
```js
const today = new Date();
const todayY = today.getFullYear();
const todayM = today.getMonth() + 1;
const todayD = today.getDate();

const future = Object.keys(S.paidBills || {}).filter(key => {
  const m = key.match(/^(\d{4})-(\d{1,2})-.*-(\d{1,2})$/);
  if (!m) return false; // malformed keys handled by state-shape-paidbills
  const [, y, mo, d] = m.map(Number);
  if (y > todayY) return true;
  if (y === todayY && mo > todayM) return true;
  if (y === todayY && mo === todayM && d > todayD) return true;
  return false;
});

return future.length === 0 || violation(`${future.length} bill(s) marked paid before their due date`, { keys: future });
```

**Tier**: fail. The user can mark bills paid early intentionally 
(some pay in advance), but the dashboard should surface this as a 
violation so they know.

**Edge case**: bills paid early on purpose. The dismiss-once-then-
escalate behavior handles this — first time fires, user dismisses, 
escalation only if it happens again with a different bill.

### MI-14-bill-recurrence-coherent (warn)

**Anchor**: OPEN-BUGS #4 directly — Add A Bill missing May bills 
that were present in April.

**Assertion**: for each bill in `S.BILLS` with `recurring: true`, 
the bill's expected occurrence in the current month is calculable 
and matches what the calendar/Add A Bill view shows.

This one is harder to assert cleanly because the bug is "renderer 
shows fewer bills than exist in BILLS." A runtime invariant can 
check: does `getExpandedBills()` (or whatever helper produces the 
month's bill list) return one entry per recurring bill? If a 
recurring bill is missing from the expansion, fire.

**Implementation**:
```js
const expanded = getExpandedBills(); // canonical helper, per PROJECT-EXTRACT
const recurringInBills = (S.BILLS || []).filter(b => b.recurring);
const missingFromExpansion = recurringInBills.filter(b => 
  !expanded.some(e => e.name === b.name && e.day === b.day)
);
return missingFromExpansion.length === 0 || violation(`${missingFromExpansion.length} recurring bill(s) missing from current month expansion`, { names: missingFromExpansion.map(b => b.name) });
```

**Tier**: warn. The bill exists in BILLS but isn't appearing in 
this month's view — it's a render bug, not data corruption. 
Dismissible per-session is fine.

**Note**: depends on `getExpandedBills` helper existing per the 
canonical helpers list. If the actual helper has a different name, 
update during Step 1 investigation.

### MI-15-payday-interpretation-canonical (fail)

**Anchor**: OPEN-BUGS #2/#3, also part of why the forecast is wrong 
— different renderers may compute "days to payday" differently.

**Assertion**: all renderers reading payday compute `daysToPayday` 
identically against `S.payday`.

The current canonical computation should be: 
```js
const today = new Date();
const payday = new Date(today.getFullYear(), today.getMonth(), S.payday);
if (today.getDate() > S.payday) payday.setMonth(payday.getMonth() + 1);
const days = Math.ceil((payday - today) / 86400000);
```

**Implementation as invariant**: assert that `MODEL.daysToPayday` 
(or whatever field carries this) equals the canonical computation. 
If MODEL doesn't have such a field yet, this invariant requires 
adding it (small Part 2.5-style refactor).

```js
const canonical = computeDaysToPaydayCanonical();
return MODEL.daysToPayday === canonical || violation(`MODEL.daysToPayday=${MODEL.daysToPayday} but canonical=${canonical}`, { model: MODEL.daysToPayday, canonical });
```

**Tier**: fail. Off-by-one or off-by-month in payday distance 
cascades into every forecast tile.

**Refactor required**: if no `MODEL.daysToPayday` exists, add it 
during this commit. Surface during Step 1 if so.

### MI-16-timezone-coherence (warn)

**Anchor**: not a confirmed bug yet, but a real risk for an app 
running on Sydney AEST while browser locale may differ. The 
"Today" boundary is timezone-dependent.

**Assertion**: comparing `Date.now()` to a midnight-anchored 
boundary uses consistent timezone. Specifically: if today's date 
is computed via `new Date().getDate()` in renderer A and via 
`new Date(Date.now()).getDate()` in renderer B, they should agree. 
A test: compute "today's start ts" two ways and assert equality.

**Implementation**:
```js
const a = new Date();
const b = new Date(Date.now());
const aDate = `${a.getFullYear()}-${a.getMonth()}-${a.getDate()}`;
const bDate = `${b.getFullYear()}-${b.getMonth()}-${b.getDate()}`;
return aDate === bDate || violation(`Timezone interpretation drift: ${aDate} vs ${bDate}`, { a: aDate, b: bDate });
```

**Tier**: warn. This is a paranoia check — unlikely to fire in 
practice but cheap.

**Note**: if Step 1 investigation finds this is genuinely 
tautological (both expressions always produce the same Date object 
in JS), drop this invariant. The reframe would be "renderer X 
computes today's start as midnight-Sydney; renderer Y computes 
today's start as midnight-UTC; assert they agree" — but that 
requires identifying renderers that do these things, which is 
likely a Layer 1 static rule, not a Layer 2 runtime check.

**Decision needed during Step 1**: keep, drop, or reframe.

## Desired outcome

After this mission ships:

1. MathInvariants namespace has 5 new invariants registered 
   (or 4 if MI-16 is dropped during Step 1)
2. Settings → Math Health panel shows "All N invariants passing" 
   (N = 13 or 14)
3. Layer 2 perf still ≤ 5ms median per renderAll
4. Each new invariant has a tier (fail or warn) and proper 
   dismissal behavior
5. State-snapshot.json baseline runs clean (no false positives on 
   real state)
6. Sandbox corruption tests for each new invariant verify it fires
7. Tests still 35/35 passing
8. Layer 1 (`npm run guardian-static`) still exits 0
9. No regressions to: 7398ae5 or any prior commit
10. If MI-15 requires adding `MODEL.daysToPayday`, that refactor 
    lands in this commit (the invariant + the model field together)

## What to do

### Step 1 — Investigate (45-60 min, no code)

For each of the 5 invariants, confirm:

1. **MI-12 no-future-dated-txns**: scan current `S.txns`, confirm 
   no false positives. Check if any seed/migration paths could 
   create future-dated txns.

2. **MI-13 paidbills-key-not-future**: scan current `S.paidBills` 
   keys. The key format from Bundle B is `${y}-${m+1}-${name}-${day}`. 
   Verify the regex matches every existing key. **Today's state 
   may already fire this invariant** — the export shows 
   `"2026-5-KIA Loan — Firstmac-15": true` and today is May 5, so 
   day 15 is in the future. **Surface this**: if MI-13 fires 
   green-field on John's actual state, that's the system catching 
   the bug it was designed to catch — that's correct behavior. The 
   user dismisses or fixes the data.

3. **MI-14 bill-recurrence-coherent**: confirm the canonical helper 
   name (`getExpandedBills` or whatever exists). Run it against 
   current state, count results vs `S.BILLS.filter(b => b.recurring)`. 
   If the count is short, the bug is real and the invariant will 
   fire on real state.

4. **MI-15 payday-interpretation-canonical**: search for all 
   computations of "days to payday" in renderers. Identify whether 
   `MODEL.daysToPayday` already exists. If not, propose adding it 
   as part of this commit.

5. **MI-16 timezone-coherence**: write the two-way computation, 
   verify it's not tautological. If it is, drop or reframe.

Print findings in the same table format as Layer 1's Step 1 + 
Layer 2's Step 1. STOP for John's confirmation before any code.

Specifically surface:
- Which invariants will fire on current state immediately
- Whether MI-15 requires adding MODEL.daysToPayday
- Whether MI-16 is implementable or should be dropped
- Total estimated lines added to MathInvariants namespace

### Step 2 — Implement (30-45 min)

Add invariants in order. After each, run:
```
npm run guardian-static
npm test
```

Should all pass. Each new invariant gets:
- Definition in MathInvariants namespace
- Registration in the invariants list with tier
- Settings panel updated to show "13 invariants" or "14 invariants"
- A small block comment explaining the anchor (e.g., "OPEN-BUGS #1")

### Step 3 — Sandbox corruption tests (15 min)

For each new invariant, write a sandbox test that:
1. Snapshots state
2. Mutates state to violate the invariant
3. Calls renderAll, expects banner/card to fire
4. Restores state

Add to existing corruption test harness from Layer 2.

Expected: 5/5 (or 4/4 if MI-16 dropped) sandbox tests pass.

### Step 4 — Verify against real state (15 min)

Load John's actual state (state-snapshot.json or current localStorage):
1. Render dashboard
2. Note which invariants fire (if any)
3. Confirm that's the expected behavior — fired invariants are 
   real bugs, not false positives

If any fire: that's the system working. Don't fix the underlying 
bugs in this commit — those are Mission B/C/E territory. Just 
confirm the firing is correct.

### Step 5 — Performance check (5 min)

Run Layer 2 perf timing 10× with all invariants enabled. Confirm 
median ≤ 5ms (current with 9 was 0.010ms, expect ≤ 0.05ms with 14).

### Step 6 — Commit and push

```
feat(guardian-layer-2): add 5 temporal invariants

Layer 2 currently covers state-shape and math-shape but not 
temporal coherence. Adds 5 new invariants for date/time validation:

- MI-12 no-future-dated-txns (fail) — txn.ts ≤ now + 1hr
- MI-13 paidbills-key-not-future (fail) — paidBills key day ≤ today
  Anchors OPEN-BUGS #1 (bills marked paid before due date)
- MI-14 bill-recurrence-coherent (warn) — recurring bills appear in 
  current month expansion. Anchors OPEN-BUGS #4 (May missing bills)
- MI-15 payday-interpretation-canonical (fail) — all renderers 
  agree on daysToPayday. Anchors OPEN-BUGS #2/#3 (forecast missing 
  payday). [Adds MODEL.daysToPayday if not yet present]
- MI-16 timezone-coherence (warn) — today-boundary computed 
  consistently across renderers. [Drop if tautological per Step 1]

Layer 2: 9 → 14 invariants (or 13 if MI-16 dropped).
Settings → Math Health updated to reflect new count.
Perf still ≤ 5ms median.

Missions E, B, C ship into the new gates.
```

Push immediately. Verification on phone:
1. Hard-refresh dashboard
2. Open Settings → Math Health → confirm count updated
3. If any invariants fire on real state, screenshot — that's the 
   system catching the bug it was built for

## Constraints

- **No regressions** to any prior commit
- **Single commit** for the 5 (or 4) new invariants  
- **Tests must still pass** (35/35)
- **Layer 1 must still exit 0** with same allow-list count
- **Don't fix the underlying bugs** that the invariants surface 
  on real state — that's Mission B, C, E territory
- **Performance budget ≤ 5ms** median per renderAll (combined)
- **MI-15 may require MODEL.daysToPayday** — if so, add the field 
  in this commit; don't defer

## Push back if

- Any invariant turns out to be tautological (like Layer 2's 
  paid-count-agreement was) — drop, don't ship dead code
- A new invariant has unbounded false-positive risk
- MI-15's MODEL.daysToPayday addition has a wider blast radius 
  than expected (e.g., many renderers need updating)
- Step 1 investigation surfaces a 6th temporal class we missed
- Total scope creeps past 90 minutes

## Estimate

60-90 minutes. Step 1 is the bulk of the time (validation 
scenarios, find canonical computations, identify surfacing on 
current state). Steps 2-5 are mechanical. Step 6 is fast.

## Run with

```
Read C:\Users\admin\slyght\MISSION-GUARDIAN-LAYER-2-TEMPORAL.md and execute.

Step 1 first — investigate each of the 5 invariants, confirm 
implementability and identify which will fire on current state. 
Print findings table. STOP after Step 1 for confirmation before 
any code.

This mission adds temporal coherence to Layer 2 (9 → 14 invariants).
Missions E, B, C ship into these new gates.

If MI-16 is tautological, drop it. If MI-15 requires MODEL.daysToPayday, 
add it in this commit. Single commit, push immediately.
```
