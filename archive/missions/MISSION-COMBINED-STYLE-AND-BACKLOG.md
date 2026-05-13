# COMBINED MISSION — STYLE GUIDE + REMAINING BACKLOG

## Part 1 — Style guide (what tonight taught us)

This document is written for Opus to read at the start of every future
SLYGHT mission. It captures patterns from the four missions shipped on
3 May 2026 (commits c800400, 5c6e219, 4a8cfba, 3c9b684) plus the
follow-up orphan cleanup. The patterns came from real ships, not
theory.

### What worked

**Outcome-driven framing over step-by-step prescription.** The first
three missions tonight were prescriptive ("Step 4: extract a function
called computeSpentToday"). They shipped clean but underused Opus's
design judgment. The fourth mission (`MISSION-TILE-CLEANUP-V2.md`) was
outcome-driven — investigate, propose, get confirmation, then implement.
Opus surfaced two judgment calls (orphan function, header reword) that
the prescriptive style would have buried. **Default to outcome-driven.**

**Investigation-then-stop gate.** Every mission tonight had a Step 1
investigation phase that printed findings before any code changes. This
caught a near-miss in the paidBills mission (10+ call sites instead of
the expected 2) and surfaced the orphan-function question in tile
cleanup. **Always include a STOP gate after investigation if scope
might be larger than expected.**

**Single commit per mission.** Every mission was one atomic commit.
Reversibility is the load-bearing safety mechanism. If anything fails
verification, `git revert HEAD && git push` returns to known-good
state. **Never combine missions into multi-commit shipments.**

**Manual phone verification as the load-bearing gate.** Tests pass and
guardian green are advisory, not authoritative. The verification block
on phone caught Wednesday's TDZ bug, Sunday's audit findings, tonight's
reconciliation work. **Always print a verification checklist that
exercises the actual changes, not a template.**

**Push back, surface judgment calls, don't silently work around.** The
v2 mission style explicitly granted Opus permission to question framing.
The follow-up that tile cleanup surfaced (orphan renderCharacterScore)
demonstrated this in practice. **Future missions: explicitly invite
pushback in the constraint section.**

### What didn't work as well

**Estimating Opus's execution time.** Estimates of 2-3 hours frequently
shipped in 5-15 minutes. Estimates of 30 minutes occasionally took 45.
The variance is real but the *direction* of error has been "I overestimate
Opus's wall-clock time." Future estimates should reflect this.

**Treating Guardian as authoritative.** Guardian has been "4/4 passing"
through every commit while real bugs shipped. Guardian catches structural
regressions (DOM IDs, function definitions, state schema drift) but does
not validate semantic correctness across tiles. **Treat as advisory.
Manual verification is the gate.** A future mission should add cross-tile
reconciliation tests — that's a real backlog item, not theater.

**Over-prescribing fixes that had multiple valid approaches.** The
prescriptive missions worked but produced the obvious fix every time.
Sometimes the obvious fix is right. Sometimes it isn't. **Frame as
problem + outcome + constraints, then ask Opus to propose. Override
only if the proposal is clearly wrong.**

### Constraints that should be in every mission

1. **No regressions to prior shipped commits.** List them by hash. Tonight's
   list now includes: `56896d8` (TDZ resilience), `c800400` (paidBills
   month-aware), `5c6e219` (misleading-math fixes), `4a8cfba` (Plan Mode
   what-if), `3c9b684` (tile cleanup). Future missions add to this.

2. **Single commit.** All work in one atomic change. Tests + guardian must
   pass before commit. Push only after green.

3. **No "while I'm here" refactors.** Stay in scope. Surface related issues
   as separate proposals, don't silently expand.

4. **Manual phone verification before declaring success.** Generate steps
   that exercise the actual changes, not a template.

5. **Push back on framing if you see better.** Investigation can reveal
   that the framed problem is wrong. Surface that, don't work around it.

### Mission template (for future use)

```markdown
# MISSION: <name>

## Context
What state is the codebase in? What's the user-level reason this matters?

## The desired outcome
What should be true after this ships? User-level, not implementation-level.

## The items / problem
The specific bugs, items, or features. With user verbatim notes where
applicable.

## What I want you to do
1. Investigate (no code yet) — produce a proposal table
2. STOP for confirmation
3. Implement approved approach
4. Tests + guardian
5. Single commit + push
6. Generate verification block specific to your changes

## Hard constraints
- No regressions to: [list of prior commits]
- Single commit
- Don't redesign visually unless explicitly in scope
- Don't touch [specific things outside scope]

## Permission to push back
If you discover [list of conditions], surface to John before proceeding.

## Run with
[command]
```

---

## Part 2 — Remaining backlog mission

The 52-item backlog had 20 items shipped tonight (#1, 2, 8, 9, 10, 11,
12, 13, 14, 15, 19, 21, 24, 26, 29, 46, 47, 48, 49, plus #3 resolved by
deletions). 32 items remain. They split into natural groupings, each of
which is a future mission.

This mission file is the **roadmap for those future missions**, not a
single mass mission. Following the style guide above, we ship them in
sequenced, focused commits — not all at once.

---

### Mission 5 — Architecture: where things live

**Items:** #4, #5, #17, #23, #28, #30, #52
**Expected complexity:** Medium-Large (touches many renderers, moves
content between tabs)
**Recommended timing:** Next session, fresh

**Items detail:**

- **#4 / #30** — Time Machine moves from Analysis tab to Settings (a
  History or Restore subsection)
- **#5** — Settings gets a "Financial Data" tab consolidating: bills
  (rent, subscriptions), weekday/weekend budget, payday day, income.
  All editable inline.
- **#17** — Goals tab content removed from NOW Analysis (already
  duplicated in Plan Mode). Plan Mode becomes single source of truth
  for goals.
- **#23** — Financial Progress + Income Received tiles move from
  Analysis to Plan Mode (forward-looking, not "right now" data).
- **#28** — Emergency Fund moves to Plan Mode only (currently in both
  Analysis and Settings weirdly).
- **#52** — China Holiday duplicated between Goals and Trips →
  consolidate. Trips is canonical (has dates). Goals are long-term
  non-trip targets.

**The framing for Opus:** "Investigate where each item currently lives
and where it should live based on the user's stated intent. For each,
propose: move to X, delete entirely, or keep in place with reasoning.
Migration must preserve any state references — don't orphan data."

---

### Mission 6 — Hard UX blockers

**Items:** #36, #51
**Expected complexity:** Small-Medium
**Recommended timing:** Can ship same evening as Mission 5 if energy
allows, or next session

**Items detail:**

- **#36** — In-app notifications cut off at the edges. Cannot read or
  interact, end up clearing without engaging.
- **#51** — "Lock this plan" needs confirmation popup. Currently
  irreversible action with no confirmation.

**The framing for Opus:** "Both items are user-experience safety
issues. #36 needs the notification cell to either redesign for
viewport-fit or become expandable. #51 needs a 'Are you sure? This
locks your allocation for the cycle' popup before action fires.
Investigate current implementations, propose minimal fixes."

---

### Mission 7 — Settings polish

**Items:** #37, #38, #39, #40, #41, #42, #44
**Expected complexity:** Medium
**Recommended timing:** After Missions 5-6, since architecture work
makes Settings home cleaner

**Items detail:**

- **#37** — Round-up indicator unclear. Toggle exists but no visible
  feedback when transactions round up. Should show last 3 round-up
  events somewhere visible.
- **#38** — Export / Import / Snapshot semantics unclear. Three buttons,
  unclear what each does. Either rename to be self-explanatory or add
  inline help text. (Note: "Export Claude Code" at bottom — what is it?)
- **#39** — Bills should be editable from one canonical place.
  Currently editable in Bills tab AND Settings. Pick one, remove the
  other.
- **#40** — State snapshots collapsed by default. List is huge,
  cluttering Time Machine. Show last 5, expandable.
- **#41** — Data Health Check never records fails despite Activity Log
  showing failures. Either consolidate to one or have Health Check
  ingest from Activity Log.
- **#42** — UX Intelligence info not surfaced anywhere. Either surface
  it or remove the system.
- **#44** — Activity Log should auto-clear when no errors. Currently
  shows old issues. Should detect "no recent errors" and present clean
  state, collapsible.

**The framing for Opus:** "Settings tab has accumulated friction items.
Investigate each. For #38, the 'Export Claude Code' is mystery — find
what it does, propose rename or removal. For #41/#42, two diagnostic
systems exist that don't agree — pick one as canonical."

---

### Mission 8 — Calendar interactivity

**Items:** #6, #7
**Expected complexity:** Medium
**Recommended timing:** Standalone session

**Items detail:**

- **#6** — Day-detail popup should be interactive. Tap a day, see
  bills/debts due. Currently view-only. Should match interactivity of
  the first Analysis tab tile — tap a bill to mark paid, edit, defer.
- **#7** — Tap into next-month days from current calendar view.
  Currently April calendar shows May 1, 2, 3 greyed out, but tapping
  does nothing. Should be tappable from April view.

**Cross-reference:** Item #56 in backlog (Bills Tab v2 / day-detail
module) addresses these as part of a larger redesign. This mission can
either ship the interactivity in current architecture OR defer to the
#56 work depending on Opus's investigation.

**The framing for Opus:** "Two interactivity items in the calendar.
Investigate whether to ship interactivity in the current architecture
or defer to the Bills Tab v2 redesign (BACKLOG-56). Propose."

---

### Mission 9 — Notification system rework

**Items:** #36 (overlap with Mission 6), #43
**Expected complexity:** Large
**Recommended timing:** After other missions, possibly its own week

**Items detail:**

- **#43** — Smart push notifications barely work. Should fire context-
  aware notifications (10am breakfast on office days, 12:30pm lunch,
  2pm afternoon, 6:30pm home time, Sunday grocery reminders). Currently
  fires randomly, ~2 notifications in a week. Either worker cron not
  firing or location/state checks over-filtering. Needs end-to-end
  debugging from worker → push API → phone.

**The framing for Opus:** "End-to-end notification system debug.
Investigate Cloudflare Worker logs, cron trigger registration, push
API delivery, phone receipt. Find where the pipeline breaks. Propose
fix. This may not be a single-commit mission — flag if multi-stage."

---

### Mission 10 — Visual unification (the big one)

**Items:** #32 (design north star), #33, #34, #35, #50, plus broader
visual coherence work
**Expected complexity:** Extra large
**Recommended timing:** Multi-session, after May 15 payday

**Items detail:**

- **#32** — Plan Mode UI is preferred. Apply that aesthetic to NOW.
- **#33 / #50** — Header buttons have cheap-looking oval backgrounds.
  Replace with Plan Mode treatment.
- **#34** — Weather takes too much space, not used. Remove or hide
  under small icon.
- **#35** — "This Week" dashboard tile should be interactive (tap →
  Analysis tab spending pivot).

**Cross-reference:** This work is laid out in detail in
`SLYGHT-design-audit.md`, `SLYGHT-roadmap-v2.md`. Multi-session,
not a single mission.

**The framing for Opus:** "This is the design system work. Reference
the design audit and roadmap-v2 documents. Multi-session. Phase 1 is
extracting design tokens and primitives. Don't attempt single mission."

---

### Mission 11 — Plan Mode polish

**Items:** #45, plus residual Plan Mode items
**Expected complexity:** Small
**Recommended timing:** Anytime

**Items detail:**

- **#45** — Plan modal popup needs containment. When breakdown popup
  opens, can scroll underlying page. No backdrop/border. Fix scroll-lock,
  add visual focus (dim background, sharp border).

**Cross-reference:** Items #46-49 already shipped in Mission 4 (commit
4a8cfba). This is the cleanup.

---

### Mission 12 — Misc + decisions

**Items:** #18, #20, #22, #25, #27, #31
**Expected complexity:** Small per item, mixed
**Recommended timing:** Standalone session

**Items detail:**

- **#18** — "What changes everything" header is unclear. John scrolled
  past because he didn't know what it was. Either rename clearly or
  remove.
- **#20** — "Projected to run out" + "If you need to borrow" — KEEP.
  John explicitly said "brilliant." Verify no double-counting (already
  fixed in Mission 1, sanity check only).
- **#22** — Opportunity cost gets scrolled past. Could be inline as
  small badges on spending pivot category items ("$527 on Food =
  $6,300/year").
- **#25** — Last 7 days too small to be useful. Make it bigger or
  remove and rely on the spending pivot.
- **#27** — Essential vs Discretionary should be higher priority.
  Currently buried. Move to top of Analysis or near safe-to-spend on
  dashboard.
- **#31** — Monthly position needs revamping. Currently fragile inline
  calc per audit. Should read from MODEL and present clearly.

**The framing for Opus:** "Mix of small UI/UX adjustments and one
'verify no regression' check. Propose action per item."

---

### Mission 13 — Auto-import (item #57)

**Reference:** `BACKLOG-57-auto-import.md`
**Expected complexity:** Multi-session
**Recommended timing:** After all other backlog work, post-payday

This is the email-forwarding / Cloudflare Worker auto-import feature.
Already designed in detail in BACKLOG-57. Reference that document for
the mission shape.

---

### Mission 14 — Bills Tab v2 (item #56)

**Reference:** `BACKLOG-56-bills-tab-v2.md`
**Expected complexity:** Multi-session (3-4 phases)
**Recommended timing:** Post-payday, alongside Mission 10 visual work

Already designed in detail. Reference that document.

---

## Part 3 — Sequencing recommendation

If shipping Missions 5-12 over the next 2 weeks (~1 mission per evening
3-4 evenings/week):

**Week 1 (post-payday):**
- Mon: Mission 5 (architecture)
- Tue: Mission 6 (UX blockers)
- Thu: Mission 7 (settings polish)
- Sun: Mission 8 (calendar interactivity)

**Week 2:**
- Mon: Mission 11 (Plan Mode polish)
- Wed: Mission 12 (misc)
- Sat-Sun: Mission 9 (notifications, multi-day debug)

**Week 3+:**
- Missions 10, 13, 14 are multi-session — schedule based on energy

This gets the entire 52-item backlog through in roughly 3 weeks of
sustainable evening work, with each mission verified independently and
reversible.

---

## Part 4 — Operating principles going forward

Tonight produced 4 clean missions in one evening. The rhythm that
worked:

1. **John names the next priority** (from backlog or felt friction)
2. **I write the mission in outcome-driven style** (referencing this
   guide's template)
3. **Opus investigates, proposes, surfaces judgment calls**
4. **John approves or adjusts** (the confirmation gate)
5. **Opus implements, tests, commits, pushes, prints verification block**
6. **John verifies on phone** (the load-bearing gate)
7. **If green, next mission. If not, revert and re-mission.**

Cycle time: ~30-90 minutes per mission depending on scope. Sustainable
at 1-2 missions per evening, 3-5 evenings per week.

The thing this rhythm avoids: one giant mission that ships 30 items in
one commit and breaks something subtle that takes longer to debug than
the work saved. We stay focused, we stay reversible, we stay verified.

---

## Use of this document

For Opus: read Part 1 (style guide) at the start of every future SLYGHT
mission. Apply its patterns. Push back on John's framing when warranted.

For John: Parts 2 and 3 are your roadmap for the next 2-3 weeks of
work. Pick the next mission when you're ready, point me at it, and I
write it in the v2 outcome-driven style with this guide's principles
applied.

For me (Claude in conversation): when John asks "what's next," reference
Part 2's mission list. When writing a new mission, use the template in
Part 1. When asked about pacing, reference Part 3's sequencing.

---

## What this is not

Not a contract. Order can change. Items can be deferred or dropped if
they stop mattering. New items can be added if real friction emerges
from using the app. The 52-item backlog was a snapshot — reality
evolves, and so should this list.

What this IS: a coherent map of remaining work, sequenced for safe
execution, written in a style that respects Opus's capability and
John's time.
