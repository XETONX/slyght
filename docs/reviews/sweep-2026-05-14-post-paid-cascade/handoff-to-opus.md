# Handoff to Opus — post-paid cascade sweep

## Sweep package

- Folder: `docs/reviews/sweep-2026-05-14-post-paid-cascade/`
- Theme: **dark** (John's phone-default)
- Frames: `input/01-14-*.png` (3 dashboard, 3 bills, 3 analysis, 1 canvas root, 4 sub-screens)
- Scenario: John's current budget fixture, plan locked + all 15 bills ticked via `BRAIN.plan.tickItem`. Captures show how the cascade lands on each surface.

## Phase docs

- `METADATA.md` — sections 1–10
- `phase1-inventory.md` — frame-by-frame inventory (14 rows)
- `phase2-why-chains.md` — 12 findings (C-01 to C-12) grounded in code
- `phase3-reeval.md` — three passes (cross-frame consistency, copy, density)
- `phase4-proposals.md` — fix sketches with severity + effort

## What I'm asking Opus to do

1. **Confirm C-01 root cause.** I diagnosed it as: `openPaydayPlan()` at index.html:9642 calls `BRAIN.plan.rolloverIfNeeded()`; defer window is 12h after `cycleEndDate`; once past 12h on cycle-end day, lock+ticks are silently wiped. Cycle ID stays the same because `_emptyActivePlan` returns the same cycleStart (today-1mo). Is this the real cause? Any other paths I missed? Recommend Option A (wider window), B (anchor to new cycle start), C (require user confirm)?

2. **Pressure-test C-02 fix logic.** Detecting "intentional mark inside lock window" by `tick.ts >= lockedAt`. Are there edge cases where ts < lockedAt is legitimate (re-marking after undo)? Should I add the +7d cycleEnd window?

3. **Sanity-check C-03 + C-04 plumbing direction.** Sharing the canvas's "free money / runway" math with dashboard + analysis — does this introduce circular dependency or render-loop risk? Where would `BRAIN.plan` consumers naturally hook in?

4. **Visual review.** Frames 01 (dashboard top, red banner), 09 (analysis bottom, stacked warnings), 10 (canvas root post-paid). Anything I missed in dark-mode contrast / hierarchy?

5. **Verify the cascade evidence.** Frames 04-06 (bills tab) + 10 (canvas) show the cascade firing correctly. Is there a surface I should have captured that I missed?

## Direct quote from John (originating ask)

> "Can you do the same sweep you ve been doing for the next hour on SLYGHT current mode and write a sweep scenario for dark mode when i have my current budget and once ive paid off my bills in PLAN mode what does it look like in the dashboard and bills and analysis?"

## Working contract reminders

- Always verify code path before claiming bug (per CC manual)
- Don't trust stale memory over CHANGELOG
- Never undo r46–r71 work without explicit approval
- NRMA must never be re-added to BILLS
- paidBills must never be swept
