# Walk-and-Judge — Coverage Map (2026-05-26, FIRST BATCH proof)

> **Output 1** of the campaign. Honest markers: ✓ COVERED (walked + screenshotted + behaves) · ✗ BROKEN (walked + misbehaves, finding attached) · ⊘ NOT-COVERED (story authored, not yet walked). A ⊘ is an honest admission, not a gap to hide.
>
> **The loop (proven):** deterministic Playwright walker (`scripts/walker/run-walk.js`) seeds the FAKE fixture (`state-snapshot.fake.json`, `pushOnSaveEnabled:false` → never reaches KV), drives a scripted flow, screenshots EVERY step, captures S-deltas + the audit-log "lands" (ground truth of each write). The JUDGE is Claude reading the screenshots — **no Anthropic API key needed** (the brief's autonomous-API-fleet is replaced by deterministic-walk + frontier-Claude verdict: cheaper, reproducible, safer).
>
> **Walk-data (Output 2 feed for Opus's interactive HTML):** `tests/walker-out/<stamp>/walk.json` + per-step screenshots (gitignored — reproducible by re-running the walker).

## WALKED THIS RUN — `tests/walker-out/2026-05-26T06-57-07/`

### Flow: darwin-A-quicklog — Quick Log → Savings → Darwin → ✗ BROKEN
| step | action | screenshot | result (audit "lands") | verdict |
|---|---|---|---|---|
| 1 | dashboard baseline | ✓ | bal 1240 · Darwin 800 · txns 6 | ✓ |
| 2 | open Quick Log | ✓ | modal opens | ✓ |
| 3 | select "Savings" | ✓ | **NO bucket/goal picker rendered** (visual-confirmed) | ✗ no way to pick Darwin |
| 4 | enter $300 | ✓ | — | ✓ |
| 5 | submit (quickLogTxn) | ✓ | bal 1240→**940** · Darwin **stays 800** · txns 6→7 · lands:[`txn_record`,`balance_apply_delta`] — **NO `bucket_saved_change`** | ✗ **cash left, goal uncredited** |
| 6 | aftermath | ✓ | Darwin still 800; toast "−$300 · Savings · Tap to undo"; **no affordability warning** | ✗ silent |
**Finding (✗ BROKEN, confirmed LIVE + visually):** Quick Log → Savings has no destination picker, so $300 decremented cash + logged a "Savings" txn but credited **no goal bucket** (audit shows no `bucket_saved_change`). Worse — Alex is **−$1,514 over-committed** (hero, screenshot), and the app accepted a $300 "save" with **no "you can't afford this" warning**. Same disease class as FR-02; the original Darwin finding, now proven on the running app.

### Flow: darwin-B-plantick — Plan-tick path → ✓ gate-correct / ✗ UX
| step | action | result (audit "lands") | verdict |
|---|---|---|---|
| 1 | baseline (re-seeded) | bal 1240 · Darwin 800 | ✓ |
| 2 | open Payday canvas | activePlan lazy-inits | ✓ |
| 3 | open Savings sub-screen | renders | ✓ |
| 4 | set Darwin override $300 | lands:[`inv32_refusal`] — **REFUSED** | ✓ gate correct / ✗ UX |
| 5 | lock plan | lands:[`payday_plan_locked` ×2] (dual-store mirror) | ✓ |
| 6 | tick Darwin | bal 1240 · Darwin 800 · txns 6 — **no-op** (no override to execute) | ✗ uncredited |
**Finding:** On Alex's over-committed state (surplus negative), INV-32 **correctly refused** the $300 savings override — the app being a proper adviser ("don't save when you can't cover bills"). BUT the refusal surfaces the raw token `inv32-over-allocation` (CLAUDE.md §8 plain-English violation), and the subsequent tick silently no-ops. So on this state **neither path credits Darwin** — Quick Log silently (the bug), Plan-tick correctly-but-cryptically. *(Whether to mark the gate ✓ or the no-op-tick ✗ is John's call; the gate firing is correct behavior, the raw token + silent no-op are the UX gaps.)*

### Boot — ✗ TDZ (caught live)
7 `pageErrors`: `Cannot access 'BRAIN' before initialization` at boot (`load`→`refreshModel`→`getBillsDue`→`isPaid` ~index.html:4512; `getLiveBal`→`getGenuineSurplus` in snapshot). MODEL falls back to a stub. This is the `phase-2c-and-tdz-pending` branch's issue — surfaced live by the walk. ✗ (recovers via stub, but boot model fails first paint).

## FULL FRAME — 7 surfaces · 202 actions (skeleton)
All 202 actions enumerated (driver + file:line) in the feature-graph skeleton, initial marker ⊘ NOT-COVERED. Walked-this-run rows above flip the Darwin savings sub-rows. Remaining: ⊘ (stories authored — see below — not yet walked).

| Surface | actions | walked | ⊘ remaining |
|---|---|---|---|
| Dashboard | 43 | 0 | 43 |
| Bills / Calendar | 20 | 0 | 20 |
| Plan-mode (canvas + sub) | 33 | 3 (savings override/lock/tick) | 30 |
| Analysis | 15 | 0 | 15 |
| Settings + Diagnostics | 57 | 0 | 57 |
| AI-Chat | 13 | 0 | 13 |
| Nav/chrome/onboarding | 21 | 0 | 21 |
| (Quick Log savings) | — | ✗ BROKEN | — |

## STORIES AUTHORED, READY TO WALK (13 hierarchical walk-specs)
First-batch (4): Darwin both-paths ✓walked · log-transaction · bills-mark-paid · plan-lock. Surface-level (9, Level 1 main → Level 2 per-button/tile → Level 3 cross-surface "updates X → verify at Y"): savings-goals+trips · daily-living+buffer+provisions · bills-full · analysis-full · dashboard-full · debts-full · AI-info-sources · settings-full · nav/chrome. Each is a deterministic flow def ready to drop into the walker's `FLOWS` array.

## CANDIDATE FINDINGS from the spec corpus (⊘ code-read, pending LIVE walk — do NOT promote until walked)
- **Savings goals/trips:** add-savings credits `bucket.saved` but never debits `S.bal` → **NW inflates** (FR-01/02 class) [HIGH]; goal-edit doesn't write canonical intent (reverts); mark-complete doesn't persist; `rainy-day` vs `rainy-day-fund` id mismatch; orphan buckets on delete; native confirm.
- **AI info-sources:** `buildSystemPrompt()` is **DEAD CODE** — the live prompt reads RAW `S.bal` (not `getLiveBal`) + `getDynamicDailyBudget` (not genuine surplus → the AI advises on a number the user can't see, CDB-23); self-contradicting static persona text; `mark_bill_paid` bypasses canonical writer; FR-03 `update_balance` overshoot; action errors swallowed.
- **Nav:** **PIN gate orphaned on boot** (splashTap never routes to pin-screen — security-or-descope flag); native alert in launchApp; goPage modal-sweep may miss EDIT_MODAL.
- **Bills:** cycle-relative writer-key vs reader-key mismatch → undo may silently no-op; edit drops `paymentDates`; 3-way "N days away" wrong for yearly.
- **Daily-living:** CDB-30 two-store split confirmed (Plan floor ≠ MAX-PER-DAY hero); provisions bypass canonical writer/audit.
- **Dashboard:** explainMaxPerDay formula ≠ MAX-PER-DAY card formula; FR-06 three day-counts; WRX two writer paths; fmt vs fmtC.
- **Debts:** no $0-archive UI; native confirm ×3; FR-07 canvas-vs-dashboard.

## FIXTURE NOTE
The fake fixture is over-committed (−$1,514 headroom) + thin (6 txns, no Bills/Loan txns, empty monthlyHistory). Good for the Darwin/affordability finding; for the Analysis filter-scatter + a clean Path-B-works contrast, the fixture needs augmentation (a few Bills/Loan/correction txns + a positive-surplus variant + monthlyHistory). Tracked as a build item.

## SCALED PLAN (prove → scale)
1. ✓ Loop proven (this run). 2. Add the other 3 first-batch flows to `FLOWS` (log-txn, bills-mark-paid, plan-lock) → walk → judge → flip markers. 3. Add a positive-surplus fake-fixture variant for the clean contrasts. 4. Fan out: convert the 9 hierarchical specs into flow defs, walk per-surface (parallelizable — one walk per surface), CC/sub-agent vision-judge each, flip all 202 markers. 5. Opus renders `walk.json` → interactive HTML path map. Code FIXES the walk surfaces (e.g. the Darwin no-picker) route through the normal pipeline with John's approval; the walking itself is read-only on fake data, safe to run freely.
