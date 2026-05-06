# MISSION: PAIDBILLS SURFACE FAMILY (Mission #42)

## Why this mission exists

Mission I sweep (2026-05-06-1231) surfaced two HARD_FAILs in
the paidBills tracking system. They appeared in different
personas with different complaint shapes but converge on the
same model:

**HF#1 (Pat) — MI-13 undo race condition:**
- Pat tapped Undo on a paid-early bill rapidly
- paidBills count went 9 → 7 (KIA Loan AND YouTube Premium
  removed) when intent was 9 → 8 (one removal)
- Evidence: Pat's transcript turns 8-9, shot-002 → shot-003
- Real data corruption — single user-intent producing multiple
  state mutations

**HF#3 (Connor) — Bills marked paid label misleads:**
- Connor saw MI-13 banner "X bill(s) marked paid before due
  date"
- Read this as "money has been deducted from account"
- Verified via read_state: bal=$381.35 unchanged despite
  supposedly-paid bills
- Evidence: Connor's transcript shot-003, modal title "Bills
  marked paid before due date"
- Real label-vs-reality mismatch — the system tracks "intent
  to mark paid" but not "money actually moved"

**Convergence:** Both target the paidBills tracking model.
HF#1 corrupts paidBills via rapid mutation; HF#3 mislabels
what paidBills means. Same surface, different angles.

## Yesterday's #39 context (relevant)

Mission #39 wired the MI-13 banner's details button to a
modal with per-bill undo via `undoPaidBillByKey(key)`. That
fix shipped in commit 3602b8d. The undo function works for
single taps (Nora verified in regression-loop closure).

Pat's race condition specifically targets THIS function —
when called in rapid succession, it produces multiple
mutations. So HF#1 is a regression-adjacent bug: not in the
code we fixed, but in the *interaction model* of the function
we just wired up.

## Required reading before starting

1. `index.html` — locate `undoPaidBillByKey` (added in #39)
2. The modal opened by `showDetails('paidbills-key-not-future')`
3. `MathInvariants.check()` and `_lastViolations` persistence
4. Existing precedents for state mutations:
   - `undoBillPaid()` (the original single-bill undo at L4562)
   - Mark-paid path itself (where paidBills entries get
     ADDED) — to understand what "marked paid" means in code
5. The `applyTxn()` and balance-mutation patterns
6. The state schema for `S.paidBills` keys: `"YYYY-M-billName-day"`

## Three subgoals

This mission has THREE distinct concerns. They may share
fixes or may need separate fixes. Step 1 decides.

### Subgoal A — Race condition guard (HF#1)

`undoPaidBillByKey(key)` needs protection against rapid
succession calls producing unintended mutations. Three
possible mechanisms:

**(a) Debounce:** First call executes immediately, subsequent
calls within Nms are ignored. Standard pattern, but feels
wrong for an undo action — user genuinely might want to undo
multiple bills.

**(b) Per-button click guard:** Each undo button gets a
state flag — once tapped, button disables until mutation
confirms. User can still undo other bills, just not double-
tap the same one.

**(c) Atomic intent check:** Before mutating, verify the
key still exists in paidBills. If two rapid calls hit the
same key, the second finds it gone and no-ops.

Step 1 decides which. My read: **(c) atomic intent check** is
the right pattern. It's the smallest change, doesn't break
multi-bill undo, doesn't add UI state, and matches defensive-
code patterns elsewhere in the codebase. But surface for
review.

### Subgoal B — Label semantics (HF#3)

The MI-13 banner says "X bill(s) marked paid before due date"
and the modal title repeats this framing. Connor (and likely
many real users) read "marked paid" as "money has been
deducted from account."

The current model: paidBills is a tracking layer for "user
declared this bill paid." It does NOT track whether money
actually moved. The actual money movement is via `applyTxn()`
adding a transaction with negative amount.

**The semantic gap:** users can mark a bill "paid" without
the corresponding transaction existing. This is by design
(Mission B's gating allows pre-marking) but the LABEL doesn't
communicate this distinction.

Three options to fix:

**(a) Rename the label:** Change "marked paid" to something
that doesn't imply money movement. Options:
- "marked as paid early" (doesn't fix it — still implies $)
- "tracked as upcoming" (loses the user-action framing)
- "scheduled paid (no transaction yet)"
- "paid early — confirm transaction" (action-oriented)

**(b) Split the banner:** Have TWO different states based on
whether a corresponding transaction exists:
- "X bill(s) paid early — money confirmed" (transaction exists)
- "X bill(s) tracked as paid early — no transaction" (no
  matching txn)
This is more accurate but adds complexity.

**(c) Make the modal explain the distinction:** Keep banner
short, but in the details modal explain "marking a bill paid
tracks your intent — actual money movement happens via
transactions." Educational, but requires user to open modal
to learn.

My read: this needs YOUR product decision. The right choice
depends on what you want SLYGHT to be:
- If SLYGHT is a tracking-only app where users self-report
  what's paid: option (a) with "tracked as paid" framing
- If SLYGHT is meant to reconcile against actual transactions:
  option (b) with the split state
- If SLYGHT is teaching users about the distinction: option (c)

**Step 1 must surface this question, not pre-decide it.**

### Subgoal C — Layer 2 invariant proposal

Super Brain's report flagged this as a Layer prevention
candidate: `undo-operations-atomic`. After fixing HF#1, add
a runtime invariant that catches double-state corruption
class:

```
For any state mutation function callable from UI events:
- Track call count per render cycle
- If same function called 2+ times within Nms with same args,
  flag as MI-XX (race-condition-detected)
```

Or simpler shape:
```
After each renderAll(), check: did paidBills change by more
than 1 entry in a single user-event cycle? If yes, flag.
```

Step 1 decides whether this invariant lands in this mission
or as a follow-up. It might be too speculative for #42's
scope.

## What to do

### Step 1 — Investigation (no code, STOP gate)

This investigation is meatier than #39's because of three
interacting concerns. Output:

#### 1A — Locate the surfaces

For each of the three subgoals, identify exact code:
- HF#1: `undoPaidBillByKey` code, its callers, the click
  handlers for modal undo buttons
- HF#3: MI-13 banner text rendering, modal title rendering,
  the wording strings
- Subgoal C: where MathInvariants.check runs, what state
  cycle it has access to

#### 1B — Verify the race condition reproduces

Write a brief reproduction case (in your head, not code):
- Start state: paidBills has 9 entries
- User opens MI-13 modal, sees 9 rows with undo buttons
- User taps undo on row 1, then immediately taps undo on row 2
- Expected: paidBills now has 7 entries (both removed)
- Pat's evidence: paidBills went 9 → 7
- Question: is this actually a bug? If user tapped both
  buttons, both should fire.

This is the calibration check. Pat reported it as a bug
because he tapped rapidly, suggesting double-fire. But
double-fire of distinct buttons is correct behavior.

**The actual bug to verify:** does rapid tapping of the SAME
button produce multiple mutations? Or does Pat's evidence
actually show two distinct buttons fired correctly and he
misread the state?

This matters because Subgoal A's fix changes based on which:
- Same button rapid-fire → atomic intent check (option c)
- Distinct buttons rapid-fire → no bug, Pat misread evidence

Read Pat's transcript carefully. Surface conclusion.

#### 1C — Decide HF#3 product question

Surface the three label options (rename / split / educate)
with concrete wording proposals for each. STOP for John's
decision before any code.

Don't pre-pick. This is the decision John explicitly retains.

#### 1D — Decide invariant scope

Should the runtime invariant for double-state-mutation land
in this mission or as a follow-up? Factors:
- If HF#1 turns out to be a real same-button rapid-fire bug,
  the invariant is highly motivated
- If HF#1 is Pat misreading distinct-button events, the
  invariant has weaker motivation
- Invariant adds ~30-50 lines and a new MI-XX number

My read: defer the invariant to a separate mission unless
HF#1 investigation confirms a real same-button race. Don't
expand #42's scope speculatively.

### Step 1 deliverables

- Code excerpts for each surface (HF#1, HF#3 banner/modal,
  invariant location)
- HF#1 reproduction analysis: same-button or distinct-button
  race? (calibration)
- HF#3 three label options with concrete wording proposals
- Invariant scope recommendation (in this mission or defer)
- Estimated total scope (separate estimates for HF#1 fix,
  HF#3 fix, optional invariant)

STOP for John's review.

### Step 2 — Implement (after approval)

Mechanical based on Step 1's decisions. Likely shape:

For HF#1:
- If atomic intent check chosen: ~5 lines in
  `undoPaidBillByKey` (early return if key missing from
  S.paidBills)
- If different mechanism: scope per Step 1's decision

For HF#3:
- Update banner string template
- Update modal title
- Possibly update help/explainer text in modal
- ~5-15 lines depending on option chosen

For invariant (if in scope):
- Add MI-XX entry in MathInvariants
- Wire up detection logic
- Add to existing render cycle
- ~30-50 lines

After change:
```
npm run guardian-static
npm test
npm run visual
node guardian-runtime.js
```

Visual diffs expected: dashboard.png if banner text changes
significantly. May need baseline regen. Surface before
regen.

### Step 3 — Verify

```
npm run guardian-static    → exit 0
npm test                   → 41/41 passing (no test changes
                              expected unless invariant adds)
npm run visual             → 4/4 passing (or regen if banner
                              text changed)
node guardian-runtime.js   → 47/50 (no regression, deferred
                              items still red as expected)
```

On phone after deploy:

For HF#1:
1. Hard-refresh dashboard
2. Open MI-13 modal (banner still firing on 6 paid-early
   entries — wait, now 8 since #39 wasn't a paid-bill edit)
3. Tap Undo rapidly on the same bill (multiple times)
4. Verify: only one removal happened (no double-mutation)
5. State check: paidBills count dropped by exactly 1 per
   distinct undo button tapped

For HF#3:
1. Open MI-13 modal
2. Read the new label/wording
3. Confirm semantics are clearer (not implying money moved)

**Optional Step 5 — Layer I regression confirmation:**

Run Pat's persona on the fix:

```
npm run test:interaction -- --persona=pat --scenario=free-explore
```

Cost: ~$0.70. If Pat doesn't flag the race condition this
time, fix is confirmed. If he does, investigate before
declaring closure.

### Step 4 — Commit

Single commit:

```
fix(paidbills): atomic undo + clarified semantics (#40 surface family)

Closes Mission I HF#1 (Pat race condition) and HF#3 (Connor 
marked-paid label).

HF#1: undoPaidBillByKey now [chosen mechanism per Step 1].
Rapid taps on the same undo button no longer produce 
multi-state mutations.

HF#3: Banner and modal now [chosen wording per Step 1] to 
distinguish "user marked paid" from "money has moved."

[If invariant included:]
Layer 2: MI-XX [name] now detects double-state-mutation 
class at runtime.

Cross-references Mission #39 (3602b8d) which wired the 
modal that exposed both bugs.

Pat persona regression: [confirmed clean / not yet validated].
```

Push immediately.

## Constraints

- **No regressions** to Mission #39's modal+undo behavior
- **Single commit** unless Step 1 surfaces strong reason to split
  (e.g., HF#1 is much smaller and shipping it independently
  validates faster)
- **41 tests must still pass** (or 42 if invariant adds a test)
- **Layer 1 must exit 0**, 16 rules unchanged
- **Layer 2 invariants must still pass** + new MI-XX if added
- **Visual baseline regen ONLY if banner text changes**
  significantly. Surface before regen.
- **No new helper extraction** beyond what cleanly fits

## Push back if

- Step 1 reveals HF#1 is Pat misreading distinct-button events
  (no real race condition) — surface, propose closing HF#1
  as known_anomaly explanation, ship only HF#3
- HF#3 product decision blocks investigation entirely — STOP,
  surface decision request, do not proceed
- The race condition fix requires deeper architectural work
  than expected (e.g., entire event-handling pattern
  refactor) — surface, propose splitting into infrastructure
  mission first
- Layer I regression run shows MI-13 modal users now confused
  by the new wording — surface before commit

## Estimate

Medium. Three subgoals. Step 1 investigation is meaningful
work (calibration check + product decision + scope decision).
Step 2 implementation depends on decisions made.

Likely range:
- HF#1 alone: small (~10-20 lines)
- HF#3 alone: small (~5-15 lines)
- Both together: medium (~20-40 lines)
- With Layer 2 invariant: medium-large (~50-90 lines)

Wall-clock: 60-90 min including verification, possibly more
if HF#3 decision triggers deeper discussion.

## Run with

```
Read C:\Users\admin\slyght\MISSION-PAIDBILLS-SURFACE.md and 
execute.

Step 1 first — four sub-investigations:
  1A: locate code surfaces for HF#1, HF#3, optional invariant
  1B: verify HF#1 reproduction — same-button or distinct-button 
      race? Read Pat's transcript carefully for evidence.
  1C: decide HF#3 product question — surface 3 label options 
      with concrete wording. DO NOT pre-pick.
  1D: decide invariant scope — in mission or defer.

Print findings + recommendations + surfaced decision points, 
STOP for John's review before any code.

This closes Mission I HF#1 (Pat) and HF#3 (Connor) — the 
paidBills surface family. Convergence finding from sweep 
2026-05-06-1231.

Single commit unless Step 1 surfaces a strong split case.

Optional Step 5: Layer I regression run with Pat's persona 
(~$0.70).
```
