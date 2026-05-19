# Invariant lockdown — 2026-05-19

**Status:** Drafts proposed by CC; awaiting John's PROPOSED→APPROVED sign-off
**Date:** 2026-05-19
**Author:** CC (Opus 4.7) — autonomous draft per John's 2026-05-19 directive ("do the drafting tonight; I'll sign off on PROPOSED ones next session")
**Source documents:** `FINANCIAL-INVARIANTS.md` §C/§K reservations · `docs/sdd/SDD-bundle-30-financial-math-integrity.md` §C decisions · Bundle 32.2 INV-32 work (commit `604c3ad`)

---

## Dispositions

| # | Title | Disposition | Substrate? | Ship next session? |
|---|---|---|---|---|
| INV-27 | Negative balance warning | **PROPOSED** | ✓ (Phase 4.A wired) | yes |
| INV-29 | Plan lock narrow semantics | **BLOCKED on Bundle 32.7 Pass 1** | needs lock canonical writer | no — after 32.7 |
| INV-30 | FX fee separate transactions | **PROPOSED (dormant until first FX txn)** | ✓ (writer-side); UI surface TBD | yes — text only |
| INV-31 | Round-up timing immediate | **PROPOSED** | ✓ (already synchronous in code) | yes — assertion + smoke spec |
| "INV-33-shape" | Always-allow-improvements policy | **KILLED — superseded** | — | n/a — already in INV-32 |

---

## INV-27 — Negative balance warning · PROPOSED

**Status:** All substrate ready. `BRAIN.balance.confirmNegativeOverride` exists. `BRAIN.transaction.recordWithAllocation` has the return path for `{ok:false, reason:'negative-warning-required'}`. SDD §C#1 drafted the canonical text.

**Canonical text (proposed — lift into FINANCIAL-INVARIANTS.md §A after INV-05):**

> **INV-27: No state mutation may result in `S.bal < 0` without explicit user confirmation.**
> - Why: Silent overdraw destroys trust. The user must consciously accept a negative-balance state.
> - Violated when: an action drives `S.bal` negative without surfacing a confirmation modal first
> - Status: PROPOSED — substrate ready (Phase 4.A wired into `recordWithAllocation`); needs activation + smoke spec ship.
> - Test: load fixture with `S.bal = 50`. Attempt to log -$100 Bills via `BRAIN.transaction.recordWithAllocation`. Assert writer returns `{ok:false, reason:'negative-warning-required'}`. Call `BRAIN.balance.confirmNegativeOverride()` then retry. Assert second call succeeds AND audit log contains `BALANCE_NEGATIVE_CONFIRMED` entry.

**Enforcement mechanism:** `recordWithAllocation` step 5 (per SDD §3) — if projected `S.bal − amt < 0` AND no `_overrideNegativeWarn` flag, return `{ok:false, reason:'negative-warning-required'}`. UI calls `BRAIN.balance.confirmNegativeOverride()` and retries. Source tag `BALANCE_NEGATIVE_CONFIRMED` on the audit entry.

**Ship plan next session (~30 min):**
1. Lift the canonical text into FINANCIAL-INVARIANTS.md §A after INV-05.
2. Verify `recordWithAllocation` Phase 4.A guard is active (or activate if currently bypassed).
3. Smoke spec `tests/smoke/inv27-negative-balance.smoke.js` — 4 cases: refusal on overdraw · confirm-then-retry succeeds · audit log carries BALANCE_NEGATIVE_CONFIRMED · `_overrideNegativeWarn` flag bypasses (for the actual confirm modal save handler).
4. Status: PROPOSED → APPROVED → SHIPPED.

**Risk:** Low. Substrate already exists.

---

## INV-29 — Plan lock narrow semantics · BLOCKED on Bundle 32.7 Pass 1

**Status:** Cannot enforce until lock state lives in ONE place. Scenario walker tonight surfaced three independent lock stores and two divergent unlock paths (see `docs/adr/ADR-bundle-32-7-lock-state-canonicalisation.md`). Defining "what locked means" before "is it locked" returns a single answer would codify the divergence.

**Prerequisite:** Bundle 32.7 Pass 1 (lock canonical writers). Once `BRAIN.plan.lock` / `BRAIN.plan.unlock` / `BRAIN.plan.isLocked()` are the single source of truth, INV-29 becomes enforceable.

**Canonical text (drafted, parked until prerequisite ships — SDD §K):**

> **INV-29: Plan lock prevents modification of `S.activePlan.overrides` only. It does NOT prevent ticking items, editing bonus, logging transactions, or marking bills paid.**
> - Why: Lock is about *plan-shape* commitment, not *execution* freeze. Users still need to record what they did during the cycle. Over-restrictive lock = users avoid locking. Under-restrictive lock = lock means nothing.
> - Violated when: locking the plan prevents tick operations, or fails to prevent override modifications
> - Status: BLOCKED on Bundle 32.7 Pass 1 (lock state canonicalisation). Text drafted; enforcement deferred.
> - Test: load fixture with plan unlocked. Set an override on a bill. Call `BRAIN.plan.lock(...)`. Attempt: (a) modify the same override → expect `{ok:false, reason:'plan-locked'}`. (b) tick the same bill → expect `{ok:true}`. (c) edit bonus via `BRAIN.plan.setBonus` → expect `{ok:true}`. (d) log a new transaction → expect `{ok:true}`. (e) mark a bill paid via `BRAIN.bills.markPaid` → expect `{ok:true}`.

**Enforcement mechanism (when prerequisite lands):** `BRAIN.plan.setOverride` gains a `if (BRAIN.plan.isLocked()) return {ok:false, reason:'plan-locked'}` guard at the head. `tickItem` / `setBonus` / `recordWithAllocation` / `markPaid` remain unguarded. Smoke spec asserts the contract.

**Ship plan: defer one session.** Bundle 32.7 Pass 1 next session → INV-29 enforcement same session as 32.7 if budget allows, else session after.

---

## INV-30 — FX fee separate transactions · PROPOSED (dormant until first FX txn)

**Status:** Writer-side substrate ready in `recordWithAllocation` (SDD §3 step 10: "If `fxFee` provided → recursively call recordWithAllocation for the FX-fee child"). NO LIVE UI surface emits `fxFee` opt yet. INV-30 ships as a contract that the future FX-fee toggle will satisfy.

**Canonical text (proposed — lift into FINANCIAL-INVARIANTS.md §A after INV-27):**

> **INV-30: FX fees are recorded as separate transactions linked to the parent via `linkedTo`.**
> - Why: FX fees mixed into the parent amount are invisible to "how much have I paid in FX fees this quarter" analysis. Separating them preserves the parent's true cost and makes the fee auditable as a category.
> - Violated when: a transaction with an FX-fee component lacks a sibling row with `cat='FX Fee'` and `linkedTo` pointing at the parent's `ts`
> - Status: PROPOSED — writer substrate ready (`recordWithAllocation` step 10); no live UI surface yet emits `fxFee` opt. Dormant invariant; activates when first FX-fee surface ships.
> - Test: load fixture. Call `recordWithAllocation({amt:100, cat:'Bills', fxFee:{amt:3, sourceCurrency:'USD'}}, ...)`. Assert two txns appended: parent ($100, cat='Bills') and child ($3, cat='FX Fee', linkedTo=parent.ts). Assert sum of category='FX Fee' over the period === 3.

**Enforcement mechanism:** Already in `recordWithAllocation` step 10. Smoke spec asserts that when caller passes `fxFee` opt, child txn lands with correct linkage.

**Ship plan next session (~20 min):**
1. Lift canonical text into FINANCIAL-INVARIANTS.md §A.
2. Smoke spec `tests/smoke/inv30-fx-fee.smoke.js` — 1 case (parent + child via writer opt).
3. Document in CLAUDE.md §5 that FX-fee UI is a future-bundle ask.
4. Status: PROPOSED → APPROVED → SHIPPED (dormant).

**Risk:** None. Writer-side contract; activates only when first caller passes `fxFee`.

---

## INV-31 — Round-up timing immediate · PROPOSED

**Status:** Code already fires round-ups synchronously after parent record. Currently UN-ASSERTED. INV-31 codifies the existing behavior.

**Note from Bundle 30 SDD r1:** "deprecated `update_balance` alias removed entirely (§4 per Q5)" + round-up timing is already synchronous in `BRAIN.transaction.recordWithAllocation` step 11. Bundle 30 explicitly described round-ups firing synchronously inside the parent writer call — INV-31 just formalises it.

**Canonical text (proposed — lift into FINANCIAL-INVARIANTS.md §D after INV-13):**

> **INV-31: Round-up transactions fire synchronously after their parent transaction records.**
> - Why: Deferred round-ups break audit-log temporal coherence ("why is my round-up audit ts hours after the parent?") and create reconciliation gaps if the user reconciles between parent and round-up. Synchronous keeps the parent+round-up as a single logical write.
> - Violated when: parent txn audit-logged at time T, round-up txn audit-logged at time T+Δ where Δ > 1 second
> - Status: PROPOSED — code already synchronous (`recordWithAllocation` step 11). Needs smoke spec to lock the behavior against future drift.
> - Test: load fixture with round-ups → Darwin enabled. Call `recordWithAllocation({amt:9.40, cat:'Other', direction:'outflow'}, ...)`. Capture audit log. Assert two entries: parent (cat='Other', $9.40) and child (cat='Savings', $0.60, _isRoundup=true). Assert child's ts ≤ parent's ts + 100ms. Assert Darwin bucket credited by $0.60.

**Enforcement mechanism:** Already in `recordWithAllocation` step 11 (synchronous recursive call). Smoke spec asserts the temporal coherence + child txn shape.

**Note on the 4 legacy round-up paths:** SDD §10 Phase 4.D lists `L9429`, `L14623`, `L14627`, `~L22159` as paths that should be folded into `recordWithAllocation` rather than firing as separate post-record calls. As of 2026-05-19, the chat-AI round-up path (L14931-14949) is STILL the legacy pattern — `BRAIN.transaction.record` followed by `BRAIN.balance.applyTxnDelta` separately. Scenario F surfaced this. INV-31's smoke spec should assert the contract on the canonical path (`recordWithAllocation`) only; the chat round-up site folds in Bundle 33 (FR-03 work).

**Ship plan next session (~30 min):**
1. Lift canonical text into FINANCIAL-INVARIANTS.md §D.
2. Smoke spec `tests/smoke/inv31-roundup-timing.smoke.js` — 3 cases: parent+child synchronous · audit log temporal · destination bucket credited.
3. CLAUDE.md §5 note: legacy chat round-up path still uses pre-Phase-4.D pattern; folds in Bundle 33.
4. Status: PROPOSED → APPROVED → SHIPPED.

**Risk:** None. Codifies existing behavior.

---

## "INV-33-shape" — Always-allow-improvements policy · KILLED — superseded

**What was proposed:** A separate invariant capturing the Bundle 32.2 policy "reductions in over-allocated state are always allowed regardless of resulting state."

**Why KILLED:** This policy is already documented as part of INV-32's body in FINANCIAL-INVARIANTS.md:

> "**INV-32:** A `savings:*` override write via `BRAIN.plan.setOverride` that INCREASES allocation is refused if it would push... above `snap.derived.surplus + ε`. **Reductions are always allowed regardless of resulting state.**"

Adding INV-33 would duplicate INV-32's exception clause. The "always allow improvements" pattern is a general-purpose principle that can be applied to any future write-time gate via parameterised "improvement-direction" annotation. Codifying it as a standalone numbered invariant adds bureaucracy without enforcement substrate.

**Disposition:** KILLED. If a future invariant needs the same exception, it'll cite "per INV-32 exception clause" rather than referencing a separate INV-33.

---

## Summary for next-session sign-off

PROPOSED ready to ship: **INV-27 · INV-30 · INV-31** (~80 min total · 3 smoke specs · text updates to FINANCIAL-INVARIANTS.md)

BLOCKED awaiting prerequisite: **INV-29** (after Bundle 32.7 Pass 1)

KILLED: **"INV-33-shape"** (superseded by INV-32 exception clause)

**Recommended sign-off order next session:** confirm INV-27, INV-30, INV-31 PROPOSED → APPROVED (1 minute each), then implement (~80 min). Bundle 32.7 Pass 1 (~3 hrs) afterwards or interleaved. INV-29 lands at end of Pass 1 or in the session immediately following.

After this sign-off, **all 5 pending invariant decisions are closed.** FINANCIAL-INVARIANTS.md goes from "26 shipped + 4 reserved + 1 implicit" to "29 shipped + 1 blocked (INV-29, prerequisite identified)" → after INV-29 lands, "30 shipped + 0 reserved." Substrate column complete on the invariant ledger.
