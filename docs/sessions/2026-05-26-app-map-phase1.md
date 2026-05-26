# Session — Jarvis App Map, Phase 1 (prove the trace shape)

Sixth track. Started the App Map (the big remaining Jarvis piece). Per John's
"scope the trace + prove the shape on a surface or two before grinding all," this
session proves the IS-vs-SHOULD trace shape on 2 surfaces and scopes the grind.
Brief: `docs/briefs/CC-JARVIS-PLATFORM.md` (App Map section).

## Shipped (local, branch `mission-control`, NOT pushed)
- `786b1b7` feat(mission-control): App Map Phase 1 — IS-vs-SHOULD trace, proven on 2 surfaces

## The reframe
A surface's wiring = its COMPLETE intended journey in real slyght steps, including
rungs that should exist but are missing/broken — gap shown IN POSITION, two columns
(SHOULD vs IS). Matched to `mission-control/jarvis-reference-IS-vs-SHOULD-ladder.html`.

## Proven on 2 surfaces (two break-shapes)
- **savings** (`flows/savings.json`, SLY-1): MISSING rung — step 4 goal picker absent →
  step 5 (bucket credit) dead → step 6 (cash debit) fires-anyway = the loss.
- **bills** (`flows/bills.json`, SLY-2): BROKEN/mismatched rung — step 3 markPaid writes
  next-month key (cycle bump), step 5 undoBillPaid reads current-month key → no-op.
  Real file:lines (openQuickLogModal:10154, quickLogTxn:10311, recordWithAllocation:24524;
  undoBillPaid:8809-8812, paidBillKey:4268, markPaid:8788).

## Build
- `flows/<surface>.json` (one file per surface = the checkpoint) → `build-flows.js`
  merges → `flows.json` (+ a roster of all 9 surfaces, traced vs not-yet; gzipped).
- App Map view (jarvis.js + jarvis.css): roster → click traced surface → two-column
  SHOULD-vs-IS ladder (rungs ok/gap/dead/fire, gap in position, gaps-are-tickets links).
  /api/flows read. Verified: 9-card roster (2 traced), savings + bills ladders render
  with the right rungs + ticket links + file:lines, 0 JS errors.

## The plan for the grind (scoped, awaiting John's go)
- Trace the other 7 surfaces (dashboard, plan, analysis, debts, ai, settings, nav) into
  `flows/<surface>.json` — likely parallel per-surface drones (like the walk-and-judge
  Gather), each reading the real handlers, big surfaces (settings ~57, dashboard ~43)
  checkpointed as their own file.
- Then Phase 2 (the clickable map): front/back toggle (front = the actual screen, back =
  the flow), now-vs-after-fix on the front, the cash-hub-and-spokes overview. gaps-are-tickets
  already links into Jarvis.

## JOHN-KNOWLEDGE
Added Demonstrated: **IS-vs-SHOULD as the complete intended journey** (John designed the
reframe + the gap-in-position modelling insight + built the savings ladder reference).
