# SLYGHT Deep Audit — 2026-05-06

> Comprehensive bug inventory across the codebase. Anchored to actual
> code at HEAD `d0bc82e`. Cross-references OPEN-BUGS, divergence map,
> and live Layer 1 + Layer 2 runs.
>
> **Method:** ran guardian-static (16 rules, 30 warnings, 0 errors),
> guardian-runtime (47/50 — 3 known fixture-drift items), unit tests
> (41/41), plus targeted scans for: missing onclick handlers, CSS
> contrast bugs, parallel localStorage stores, stale function names.
>
> **Status:** Audit. Companion: `SHIP-PLAN-2026-05-06.md`.

---

## Findings by class

Six bug classes, each with a clean fix path. Class letters are used in
the ship plan.

### Class A — CSS visibility bugs

Pattern: `color:inherit` on a coloured-background banner, or low-opacity
backgrounds that fail contrast checks. Bugs in this class are pure
styling fixes — no logic changes, no risk of breaking behaviour.

| ID | Site | What's invisible | Why |
|---|---|---|---|
| **A.1** | `index.html:416–417` Math invariant banner buttons | × dismiss button + "Show me these bills" button | `color: inherit` on a `var(--red-dim)` parent with `color: var(--red)` = red on dark-red. "Show me these bills" also uses `rgba(255,255,255,0.12)` background = barely 12% opacity. |

**Audit conclusion:** Class A has *only* the banner instance. Other
buttons in the codebase using `rgba(255,255,255,0.06–0.12)` backgrounds
are on dark themed backgrounds where 6–12% white is subtly visible
*and* paired with explicit `color:rgba(255,255,255,0.6)` — they're
correct. The two banner buttons are unique because of `color:inherit`
+ red-on-red.

---

### Class B — Stale / wrong function references

Pattern: `onclick="X()"` where `X` doesn't exist. Silent failure.

| ID | Site | Stale name | Should be |
|---|---|---|---|
| **B.1** | `index.html:9856` (renderSpendingPivot, expanded category transaction row) | `openEditTxnModal(txnIdx)` | `editTransaction(txnIdx)` (defined L3086, used correctly at L3660 and L5698) |

**Audit conclusion:** A full sweep of every onclick handler in
`index.html` (25+ unique handlers across all tabs) found exactly ONE
stale reference. Every other handler has a defined backing function.
The interaction surface is wired correctly at the function-existence
level; the bug class is small.

---

### Class C — Persistence-split bugs

Pattern: data lives in a non-`slyght_v5` localStorage key, with
incomplete or missing dual-write to the main state. State updates in
one surface, doesn't propagate to others.

| ID | Store | Symptom | Mechanism |
|---|---|---|---|
| **C.1** | `slyght_goals` | Adding savings to `freedom-buffer` or any user-added goal updates Plan tab but not Dashboard / Settings (which read `S.savingsBuckets`) | `confirmGoalSavings` does dual-write only for `china` and `apartment` IDs; other goal IDs only update `slyght_goals` |
| **C.2** | `slyght_trips` (likely) | Adding savings to a trip likely has same pattern — update visible in Plan tab only | `confirmTripSavings` calls `PLAN.saveTrip` only; no dual-write to `S.savingsBuckets` for any trip |
| **C.3** | `slyght_payday_plan` | Payday plan items may not propagate; needs verification | `lockPaydayPlan` and edit handlers — surface for further audit |
| **C.4** | `slyght_character` | Character/discipline data — risk depends on whether other surfaces read `S.character` directly | Lower priority; isolated engine consumption |

**Total parallel localStorage keys found:** 22 (e.g. `slyght_v5`,
`slyght_goals`, `slyght_trips`, `slyght_payday_plan`, `slyght_character`,
`slyght_audit_log`, `slyght_snapshots`, plus various flag/cache keys).
Most are intentional separation (cache, audit logs, security). The
risky ones are the four above where user-meaningful data lives split
from main state.

**Audit conclusion:** This is the *real* mechanism behind OPEN-BUGS #11
and explains why repro of #11 was confusing. The handler runs, modal
closes, state updates — but updates the wrong store. Same pattern likely
across trips and possibly payday-plan.

---

### Class D — Open bugs needing repro / further investigation

Items in OPEN-BUGS marked open/investigating where the failure mode
isn't fully diagnosed from code alone.

| ID | OPEN-BUGS | Title | What's needed |
|---|---|---|---|
| **D.1** | #1 | Savings bucket goal/saved-amount edit broken | Specific bucket + field + failure mode (silent no-op vs error vs wrong value) |
| **D.2** | #2 | "Projected to run out" date math | Date offset bug suspected near `getSurvivalForecast` L2490–2514 |
| **D.3** | #4 | "+ Add Debt" button broken | Code is wired (L459 → openAddDebtModal at L3955 → save at L3997) — needs phone repro to identify failure mode |
| **D.4** | #20 | Calendar not showing immediate debts | `buildCalendarEntries` (L2274) DOES include debts. `renderCalendar` (L5124) DOES check `hasDebt`. Bug is upstream — `getCalendarDayItems` may filter, or `_covers` (debt-bill matching) over-matches |

**Audit conclusion:** D.* are real bugs but each needs phone-level
repro or deeper code dive before specifying fixes. Not blocking ship of
A and B fixes.

---

### Class E — Architectural / parallel-implementation bugs

Already inventoried in `STEP-3-DIVERGENCE-MAP-2026-05-06.md`. Summary:

| ID | Item | Tracked |
|---|---|---|
| **E.1** | Cross-tile `today's spend` (3 different values) | OPEN-BUGS #17 |
| **E.2** | 3 different daily-cost figures across forecast tiles | OPEN-BUGS #15 |
| **E.3** | Pace tile labelling — same label, different metrics | DivMap B1/B2 |
| **E.4** | PREDICTOR inline net-worth computation | DivMap A6 |
| **E.5** | 12+ inline `daysLeft(S.payday)` sites | OPEN-BUGS #22 / Mission F |
| **E.6** | All-time category sum (3 inline computations) | OPEN-BUGS #6 |
| **E.7** | paydayDate parallel implementation pattern | OPEN-BUGS #31 |
| **E.8** | Three inline category-filter arrays (incl. L3424, L5728) | DivMap A9, A10 |

**Audit conclusion:** Class E is the architecture work (BILLS_VM,
BRAIN consolidation, view-model migrations). NOT in scope for an
immediate ship. Continues on the architecture migration track.

---

### Class F — Layer 1 rule promotions

Static rules currently at WARN that COULD be promoted to ERROR. Promotion
blocks new instances of the bug class at commit time.

| ID | Rule | Current sev | Existing violations | Promote? |
|---|---|---|---|---|
| **F.1** | `no-third-discretionary-filter-array` (RC2) | warn | 2 (L3424, L5728) | **Yes — but allow-list both sites first.** RC2 is the parallel-impl rule class; promoting blocks new instances. |
| **F.2** | `no-hardcoded-survival-mode-string` | warn | 18 | No — anchor is "future-proofing (no shipped bug)". Promoting requires either fixing 18 sites or allow-listing 18 sites. Cost > benefit right now. |
| **F.3** | `no-hardcoded-debt-strategy-string` | warn | 10 | No — same reason as F.2. |

**Audit conclusion:** Only F.1 has positive cost-benefit for promotion
right now. F.2/F.3 should stay WARN until the underlying string
constants get extracted (a separate refactor).

---

## Cross-class fix dependencies

These are constraints on what can ship together vs separately:

- **A and B are independent.** Both are pure surface fixes with no
  shared code path. Can ship in one commit safely.
- **C is independent of A/B.** Different file region (PLAN handlers
  vs banner CSS / spending pivot). Different test surface. Can be its
  own work.
- **F.1 promotion requires C, E.8 to be acknowledged in allow-list
  first** (the L3424/L5728 sites won't be fixed in the hygiene commit).
  Allow-list entries are mechanical.
- **D.* are blockers for nothing.** They're independent investigations.
- **E.* (architecture) is parallel work — doesn't block A/B/C.

---

## Recommended bundling

Three coherent commit/mission groupings, smallest-scope-first:

### Bundle 1 — Hygiene commit (today)
Scope: A.1 + B.1. Both pure surface fixes. Net diff ≈ 5 lines.
Risk: nil. Visible win: yes (banner becomes useful, spending pivot
rows become tappable).

### Bundle 2 — Layer 1 hygiene commit (today or this week)
Scope: F.1 promotion + the two allow-list entries it requires.
Risk: nil. Effect: from the moment this lands, no new commit
introducing a third discretionary-filter array can ship without
explicit allow-list. Closes the bug class at commit time.

### Bundle 3 — Plan persistence consolidation (mission)
Scope: C.1 + C.2 (goals + trips dual-write or migration to single
source). Smaller fix possible today (Option A — extend dual-write);
proper fix wants its own mission spec (Option B — single source of
truth, migration of existing localStorage data into S).

### Bundle 4 — D.* investigations (when John is at his phone)
Scope: D.1 + D.3 + D.4 + D.2. Each needs phone-level repro to
specify fix. Not a ship — an investigation block.

### Bundle 5 — Architecture migration (in flight)
Scope: E.* via `BILLS_VM-REFERENCE.md`, future BRAIN work, view-model
migrations per `ARCHITECTURE.md`. Continues in parallel.

---

## Live verification context

All numbers below confirmed by running scripts against the actual
codebase in this audit:

- **guardian-static.js:** 16 rules, 30 warnings, 0 errors. Allow-list
  23 entries (0 unused). Catalog last verified clean.
- **guardian-runtime.js:** 47/50 passing — 3 known fixture-drift items
  (`Owed to Mum has viaRent:true`, `paydayReceived = true`, `Mark Pet
  Insurance paid`) per existing HANDOFF documentation.
- **tests/core.test.js:** 41/41 passing.

If any of these numbers change after Bundle 1 ships, that's a regression
worth investigating.
