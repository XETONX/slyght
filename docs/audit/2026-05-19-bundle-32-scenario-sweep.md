# Bundle 32 — Scenario sweep A-K consolidated findings

**Date:** 2026-05-19
**Method:** `scripts/scenario-walk.js` against refreshed reconciled fixture (`state-snapshot.json` reconciled 2026-05-19, S.bal=$1113.61, paydayReceived=true). Frozen clock 2026-05-19T22:00+10:00. 11 scenarios · 33 step assertions · 11/11 passed.
**Trace:** `docs/audit/2026-05-19T07-21-16-814Z-scenario-walk.jsonl`
**Screenshots:** `docs/audit/_scenario_screenshots/<scenario-id>/step-NN.png`

---

## Per-scenario summary

| ID | Name | Status | Findings |
|---|---|---|---|
| A | daily-use | **PASS** 4/4 | working-as-designed |
| B | allocation-workflow | **PASS** 3/3 | working-as-designed (verifies Bundle 32.1 snap.derived migration) |
| C | over-allocation-refusal | **PASS** 3/3 | working-as-designed (verifies Bundle 32.2 INV-32) |
| D | lock-tick-unlock | **PASS** 4/4 | **architectural-divergence** (3 lock stores, 2 unlock paths) — ADR-32.7 drafted |
| E | activity-filter-coherence | **PASS** 3/3 | working-as-designed |
| F | chat-ai-dispatch | **PASS** 3/3 | working-as-designed (round-up sibling docs-worthy) |
| G | ai-update-balance-fr03 | **PASS** 3/3 | **user-facing-bug** (FR-03 known; captured as regression guard) |
| H | debt-subscreen-coherence | **PASS** 3/3 | **architectural-divergence** (snap.debts viaRent exclusion); informational (fixture state has 0 non-viaRent debts) |
| I | multi-cycle-rollover | **PASS** 3/3 | **architectural-divergence** (cycleId computation; r74 defer is workaround) |
| J | notify-local-queue | **PASS** 3/3 | working-as-designed |
| K | settings-ia-navigation | **PASS** 2/2 | working-as-designed |

---

## Architectural divergences surfaced (3)

### AD-1 · Lock state (3 stores, 2 unlock paths) — scenario D

- **Pattern:** multiple-sources-of-truth + write-path-fork
- **Surface:** `S.activePlan.lockedAt` vs `BRAIN.allocation`'s `slyght_payday_plan.lockedAt` vs legacy `slyght_payday_plan.locked` boolean. Two unlock paths (`openPaydayUnlockPlan` clears #1+#2 · `unlockPlanWithConfirm` clears ONLY #1). Real user-facing divergence after `unlockPlanWithConfirm`.
- **Maps to existing canonical-state work:** Bundle 32.7 ADR drafted (`docs/adr/ADR-bundle-32-7-lock-state-canonicalisation.md`). Recommended Option D Pass 1. Ship next session.
- **Status:** drafted, awaiting Pass 1 implementation
- **Prerequisite for:** INV-29 sign-off

### AD-2 · cycleId computation (date-derived, not incrementing) — scenario I

- **Pattern:** same-identity-on-rollover
- **Surface:** `BRAIN.plan.rolloverIfNeeded()` returns `ok:true` but `result.newCycle === result.previousCycle` when frozen clock is mid-cycle. Root: `_emptyActivePlan` computes `cycleId` from current-date's last-payday, not by incrementing the previous cycleId. With frozen clock 2026-05-19 + last-payday 2026-05-14, the "new" cycle resolves to the same date-derived id.
- **What this explains:** r74 (John 2026-05-14 "PLAN gets wiped after every commit") added `hasWork: true → defer rollover` as workaround. The workaround prevents the wipe but doesn't address the underlying cycleId-collision pattern. If user clears their work mid-cycle (e.g., unlocks + clears overrides), rollover fires, plan history archives the previous cycle, new plan opens with SAME cycleId. Surface: confusing UX (history shows two entries with same cycleId; render code that keys off cycleId could double-display).
- **Maps to existing canonical-state work:** NOT mapped — new canonical-migration candidate. Doesn't fit Bundle 32 columns 1-4 (write substrate / allocation reads / lock state / render-truth).
- **Status:** NEW finding · candidate Bundle 32.8 or ADR-E.5 (cycle-rollover semantics)
- **Recommendation:** Draft an ADR (`docs/adr/ADR-cycleid-semantics.md`) before any rollover work. Question to answer: should cycleId be (a) date-derived as today, OR (b) date-derived but with a discriminator suffix when same-day rollover, OR (c) incrementing integer with date-of-issue metadata? Option (c) aligns with Bundle 33 cloud-sync (Gist) since incrementing ids dedupe cleanly.

### AD-3 · `snap.debts` viaRent exclusion — scenario H

- **Pattern:** silent-filter (canonical reader excludes a category that's still in S)
- **Surface:** `BRAIN.plan.getSnapshot` line 20045: `const debtsList = (S.debts || []).filter(d => !d.paid && !d.viaRent);`. Reconciled fixture state at 2026-05-19 has 0 non-viaRent debts in `S.debts` — meaning EVERY visible "debt" on the canvas debt sub-screen is filtered out of the snap.debts.total + snap.derived.essentialsTotal computations.
- **What this means:** ` snap.debts.total = $0` and snap.derived.essentialsTotal doesn't reflect any debt. The user sees viaRent debts rendered on the Debts sub-screen (with non-zero amounts) but the plan-mode "this cycle" debts total is $0. This IS the intent (viaRent = paid out of rent, not from working balance), but it's a silent filter — consumers reading `snap.debts.total` don't know debts EXIST elsewhere.
- **Maps to existing canonical-state work:** partially — Bundle 32.1's `snap.derived` doesn't surface viaRent debt totals separately. Bundle 32.4 (essentialsVsDiscretionary drilldown) is the natural place to add `snap.debts.viaRentTotal` as a sibling field.
- **Status:** documented intent · candidate addition to Bundle 32.4 scope · informational only (no user-facing bug given current viaRent-only state)
- **Recommendation:** When Bundle 32.4 lands, add `snap.derived.viaRentDebtsTotal` so drilldown can show "$X working balance, $Y rent-paid debts" in the breakdown. Low priority until then.

---

## User-facing bugs surfaced (1)

### UB-1 · FR-03 update_balance overshoot — scenario G (regression guard)

- **Status:** KNOWN. Documented in CLAUDE.md §10 ("Don't trust in-app AI `update_balance` tool until FR-03 lands"). Scenario G now serves as the regression guard: it asserts the current buggy target-balance semantics. When FR-03 lands, the assertion flips to delta semantics.
- **Behavior:** `applyBalanceCorrection(newBal, reason)` interprets `action.amt` as TARGET balance. AI agent passing delta-meant value (e.g., "user added $500 income, set amt=500") drives balance to $500 absolute. Real-world consequence: $7k overshoot John reported.
- **Maps to existing canonical-state work:** Bundle 33+ (AI tool surface migration to canonical writers). Closes FR-03.
- **Recommendation:** Wrap the AI tool's `update_balance` dispatch in a delta-vs-target detector with explicit prompt update. Until then, do NOT re-enable that tool path.

---

## Working-as-designed (3 — documented to avoid future false-positives)

- **WAD-1 — Chat log_txn round-up sibling (scenario F).** When `S.roundUpsEnabled` and txn amt has cents, `executeChatAction('log_txn', ...)` creates TWO txns: the main expense + a round-up sibling routed to the user's round-up destination bucket. Behavior intentional per Bundle 22 v3 Phase 0.F (path #2). Implication for future test authors: assert against the chat-marked txn (filter `_chatLogged`), not the last txn in the array.
- **WAD-2 — planHistory caps at 24 cycles (scenario I).** Line 21101: `if (S.planHistory.length > 24) S.planHistory = S.planHistory.slice(-24);`. At cap, rollover still appends + slices the oldest. Length stays constant. ~2 years of history retained. No user-facing surface needs adjustment.
- **WAD-3 — NOTIFY.add dedups by id (scenario J).** Same-id repeats yield delta 0 (correct). Render loops can safely re-fire `NOTIFY.add` without flooding the notification list. Pattern already in use at `:23491` and elsewhere.

---

## UX gaps surfaced (0 new this round)

Scenario walker is action-oriented, not pixel-oriented. The 70+ UX findings from Phase 1B Run 2/3/4 vision audits remain as-is. The remaining `H` phase (~15 polish findings) is unaffected by this sweep.

---

## How the findings compound (per trajectory doc)

| Finding | Column | Bundle | Status |
|---|---|---|---|
| AD-1 (lock state) | Column 3 (lock substrate) | 32.7 Pass 1 | ADR drafted; ships next session |
| AD-2 (cycleId) | NEW — column 5 candidate (cycle substrate) | ADR-E.5 (new) | Needs ADR draft |
| AD-3 (viaRent silent filter) | Column 4 (render-truth) | 32.4 (extend) | Add to scope |
| UB-1 (FR-03) | Column 5 (AI layer) | 33.x | Bundle 33 AI migration |
| WAD-1/2/3 | n/a (documented) | — | Pattern register |

**Reading:** Bundle 32's substrate work is on track. The new finding (AD-2 cycleId) extends Bundle 32 by one phase but doesn't reshape the trajectory. AD-3 folds into 32.4's existing scope. UB-1 stays Bundle 33.

---

## Next-session entry points

1. **Bundle 32.7 Pass 1** — implement lock canonical writers per ADR. Migrate 5 call sites. Smoke spec. ~3 hours. Bumps INV-29 from RESERVED to enforceable.
2. **ADR-cycleid-semantics draft** — answer the cycleId-collision question. ~45 min. Sets up a future Bundle 32.8 or ADR-E.5 (either-or).
3. **Bundle 32.4 scope expansion** — add `snap.derived.viaRentDebtsTotal` to the essentialsVsDiscretionary drilldown spec. ~10 min doc change.

The 5 scenarios shipped this session (A-E) + 6 added tonight (F-K) form the regression baseline. Every Bundle 32+ commit should re-run `node scripts/scenario-walk.js` (~6 sec end-to-end on this fixture). Adds 0 commit-gate latency, surfaces inter-step coherence breakage immediately.

---

**End of sweep.** Scenario walker is now a permanent fixture in the engineering loop.
