# MISSION: TILE CLEANUP — BACKLOG ITEMS 3, 11, 14, 19, 21, 24, 26, 29

## ⚠️ Read this header before any code touches the file

**Source:** John's 52-item backlog, items he explicitly flagged as
unused, duplicate, or unnecessary clutter.

**Items in scope:**
- **#3** Too many tiles in Analysis tab (umbrella — resolved by below)
- **#11** Duplicate "$110 due this week" tile (already shown elsewhere)
- **#14** Daily Character Score / points system simplification
- **#19** SLYGHT Score removal
- **#21** Spending by category duplicate tile
- **#24** Worst 5 vs Baseline removal
- **#26** Spending DNA removal
- **#29** 90-day forecast removal

**Pattern:** every item is a deletion or simplification of something
John has explicitly told us he does not use or finds confusing. The
underlying calculations stay (some power other tiles); only the visual
tile is removed.

**Estimated time:** 60-90 minutes. Hard stop at 2 hours.

**Why this mission:** lowest-risk change possible in a finance
codebase. Deletions don't break math. Each deletion makes the app
cleaner, faster, more focused. Doesn't conflict with future design
system work — deleted things don't need redesigning.

---

## ⚠️ PUSH POLICY

Single commit, manual phone verification, push to main. Same flow as
prior missions tonight (5c6e219, 4a8cfba both shipped clean).

investigate → delete one item at a time → test no regressions → commit
(single) → push → print verification block → STOP.

---

## SUCCESS CRITERIA

1. Each of the 8 tiles is removed from its visible location, OR
   simplified per the spec below
2. The underlying calculation/data is preserved if it powers other
   tiles (don't delete the calc functions, just the renderer)
3. No regression to dashboard "Spent today," bills tab calendar,
   Plan Mode what-if, or any of the prior fixes (4a8cfba, 5c6e219,
   c800400, 56896d8)
4. All existing 35 tests still pass
5. Single commit, manual phone verification gate, push to main

---

## CONSTRAINTS

- **Do NOT redesign anything.** Tile removal is structural, not
  visual. The remaining tiles keep their current styling.
- **Do NOT modify dashboard, bills tab, or Plan Mode.** All deletions
  are in the Analysis tab unless noted.
- **Do NOT delete calculations.** If a function is computed but the
  tile is being removed, leave the function in place. It might power
  other things, and we don't want to chase down dependencies.
- **Do NOT consolidate the surviving tiles into new layouts.** That's
  post-payday redesign work.
- **Single commit.**
- **No "while I'm here" refactors.**

---

## WORK PLAN

### Step 1 — Investigation (10 min, read-only)

For each item, locate the rendering code and document:

```
| # | Item                  | Location | Calc deps | Safe to remove? |
|---|-----------------------|----------|-----------|-----------------|
| 11| Duplicate $110 tile   | line ### | ?         | y/n             |
| 14| Character Score       | line ### | ?         | partial (see #14)|
| 19| SLYGHT Score          | line ### | ?         | y/n             |
| 21| Spending category dup | line ### | ?         | y/n             |
| 24| Worst 5 vs Baseline   | line ### | ?         | y/n             |
| 26| Spending DNA          | line ### | ?         | y/n             |
| 29| 90-day forecast       | line ### | ?         | y/n             |
```

For #14 (Character Score), confirm the simplification spec from John's
backlog: keep no-spend-evening tracking only, strip vape detection,
FIFA detection, weed detection, and the points aggregation.

For each item, check if the calculation function is referenced
elsewhere (e.g., the underlying score calc might be used in chat
context, notifications, or other tiles). If so, leave the function
intact and only remove the tile renderer.

**STOP after Step 1 and confirm before editing if any item turns out
to be load-bearing for something else.**

---

### Step 2 — Remove #11 (Duplicate $110 tile) (5 min)

Find the duplicate "$110 due this week" tile (it appears somewhere
beyond the actual "This Week" section — possibly on the dashboard or
near the calendar). Remove just that tile renderer. The information
remains visible in the canonical "This Week" section.

---

### Step 3 — Remove #19 (SLYGHT Score) (10 min)

Find the SLYGHT Score tile in the Analysis tab (or wherever it
currently displays). Remove the tile renderer.

The underlying score calculation (`_currentSlyghtScore` field, the
`computeSlyghtScore` function or similar) — leave it in place if
referenced elsewhere. If it's only used for the tile, leave it anyway
(no calc deletion in this mission).

---

### Step 4 — Remove #26 (Spending DNA) (5 min)

Same pattern. Find the tile, remove the renderer. Leave any underlying
calc.

---

### Step 5 — Remove #29 (90-day forecast) (5 min)

Same pattern.

---

### Step 6 — Remove #24 (Worst 5 vs Baseline) (5 min)

Same pattern. John's note: "good figure but I don't use it." Soft
delete — remove the tile, keep the calc available in case it powers
something useful later.

---

### Step 7 — Remove #21 (Spending category duplicate) (5 min)

The Analysis tab has a "Spending by category" view at the top (the
interactive pivot). The duplicate tile John flagged is somewhere
further down on the same tab. Remove the duplicate, leave the
canonical pivot at top.

---

### Step 8 — Simplify #14 (Daily Character Score) (15-30 min)

This is the biggest item — actual code reduction, not just deletion.

Current Character Score system tracks (per John's backlog notes):
- No-spend evenings
- Under-budget days
- Meal prep logging
- Workout logging
- Negative patterns via transaction note keywords (vape, FIFA, weed)

Simplification:
- **Keep:** no-spend-evening tracking
- **Remove:** under-budget tracking, meal prep, workout, all negative
  pattern detection (vape/FIFA/weed keyword scanning)
- **Remove:** the points aggregation that produces the "character
  score" number
- **Replace tile content** with a simple "Days no-spend this week: N"
  display, OR remove the tile entirely if it adds no value with just
  that one metric

If the negative pattern detection feeds notifications elsewhere, leave
those notification triggers alone (out of scope). Just strip from the
score calculation and tile.

---

### Step 9 — Run tests (5 min)

```bash
node tests/core.test.js
node guardian-all.js
```

All 35 existing tests should still pass. Don't add new tests for this
mission — the changes are pure deletions, not new functionality.

---

### Step 10 — Commit, push, print verification block (10 min)

```bash
git add index.html
git status   # confirm only that one file
```

If anything else is staged: STOP and report.

```bash
git commit -m "chore(ui): remove unused/duplicate tiles from Analysis tab" \
  -m "Backlog deletions: #11 duplicate $110-due-this-week tile. #19 SLYGHT Score (no decisions driven). #21 spending category duplicate (canonical pivot remains at top). #24 Worst 5 vs Baseline (unused). #26 Spending DNA (unused). #29 90-day forecast (unused). #14 Character Score simplified to no-spend-evening tracking only — stripped vape/FIFA/weed detection and point aggregation." \
  -m "All deletions preserve underlying calculation functions where they may be referenced elsewhere. No visual redesign. No layout consolidation."

git push origin main
```

Then print verification block (Step 11).

---

### Step 11 — Verification block

```
═══════════════════════════════════════════════════════════════
TILE CLEANUP SHIPPED to xetonx.github.io/slyght

Commit: <new hash>
Tests: 35/35 passing
Guardian: 4/4 passing

Backlog items: #3, #11, #14, #19, #21, #24, #26, #29

═══════════════════════════════════════════════════════════════
JOHN'S MANUAL VERIFICATION ON PHONE:

Wait ~60 seconds for GitHub Pages to redeploy.

Hard-refresh xetonx.github.io/slyght on phone.

[ ] 1. Open Analysis tab. Scroll through.
       Confirm: SLYGHT Score tile is gone.
       Confirm: Spending DNA tile is gone.
       Confirm: 90-day forecast tile is gone.
       Confirm: Worst 5 vs Baseline tile is gone.
       Confirm: duplicate Spending-by-category tile is gone (the
       interactive pivot at top should still be present).

[ ] 2. Find any "$110 due this week" tile that previously appeared
       outside the "This Week" section.
       Confirm: it's gone. The canonical "This Week" total still
       shows in its proper section.

[ ] 3. Find Character Score / points display.
       Confirm: it's either simplified to a "Days no-spend this
       week" line OR removed entirely. Vape/FIFA/weed detection
       is gone from any visible display.

[ ] 4. Open Dashboard. Confirm balance, "Spent today," and
       recent transactions still display correctly.
       (No regression to 5c6e219.)

[ ] 5. Open Plan Mode. Tap "Locked — Non-Negotiable."
       Confirm: breakdown still expands. (No regression to 4a8cfba.)
       Type a bonus amount.
       Confirm: preview block still appears. (No regression.)

[ ] 6. Bills tab → Calendar → tap May 1.
       Confirm: Teachers Health still shows paid.
       (No regression to c800400.)

[ ] 7. The Analysis tab should now feel noticeably less cluttered
       — fewer tiles, faster scroll, easier to find what you use.

If ALL pass: Analysis tab is cleaner. Backlog progress: 12/52
items shipped tonight (#1, 2, 8, 9, 10, 11, 12, 13, 14, 15, 19, 21,
24, 26, 29, 46, 47, 48, 49). Counting #3 as resolved by the deletions.

If ANY fail: report which one. `git revert HEAD && git push` to
roll back. Previous deployed state at 4a8cfba stays good.

═══════════════════════════════════════════════════════════════
```

THEN STOP.

---

## SAFETY RULES

1. No commits without guardian + tests passing
2. No "while I'm here" refactors
3. Single commit
4. Do not modify dashboard, bills tab, or Plan Mode
5. Do not delete calculation functions — only tile renderers
6. Do not redesign or consolidate the remaining Analysis tiles
7. Hard stop at 2 hours
8. After Step 1, if any item turns out to be load-bearing for
   something else (referenced by chat context, notifications, or
   other tiles), STOP and confirm with John whether to proceed

---

## Run with

```
Read C:\Users\admin\slyght\MISSION-TILE-CLEANUP.md and execute it
exactly. Single commit + push + verification block. Stop after print.
```
