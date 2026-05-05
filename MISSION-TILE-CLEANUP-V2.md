# MISSION: TILE CLEANUP v2 — Items 3, 11, 14, 19, 21, 24, 26, 29

## ⚠️ Read this header before any code touches the file

This mission is written differently from prior ones in this project.
Instead of prescribing implementations, it describes the problems and
the desired outcomes, then asks you (Opus) to propose your approach
before implementing.

You are a capable agent. If you see a better solution than the obvious
one, propose it. If a constraint I've set seems wrong, push back. The
prior missions have been over-prescriptive — that's been a failure on
the prompt-writer's part, not a reflection of your capability.

---

## Context

John maintains a personal finance PWA at `xetonx.github.io/slyght`.
The Analysis tab has accumulated tiles over months of development that
he no longer uses. He's flagged 8 specific items for removal or
simplification.

Three missions shipped tonight already (commits c800400 → 5c6e219 →
4a8cfba) — all clean, all manually verified on phone. This is the
fourth mission of the evening.

---

## The desired outcome

After this mission ships, when John opens the Analysis tab tomorrow:

1. The tab should feel noticeably less cluttered
2. Tiles he actually uses (Spending pivot, Survival Forecast, Essential
   vs Discretionary) should be more findable
3. Nothing he uses should be broken or removed
4. The app's underlying calculations and data shouldn't be damaged in
   ways that affect Plan Mode, dashboard, bills tab, or future features

That's the bar. The how is yours to figure out.

---

## The 8 items, with John's verbatim notes

**#3** — *"Way too many tiles in Analysis tab"*
This is the umbrella complaint. Resolved by the deletions below.

**#11** — *"Pointless having it again tell me $110 due this week, better
to be referenced somewhere with other key info instead of a separate
tile"*
There's a duplicate "due this week" tile somewhere outside the canonical
"This Week" section.

**#14** — *"Daily Character Score points system. Just then points system
notification for no spending so thats false but also that function should
be stripped"*
The character score has multiple tracked behaviors: no-spend evening,
under-budget, meal prep, workout logged, plus negative pattern detection
via keywords (vape, FIFA, weed). John wants to keep no-spend-evening
tracking only and strip everything else.

**#19** — *"SLYGHT score just is like pointless for now i dont get it,
the number doesnt help"*
0–1000 score with sub-categories. Doesn't drive any decision he makes.

**#21** — *"Spending by category is already displayed at the top of
analysis tab, is more interactive and informative this dobuble up can be
removed just ensure the database isnt affected or changes anything in
the first tile"*
Two views of spending-by-category exist. The interactive pivot at top
is canonical. The duplicate further down is the target.

**#24** — *"Worst 5 vs baseline, I guess its a good gfigure but again i
dont use it"*
Soft delete — he's said it's not actively bad, just unused.

**#26** — *"Spending DNA useless"*
Direct.

**#29** — *"90 day forecast useless"*
Direct.

---

## What I want you to do

### Step 1 — Investigation and proposal (15-30 min, no code yet)

For each of the 8 items, investigate the codebase and produce a brief:

```
Item #X: [name]
  Location:        [file:line range]
  Current code:    [what it does, what it renders]
  Dependencies:    [what calls this, what it calls, what state it reads/writes]
  Risks:           [what could break if removed]
  Proposed action: [your recommendation]
  Reasoning:       [why this approach over alternatives]
```

For each item you have multiple possible actions:

- **Full delete** — remove tile renderer + calc function + any state fields
- **Renderer-only delete** — remove what's displayed but keep the calc
  in case it's referenced elsewhere or useful later
- **Simplify** — for #14 specifically, the spec is "keep no-spend-evening,
  remove everything else." Apply your judgment to other items if
  simplification makes more sense than deletion
- **Defer** — if removal would create non-trivial risk, propose deferring
  to a future mission with a specific concern

I'm not assuming I know which is right for each item. You decide based
on what you find. **Push back if my framing is wrong** — for example,
if you think #14 should just be deleted entirely rather than simplified,
say so and explain.

### Step 2 — Confirmation gate (STOP)

After Step 1, print your full proposal table and STOP. Wait for
confirmation before any code changes. If your proposal differs from
John's stated wishes (e.g., he said "delete" but you found it's
load-bearing), surface that conflict explicitly so he can decide.

### Step 3 — Implementation

After confirmation, implement your approved approach. Single commit. No
"while I'm here" additions beyond what was approved.

### Step 4 — Tests + commit + push + verification block

Run existing tests + guardian. If anything fails, debug before
proceeding. Commit. Push. Print a verification block.

---

## Hard constraints

These are non-negotiable, not because I distrust your judgment, but
because they protect work already shipped tonight:

1. **No regressions** to:
   - Dashboard "Spent today" / balance / recent transactions (5c6e219)
   - Plan Mode "Locked non-negotiable," bonus preview, slider
     affordability, editable repayment fee (4a8cfba)
   - Bills tab calendar / paidBills logic (c800400)
   - TDZ resilience for boot-time PLAN access (56896d8)

2. **Single commit.** All deletions/simplifications in one atomic change.

3. **Don't redesign.** Tile removal is structural. Surviving tiles keep
   their current styling. Layout consolidation is post-payday work.

4. **Don't touch screens outside Analysis tab** unless investigation
   reveals a flagged tile lives elsewhere (#11 specifically might be in
   dashboard).

5. **Don't claim Guardian green = ship safely.** Guardian catches
   structural regressions but not semantic ones. Use manual phone
   verification as the load-bearing gate.

---

## Permission to push back

If during investigation you discover any of the following, surface it
to John before proceeding:

- A "useless" tile is actually load-bearing (referenced by chat context,
  notifications, computed by something John uses elsewhere)
- A "delete" decision should be a "simplify" or vice versa
- The constraint list above blocks a cleaner solution
- The mission scope feels wrong (e.g., 8 items in one commit is too
  much for safe rollback if something breaks)
- You see a related issue that's unsafe to leave alone

Surface, don't silently work around.

---

## Output format for verification block

Standard format for this project:

```
═══════════════════════════════════════════════════════════════
TILE CLEANUP v2 SHIPPED to xetonx.github.io/slyght

Commit: <hash>
Tests: NN/NN passing
Guardian: 4/4 (advisory)

Items shipped: <list with notes on action taken per item>

═══════════════════════════════════════════════════════════════
JOHN'S MANUAL VERIFICATION ON PHONE:

[generate verification steps based on what you actually changed —
don't follow a template, generate steps that exercise your specific
changes and check the constraints above]

═══════════════════════════════════════════════════════════════
```

---

## Working notes on Guardian

John has correctly observed that Guardian has been "green" while real
bugs shipped. Guardian catches structural regressions (DOM IDs,
function definitions, state schema) but doesn't validate semantic
correctness across tiles. For this mission specifically, Guardian
should still pass — we're only removing things — but a Guardian-green
state alone isn't sufficient evidence of a clean ship. Manual phone
verification is the gate.

---

## Run with

```
Read C:\Users\admin\slyght\MISSION-TILE-CLEANUP-V2.md and execute it.

Note the new style: investigate first, propose actions per item, get
confirmation, then implement. Push back if my framing is wrong. Single
commit. Manual phone verification as the load-bearing gate.
```
