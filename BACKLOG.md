# SLYGHT — BACKLOG

Captured: 29 April 2026, ~11pm AEST
Source: John's first proper end-to-end use of the deployed app after the
TDZ hotfix shipped (commit 56896d8). 52 items observed across NOW
dashboard, Bills, Calendar, Analysis, Plan Mode, Settings, Chat, and
Notifications.

---

## Design north star (the most important thing in this list)

**Item #32 — "Plan Mode UI is day and night vs NOW. I love Plan Mode."**

This is the single most important observation in the entire list.
Half the visual complaints below collapse into one design pass once
this is the goal: **make NOW look like Plan Mode.**

When working through items in this backlog, ask: "does this fit the
Plan Mode aesthetic?" If yes, ship. If it's a band-aid on the current
NOW design, defer until the unification pass.

---

## Phase order recommendation

| Phase | Title | Items | Estimated time |
|---|---|---|---|
| **A** | Misleading-math hotfixes | 1, 2, 8, 9, 10, 12, 13 | ~2 hrs |
| **B** | Hard UX blockers | 15, 36, 51 | ~1 hr |
| **C** | Architecture / where things live | 4, 5, 17, 23, 28, 30, 52 | ~2 hrs |
| **D** | NOW visual unification (Plan Mode parity) | 3, 11, 21, 25, 27, 33, 34, 35, 50 | ~3 hrs |
| **E** | Feature deletions | 14, 19, 26, 29, 24 | ~1 hr |
| **F** | Plan Mode enhancements | 45, 46, 47, 48, 49, 52 | ~3 hrs |
| **G** | Calendar interactivity | 6, 7 | ~2 hrs |
| **H** | Notification system rework | 36, 43 | ~3 hrs |
| **I** | Settings + system polish | 5, 37, 38, 39, 40, 41, 42, 44 | ~2 hrs |
| **J** | Misc clarifications + decisions | 18, 20, 22, 31 | ~30 min |

**Total: ~20 hours of focused work** across roughly 8–10 sessions.
Realistic to ship over 2 weeks if you do one focused 90-min session
most days.

---

## Phase A — Misleading-math hotfixes (DO FIRST)

These actively mislead you when using the app. Fix before architectural
or visual work.

### #1 — "Spent today" doesn't align with Analysis tab
Dashboard says one number, Analysis tab says another. Probably reading
from different sources or applying different filters (income vs
discretionary vs roundups). **Fix: route both through MODEL.todaySpent.**

### #2 — Variable expenses calculated into "pay this week"
Variable bills (e.g. Fuel) get folded into pay-this-week instead of
being treated separately. Need to think through whether variable bills
should be in the bills total or shown separately. Probably separate
section: "Fixed bills this week" vs "Variable estimated this week."

### #8 — Dynamic projection "spent so far" wrong
Shows $98.47 for the week but you spent $135 today. Off by ~$36.
Likely a discretionary-only filter where it should be all-spend, or
wrong week-start date.

### #9 — Dynamic projection "Bills remaining" says $0
But Teachers Health $259 + Amazon Prime $10 are due before week ends.
Function is excluding bills it shouldn't be excluding. Possibly the
inverse of the Phase 2C suppression bug — over-suppressing.

### #10 — Cascading week total wrongness
Effects compound: #8 + #9 → week total projection is wrong. Single fix
once #8 and #9 are correct.

### #12 — "This Week $120" total inconsistent with shown bills
$120 total claimed, but the bills shown crossed-out as paid would only
sum to $110. Off by $10 (Amazon Prime $9.99). **Same root cause as
tonight's paidBills mission.** Verify after that ships.

### #13 — Netflix "monthly bill day 10, paid on 9th"
Three problems mixed: confusing display, lowercase tracking, no
date validation that prevents marking-paid before due-date. Probably
fine to mark-paid early (you might pay early) but display should be
clearer.

---

## Phase B — Hard UX blockers

### #15 — Keyboard closes after every character on expected income input
**This is a hard block.** Cannot use the feature at all. Probably a
re-render firing on every input event that destroys the input element.
Fix: don't re-render on input events, only on blur/submit.

### #36 — Notifications cut off, can't interact
Notification UI clips content and tap targets. Need to either redesign
the notification cell or make it expandable.

### #51 — "Lock this plan" needs confirmation popup
Currently irreversible action with no confirmation. Add a "Are you sure?
This locks your allocation for the cycle" popup before action fires.

---

## Phase C — Architecture / where things live

You've identified clear opinions about what should live in NOW vs
Settings vs Plan Mode. This phase honors them.

### #4 / #30 — Time Machine → Settings (out of NOW dashboard)
Currently lives in Analysis. Move to Settings under a "History" or
"Restore" subsection.

### #5 — Settings: dedicated "Financial Data" tab
Permanent data that rarely changes: bills (rent, subscriptions),
weekday/weekend budget, payday day, income. All editable. Currently
scattered across multiple Settings sections.

### #17 — Goals tab content → Plan Mode only
"Your goals and timeline" section in NOW Analysis duplicates Plan Mode
goals. Remove from NOW. Single source of truth in Plan Mode.

### #23 — Financial Progress + Income Received → Plan Mode
These are forward-looking, not "right now" data. Belong in Plan Mode.

### #28 — Emergency Fund → Plan Mode only
Currently in both Analysis and Settings weirdly. Plan Mode is the
canonical place.

### #52 — China Holiday duplicated between Goals and Trips
Same item appears in two places with two saved-amounts. Consolidate.
Trips is the right home (it has dates). Goals are long-term
non-trip targets.

---

## Phase D — NOW visual unification (Plan Mode parity)

The big one. Item #32's design north star applied across NOW.

### #3 — Too many tiles in Analysis tab
Currently ~12 tiles. After Phase C (moving things to Plan Mode and
Settings) and Phase E (deletions), should be down to ~4–5. Then
visual pass to make remaining tiles match Plan Mode style.

### #11 — Pointless duplicate "$110 due this week" tile
Already shown elsewhere. Fold the calculation into a single explanatory
tile that shows where the numbers come from.

### #21 — Spending by category duplicated
Already shown at top of Analysis with better interactivity. Remove the
duplicate. Verify no calculation pipeline depends on the second view
before removing.

### #25 — Last 7 days too small to be useful
Tiny chart, hard to read individual days. Either make it the focus of
its own tile (bigger), or remove it and rely on the spending pivot.

### #27 — Essential vs Discretionary should be higher priority
Currently buried. This is the most important behavioral signal —
"essential up, discretionary down" is John's progress thesis. Move
to top of Analysis or near safe-to-spend on dashboard.

### #33 / #50 — Cheap-looking ovals around buttons (notifications, etc)
Header buttons (notifications, snapshot, theme) have a weird oval
backing that looks bad. Plan Mode doesn't have this. Apply Plan Mode
treatment.

### #34 — Weather takes too much space, not used
Either remove entirely or hide under a small icon that expands.
Currently top-level real estate spent on something John doesn't use.

### #35 — "This Week" dashboard tile should be interactive
Tapping it should swing to Analysis tab spending pivot. Right now it's
read-only.

---

## Phase E — Feature deletions

### #14 — Daily Character Score / points system
Decision earlier tonight: simplify to no-spend evenings only. ~200
lines → ~30. Strip out points, vape detection, FIFA detection, weed
detection — all the gamified stuff that you don't use. Keep no-spend
evening tracking only.

### #19 — SLYGHT Score
0–1000 score with 5 sub-categories. Doesn't drive any decision. Cut
entirely. ~120 lines.

### #26 — Spending DNA
You called it useless. Cut.

### #29 — 90-day forecast
You called it useless. Cut. (Forecast logic stays in Plan Mode if
needed.)

### #24 — Worst 5 vs Baseline
You said "good figure but I don't use it." Soft cut — keep the data
calculation if it powers anything, but remove the tile.

---

## Phase F — Plan Mode enhancements

Plan Mode is the strongest part of the app. These items make it
stronger.

### #45 — Plan modal popup needs containment
When breakdown popup opens, you can scroll the underlying page. No
backdrop/border. Should fix scroll-lock and add visual focus (dim
background, sharp border).

### #46 — Editable early repayment fee
Currently hardcoded "$382 (2 months interest)". When the bank gives
you the actual fee, you should be able to type it in and the WRX
analysis recalculates live.

### #47 — Bonus preview
"Quarterly bonus expected" currently just adds a number. Should
preview: "If you receive $X bonus, your daily becomes $Y, your savings
allocation could be $Z, your debt payoff accelerates by N months."

### #48 — Locked non-negotiable transparency
Currently shows the amount but not the math. Should show: starting
balance + income + bonus → less rent → less savings → less KIA →
remaining = $X discretionary. Tie back to bonus from #47.

### #49 — Slider justification ("can I afford $500 to China?")
When you push China slider to $500 this month, the app should react:
"This leaves $X for daily living = $Y/day. That's below your $30
weekday budget. Suggested: cap at $200 or pull $300 from Freedom
Buffer?" Real-time affordability check on the sliders.

### #52 — Goal time horizons (1mo / 3mo / 6mo / 1yr / 3yr / 5yr)
Currently goals are open-ended. Add time bracket and the app
auto-suggests realistic numbers based on income and current pace.
"For a 3-year goal of $10k, you need $278/month. You're currently
saving $X. Gap: $Y."

---

## Phase G — Calendar interactivity

### #6 — Day-detail popup should be interactive
Tap a day, see bills/debts due. Currently it's view-only. Should match
the interactivity of the first Analysis tab tile — tap a bill to mark
paid, edit, defer, etc.

### #7 — Tap into next-month days from current calendar view
Currently the April calendar shows the first few days of May (1, 2, 3)
greyed out, but tapping them does nothing. You have to press "next" to
go to May then tap. Should be tappable from April view.

---

## Phase H — Notification system rework

### #36 — In-app notifications cut off (already in Phase B)
Already covered above.

### #43 — Smart push notifications barely work
Should fire context-aware notifications throughout the day:
- 10am breakfast check on office days
- 12:30pm lunch check
- 2pm afternoon snack reminder / Sunday grocery reminder
- 6:30pm home time / Sunday grocery reminder

Currently fires randomly, you got ~2 notifications in a week. Either
the worker's cron triggers aren't firing or the location/state checks
are over-filtering. Needs end-to-end debugging from worker → push API →
phone.

---

## Phase I — Settings + system polish

### #5 — Financial Data tab (already in Phase C)

### #37 — "Round-up enabled" indicator unclear
Toggle exists but no visible feedback when you log a transaction
showing "this just round-upped to China bucket +$0.40." Should show
last 3 round-up events somewhere visible.

### #38 — Export / Import / Snapshot semantics unclear
Three buttons, unclear what each does:
- Export: full state to JSON file (backup)
- Import: load state from JSON file (restore)
- Snapshot: copy compressed state string to clipboard (for pasting to
  Claude)
- "Export Claude Code" at bottom: ???

Either rename these to be self-explanatory or add inline help text.

### #39 — Bills should be editable from one canonical place
Currently bills can be edited in Bills tab AND Settings. Pick one,
remove the other.

### #40 — State snapshots collapsed by default
List is huge, cluttering Time Machine. Show last 5, expandable.

### #41 — Data Health Check never records fails despite errors in
Activity Log
Two separate systems both watching the app, only one notices problems.
Either consolidate to one or have Health Check ingest from Activity
Log.

### #42 — UX Intelligence info not surfaced anywhere
System reports something but never shows it to you. Either surface it
or remove the system.

### #44 — Activity Log should auto-clear when no errors
Currently shows "43 issues detected" — all from before the TDZ fix
shipped. Should detect "no recent errors" and present a clean state,
collapsible.

---

## Phase J — Misc / clarifications

### #18 — "What changes everything" — what is this?
You scrolled past it because you didn't know what it was. That IS the
feedback. Either rename clearly or remove.

### #20 — "Projected to run out" + "If you need to borrow" — KEEP
You explicitly said this is brilliant. Verify no double-counting.
Already in good shape.

### #22 — Opportunity cost gets scrolled past
Currently a big tile that you skim. Could be inline with another tile
(e.g. shown as a small badge on the spending pivot category items:
"$527 on Food = $6,300/year"). More integrated, less standalone.

### #31 — Monthly position shown but needs revamping
Currently fragile inline calc per audit. Needs to read from MODEL and
present clearly. "You're $X ahead/behind on your monthly plan."

---

## Items already addressed tonight

- TDZ resilience fix shipped (commit 56896d8) — dashboard renders real
  numbers on phone
- paidBills month-aware lookup — mission written, about to ship

---

## Items deliberately deferred (Phase 2C work, not in this backlog)

- Coverage link: kill HEALTH heuristic, add `coversBillName`, UI for
  linking debts to bills
- 6 commits sit on `phase-2c-and-tdz-pending` branch
- Will be re-evaluated after Phases A–D land — possibly the architecture
  changes make some of Phase 2C unnecessary or change its shape

---

## Process notes

- Each phase should be its own focused session with manual phone
  verification before push (TDZ-fix flow worked well, keep using it)
- Phase D (visual unification) is the single most impactful phase but
  also the riskiest. Do Phases A, B, C first so the structure is right
  before the visual pass
- Phase F is the most fun. Save it as a reward
- Don't try to do more than one phase per session. Drift kills sessions
- After each phase, snapshot the state. Tomorrow morning open with a
  snapshot import so you have continuity
