# Jarvis QA — Overview + Board "verify all buttons" pass

**Date:** 2026-05-27
**Tester:** Claude Code (automated Playwright, chromium, viewport 2300×1320)
**Target:** `http://127.0.0.1:5050` (live server, not restarted)
**Mode:** NON-DESTRUCTIVE — modals opened and inspected, filters/search/views/sort/nav exercised (read-only, client-side). No create/delete/setMeta/setStatus/dispatch was confirmed.

**Data context at test time:** 34 tickets, **all in status `Open`**, 4 are P0. So views In Flight / Confirmed Live / Shipped legitimately show 0; Needs Judgment = 34. App-Map reports 22 gaps across 9/9 traced surfaces.

**Console / page errors:** none captured during the entire run on either view.

---

## Results table

Verdict key: **PASS** = works as expected · **FAIL** = broken/dead/wrong · **UX** = works but ugly/confusing/cut-off/lowercase.

### Overview (`#/overview`)

| Element | Verdict | Notes |
|---|---|---|
| Page loads | PASS | h1 "Overview", subtitle renders |
| Stat cards count | PASS | 6 cards |
| Stat card "Tickets" (34) | PASS | → `#/board`, All view, 34 rows, hint "Everything, unfiltered" |
| Stat card "Need Your Judgment" (34) | PASS | → `#/board?status=needs`, lands on **Needs Judgment** view (crumb + active chip), 34 rows |
| Stat card "In Flight (CC)" (0) | PASS | → `#/board?status=flight`, In Flight view, 0 rows (correct) |
| Stat card "P0 Critical" (4) | PASS | → `#/board?sev=P0`, P0 view, Priority=P0 filter active, **4 rows** |
| Stat card "Shipped" (0) | PASS | → `#/board?status=Shipped`, Shipped view, Status=Shipped filter active, 0 rows |
| Stat card "App-Map Gaps" (22) | PASS | → `#/map`, hint "9/9 surfaces traced" |
| Hub map rendered | PASS | `svg#hub` present |
| Hub map nodes clickable | PASS | 9 spoke nodes have onclick |
| Hub node click → surface map | PASS | e.g. dashboard node → `#/map/dashboard` |
| "The App At A Glance" legend | PASS | Clean / 1–2 gaps / 3+ gaps dots render |
| Gaps By Surface rows | PASS | 9 rows |
| Gaps By Surface labels not cut off | PASS | Full short names render, no clipping: Analysis, Dashboard, Debts, Payday plan, Bills & calendar, Nav / onboarding, Settings, AI chat, Savings & goals |
| Gaps By Surface row → surface map | PASS | e.g. → `#/map/analysis` |
| Need Your Judgment rows | PASS | 6 rows shown (capped) |
| Judgment row → ticket | PASS | → `#/ticket/SLY-1` |
| **"+28 more on the Board →" link** | **FAIL** | Lands on board with **0 rows / empty state** — see Bug #1 |
| Status Breakdown rows | PASS | 1 row (only "Open" has count>0); bar + count render |
| Status Breakdown row → board | PASS | Sets `status:'Open'` → board shows all 34 (correct, since every ticket is Open) |
| Confirmed Findings rows | PASS | 7 rows |
| Confirmed Findings row → ticket | PASS | → ticket detail |
| "Open full App Map →" header link | PASS | → `#/map` |
| "Full Map →" panel link | PASS | → `#/map` |

### Board (`#/board`)

| Element | Verdict | Notes |
|---|---|---|
| Page loads | PASS | h1 "Tickets / All" |
| Ticket rows render (All view) | PASS | 34 rows |
| Saved-view chips count | PASS | 6 chips (All / Needs Judgment / In Flight / Confirmed Live / Shipped / P0 Critical) |
| Chip "All" (34) | PASS | 34 rows, count badge matches |
| Chip "Needs Judgment" (34) | PASS | 34 rows, count matches |
| Chip "In Flight" (0) | PASS | 0 rows + empty state, count matches |
| Chip "Confirmed Live" (0) | PASS | 0 rows + empty state, count matches |
| Chip "Shipped" (0) | PASS | 0 rows + empty state, count matches |
| Chip "P0 Critical" (4) | PASS | 4 rows, count matches |
| Search box — no-match | PASS | gibberish query → empty state |
| Search box — filters live | PASS | "payday" narrows 34 → 4 |
| Search box — keeps focus after re-render | PASS | caret/focus retained through debounced re-render |
| Dropdown "Status" options | PASS | All Status / Open / Discussing / Aligned / Investigating / Confirmed live / Shipped — Title Case |
| Dropdown "Type" options | PASS | All Type / Bug / Feature / Task — Title Case |
| Dropdown "Priority" options | PASS | All Priority / P0 · Critical / P1 · High / P2 · Normal |
| Dropdown "Surface" options | PASS | All Surface + 11 Title-Case surfaces (AI Chat, Nav / Onboarding, Payday Plan, etc.) |
| Dropdown "Sort by" options | PASS | Last activity / Newest / Oldest / Severity / Status — Title Case |
| Status filter applies | PASS | Open → 34, Shipped → 0 |
| Type filter applies | PASS | feature → 1 row |
| Priority filter applies | PASS | P0 → 4 rows |
| Surface filter applies | PASS | dashboard → 2 rows |
| Sort applies (Severity) | PASS | Top row flips to a P0 ticket (SLY-31 → SLY-1) |
| Reset button appears when filter active | PASS | shows after applying a filter |
| Reset button clears filters | PASS | rows → 34, "All" chip active, dropdowns cleared, Reset button hides |
| Create New Ticket — modal opens | PASS | scrim + modal |
| Create modal — 3 dropdowns | PASS | Type [Bug/Feature/Task], Severity [P0·Critical/P1/P2], Surface [11 options] |
| Create modal — Title + Summary fields | PASS | both present, Title autofocused |
| Create modal — Cancel closes | PASS | closes with no write |
| Ticket row — checkbox present | PASS | |
| Ticket row — checkbox selects row | PASS | adds `.sel` highlight (UI-only; no bulk-op surface yet) |
| Ticket row — inline Status select | PASS | shows current + optgroup "Move to →" with legal transitions (Open → Discussing) |
| Ticket row — inline Type select | PASS | present |
| Ticket row — inline Priority select | PASS | present |
| Ticket row — assignee chip | PASS | renders "John" (derived from status) |
| Due chip renders if set | PASS (n/a) | 0 tickets currently have a due date; chip code path intact |
| Bundle chip renders if set | PASS (n/a) | 0 tickets currently have a bundle; chip code path intact |
| Ticket row click → opens ticket | PASS | row → `#/ticket/SLY-31` |

### Nav / chrome (read-only, exercised opportunistically)

| Element | Verdict | Notes |
|---|---|---|
| Rail links present | PASS | 10 nav links |
| Rail "Board" link | PASS | → `#/board`, active state set |
| Rail "Overview" link | PASS | → `#/overview` |
| Command palette button (⌘K) opens | PASS | `#cpScrim.on`, panel display:flex/opacity:1, input autofocused, 33 results listed |
| Command palette — search | PASS | typing "P0" narrows to ~8 result rows |
| Command palette — Ctrl+K opens | PASS | global shortcut works |
| Command palette — Esc closes | PASS | |

---

## Bugs to fix (ranked)

### 1. (HIGH) Overview "+28 more on the Board →" lands on an EMPTY board
- **Where:** `mission-control/jarvis.js:211` (Need Your Judgment panel footer button).
- **What happens:** Button reads "+28 more on the Board →" but its onclick sets
  `J.filter = {…, status:'needs', view:'all'}` and navigates to `#/board`.
  `'needs'` is **not a real status** (real statuses: Open/Discussing/Aligned/…), and `view:'all'`
  applies no view predicate. The board then filters `t.state.status === 'needs'` → matches nothing.
  Result: user clicks "see 28 more" and gets **0 rows + "No tickets match these filters."**
- **Verified:** clicked live → `hash=#/board`, crumb "/ All", active chip "All", **rows=0, empty state shown**.
- **Root cause / fix:** the inline button bypasses `route()`'s query-string mapping. The correct
  target is the **judgment saved view**, not a literal status. Two clean fixes:
  - Set `view:'judgment'` (and leave `status:''`), matching what the "Need Your Judgment" stat card
    achieves via `#/board?status=needs` (which `route()` maps to `view:'judgment'`), **or**
  - Change the onclick to simply `location.hash='#/board?status=needs'` so it reuses the same
    query-mapping path the stat card already uses (DRY + guaranteed-consistent).
- **Note:** the "Need Your Judgment" *stat card* at the top works correctly — only this inline
  "+N more" footer button is broken. Same anti-pattern lives in the Status Breakdown row
  (`jarvis.js:140`) but that one passes real status names so it happens to work.

*(No other FAILs found. The two FAILs my first harness pass reported against `window.J` were
false negatives — `const J` is module-scoped and never attached to `window`; re-tested via DOM/hash
truth and they all pass. The Reset "FAIL" and palette "UX" in the raw first run were also harness
artifacts, confirmed PASS on focused re-test.)*

---

## Polish / UX wins (works, but could feel more premium)

1. **Status Breakdown is a one-row chart right now.** Because every ticket is `Open`, the panel
   shows a single full-width bar. Not a bug, but it reads thin/unbalanced next to the richer panels.
   Consider a min-height or a muted "0" ghost row for the other statuses so the panel has structure
   even when one status dominates — it would also telegraph the pipeline stages to a first-time viewer.

2. **Saved-view counts can mislead at a glance.** "Needs Judgment 34" and "All 34" being identical
   is correct today but visually collapses the distinction. Minor — consider de-emphasizing a chip's
   count when it equals All's count, or it's fine as-is.

3. **Row checkbox selection has no payoff yet.** Selecting rows adds a highlight but there's no bulk
   bar / action surface (`BD2_SELECTED` is "ready for future bulk ops" per the code comment). A user
   who ticks several rows expecting a bulk action gets nothing. Either hide the checkboxes until bulk
   ops exist, or add a lightweight "N selected" affordance so the control isn't a dead end.

4. **Empty-view chips still show as clickable tabs with 0.** Clicking "Shipped (0)" lands on a polished
   empty state ("No tickets match these filters") — good — but the empty card's body copy ("Try a
   different saved view, clear the search, or reset the filter bar") is slightly off when the empty
   result is simply because *no ticket has reached that stage yet*, not because of an over-tight filter.
   Minor copy nuance.

5. **Gaps By Surface uses sentence-case short labels** ("Payday plan", "Nav / onboarding", "AI chat",
   "Savings & goals") while the rest of the app leans Title Case ("Payday Plan", "AI Chat"). These come
   from `flows.roster[].name` rather than the `SURFACE_NAMES` map, so casing diverges from the Board's
   Surface dropdown ("Payday Plan", "AI Chat", "Nav / Onboarding"). Not cut off (the original concern),
   just inconsistent casing between two surfaces that name the same things. Worth aligning for premium feel.

6. **Command palette `offsetParent` quirk (note for future automated tests, not a user bug).** The
   palette overlay is visually open and fully functional, but `offsetParent` reads null due to its
   fixed/transform layout — any future screenshot/visibility assertions should key off `.on` class +
   computed `display`/`opacity`, not `offsetParent`.

---

## Method notes / caveats

- Everything was driven through real clicks/selects/typing in chromium at 2300×1320, asserting on
  the resulting hash, crumb, active chip, rendered row counts, and option text — i.e. DOM truth, not
  internal state (the app's `J` filter object is module-scoped and not inspectable from the page, so
  all verdicts are based on observable behavior, which is the stronger test anyway).
- Strictly non-destructive: Create and Delete modals were opened and their controls verified, then
  Cancelled. No `setStatus`, `setMeta`, `createTicket`, `deleteTicket`, `dispatchCC`, or `autoTicket`
  was ever confirmed. Search / filters / saved views / sort / reset / nav are client-side reads and
  were exercised freely.
- Server was not restarted. Temporary Playwright harness files were created under `mission-control/`
  for the run and deleted afterward; no app code was modified.
