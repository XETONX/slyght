# MISSION: MI-13 DETAILS BUTTON FIX (Mission #39)

## Why this mission exists

Layer I's first run last night surfaced OPEN-BUGS #39: the MI-13 
banner's "details" button does nothing when tapped. Nora found 
it in 9 turns of free-explore against the current fixture.

Context — what the button is *supposed* to do:

When MI-13 (paidbills-key-not-future) fires, a non-dismissible 
banner appears on the dashboard saying "X bill(s) marked paid 
before due date" with a "details" link. The intent: tap to 
expand and see *which* bills are firing, with options to undo 
each.

What it does today: nothing. The link is rendered but has no 
onclick handler, or the handler doesn't perform the expand 
action.

This is a small mission — likely a 2-line fix, but it deserves 
its own spec because:
- It's the first bug Layer I caught autonomously
- The fix needs proper surfacing UX (modal vs inline expand)
- Verify gate must include re-running Layer I to confirm 
  Nora no longer flags it (closes the regression loop)

## Required reading before starting

1. The MI-13 banner render — find via search for 
   "paidbills-key-not-future" or "marked paid before due date"
2. Layer 2 invariant card framework — how other invariants 
   surface details (if they have a precedent)
3. Mission B (commit 8af37c8) — the mark-paid gating + 
   undoBillPaid pattern for context on how unmark works
4. State: `S.paidBills` keys are formatted as 
   `"YYYY-M-billName-day"` per existing canonical helper

## What to do

### Step 1 — Investigation (no code, STOP gate)

Three questions.

#### 1A — Locate the broken button

Find the MI-13 banner render code. Identify:
- Line number(s) of the banner template
- Where "details" link is rendered
- Whether onclick exists at all (and is broken) or is missing
- What the surrounding card structure looks like

Output: exact code excerpt of the broken state.

#### 1B — Decide UX for the expanded state

Three reasonable patterns:

**(a) Inline expand.** Tap "details" → banner grows to show 
list of offending bills inline with undo button per bill.

**(b) Modal popup.** Tap "details" → modal opens listing 
offending bills with undo buttons.

**(c) Navigate to filtered Bills tab.** Tap "details" → switch 
to Bills tab with filter applied to show only paid-before-due 
entries.

My read: **(b) modal** is the right pattern. Reasons:
- Inline expand changes layout, may push other dashboard cards
- Bills tab navigation loses context (user came from a banner 
  warning, want to address the warning)
- Modal pattern matches existing app conventions (Add Bill, 
  Edit Bill, mark-paid confirms all use modals)

But surface for confirmation. If Opus prefers (a) or (c) for 
specific reasons, propose with reasoning.

#### 1C — Decide undo behavior

For each offending bill, the user needs an action. Two options:

**(a) Undo this paid mark only.** Tap → removes 
`S.paidBills[key]` for that one entry. MI-13's count drops by 
one.

**(b) Confirm-and-undo.** Tap → confirm dialog 
("Remove paid mark for X?") → on yes, remove.

I lean **(a) immediate undo with toast confirmation**. The 
user explicitly tapped "I want to undo this paid mark" — 
double-confirming is friction. A toast that fires after with 
"Undid X — tap to redo" gives reversibility.

Surface for confirmation.

### Step 1 deliverables

- Code excerpt showing current broken state
- UX pattern recommendation (inline / modal / navigate)
- Undo behavior recommendation (immediate / confirm-and-undo)
- Estimated scope: ~lines of code added/changed

STOP for John's review.

### Step 2 — Implement (after approval)

Mechanical based on Step 1's decisions:
- Wire onclick handler
- Render the chosen surface (modal contents / inline expand / 
  filtered tab)
- Wire per-bill undo action
- Add toast for undo confirmation if chosen pattern

After change:
```
npm run guardian-static
npm test
npm run visual
```

Visual diffs: dashboard.png unchanged (banner appearance same; 
button only changes on tap). If modal screenshot is taken 
during a test, that's a separate concern. No baseline regen 
expected.

### Step 3 — Verify

```
npm run guardian-static    → exit 0
npm test                   → 40/40 passing (or +1 if a small 
                              test added for undo function)
npm run visual             → 4/4 passing, 0 diff
npm run guardian           → all gates green
```

On phone after deploy:
1. Hard-refresh dashboard
2. MI-13 banner visible (firing on 6 paid-early entries)
3. Tap "details"
4. Modal opens (or chosen surface) listing the 6 entries
5. Each entry has an undo control
6. Tap undo on one entry → entry disappears, count drops to 5, 
   MI-13 banner updates
7. State should reflect: `S.paidBills` no longer has that key

**Optional: re-run Layer I smoke test.** This is the 
regression-loop closure — Nora should no longer flag the 
"details button does nothing" finding because the button now 
works. Cost: ~$0.20 for single persona × free-explore.

```
npm run test:interaction -- --persona=nora --scenario=free-explore
```

If Nora reports zero hard_fail findings (or only known 
anomalies), that's the bug class confirmed closed by Layer I 
itself. Cool moment if it works.

### Step 4 — Commit

Single commit:

```
fix(banner): wire MI-13 details button to show paid-early bills

Closes OPEN-BUGS #39 — MI-13 banner "details" link was rendered 
but onclick did nothing. Tapping now opens a modal listing the 
offending bills with per-entry undo controls.

UX pattern: [chosen — modal / inline / navigate]
Undo behavior: [chosen — immediate / confirm]

This was the first bug found autonomously by Layer I (Nora 
persona, run 1, turn 9, last session). Re-running Layer I 
smoke test post-fix [confirms / not yet validated] the 
finding closure.
```

Push immediately.

## Constraints

- **No regressions** to any prior commit
- **Single commit** — wire + UI + undo + any small test
- **40 tests must still pass**
- **Layer 1 must exit 0**, 16 rules unchanged
- **Layer 2 invariants must still pass** — except MI-13 which 
  may show fewer firing entries if you test undo during dev
- **No visual baseline regen** unless Step 1 surfaces that 
  banner appearance changes
- **No new helper extraction** beyond what cleanly fits

## Push back if

- The "details" link doesn't exist at all (it's just 
  non-interactive text) — surface, propose adding the 
  interaction
- The MI-13 banner pattern doesn't match other invariant 
  banners (might mean a wider invariant-card UX consolidation 
  is warranted) — surface as future Layer 2 follow-up
- The undo flow has unexpected complexity (e.g., does it need 
  to also update other state like savings buckets if the bill 
  was tracked?) — surface
- Layer I re-run surfaces unexpected findings — pause to read 
  before claiming closure

## Estimate

Small. Investigation in Step 1 is the bulk; implementation is 
mechanical once UX pattern is decided. Ship within ~30-45 min.

## Run with

```
Read C:\Users\admin\slyght\MISSION-MI13-DETAILS-FIX.md and 
execute.

Step 1 first — three sub-investigations:
  1A: locate broken button code
  1B: decide UX pattern (modal / inline / navigate)
  1C: decide undo behavior (immediate / confirm)
Print findings + recommendations, STOP for John's review 
before any code.

This closes OPEN-BUGS #39 — the first bug Layer I (Nora 
persona) found autonomously last night. Small warmup mission.

Single commit. Optional Layer I re-run post-fix to close the 
regression loop.
```
