# MISSION: DASHBOARD UX CLEANUP (Mission A)

## Why this mission exists

John walked the dashboard on phone after Layer 2 shipped (commit 
9a316d3) and identified three pieces of dashboard real estate that 
don't earn their place:

1. Orphan text "Over by $X today (discretionary only) · Adjusted: 
   $Y/day for N days" floating between cards (writes to 
   `dash-overspend`)
2. "THIS WEEK" section with food/health/entertainment chips and the 
   "$75.48/day · Budget $21.56/day · $53.92 over pace" line (lives 
   in dashboard hero card area, redundant with Analysis tab)
3. "🏁 City2Surf in 96 days" line inside the weekly snapshot tile 
   (`weekly-snapshot-content`)

Removing these:
- Resolves OPEN-BUGS #15 partially (the $75.48 vs $21.56 
  cross-screen disagreement) — by deleting the section that exposes 
  the disagreement. The remaining "$21.56" inside the "You can 
  spend today" card becomes the unambiguous canonical pace.
- Reduces dashboard clutter without removing load-bearing 
  information. Everything kept exists more cleanly elsewhere 
  (Analysis tab for spending breakdown; weekly snapshot tile keeps 
  its actual financial summary content).
- Single commit, deletion only, no math changes.

This is Mission A in an A/B/C trio. A ships first because:
- Pure deletion — cannot break math
- Tests Layer 1 + Layer 2 gates on a small focused commit
- Resolves one cross-tile coherence bug as a free side-effect

Missions B (bill state lifecycle) and C (forecast payday netting) 
follow as separate commits.

## Required reading before starting

1. PROJECT-EXTRACT-2026-05-05.md § 5 (render functions catalog)
2. OPEN-BUGS.md — verify #15's "$75.48 vs $21.56" framing matches 
   what this mission resolves
3. The three render functions touched, in current index.html

## Decisions already made (do not re-ask)

**City2Surf removal: SURGICAL.** Remove only the City2Surf line 
inside `renderWeeklySnapshot`. Keep the rest of the tile's output 
(week pace, debt summary, daysToPayday line). Do NOT delete the 
whole tile.

**dash-overspend orphan text: TWO-SIDED.** Delete both the JS write 
in `renderAll` (the `overspendEl = $('dash-overspend')` block) AND 
the static `<div id="dash-overspend">` element in HTML. Leaves no 
orphan in either direction.

**THIS WEEK section: WHOLE BLOCK.** This is the section in dashboard 
hero containing the food/health/entertainment chip pills, the daily 
pace line ("$X/day · Budget $Y/day · $Z over pace"), and any related 
helper output. Identify the exact bounds during Step 1; remove the 
entire block including its container.

## Desired outcome

After this mission ships:

1. Dashboard renders without the three sections listed above
2. No empty/orphan DOM elements left behind (dash-overspend element 
   removed from HTML)
3. `renderWeeklySnapshot` still renders the rest of its tile content 
   (week pace, debt summary, daysToPayday)
4. No JS errors in console (no references to deleted DOM IDs)
5. Tests still 35/35 passing
6. Layer 1 (`npm run guardian-static`) still exits 0
7. Layer 2 invariants on dashboard still fire correctly (no banner 
   should appear from this commit alone)
8. No regressions to: 56896d8, c800400, 5c6e219, 4a8cfba, 3c9b684, 
   7351f9e, a8952c9, ae2bbef, cdbe86e, ebc1642, 35fd9c5, 0ec0ebe, 
   9a316d3
9. Visible improvement on phone walk: dashboard cleaner, no $75.48 
   vs $21.56 disagreement visible to user, no City2Surf line, no 
   orphan "Over by $X today" text

## What to do

### Step 1 — Locate (10 min)

For each of the three deletion targets:

1. **dash-overspend orphan text:**
   - Find the `overspendEl = $('dash-overspend')` JS block in 
     `renderAll` (or wherever it lives). Capture its line range.
   - Find the `<div id="dash-overspend">` element in static HTML. 
     Capture its line.
   - Verify no other code reads `dash-overspend`. If anything else 
     references it, surface and stop.

2. **THIS WEEK section:**
   - Identify the JS that writes the food/health/entertainment chips 
     plus the daily pace line. This is likely inside renderAll's 
     dashboard hero block or a dedicated render function.
   - Identify the container element ID(s) it writes to.
   - Capture line ranges for both JS write and HTML container.
   - Verify nothing else reads from those container IDs.

3. **City2Surf line:**
   - Find `renderWeeklySnapshot` function definition.
   - Locate the specific line(s) producing the "🏁 City2Surf in N 
     days" output.
   - Confirm the rest of the function body produces other useful 
     content (week pace, debt summary, daysToPayday) — that content 
     stays.

Print findings before any deletion. STOP for confirmation if 
anything surprising surfaces (e.g., dash-overspend has another 
reader, THIS WEEK section is structurally entangled with something 
load-bearing, City2Surf logic is the only thing in renderWeeklySnapshot).

### Step 2 — Execute (10 min)

In order, smallest first:

1. Delete the City2Surf line from renderWeeklySnapshot. Keep all 
   other tile content. Run `npm test` — expect green.
2. Delete the dash-overspend JS block AND the static HTML element. 
   Run `npm test` — expect green.
3. Delete the THIS WEEK section JS write AND its HTML container 
   block. Run `npm test` — expect green.

After each deletion, run:
```
npm run guardian-static
npm test
```

If anything goes red, stop and surface immediately. Don't proceed 
to next deletion.

### Step 3 — Verify (5 min)

1. `npm run guardian-static` → exit 0 (no Layer 1 violations, 19 
   allow-list entries unchanged)
2. `npm test` → 35/35 passing
3. `npm run guardian` → all 4 existing + Layer 1 green
4. Manually scan renderAll body and renderWeeklySnapshot — confirm 
   no orphan references to deleted DOM IDs

### Step 4 — Commit and push (5 min)

Single commit:

```
refactor(dashboard): remove three orphan/redundant sections

- Remove dash-overspend JS write + static <div id="dash-overspend"> 
  HTML. Orphan text "Over by $X today (discretionary only)" floating 
  between hero cards. Two-sided deletion (no orphan DOM left).
- Remove THIS WEEK section from dashboard hero (food/health/entertainment 
  chip pills + "$X/day · Budget $Y/day · $Z over pace" line). 
  Redundant with Analysis tab.
- Remove "🏁 City2Surf in N days" line from renderWeeklySnapshot 
  (surgical — rest of weekly snapshot tile content kept).

Resolves OPEN-BUGS #15 partially: deleting the THIS WEEK section 
removes the $75.48/day vs $21.56/day cross-section disagreement. 
The "$21.56" in "You can spend today" card becomes the unambiguous 
canonical pace.

No math changes. No render function logic changes (apart from 
deletions). Tests 35/35 passing. Layer 1 exit 0. Layer 2 invariants 
unchanged.

Mission A of A/B/C trio. B (bill state lifecycle) and C (forecast 
payday netting) follow as separate commits.
```

Push immediately. Verification on phone:
1. Hard-refresh dashboard
2. Scroll past hero — confirm no THIS WEEK section, no orphan "Over 
   by $X" text
3. Scroll to weekly snapshot tile — confirm rest of tile renders, 
   no City2Surf line
4. Open Settings → Math Health panel — confirm "All 9 invariants 
   passing"

## Constraints

- **Single commit** for the three deletions
- **No math changes** — pure deletion mission
- **No regressions** to any prior commit listed above
- **35 unit tests must still pass**
- **Layer 1 stays at 15 active rules with 19 allow-list entries** 
  (no rule violations introduced or removed)
- **Layer 2 invariants on dashboard still fire correctly** (this 
  mission shouldn't trigger any new banner)

## Push back if

- Any of the three sections has a reader/dependency we don't expect 
  — surface
- THIS WEEK section is structurally entangled with something 
  load-bearing — surface, propose alternative
- City2Surf logic is the only thing in renderWeeklySnapshot's body 
  (in which case "surgical" doesn't apply — surface)
- Total scope creeps past 45 minutes — surface, propose split
- A deletion would create a Layer 1 violation (e.g., a render 
  function that no longer has a target DOM ID would now flag 
  something) — surface

## Estimate

30-40 minutes. Step 1 is the bulk (locating exact bounds). Step 2 
is fast (deletions are a few line ranges each). Step 3 is verify. 
Step 4 is commit/push.

## Run with

```
Read C:\Users\admin\slyght\MISSION-DASHBOARD-CLEANUP.md and execute.

Step 1 first — locate all three deletion targets, capture line 
ranges for both JS writes and HTML containers. Print findings.
STOP for confirmation if anything surprising surfaces, otherwise 
proceed straight to Step 2.

Three surgical deletions, no math changes. Single commit. Push 
immediately. Verification on phone.

This is Mission A of A/B/C trio. After it ships clean, B (bill 
state lifecycle) and C (forecast payday netting) ship as separate 
commits.
```
