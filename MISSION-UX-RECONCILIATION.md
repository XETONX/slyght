# MISSION: UX RECONCILIATION (Mission E)

## Why this mission exists

John's dashboard renders three cards simultaneously that say 
overlapping but conflicting things. From earlier phone screenshots 
on May 5 ($381.35 balance, 10 days to payday):

- **"Very tight $141"** — appears to be a budget-mode label or 
  threshold indicator
- **"Spending alert won't cover bills"** — a warning state about 
  overall financial position
- **"$21.56 You can spend today"** — a daily safe-spend number 
  with "TIGHT — cover your essentials first" subtext

Each card is technically correct given its own math. The cards 
don't *agree* with each other on what state John is in. A user 
reading the dashboard cannot tell:
- Am I in "very tight" mode? Or "tight" mode? (different labels)
- Should I focus on covering bills or limiting daily spending?
- Is $141 a budget? A buffer? A shortfall?
- Is $21.56 actually achievable given the spending alert?

OPEN-BUGS this resolves:
- **#21** — Three-card contradiction on dashboard ("Very tight" vs 
  "Spending alert" vs "$21.56")
- **#20 partial** — $21.56 mislabeled as "today's hard cap" when 
  the math is actually "remaining ÷ days_to_payday" sustainable rate

This mission is *different shape* from F/C/B-followup:
- Not math — the underlying numbers are correct
- Not refactor — no parallel implementations to consolidate
- Not schema — no data model changes
- **It's UX hierarchy** — what each card means, how they relate, 
  which take priority when in conflict

The fix is decided in Step 1, not Step 2. Step 1 produces a copy 
and suppression decision matrix; Step 2 mechanically applies it.

## Required reading before starting

1. The dashboard render flow — find every card that appears on 
   pg-dash with state-conditional visibility
2. The "Very tight $141" source — what computes that number, 
   what triggers the label, where rendered
3. The "Spending alert" source — what conditions trigger it, what 
   it's claiming about the user's financial state
4. The "$21.56 You can spend today" source — likely the hero "safe 
   to spend today" card; what's the math, what's the label
5. Each card's tier classification (Survival / Tight / Cautious / 
   Normal modes per `S` state and budget tier helpers)
6. Recent prior screenshots in the conversation context for 
   visual reference

## What to do

### Step 1 — Decision matrix (no code, STOP gate)

Four sub-investigations.

#### 1A — Card inventory

For each of the three cards (and any others on the dashboard 
that overlap in domain — could be 4 or 5), document:

| Card | DOM ID / Function | Math | Trigger Condition | Label | Audience |
|------|-------------------|------|-------------------|-------|----------|

The "audience" column matters: who is this card *for*? What 
question is it answering? If two cards answer the same question 
with different numbers, one of them is redundant.

#### 1B — Conflict analysis

For each pair of overlapping cards, identify:
- What's the actual conflict? (Different numbers? Different 
  labels for same state? Different recommendations?)
- Are both technically correct? (Usually yes — the math is right; 
  the user-facing presentation conflicts.)
- What does the user think when they see both?

Output: explicit conflict list, e.g.:
- "Very tight $141" + "Tight $21.56" — both label John's state, 
  but with different magnitudes ($141 vs $21.56) and different 
  modifier words ("very" vs "tight")
- "Spending alert won't cover bills" + "$21.56 You can spend" — 
  contradictory recommendations: one says "danger, can't afford 
  bills," the other says "you can spend $21.56"

#### 1C — Hierarchy decision

Propose a UX hierarchy. This is the heart of the mission.

**The question:** When the user opens the dashboard, what's the 
*one thing* they should walk away knowing? Then: what's the 
second thing?

Three plausible hierarchies:

**Hierarchy A: Survival-first.**
- Priority 1: Will I make it to payday? (Survival forecast 
  summary)
- Priority 2: What's safe to spend today? (Single daily number)
- Priority 3: How am I tracking against the cycle? (Trend/coach)
- Conflicts resolved by: suppressing duplicate-domain cards. If 
  Survival Forecast says "you're tight," the dashboard doesn't 
  also need a "Very tight" badge.

**Hierarchy B: Daily-action-first.**
- Priority 1: What can I spend right now? (Hero number)
- Priority 2: What's coming up that I need to cover? (Bills/debts)
- Priority 3: Trend/context (run-out date)
- Conflicts resolved by: making the hero number authoritative; 
  warnings reframe to support it ("$21.56 — covers essentials 
  through payday")

**Hierarchy C: Mode-first.**
- Priority 1: What mode am I in? (Survival/Tight/Cautious/Normal 
  with single label)
- Priority 2: What mode-specific action? (Different per mode)
- Priority 3: Numbers
- Conflicts resolved by: removing redundant mode labels — only 
  one card declares the mode

Surface tradeoffs:
- A is closest to John's actual mental model ("can I survive to 
  payday")
- B matches the existing hero card design
- C is cleanest from a UI organization perspective

Recommend one. Justify. Surface for John to confirm or counter.

#### 1D — Specific copy and suppression decisions

Once hierarchy is agreed, produce specific decisions:

For each card from 1A:
- **Keep / Modify / Suppress** — if keep, exact copy. If modify, 
  before/after copy. If suppress, when (always / only when card X 
  is active).
- **Math** — does the math change at all? (Probably not — if it 
  changes, that's a separate mission.)
- **Label** — exact text the user sees.

For #20's "$21.56 mislabel" specifically: the math is "remaining 
÷ days_to_payday" (sustainable daily rate, not today's hard cap). 
The label said "TODAY" implying daily cap. Two fixes possible:
- Rename label to "AVERAGE PER DAY UNTIL PAYDAY" or "DAILY 
  SUSTAINABLE" 
- Or change math to actual today's-hard-cap (different number, 
  different meaning)

Recommendation: relabel, not remath. The sustainable-rate is 
useful information; just label it accurately. "Today" is the 
misleading word.

### Step 1 deliverables

- Card inventory table
- Explicit conflict list
- Hierarchy recommendation with rationale
- Per-card keep/modify/suppress decisions with exact copy
- Decision on $20 mislabel (rename vs remath)

STOP for John's review. **This is the most important Step 1 of 
the night** because the wrong hierarchy choice ships UX that 
feels worse than the contradiction. Take time here.

### Step 2 — Implement (after approval)

Mechanical application of Step 1's decisions:
- Update render functions per keep/modify/suppress decisions
- Update labels per agreed copy
- Add suppression logic where needed (e.g., "show Very Tight 
  badge only when Survival Forecast isn't visible")

Visual baselines will diff for dashboard.png. Possibly 
analysis.png too if forecast labeling changes. Regen via 
visual:update, eyeball per Mission C lesson, commit baselines 
with code change.

### Step 3 — Verify

```
npm run guardian-static    → exit 0
npm test                   → 40/40 passing (no new tests likely 
                              needed unless suppression logic 
                              warrants one)
npm run visual             → diffs reviewed and accepted
npm run guardian           → all gates green
```

On phone after deploy:
- Dashboard: confirm one clear narrative reads through. The 
  three-card contradiction is gone. Test the question: "If I 
  tap into the app fresh and read the dashboard, what's the 
  single most important thing I learn?"
- Specifically check: $21.56 label now matches its math. No 
  longer says "today's cap."

### Step 4 — Commit

Single commit:

```
fix(ui): reconcile dashboard three-card contradiction + relabel sustainable rate

Hierarchy: [chosen hierarchy from Step 1].

Cards changed:
- "Very tight $141" — [decision]
- "Spending alert" — [decision]
- "$21.56 You can spend today" — [decision]

#20 partial: $21.56 was labeled as today's hard cap; math is 
"remaining ÷ days_to_payday" sustainable rate. Relabeled to 
[chosen new label].

Visual baselines regenerated for [list].

Closes OPEN-BUGS #21. #20 partial closure (mislabel resolved; 
verify if any other #20 framing remains open).
```

Push immediately.

## Constraints

- **No regressions** to any prior commit
- **Single commit** for hierarchy + copy + suppression
- **40 tests must still pass** (new tests only if suppression 
  logic is non-trivial)
- **Layer 1 must exit 0**, 16 rules
- **Layer 2 invariants must still pass on real state** — except 
  MI-13 which legitimately fires on John's pre-marked auto-debits
- **Visual diffs expected and accepted via visual:update** 
  per Mission C lesson (eyeball, don't trust silent ok)
- **No math changes** — labels and visibility only. If 
  investigation finds the math is wrong somewhere, that's a 
  separate mission, surface it
- **No new helper extraction** beyond what cleanly exists

## Push back if

- Step 1 finds more than 3 conflicting cards (could be 4-5) — 
  surface, scope decision
- The hierarchy decision isn't clean cut (e.g., John's actual 
  use pattern doesn't match A/B/C cleanly) — surface alternatives
- Some card's math is actually wrong (not just mislabeled) — 
  surface as separate mission scope
- A suppression rule has wider blast radius than expected (e.g., 
  "hide Very Tight badge when Survival Forecast visible" affects 
  other modes too) — surface
- The $21.56 relabel breaks something else (e.g., other code 
  reads the label string) — surface
- Step 1 reveals the underlying mode-classification logic is 
  itself inconsistent (different cards classifying same state 
  as different modes) — major surface, may need follow-up 
  mission

## Estimate

Medium. Investigation is the bulk and the hardest call of the 
night. Implementation is mechanical once hierarchy is agreed.

## Run with

```
Read C:\Users\admin\slyght\MISSION-UX-RECONCILIATION.md and 
execute.

Step 1 first — four sub-investigations:
  1A: card inventory (what each card is, math, trigger, audience)
  1B: explicit conflict analysis (which cards contradict and how)
  1C: hierarchy decision (recommend A/B/C, justify)
  1D: per-card keep/modify/suppress decisions with exact copy
Print findings as decision matrix, STOP for John's review.

This is the trickiest mission of the night — UX hierarchy, not 
code. The fix is decided in Step 1. Take time.

Closes #21 directly + #20 partial (mislabel resolution).

Single commit including baseline regen for affected screens.
```
