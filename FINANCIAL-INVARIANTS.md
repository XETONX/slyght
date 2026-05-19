# FINANCIAL-INVARIANTS.md

> **The contract slyght must satisfy at all times.** Every state change, every render, every transaction must leave the app in a state where all of these statements are true. If any statement is false, the app has a bug — by definition.
>
> **This file is authoritative.** It outranks intuition, manual judgment, and "looks right to me." A change that violates these invariants is a bug, regardless of whether anyone noticed.
>
> **Read this file at session start, after CLAUDE.md, before CC-PRINCIPAL-ENGINEER-MANUAL.md.**
>
> **Version:** v1.0 (draft) · **Date:** 2026-05-18
> **Status:** Awaiting John's read + edits. Once he signs off, this becomes the testing contract.

---

## How to read this document

Each invariant is a statement that must be true. Format:

```
INV-NN: [the statement]
  Why: [why this matters in plain English]
  Violated when: [the symptom you'd see]
  Test: [how a Playwright spec would verify this]
```

If you (CC or Opus) are about to ship a change and you're not sure whether it preserves these invariants — STOP. Either write a test that proves it preserves them, or surface the conflict to John before shipping.

---

## A. Balance and cash flow

**INV-01: Every transaction logged decrements (or increments) the cash balance by exactly its amount.**
- Why: If you record a transaction, the cash you have changes. Period. There is no "networth-neutral" category that skips cash decrement — only the destination side differs.
- Violated when: app balance ≠ real bank balance after honest logging
- Test: load fixture with `S.bal = 1000`. Log -$200 Bills. Assert `S.bal === 800`. Log -$500 Savings (to Darwin). Assert `S.bal === 300`. Log +$100 Income. Assert `S.bal === 400`.

**INV-02: A "Savings" or "Transfer" category transaction decrements cash AND credits the destination bucket by the same amount.**
- Why: Money moved from your cash account to your Darwin savings account leaves cash AND arrives in Darwin. Both sides happen. Networth is unchanged.
- Violated when: balance shows transaction but bucket shows $0, OR vice versa
- Test: load fixture, log -$800 Savings to Darwin bucket. Assert `S.bal -= 800` AND `S.savingsBuckets.Darwin.saved += 800` AND `networth unchanged`.

**INV-03: A "Bills", "Debt repayment", "Loan", "Fixed (expense)" category transaction decrements cash AND networth by the same amount.**
- Why: This is real money gone. Cash leaves, no destination bucket.
- Violated when: networth doesn't drop when bill is paid
- Test: load fixture with networth = 10000. Log -$200 Bills. Assert networth = 9800.

**INV-04: An "Income" category transaction increments cash AND networth by the same amount.**
- Why: Money arrived. It's both in your account and in your wealth.
- Violated when: payday landed but balance didn't increase
- Test: load fixture pre-payday. Log +$8623 Income. Assert balance += 8623 AND networth += 8623.

**INV-05: `S.bal` (the displayed balance) at any moment equals the reconciled balance plus the net of all transactions since that reconciliation.**
- Why: The balance must be derivable. If two different code paths can compute different values for "current balance," they will disagree.
- Violated when: hero shows $X, footer shows $Y, NW cash shows $Z, all different
- Test: take 3 snapshots of balance from 3 different surfaces. Assert all equal.

**INV-27: No `recordWithAllocation` outflow that would drive `S.bal < 0` succeeds without a fresh `BRAIN.balance.confirmNegativeOverride()` arm (≤30s old) AND an explicit `_overrideNegativeWarn: true` flag on the envelope.**
- Why: Silent overdraw destroys trust. The user must consciously accept negative-balance state via a confirm modal; the confirmation token expires after 30 seconds so stale confirms can't authorize unrelated future txns.
- Violated when: a writer accepts an outflow that takes `S.bal` below 0 without both (a) a fresh `_negativeOverrideArmedAt` timestamp (≤30s old) and (b) `envelope._overrideNegativeWarn: true`. Inflows are exempt (income always lands). `_isRoundup` and `_skipFreeMoneyGate` are exempt (downstream of a parent that already passed the gate).
- Status: SHIPPED Bundle 33.x in `BRAIN.transaction.recordWithAllocation` Phase 4.A. Opt-in flag — existing callers see no behavioral change; UI migration to confirm modal lands per-site.
- Test: `tests/smoke/inv27-negative-balance.smoke.js` — 5 cases: (1) refusal without arm · (2) confirm-then-retry with `_overrideNegativeWarn:true` succeeds, audit logs arm event with `balance-negative-confirmed` source · (3) inflow always succeeds regardless of starting balance · (4) boundary $0.01 → $0.02 refused, then confirm + retry succeeds · (5) TTL: arm + simulate >30s age → retry refused with audit entry `balance_negative_override_stale`.
- Token lifecycle: `BRAIN.balance.confirmNegativeOverride()` stamps `_negativeOverrideArmedAt = Date.now()`. `_consumeNegativeOverride()` returns true only if age ≤ `_NEGATIVE_OVERRIDE_TTL_MS` (30000); audit-logs `balance_negative_override_stale` and returns false if stale. Token clears on either consumption path.

---

## B. Net worth

**INV-06: Net worth = cash + sum(bucket balances) + sum(other assets) − sum(liabilities).**
- Why: This is the definition. Any computation that disagrees is wrong.
- Violated when: NW changes in a way that doesn't match a transaction
- Test: load fixture. Record NW. Log a Savings transaction. Assert NW unchanged. Log a Bills transaction for $X. Assert NW decreased by exactly $X.

**INV-07: Net worth never changes spontaneously between user actions.**
- Why: If you didn't do anything, your wealth didn't change.
- Violated when: opening a sub-screen, navigating, or re-rendering changes the NW figure
- Test: load fixture, record NW. Navigate through 10 sub-screens without acting. Assert NW unchanged.

---

## C. Free money and allocations

**INV-08: After an allocation transaction, "free money this cycle" decreases by exactly the allocation amount.**
- Why: Allocating money to a bucket means that money is committed, not free.
- Violated when: marking Darwin as allocated INCREASES "free money" (the bug John named)
- Test: load fixture with free_money = 2000. Allocate $500 to Darwin. Assert free_money === 1500.

**INV-09: After a debt is marked paid, "free money this cycle" decreases by the amount paid (NOT by the debt's outstanding total).**
- Why: Paying a $550 debt means $550 cash left. The free money is now $550 less. The debt's clearing from the "essentials" list does NOT inflate free money.
- Violated when: paying a debt INCREASES free money (the second bug John named)
- Test: load fixture. Mark a $550 debt as paid (creating a -$550 Debt repayment transaction). Assert free_money decreased by 550.

**INV-10: `free_money_remaining + sum(committed allocations this cycle) + sum(spent essentials this cycle) = total cycle inflow − fixed essentials − buffer.`**
- Why: This is the conservation law for the cycle pool. If LHS ≠ RHS, money is being created or destroyed accounting-wise.
- Violated when: cross-surface free-money numbers diverge ($2,110 canvas vs $1,650 savings sub-screen)
- Test: at any point in cycle, compute LHS and RHS independently. Assert equal.

**INV-11: The same "free money" quantity displayed on multiple surfaces always shows the same value.**
- Why: If canvas root says $2,110 and savings sub-screen says $1,245, the user can't trust either.
- Violated when: cross-surface inconsistency
- Test: Playwright walks canvas root → savings sub-screen → auto-allocate modal. Scrape the "free money" number from each. Assert all match.

**INV-27: Negative balance warning.**
- Status: SHIPPED Bundle 33.x. Canonical body lives in §A after INV-05 (write-time guard belongs with the balance-conservation invariants). Cross-reference only.

**INV-28: A `recordWithAllocation` call with `direction:'outflow'`, `cat: ['Savings','Transfer']`, and a bucket destination is refused if the requested amount exceeds `free_money_remaining` for the current cycle. Exemptions: `_skipFreeMoneyGate` (payday-tick semantics), `_isRoundup` (round-up sibling txns).**
- Why: Bucket-allocation outflows draw from the same surplus pool that payday-plan allocations earmark. Without a refusal gate, ad-hoc bucket allocations can drain the pool past what the plan committed.
- Status: SHIPPED Bundle 30 Phase 2.B in `BRAIN.transaction.recordWithAllocation`. Currently DORMANT in production — no live UI surface triggers the gate (all three live allocation paths bypass via the exemption flags or omit the destination entirely). Resolved by ADR-Bundle31-A or ADR-Bundle31-B landing.
- Violated when: a non-exempt bucket allocation > free_money_remaining is accepted
- Test: `tests/smoke/transaction-paths.smoke.js:309` — Phase 2.B refusal probe

**INV-29: Plan lock narrow semantics (RESERVED — SDD-bundle-30 §C#3).**
- Status: Reserved invariant number for the locked-plan-state semantics work. Decision pending per "Pending decisions" section below. Earlier Bundle 32.2 work mistakenly assigned this number to the savings-override over-allocation rule; that rule is now correctly numbered INV-32 below. INV-29's reservation stands.

**INV-30: FX fee separate transactions (RESERVED — SDD-bundle-30 §C#4).**
- Status: Reserved invariant number. Decision pending per "Pending decisions" section below. When this invariant ships, fold its body in here.

**INV-31: Round-up timing immediate (RESERVED — SDD-bundle-30 §C#5).**
- Status: Reserved invariant number. Decision pending per "Pending decisions" section below. Round-ups exist in code (`BRAIN.SOURCES.ROUNDUP`) but the invariant body — "fires immediately on transaction record, not at end-of-day batch" — hasn't been formally asserted with a smoke spec. When this invariant ships, fold its body in here.

**INV-32: A `savings:*` override write via `BRAIN.plan.setOverride` that INCREASES allocation is refused if it would push `sum(savings:* thisCycleAmount)` above `snap.derived.surplus + ε`. Reductions are always allowed regardless of resulting state.**
- Why: Pre-Bundle-32.2 the override-write path bypassed all gates. User could allocate $1,433 to savings goals against a $1,170 surplus and the writes succeeded — the savings sub-screen surfaced "-$263 over allocated to goals" as a red display warning, but state was already corrupt at write time. INV-28 covers the txn-time path (`recordWithAllocation`); INV-32 covers the plan-time path (`setOverride`).
- Why reductions allowed: a user with currently-over-allocated state needs to be able to fix it by reducing allocations. Refusing reductions creates a stuck state.
- Violated when: a savings:* override increase is accepted that pushes total savings allocation above surplus
- Status: SHIPPED Bundle 32.2 in `BRAIN.plan.setOverride` (`index.html:20276+`). Active in production (every modal save handler routes through `setOverride`).
- Test: `tests/smoke/inv32-over-allocation.smoke.js` (renamed from `inv29-over-allocation.smoke.js` after the numbering correction). Load fixture; inject savings override > surplus via `BRAIN.plan.setOverride('savings', X, amt, {}, source)`. Assert `r.ok === false`, `r.reason === 'inv32-over-allocation'`, no state mutation, audit log appended `inv32_refusal` entry. Then assert a reduction call (`amt < oldAmt`) succeeds even in over-allocated state.
- Numbering history: originally shipped 2026-05-19 as INV-29; renumbered to INV-32 same evening after the SDD-bundle-30 INV-29 reservation collision was discovered during state-of-project audit. INV-29 reservation stands for "plan lock narrow semantics" per SDD-bundle-30 §C#3.

---

## D. Bucket balances

**INV-12: `bucket.saved` is exactly the sum of credits to that bucket minus debits.**
- Why: Bucket is a ledger. It is what's been put in minus what's come out.
- Violated when: Darwin shows $0 but transaction history shows -$800 to Darwin
- Test: load fixture. Make 3 allocations to Darwin totaling $800. Assert `S.savingsBuckets.Darwin.saved === 800`.

**INV-13: Round-up transactions credit the configured destination bucket.**
- Why: If "round up to China Holiday" is on and a transaction triggers a $0.40 round-up, that $0.40 lands in China Holiday's `saved` field.
- Violated when: round-ups in transaction history but China Holiday bucket unchanged
- Test: enable round-ups → China Holiday. Log transaction that triggers $0.40 round-up. Assert China Holiday `saved` += 0.40.

**INV-31: Round-up transactions fire synchronously after their parent transaction records.**
- Why: Deferred round-ups break audit-log temporal coherence ("why is my round-up audit ts hours after the parent?") and create reconciliation gaps if the user reconciles between parent and round-up. Synchronous keeps the parent+round-up as a single logical write. Also blocks the silent-drop class — if the app closes between parent and a `setTimeout`-scheduled round-up callback, the round-up vanishes.
- Violated when: parent txn at audit-log time T, round-up child at T+Δ where Δ > 100ms; OR round-up landing in a different event-loop tick (e.g., wrapped in `setTimeout` / `setInterval` / `queueMicrotask` / `await`).
- Status: SHIPPED Bundle 33.x. **Behavioral invariant** — codifies the existing synchronous pattern at both live emission sites (Quick Log `quickLogTxn` at index.html:9478 · chat `executeChatAction` log_txn at index.html:14931). The SDD §3 step 11 fold-into-`recordWithAllocation` migration is a separate future optimization; INV-31 holds either way.
- Test: `tests/smoke/inv31-roundup-timing.smoke.js` — 3 cases. (1) `executeChatAction({action:'log_txn', amt:9.40, ...})` emits parent + round-up; assert `|child.ts - parent.ts| ≤ 100ms`; assert destination bucket credited synchronously. (2) `quickLogTxn()` via DOM seeding emits same shape with same temporal guarantee. (3) `recordWithAllocation` alone does NOT emit a round-up sibling (regression guard — assertion FLIPS when SDD §3 step 11 fold-in lands).
- Anti-pattern enforcement: Guardian rule `no-async-roundup` (`guardian-static.js` rule #18) scans the AST for `setTimeout` / `setInterval` / `queueMicrotask` whose inline callback body references `_isRoundup`. Catches any future attempt to defer round-up emission. First anti-pattern rule in the Guardian catalog (counterpart to required-pattern rules like `no-direct-applyTxnDelta`).

---

## E. Cycle and date logic

**INV-14: "Days to payday" is computed from `cycleEndDate`, not from `S.payday` directly.**
- Why: When payday lands early (e.g. 14 May instead of 15 May), `cycleEndDate` reflects this. `S.payday` (day-of-month) doesn't.
- Violated when: canvas says 30 days, dashboard says 31, AI says 0
- Test: load fixture with paydayReceived=true on 14 May, S.payday=15, today=15 May. Read "days to payday" from canvas, dashboard, AI context. Assert all === same value.

**INV-15: `S.paydayReceived` and `S.paydayReceivedDate` are the source of truth for "did this cycle's payday land yet."**
- Why: The day-of-month alone (`S.payday = 15`) is insufficient because early/late payday breaks the day-only logic.
- Violated when: cycle math behaves incoherently around early-payday
- Test: load fixture with payday landed early. Assert all surfaces respect this.

---

## F. Bill state coherence

**INV-16: A bill marked paid increments the "paid count" on every surface that displays it.**
- Why: Marking a bill paid in one surface (dashboard) must reflect in others (canvas, bills tab).
- Violated when: bills tab shows "8 of 16 paid" but canvas tile still shows "6 of 16 paid"
- Test: load fixture, mark a bill paid via dashboard. Assert bills tab paid_count += 1, canvas tile paid_count += 1, plan-mode paid_count += 1.

**INV-17: "Bills due before payday" excludes bills already paid.**
- Why: Math should never count paid bills as still owed.
- Violated when: MAX PER DAY says $0 "essentials first" when essentials are mostly paid
- Test: load fixture with 6 of 8 pre-payday bills paid. Assert `getBillsDue()` returns only the remaining 2.

---

## G. Debts

**INV-18: A debt with `viaRent: true` is excluded from "active debts this cycle" totals.**
- Why: Property Deposit (via rent) is conceptually a debt but routed through rent — it's already counted in essentials. Counting it again would double-count.
- Violated when: debts sub-screen lists $5,681 Property Deposit but canvas says "Debts $0 CLEAR" (current ambiguity)
- Test: load fixture with one viaRent debt. Assert it appears in dashboard immediate debts UI but NOT in canvas debts total.

**INV-19: The debts sub-screen "X of Y" counter shows `paid_count` of `total_count` consistently.**
- Why: "$0 · 3 of 0" is semantically broken (currently displayed).
- Violated when: numerator doesn't fit denominator
- Test: load fixture with N active debts, K paid. Assert header reads "K of N paid".

---

## H. AI agent

**INV-20: AI tool `update_balance` modifies `S.bal` by exactly the delta needed to reach the target, never more.**
- Why: Current bug — overshooting by ~$7k makes the AI actively harmful.
- Violated when: user requests target $3000 from current $5000 (delta -$2000), AI applies -$5000 or similar
- Test: load fixture S.bal=5000. Call AI tool with target=3000. Assert post-call S.bal === 3000.

**INV-21: AI BRAIN context refreshes on every user message in chat.**
- Why: If user makes changes mid-chat, the AI must see them.
- Violated when: AI reasoning operates on stale state
- Test: load fixture, start chat, make external state change, send second message. Assert AI's reasoning reflects new state.

---

## I. Audit log

**INV-22: Every canonical writer appends to `S._auditLog`.**
- Why: The audit log is the forensic record. A write without an audit entry is invisible to debugging.
- Violated when: state changed but no audit row
- Test: load fixture, capture audit log length. Call every canonical writer once. Assert audit log length grew by exactly the number of writers called.

**INV-23: Audit log entries are append-only. No writer modifies or deletes prior entries.**
- Why: Forensic integrity. History should not rewrite.
- Violated when: prior entries change
- Test: load fixture with non-empty audit log. Call writers. Assert prior entries unchanged.

---

## J. UI invariants

**INV-24: Every interactive element is at least 44×44 pixels.**
- Why: Mobile touch targets must hit minimum size for accessibility.
- Violated when: missed taps on small buttons
- Test: Playwright iterates every interactive element on every surface. Assert dimensions.

**INV-25: No surface overflows the viewport horizontally at 380px width.**
- Why: Phone-first design. Content cutoff is broken UX.
- Violated when: locked banner clips at edge ("3 cycle stre[ak]")
- Test: render every surface at 380px width. Assert no horizontal scrollbar.

**INV-26: Every numeric display on screen has a tappable "explain" path.**
- Why: Per CC manual §6 — every number traceable. Trust requires showability.
- Violated when: a number appears that user can't tap to understand
- Test: Playwright finds every number on screen. Assert each has an `onclick` or `data-explain` attribute.

---

## How invariants get enforced

**Three layers:**

1. **Boot self-test** runs at app load. Verifies invariants A through F (state-shape ones). If any fail, log to `_auditLog` as `boot_invariant_fail`.

2. **Post-write assertions** run after every canonical writer call. Verify the writer's specific invariant held. If failed, log + console.error (don't crash — fail loud).

3. **Playwright test suite** runs against fixtures. Each invariant has at least one spec that fails when the invariant is violated. CI-friendly when CC sets that up later.

---

## How this document evolves

- John may add invariants ("the app should never show negative balance without a warning")
- Bugs found in the wild become candidates for new invariants
- CC may propose invariants as part of bundle SDDs
- All amendments via PR / commit, with rationale

**This is a living document. v1.0 is a starting set, not the final word.**

---

## Pending decisions (resolve in Saturday session)

These are invariants I think SHOULD exist but want John to confirm before committing:

- **Negative balance warning**: should the app refuse certain actions when they'd drive balance negative? Or warn? Or silently proceed? (Decides whether this is an invariant or a UX choice.)
- **Bucket overdraw**: can you allocate $1,000 to Darwin if free_money is only $500? Should the writer refuse, or allow with a warning?
- **Plan lock semantics**: while plan is locked, can essentials still tick? Can bonus still change? Can new transactions log against the cycle?
- **FX fee handling**: should the FX fee be a separate transaction line or attached as metadata to the parent transaction?
- **Round-up timing**: do round-ups fire immediately on transaction record, or at end-of-day batch? (Different invariants apply.)

---

**End of FINANCIAL-INVARIANTS.md v1.0 draft.**

John: read, edit, strike, add. Sign off before CC implements anything against this.
