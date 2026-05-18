# SDD-bundle-30-financial-math-integrity

**Status:** APPROVED 2026-05-18 (revision r1 — John's amendments + Q1-Q6 answers folded in)
**Date:** 2026-05-18 (r0) · 2026-05-18 (r1)
**Author:** Claude Code (CC)
**Triggered by:** FIELD-REPORT-2026-05-15-payday-plan-walkthrough.md
**Decisions baked in:** John's Part C / Part D answers + r1 amendments (2026-05-18)
**Surface to John before code:** Approved — proceed to Phase 1 Commit 1.A; per-commit STOP gates within Phase 1

**Revision history:**
- r0 (2026-05-18) — initial proposal
- r1 (2026-05-18) — INV-28 framing note (Phase 4); 'FX Fee' added to round-up exclusion list (§3 step 11); explicit `{ok:false, reason:'requires-confirm'}` returns in confirmation paths (§4); deprecated `update_balance` alias removed entirely (§4 per Q5); pre-Phase-4.B grep prerequisite added (§10); Q1-Q6 answers integrated; STOP cadence mixed per Q1 (§10)

---

## 1. Scope statement

### Field-report findings this bundle addresses

| FR | Severity | Title | INVs preserved |
|---|---|---|---|
| FR-01 | 🚨 BLOCKING | Cash hero `S.bal` doesn't decrement on transaction record | INV-01, INV-03, INV-05 |
| FR-02 | 🚨 BLOCKING | Bucket balances don't increment when allocation transactions record | INV-02, INV-12 |
| FR-03 | 🚨 BLOCKING | AI `update_balance` overshoots by ~$7k | INV-20 |
| FR-05 | ⚠️ HIGH | Free money goes UP after clearing debt | (subsumed — resolves once FR-01 + FR-02 land) |
| FR-08 | ⚠️ HIGH | MAX PER DAY shows $0 despite locked plan | (partial — verify after FR-01) |

### Adjacent invariants in the same surgical site (covered without scope-creep)

- **INV-06 / INV-07** — net worth definition + spontaneity. The single-writer pattern that fixes FR-01 cash mutation is the same site where NW divergence stops.
- **INV-22** — every canonical writer appends to `_auditLog`. Newly-introduced `S.bal` writer MUST satisfy this from day one.

### New invariants introduced by this bundle (per Part C decisions)

- **INV-27** — negative balance warning (C#1)
- **INV-28** — bucket overdraw refused (C#2)
- **INV-29** — plan lock narrow semantics (C#3)
- **INV-30** — FX fee separate transactions (C#4)
- **INV-31** — round-up timing immediate (C#5)

### Explicitly OUT OF SCOPE for Bundle 30

- FR-04 cross-surface free-money inconsistency → carried to Bundle 31 (pixel + label work; verify after FR-01/02 stabilise)
- FR-06 payday countdown unification → carried to Bundle 31 (date-logic surface, separate from accounting)
- FR-07 debts sub-screen disagreement → carried (design decision on viaRent semantics)
- FR-09 thru FR-14 → carried (per field-report §5 prioritisation)
- Full S.bal-as-derived migration (phases 3+4 of D#1) → deferred to Bundle 31+
- `UX-INVARIANTS.md` split (D#3) → deferred per John's decision

---

## 2. `S.bal` derived-migration plan (Part D#1)

### Call-site audit

Grep results from `index.html` (25,678 lines):

| Pattern | Count |
|---|---|
| Total `S.bal` references | **128** |
| Write sites (`S.bal = ...`) | **31** |
| Read sites (inferred: total − writes) | **~97** |
| `getLiveBal()` references (existing reader) | **28** |

**Per John's threshold rule (D#1): >50 reads → phased migration.** 97 reads warrants a phased structural fix, not a Bundle-30 big-bang refactor.

### The fundamental problem

`S.bal` is *currently* both a stored field and a derived expectation. INV-05 implies derived. FEATURE-MAP and the actual code treat it as stored. The 31 write sites all mutate it directly — some routing through `BRAIN.transaction.record` first, some mutating then-and-also calling the recorder (double-application risk), some mutating without ever calling the recorder. This is the architectural root of FR-01.

### Phased plan

**Phase 1 — Single-writer consolidation (Bundle 30, this bundle).**

- Introduce `BRAIN.balance` bubble. Single canonical writer: `BRAIN.balance.applyTxnDelta(delta, source, txnRef)`. This is the ONLY function permitted to assign `S.bal` for transaction-driven changes.
- `applyBalanceCorrection` keeps `S.bal = newBal` for reconciliation only (a distinct write-class; routes through `BRAIN.balance.reconcileTo(newBal, source)`).
- `BRAIN.transaction.record` is upgraded to call `BRAIN.balance.applyTxnDelta` internally whenever `_balAffected: true`. Callers stop touching `S.bal` directly.
- All 31 existing write sites audited; direct mutations either removed (already double-applied) or routed through the new writer.
- Guardian Layer 1 rule added: `S\.bal\s*=` outside `BRAIN.balance.*` is a violation.

**Phase 2 — Reader consolidation (Bundle 30, this bundle).**

- Promote `getLiveBal()` to `BRAIN.balance.get()` (keep `getLiveBal` as a thin alias for backwards compat through Phase 3).
- Add boot self-test invariant: `BRAIN.balance.get() === S.bal` at boot (the alias contract; should ALWAYS hold while S.bal is still stored).
- Dev-mode console warning whenever code calls `getLiveBal()` from outside the `BRAIN.balance.*` namespace (instrumentation only — does not change behaviour).

**Phase 3 — Reader migration (Bundle 31+).**

- Migrate the ~97 read sites incrementally over several bundles. Each migration: grep one read pattern, route through `BRAIN.balance.get()`, verify.
- When 0 direct reads remain, `S.bal` becomes private to `BRAIN.balance`.

**Phase 4 — True derivation (Bundle 32+).**

- `BRAIN.balance.get()` switches from returning `S.bal` to computing `S._lastReconciledBal + sum(txns since last reconciliation)`.
- `S.bal` is removed from persisted state. `S._lastReconciledBal` and `S.txns` are the new source of truth.
- INV-05 fully satisfied by construction.

### Risk assessment

- **Phase 1 risk:** HIGH for missed write sites. Mitigation: Guardian Layer 1 rule + boot self-test catches anything that slips. Layer V capture diff on every payday surface verifies UI unchanged.
- **Phase 2 risk:** LOW (read-only alias).
- **Phase 3 risk:** MEDIUM (97 sites × small risk each). Spread over bundles.
- **Phase 4 risk:** HIGH (changes persisted state shape). Snapshot before migration, careful rollout, separate SDD when we get there.

### What ships in Bundle 30 from this plan

**Phases 1 + 2 only.** Bundle 30 introduces the single writer, consolidates the reader API, and instruments dev-mode warnings. Bundle 30 does NOT migrate the 97 read sites and does NOT change the persisted state shape. This is the structural fix without the band-aid — every NEW write goes through the canonical path; every NEW read uses the canonical reader; existing readers are flagged for migration in subsequent bundles.

---

## 3. New canonical writers and source tags (FR-02)

### Problem recap

`BRAIN.transaction.record` currently records the txn and (per `_balAffected`) decrements `S.bal`. But for Savings/Transfer categories, it does NOT call `BRAIN.savings.addToBucket` — the bucket-credit side of INV-02 is missing from the manual transaction-record path. The auto-allocate Apply path DOES call `addToBucket` separately. That's the parallel-paths anti-pattern (CC manual §13).

### New writer: `BRAIN.transaction.recordWithAllocation`

```javascript
BRAIN.transaction.recordWithAllocation({
  amt,             // positive number (the dollar movement)
  note,            // user-visible description
  cat,             // category string (must be one of CATEGORIES_SET)
  direction,       // 'outflow' | 'inflow' (replaces income:bool — explicit)
  destination,     // optional: { type: 'bucket'|'debt'|'asset', id: string }
  fxFee,           // optional: { amt, sourceCurrency } — triggers INV-30 split
  income,          // legacy compat flag (computed from direction === 'inflow')
  _balAffected,    // legacy compat flag (defaults true; always true in v1)
  _txnType,        // legacy compat flag
  flagged,         // legacy compat flag
}, source) → {
  ok: boolean,
  txnTs?: number,       // primary txn timestamp
  fxFeeTs?: number,     // child FX-fee txn timestamp (per INV-30)
  roundUpTs?: number,   // round-up txn timestamp (per INV-31)
  bucketCredit?: { bucket, amt },
  reason?: 'unknown-source' | 'invalid-category' | 'insufficient-free-money'
         | 'invalid-amount' | 'bucket-not-found' | 'downstream-failed'
}
```

**Internal flow (atomic — all-or-nothing):**

1. Validate `source` against `_SOURCE_SET`. Reject if unknown.
2. Validate `cat` against allowed categories. Reject if not.
3. Validate `amt > 0`. Reject if not.
4. If `direction === 'outflow'` AND `cat ∈ {Savings, Transfer}`:
   - Look up `destination.bucket` (required). Reject if missing.
   - Compute `free_money_remaining` from `BRAIN.plan.getSnapshot()`.
   - If `amt > free_money_remaining` → reject with `'insufficient-free-money'` (**INV-28**).
5. If projected `S.bal − amt < 0` AND no `_overrideNegativeWarn` flag → return `{ok:false, reason:'negative-warning-required'}` (writer fails; UI must call `BRAIN.balance.confirmNegativeOverride()` and retry). (**INV-27**)
6. Compute delta to S.bal:
   - `outflow` → `delta = -amt`
   - `inflow` → `delta = +amt`
7. Call `BRAIN.transaction.record(...)` (existing writer) to append the txn ledger entry and grab its `ts`.
8. Call `BRAIN.balance.applyTxnDelta(delta, source, txnTs)` to update `S.bal`.
9. If `destination.type === 'bucket'` → call `BRAIN.savings.addToBucket(destination.id, amt, source)`. (**INV-02, INV-12 bucket side**)
10. If `fxFee` provided → recursively call `recordWithAllocation` for the FX-fee child (cat='FX Fee', `linkedTo: txnTs`, **INV-30**).
11. If round-ups enabled AND outflow AND cat ∉ {Income, Savings, Transfer, **FX Fee**} → recursively call `recordWithAllocation` for the round-up child (synchronously per **INV-31**), with `linkedTo: txnTs`. (FX Fee exclusion prevents recursive round-up generation on the child txn spawned in step 10.)
12. Audit-log the composition: `txn_with_allocation_recorded` with full envelope including all child timestamps.
13. Single `onStateChange('txn_recorded')` call at the end.

### Existing `BRAIN.transaction.record` is preserved but downgraded

- Kept for: corrections (`recordCorrection`), reclassifications (`reclassify`), removals (`removeByTs`), and as the low-level append called by `recordWithAllocation`.
- Direct calls to `BRAIN.transaction.record` from UI handlers become a Guardian Layer 2 warning (not an error — still permitted for the niche cases, but flagged for review).

### New SOURCES tags

Add to `BRAIN.SOURCES` AND `BRAIN._SOURCE_SET` (both must be updated together — typos fail at write time):

| New tag | Constant | Purpose |
|---|---|---|
| `'txn-with-allocation'` | `TXN_WITH_ALLOCATION` | Generic source for composed writes (when caller has no more-specific tag) |
| `'fx-fee-auto'` | `FX_FEE_AUTO` | Child txn auto-spawned for FX fee per INV-30 |
| `'balance-apply-delta'` | `BALANCE_APPLY_DELTA` | `BRAIN.balance.applyTxnDelta` audit entries |
| `'balance-reconcile-to'` | `BALANCE_RECONCILE_TO` | `BRAIN.balance.reconcileTo` audit entries |
| `'balance-negative-confirmed'` | `BALANCE_NEGATIVE_CONFIRMED` | User confirmed negative-balance override per INV-27 |
| `'chat-update-balance-target'` | `CHAT_UPDATE_BALANCE_TARGET` | AI `set_balance_target` action (per §4) |
| `'chat-update-balance-delta'` | `CHAT_UPDATE_BALANCE_DELTA` | AI `apply_balance_delta` action (per §4) |

### Migration of existing call sites

The 9 existing `BRAIN.transaction.record` call sites that currently mutate `S.bal` separately:

| Site (line) | Current pattern | Migrated to |
|---|---|---|
| L9355 (Income log) | `S.bal += amt` then `record(..LOG_INCOME)` | `recordWithAllocation({direction:'inflow', cat:'Income'}, LOG_INCOME)` |
| L9379 (From-person) | `S.bal += amt` then `record(..LOG_FROM_PERSON)` | `recordWithAllocation({direction:'inflow', cat}, LOG_FROM_PERSON)` |
| L9409 (Expense) | `record(..LOG_EXPENSE)` then S.bal handled in writer | `recordWithAllocation({direction:'outflow', cat}, LOG_EXPENSE)` — verify writer handles S.bal |
| L9429 (Round-up sibling) | `S.bal -= roundUp` then `record(..ROUNDUP)` | Folded into parent via `recordWithAllocation` (INV-31) |
| L14605 (Chat `log_txn`) | `record(..CHAT)` then `S.bal -= action.amt` | `recordWithAllocation({direction:'outflow', cat}, CHAT)` — eliminates double-mutation |
| L14623 (Chat round-up) | Same double-mutation pattern | Folded into parent (INV-31) |
| L18495 (Pay bill) | `S.bal -= billAmt` then `record(..PAY_BILL_NOW)` | `recordWithAllocation({direction:'outflow', cat:bill.tag}, ...)` |
| L19540, L19581, L19603, L19614, L19627 (Payday plan tick paths) | Various mixes of `record` + direct `S.bal` mutation + `addToBucket` | `recordWithAllocation` with full envelope including bucket destination where applicable |
| L19669 (Payday untick reversal) | `S.bal += findRes.amt` then no record | `BRAIN.balance.applyTxnDelta` directly (it's a reversal, not a new txn) |
| L21832, L21879, L21883 (WRX allocation paths) | Mixed | Inspect case-by-case during Phase 1 |
| L22144, L22159, L22485 (round-up/recompute paths) | Mixed | Inspect case-by-case during Phase 1 |

---

## 4. AI `update_balance` tool fix (FR-03)

### Root cause confirmed (from code read)

**Tool docstring** at `index.html:14496`:
```
update_balance: {"action":"update_balance","amt":X,"reason":"..."}
```

**Implementation** at `index.html:14648-14650`:
```javascript
case 'update_balance':
  if (action.amt !== undefined) {
    applyBalanceCorrection(action.amt, action.reason || 'Chat update');
  }
```

**`applyBalanceCorrection` semantics** at `index.html:6676-6691`:
```javascript
function applyBalanceCorrection(newBal, reason) {
  const diff = parseFloat((newBal - S.bal).toFixed(2));
  // ... S.bal = parseFloat(newBal.toFixed(2));
}
```

The function takes a **target** balance. The AI docstring says `amt:X` — silent on whether X is target or delta. In the field-report incident, AI computed `delta = -4166` (the correction needed) and called the tool with `amt: -4166`. Code path:

- `applyBalanceCorrection(-4166, ...)`
- `diff = -4166 - 7177 = -11343`
- Logged a `-$11,343` correction transaction
- Set `S.bal = -4166`

That's the "$11k overshoot" John reported. Schema ambiguity, not implementation bug.

### Fix: split into two explicit tools

Replace the single ambiguous `update_balance` action with two unambiguous actions:

**Tool 1 — `set_balance_target`** (use when AI knows the target balance value the user wants):
```
{
  "action": "set_balance_target",
  "newBalance": X,           // X IS the new S.bal value
  "reason": "..."             // required, ≤100 chars
}
```

**Tool 2 — `apply_balance_delta`** (use when AI knows the delta to apply):
```
{
  "action": "apply_balance_delta",
  "delta": X,                 // X is signed; +X increments, -X decrements
  "reason": "..."             // required, ≤100 chars
}
```

### Implementation changes at `index.html:14648`

```javascript
case 'set_balance_target': {
  const newBal = action.newBalance;
  if (typeof newBal !== 'number' || isNaN(newBal)) {
    return { ok: false, reason: 'invalid-newBalance' };
  }
  const currentBal = BRAIN.balance.get();
  const diff = parseFloat((newBal - currentBal).toFixed(2));
  // Guardrail per INV-20: confirm if delta exceeds threshold
  if (Math.abs(diff) > 1000) {
    if (!action._userConfirmed) {
      BRAIN.chat.addAssistant(
        `⚠️ This would change your balance by ${fmtC(diff)}. ` +
        `Please confirm in chat: "yes apply" to proceed, or correct me.`,
        { pendingAction: action, requiresConfirm: true },
        BRAIN.SOURCES.CHAT_ASSISTANT_REPLY
      );
      return { ok: false, reason: 'requires-confirm' };
    }
  }
  BRAIN.balance.reconcileTo(newBal, action.reason || 'Chat target-set',
    BRAIN.SOURCES.CHAT_UPDATE_BALANCE_TARGET);
  break;
}

case 'apply_balance_delta': {
  const delta = action.delta;
  if (typeof delta !== 'number' || isNaN(delta)) {
    return { ok: false, reason: 'invalid-delta' };
  }
  if (Math.abs(delta) > 1000 && !action._userConfirmed) {
    // Same guardrail
    BRAIN.chat.addAssistant(
      `⚠️ This would change your balance by ${fmtC(delta)}. ` +
      `Please confirm in chat: "yes apply" to proceed, or correct me.`,
      { pendingAction: action, requiresConfirm: true },
      BRAIN.SOURCES.CHAT_ASSISTANT_REPLY
    );
    return { ok: false, reason: 'requires-confirm' };
  }
  BRAIN.balance.applyDelta(delta, action.reason || 'Chat delta',
    BRAIN.SOURCES.CHAT_UPDATE_BALANCE_DELTA);
  break;
}

// 'update_balance' (legacy single tool) was removed in Bundle 30 Phase 3
// per Q5 decision. AI must use set_balance_target or apply_balance_delta.
// Any AI attempt to call the legacy action falls through this switch as a
// no-op (the case is intentionally absent). The system prompt update in
// the same Phase 3 commit makes this unreachable from any in-context AI.
```

### System-prompt update

The AI system prompt at `index.html:14490-14502` needs explicit guidance. Replace the `update_balance:` line with:

```
set_balance_target: {"action":"set_balance_target","newBalance":X,"reason":"..."}
  USE WHEN: user tells you their actual bank balance.
  newBalance IS the value S.bal will be set to. NOT a delta.
  EXAMPLE: User says "my actual balance is $3,012" → {"action":"set_balance_target","newBalance":3012,"reason":"User reconciled with bank"}

apply_balance_delta: {"action":"apply_balance_delta","delta":X,"reason":"..."}
  USE WHEN: user describes an unlogged change (e.g. "I forgot to log a $50 spend").
  delta is SIGNED. +50 for income, -50 for spend.
  EXAMPLE: User says "I withdrew $100 from ATM I forgot to log" → {"action":"apply_balance_delta","delta":-100,"reason":"Unlogged ATM withdrawal"}

NEVER use both. The legacy "update_balance" action no longer exists — calling it is a no-op.
For any |change| > $1000, the system will request user confirmation in chat before applying. Do not retry on confirmation request — wait for user reply.
```

---

## 5. Five new invariants from Part C answers

To be appended to `FINANCIAL-INVARIANTS.md` as part of the same Bundle 30 commit. Numbered INV-27 through INV-31, placed in section-appropriate locations.

### Append to Section A (Balance and cash flow), after INV-05:

```markdown
**INV-27: No state mutation may result in `S.bal < 0` without explicit user confirmation.**
- Why: Silent overdraw destroys trust. The user must consciously accept a negative-balance state.
- Violated when: an action drives `S.bal` negative without surfacing a confirmation modal first
- Test: load fixture with `S.bal = 50`. Attempt to log -$100 Bills via `BRAIN.transaction.recordWithAllocation`. Assert writer returns `{ok:false, reason:'negative-warning-required'}`. Call `BRAIN.balance.confirmNegativeOverride()` then retry. Assert second call succeeds AND audit log contains `BALANCE_NEGATIVE_CONFIRMED` entry.

**INV-30: FX fees are recorded as separate transactions linked to the parent via `linkedTo`.**
- Why: FX fees mixed into the parent amount are invisible to "how much have I paid in FX fees this quarter" analysis. Separating them preserves the parent's true cost and makes the fee auditable as a category.
- Violated when: a transaction with an FX-fee component lacks a sibling row with `cat='FX Fee'` and `linkedTo` pointing at the parent's `ts`
- Test: load fixture. Call `recordWithAllocation({amt:100, cat:'Bills', fxFee:{amt:3, sourceCurrency:'USD'}}, ...)`. Assert two txns appended: parent ($100, cat='Bills') and child ($3, cat='FX Fee', linkedTo=parent.ts). Assert sum of category='FX Fee' over the period === 3.
```

### Append to Section C (Free money and allocations), after INV-11:

```markdown
**INV-28: An allocation transaction's amount cannot exceed `free_money_remaining` at the time of allocation.**
- Why: Allocating $1,000 to Darwin when only $500 is free silently creates overcommit, which then surfaces as cross-surface confusion ("how is Darwin $1,000 when I only had $500?"). Refusal at write time prevents the divergence.
- Violated when: writer accepts an allocation > free_money_remaining
- Test: load fixture with `free_money = 500`. Call `recordWithAllocation({amt:1000, cat:'Savings', destination:{type:'bucket', id:'Darwin'}}, ...)`. Assert `{ok:false, reason:'insufficient-free-money'}`. Assert `S.bal` unchanged. Assert no audit entries for this attempt's source tag.
```

### Append as new Section K (Plan lock semantics):

```markdown
## K. Plan lock semantics

**INV-29: Plan lock prevents modification of `S.activePlan.overrides` only. It does NOT prevent ticking items, editing bonus, logging transactions, or marking bills paid.**
- Why: Lock is about *plan-shape* commitment, not *execution* freeze. Users still need to record what they did during the cycle. Over-restrictive lock = users avoid locking. Under-restrictive lock = lock means nothing.
- Violated when: locking the plan prevents tick operations, or fails to prevent override modifications
- Test: load fixture with plan unlocked. Set an override on a bill. Lock the plan. Attempt: (a) modify the same override → expect `{ok:false, reason:'plan-locked'}`. (b) tick the same bill → expect `{ok:true}`. (c) edit bonus via `BRAIN.plan.setBonus` → expect `{ok:true}`. (d) log a new transaction → expect `{ok:true}`. (e) mark a bill paid via `BRAIN.bills.markPaid` → expect `{ok:true}`.
```

### Append to Section D (Bucket balances), after INV-13:

```markdown
**INV-31: Round-up transactions fire synchronously after their parent transaction records.**
- Why: Deferred round-ups break audit-log temporal coherence ("why is my round-up audit ts hours after the parent?") and create reconciliation gaps if the user reconciles between parent and round-up. Synchronous keeps the parent+round-up as a single logical write.
- Violated when: parent txn audit-logged at time T, round-up txn audit-logged at time T+Δ where Δ > 1 second
- Test: load fixture with round-ups → Darwin enabled. Call `recordWithAllocation({amt:9.40, cat:'Other', direction:'outflow'}, ...)`. Capture audit log. Assert two entries: parent (cat='Other', $9.40) and child (cat='Savings', $0.60, _isRoundup=true). Assert child's ts ≤ parent's ts + 100ms. Assert Darwin bucket credited by $0.60.
```

---

## 6. Read-order amendments (Part D#2)

Two exact text changes, both committed as part of Bundle 30 housekeeping (Phase 5).

### Change 1 — `FINANCIAL-INVARIANTS.md` line 7

**Current:**
```markdown
> **Read this file at session start, after CLAUDE.md, before CC-PRINCIPAL-ENGINEER-MANUAL.md.**
```

**Replace with:**
```markdown
> **Read this file at session start in the canonical order specified by CLAUDE.md §0: CLAUDE.md → CC-PRINCIPAL-ENGINEER-MANUAL.md → FINANCIAL-INVARIANTS.md → FEATURE-MAP.md.**
```

### Change 2 — `CC-PRINCIPAL-ENGINEER-MANUAL.md` §0 lines ~13-15

**Current:**
```markdown
Every session, before responding to John's first instruction:

1. Open `FEATURE-MAP.md` — your real-time atlas of the codebase.
2. Open this manual — your operating rules.
3. Identify which section(s) of this manual apply to the work John has asked for.
4. Walk the **session loop** in §3 before writing a single line of code.
```

**Replace with:**
```markdown
Every session, before responding to John's first instruction:

1. Read `CLAUDE.md` — the entry point; fixes the canonical read order.
2. Read this manual — your operating rules.
3. Read `FINANCIAL-INVARIANTS.md` — the math contract.
4. Open `FEATURE-MAP.md` — your real-time atlas of the codebase.
5. Identify which section(s) of this manual apply to the work John has asked for.
6. Walk the **session loop** in §3 before writing a single line of code.
```

---

## 7. BRAIN bubble inventory audit (Part D#4)

Live `const BRAIN = {...}` literal occupies `index.html:18697-22697`. Top-level keys (canonical, in declaration order):

| # | Key | Line | Domain | In CLAUDE.md §3? |
|---|---|---|---|---|
| — | `SOURCES` (+ `_SOURCE_SET`) | 18707 | Frozen vocabulary | n/a (not a bubble per se) |
| 1 | `audit` | 18881 | Audit log writers + query API | ✓ |
| 2 | `config` | 18978 | Income, payday, budgets, API key | ✓ |
| 3 | `allocation` | 19106 | Auto-allocate computation | ✗ MISSING |
| 4 | `plan` | 19224 | Active plan + intent layer | ✓ |
| 5 | `assets` | 20562 | WRX, super, mum, CC, carloan | ✓ |
| 6 | `chat` | 20801 | Chat history writers | ✗ MISSING |
| 7 | `cycle` | 20880 | Payday-received lifecycle | ✗ MISSING |
| 8 | `savings` | 20947 | Buckets + round-up destination | ✓ |
| 9 | `summary` | 21184 | Aggregated readers (read-only bubble) | ✗ MISSING |
| 10 | `dashboard` | 21577 | Dashboard-specific readers (e.g. `todayOutflows`) | ✗ MISSING |
| 11 | `transaction` | 21636 | Txn record / correction / reclassify / removal | ✓ |
| 12 | `bills` | 21920 | Bill paid/unpaid + bill CRUD | ✓ |
| 13 | `debts` | 22391 | Debt CRUD + markPaid/unmark | ✓ |

**CLAUDE.md §3 lists 8 bubbles; the codebase has 13.** Five bubbles missing from the doc: `allocation`, `chat`, `cycle`, `summary`, `dashboard`.

### Bundle 30 will also add:

- **`BRAIN.balance`** (new — Phases 1+2 of D#1)

### CLAUDE.md §3 edit (committed in Phase 5)

**Current:**
```markdown
- **BRAIN bubbles** = bounded contexts within `index.html`. `BRAIN.config`, `BRAIN.transaction`, `BRAIN.debts`, `BRAIN.savings`, `BRAIN.bills`, `BRAIN.plan`, `BRAIN.audit`, `BRAIN.assets`.
```

**Replace with:**
```markdown
- **BRAIN bubbles** = bounded contexts within `index.html`. Current inventory (14 bubbles as of Bundle 30): `BRAIN.config`, `BRAIN.transaction`, `BRAIN.debts`, `BRAIN.savings`, `BRAIN.bills`, `BRAIN.plan`, `BRAIN.audit`, `BRAIN.assets`, `BRAIN.allocation`, `BRAIN.chat`, `BRAIN.cycle`, `BRAIN.summary`, `BRAIN.dashboard`, `BRAIN.balance`. (Plus `BRAIN.SOURCES` — the frozen source-tag vocabulary, not a bubble.)
```

FEATURE-MAP.md sibling-artifacts table will get a parallel update in Phase 5.

---

## 8. Playwright spec scaffold

### Directory structure (matches CLAUDE.md §13)

```
tests/
├── fixtures/
│   ├── baseline-pre-payday.json       (S.bal=10000, no txns, plan unlocked)
│   ├── baseline-post-payday-clean.json (S.bal=17282 post-income, plan unlocked)
│   └── baseline-locked-plan.json       (S.bal=7282, plan locked, 0 ticks)
├── scenarios/
│   ├── inv-01-cash-decrements-on-record.spec.js   (FR-01)
│   ├── inv-02-bucket-credits-on-allocation.spec.js (FR-02)
│   └── inv-20-ai-update-balance-no-overshoot.spec.js (FR-03)
├── helpers/
│   ├── fixture-loader.js              (loads JSON into localStorage, reloads app)
│   ├── persona-actor.js               (decisive-john helpers — tap, type, confirm)
│   ├── state-asserter.js              (reads S from window, asserts shape)
│   └── audit-asserter.js              (reads S._auditLog, asserts entries)
├── playwright.config.js               (chromium, 380×660 viewport)
├── run-sweep.js                       (orchestrator — runs all scenarios serially)
└── README.md                          (how to run, how to add scenarios)
```

### Helpers

**`fixture-loader.js`** — exposes `loadFixture(page, fixtureName)`. Reads JSON from `fixtures/`, navigates to local app, evaluates `localStorage.setItem('slyght_v5', JSON.stringify(fixture))`, reloads, waits for boot self-test to complete.

**`persona-actor.js`** — exposes one factory per persona. For Bundle 30 we need only `decisiveJohn(page)` returning `{logTxn, markBillPaid, allocateToSavings, openHeroBalEdit, sendChatMessage}`. Each is a sequence of `page.tap()` + `page.fill()` calls following the actual touch path on the 380×660 viewport.

**`state-asserter.js`** — exposes `readState(page)` returning the live S object via `page.evaluate(() => window.S)`. Plus convenience matchers: `expectBalance(page, expected)`, `expectBucket(page, name, expected)`, `expectNetWorth(page, expected)`.

**`audit-asserter.js`** — `readAuditLog(page)`, `expectAuditEntry(page, predicate)`, `expectAuditEntries(page, count, predicate)`.

### First 3 specs (one per FR)

**Spec 1 — `inv-01-cash-decrements-on-record.spec.js`** (FR-01)

Covers INV-01, INV-03, INV-05. Replicates field-report §4 reproduction scenario steps 1-3.

```javascript
test('INV-01: every recorded txn decrements S.bal by exact amount', async ({page}) => {
  await loadFixture(page, 'baseline-pre-payday.json');
  await expectBalance(page, 10000);

  const john = decisiveJohn(page);
  await john.logTxn({amt: 200, cat: 'Bills', note: 'Optus'});
  await expectBalance(page, 9800);
  await expectNetWorth(page, /* baseline - 200 */);

  await john.logTxn({amt: 500, cat: 'Debt repayment', note: 'Mum debt'});
  await expectBalance(page, 9300);
  await expectNetWorth(page, /* baseline - 700 */);

  // INV-05 cross-surface coherence
  const heroBal = await page.locator('#h-bal').textContent();
  const nwCashBal = await page.evaluate(() => calculateNetWorth().breakdown.cashBalance);
  expect(Math.abs(parseDollar(heroBal) - nwCashBal)).toBeLessThan(0.01);
});
```

**Spec 2 — `inv-02-bucket-credits-on-allocation.spec.js`** (FR-02)

Covers INV-02, INV-12. Replicates field-report §4 step 4.

```javascript
test('INV-02: savings txn decrements cash AND credits bucket by same amount', async ({page}) => {
  await loadFixture(page, 'baseline-pre-payday.json');
  await expectBalance(page, 10000);
  await expectBucket(page, 'Darwin', 0);
  const nwBefore = await readNetWorth(page);

  const john = decisiveJohn(page);
  await john.allocateToSavings({amt: 800, bucket: 'Darwin'});

  await expectBalance(page, 9200);                  // cash decremented
  await expectBucket(page, 'Darwin', 800);          // bucket credited
  await expectNetWorth(page, nwBefore);             // NW unchanged (cash → bucket)

  // INV-22: audit log has both entries
  await expectAuditEntries(page, 2,
    e => e.source === 'txn-with-allocation' && (e.type === 'txn_recorded' || e.type === 'bucket_credited'));
});
```

**Spec 3 — `inv-20-ai-update-balance-no-overshoot.spec.js`** (FR-03)

Covers INV-20, INV-27 confirmation flow.

```javascript
test('INV-20: AI set_balance_target sets balance exactly, never overshoots', async ({page}) => {
  await loadFixture(page, 'baseline-pre-payday.json'); // S.bal = 10000

  // Simulate AI returning the structured action directly (no API call)
  await page.evaluate(() => executeChatAction({
    action: 'set_balance_target',
    newBalance: 3012,
    reason: 'User reconciled with bank',
    _userConfirmed: true  // delta is $6988 > $1000, but pre-confirmed for test
  }));

  await expectBalance(page, 3012);  // exact, not overshot
  await expectAuditEntries(page, 1,
    e => e.source === 'chat-update-balance-target' && e.new === 3012);
});

test('INV-20 guardrail: AI apply_balance_delta > $1000 requires confirm', async ({page}) => {
  await loadFixture(page, 'baseline-pre-payday.json');
  const balBefore = await readBalance(page);

  await page.evaluate(() => executeChatAction({
    action: 'apply_balance_delta',
    delta: -4166,
    reason: 'Test'
    // NO _userConfirmed
  }));

  await expectBalance(page, balBefore);  // unchanged — confirmation required
  const lastChat = await page.evaluate(() => S.chatHistory[S.chatHistory.length-1]);
  expect(lastChat.requiresConfirm).toBe(true);
});
```

### Boot self-test additions (Phase 1)

Add to the existing self-test panel:

- `BRAIN.balance.get callable` — typeof check
- `BRAIN.balance.applyTxnDelta callable`
- `BRAIN.balance.reconcileTo callable`
- `BRAIN.balance.confirmNegativeOverride callable`
- `BRAIN.transaction.recordWithAllocation callable`
- `BRAIN.balance.get() === S.bal` — alias contract (will be true through Phase 3, becomes computational equality at Phase 4)
- `BRAIN.SOURCES.TXN_WITH_ALLOCATION defined`
- `BRAIN.SOURCES.BALANCE_APPLY_DELTA defined`
- `BRAIN.SOURCES.BALANCE_RECONCILE_TO defined`
- `BRAIN.SOURCES.BALANCE_NEGATIVE_CONFIRMED defined`
- `BRAIN.SOURCES.CHAT_UPDATE_BALANCE_TARGET defined`
- `BRAIN.SOURCES.CHAT_UPDATE_BALANCE_DELTA defined`
- `BRAIN.SOURCES.FX_FEE_AUTO defined`

---

## 9. Effort estimate (Opus manual §6 — naive + 2x + confidence)

| Phase | Work | Naive | 2x adjusted | Confidence | Notes |
|---|---|---|---|---|---|
| 1 | FR-01: `BRAIN.balance` bubble + `recordWithAllocation` + migrate 9 direct-write sites + Guardian rule | 6h | **12h** | MEDIUM | Risk: missed write sites; mitigated by Guardian rule |
| 2 | FR-02: bucket-linkage in `recordWithAllocation` + parallel-path elimination + INV-28 enforcement | 3h | **6h** | MEDIUM | Auto-allocate Apply path already correct — verify it routes through new writer too |
| 3 | FR-03: split tool + system prompt update + confirmation flow + deprecated alias | 2h | **4h** | HIGH | Self-contained; clear schema |
| 4 | INV-27 negative-balance confirm flow + INV-29 lock-narrowing audit + INV-30 FX-fee child txn + INV-31 round-up synchronisation | 4h | **8h** | MEDIUM | INV-29 requires touching ~6 lock-check sites; INV-30 needs new UI field on relevant modals |
| 5 | Playwright scaffold (helpers, fixtures, 3 specs, README) + boot self-test additions | 5h | **10h** | LOW-MEDIUM | First Playwright work in this repo — tooling shake-out likely; LOW-MEDIUM confidence reflects unknown unknowns |
| 6 | Housekeeping commit: append 5 new INVs · read-order amendments · BRAIN inventory update in CLAUDE.md + FEATURE-MAP · CHANGELOG entry | 1h | **2h** | HIGH | Mechanical doc edits |

**Totals: naive 21h · adjusted 42h · confidence MEDIUM overall.**

This is a multi-session bundle. Probably 5–7 sit-downs of 6–8h each. Sequence the commits so each phase ships incrementally and gets phone-verified before the next phase starts (per CLAUDE.md §7 step 5).

**Risk multipliers I've already baked in:**
- Phase 1 doubled because the 31 write sites need case-by-case review, not a regex sweep
- Phase 5 doubled because Playwright setup in this repo is greenfield (no existing config, no CI integration)
- Phase 4 doubled because INV-29 lock-narrowing touches multiple bubbles (transaction, plan, bills, debts)

**Risks NOT yet quantified (could expand the estimate):**
- Snapshot/migration if Phase 1 changes break loading of existing user state (mitigation: pre-Phase-1 snapshot via `SNAPSHOTS.take('pre-bundle-30')`)
- Layer V regression noise if `recordWithAllocation` changes onStateChange timing subtly (mitigation: capture baseline before Phase 1)
- John finds field-report-tier bugs adjacent during phone-verify between phases (mitigation: hard-cap each phase commit to its declared scope; new bugs become Bundle 31 candidates, not scope-creep)

---

## 10. Phase breakdown — STOP gates and commits

Each phase is one or more commits. Each commit ends with phone-verify on 380px.

**STOP cadence (per Q1 answer):** Phase 1 and Phase 4 ship at **per-commit STOP gates** (high blast radius — single-writer consolidation and multi-invariant work). Phases 2, 3, 5 ship at **end-of-phase STOP gates** only. CC surfaces back at each STOP gate; John phone-verifies; only after John says "proceed" does the next commit/phase begin.

### Phase 0 — Pre-flight (Opus + John, 0 code)

- Read this SDD
- Answer the OPEN QUESTIONS in §11 below
- John approves or amends

**STOP — Phase 1 does not start until John explicitly approves this SDD.**

### Phase 1 — `BRAIN.balance` introduction + FR-01 single-writer consolidation

**Pre-1.A insurance (per Q2 answer — BOTH in-app snapshot AND external export):**
- One-shot `SNAPSHOTS.take('pre-bundle-30')` fires automatically on first app load after Commit 1.A lands. CC wires this as an idempotency-guarded init call in the new `BRAIN.balance` bubble (skipped if a snapshot with that label already exists). Captures state immediately, before any new writer can be invoked.
- John additionally exports `localStorage.getItem('slyght_v5')` to a JSON file outside the app — recommended path: `slyght/archive/state-bundle-30-pre.json`. Done from Settings → Data & Backup → Export (or via browser console). This belt-and-suspenders external copy survives even if the app's snapshot ring is later overwritten.

Commit 1.A — scaffolding only (no behavioural change to existing writers):
- Add `BRAIN.balance` bubble with `get()` (returns `S.bal`), `applyTxnDelta(delta, source, ref)` (mutates `S.bal` + audit), `reconcileTo(newBal, source, reason)` (mutates `S.bal` + audit + records correction txn via `BRAIN.transaction.recordCorrection`), `applyDelta(delta, source, reason)` (delta version of reconcileTo for AI tool), `confirmNegativeOverride()` (one-shot flag for the next write).
- Bubble init takes one-shot `SNAPSHOTS.take('pre-bundle-30')` if no such snapshot exists yet (idempotency-guarded).
- Add new SOURCES tags (all from §3).
- Add boot self-test entries (all from §8).
- `getLiveBal()` becomes thin alias for `BRAIN.balance.get()`.

Commit 1.B — migrate the 9 transaction-record sites identified in §3:
- Each site: remove the direct `S.bal = ...` mutation, route through `BRAIN.transaction.recordWithAllocation` (which internally calls `BRAIN.balance.applyTxnDelta`).
- Verify audit log shows the expected entries.

Commit 1.C — Guardian rule:
- Add Layer 1 static check: `S\.bal\s*=` outside `index.html:[lines containing BRAIN.balance.* or applyBalanceCorrection]` is a violation.
- Verify clean.

**STOP — phone-verify on 380px. John tests: log a Bills txn, log a Debt-repayment txn. Hero, footer, NW cash all must match. If verified, proceed to Phase 2.**

### Phase 2 — FR-02 bucket-linkage

Commit 2.A — implement bucket destination in `recordWithAllocation`:
- For Savings/Transfer category with `destination.type === 'bucket'`, call `BRAIN.savings.addToBucket` as part of the atomic flow.
- Enforce INV-28 (free-money refusal).
- Migrate the 5 payday-plan tick sites at L19540-L19627 to use the new envelope.

Commit 2.B — audit and eliminate parallel paths:
- Verify auto-allocate Apply flow now routes through `recordWithAllocation`. If it currently has its own bucket-credit path, fold it.

**STOP — phone-verify on 380px. John tests: allocate $X to Darwin via Quick Log. Bucket increments. Cash decrements. NW unchanged. Free money decreases per INV-08. If verified, proceed to Phase 3.**

### Phase 3 — FR-03 AI tool fix

Commit 3.A — split `update_balance` into `set_balance_target` + `apply_balance_delta`:
- Implement both cases in `executeChatAction`.
- Add the $1000 confirmation guardrail (writes to chat, awaits `_userConfirmed`).
- Update system prompt at L14490-14502.
- Keep deprecated alias for one bundle with console.warn.

Commit 3.B — confirmation-flow UI wiring:
- When AI sends a `requiresConfirm` message, render with a distinct visual treatment + tappable "Yes apply" / "Cancel" inline buttons.
- "Yes apply" re-fires the same action with `_userConfirmed: true`.

**STOP — phone-verify on 380px. John tests: ask AI to correct balance from current value to $X (where |delta| > $1000). Verify confirmation prompt appears. Tap "Yes apply" → balance lands at $X exactly. Verify audit log has `chat-update-balance-target` entry. If verified, proceed to Phase 4.**

### Phase 4 — Remaining new invariants (INV-27, 29, 30, 31)

*INV-28 (bucket overdraw refusal) ships writer-side in **Phase 2 Commit 2.A** — it's enforced inside `recordWithAllocation` step 4 when bucket-destination logic arrives. Phase 4 adds no UI work for INV-28 because the refusal surfaces via the standard `{ok:false, reason:'insufficient-free-money'}` envelope that callers' existing failure-toast handlers already render.*

Commit 4.A — INV-27 negative balance confirm flow (writer-side):
- `recordWithAllocation` returns `'negative-warning-required'` when projected `S.bal < 0` and no override flag.
- UI handler intercepts this reason, opens `EDIT_MODAL.openConfirm` with the projected balance shown.
- On confirm: caller sets `_overrideNegativeWarn` flag and re-fires, OR `BRAIN.balance.confirmNegativeOverride()` is called once and the writer retries.

Commit 4.B — INV-29 plan-lock narrowing audit:

**Pre-Phase-4.B grep (CC surfaces count to John before starting 4.B):** count read sites of `S\.activePlan\.locked` (and equivalent forms like `S.activePlan?.locked`, `plan.locked` from local vars). The Phase 4 8h adjusted estimate assumes ≤20 read sites. If the grep returns ≥20, surface to John — the lock-narrowing audit likely touches more bubbles than scoped, and Phase 4's estimate needs revisiting before 4.B begins.

- Find all `S.activePlan.locked` reads. For each:
  - If it's gating an override mutation → keep (this is the lock's actual job).
  - If it's gating a tick, bonus edit, transaction log, or bill mark-paid → remove the gate.
- Add test that locked plan still permits ticks/bonus/log/markPaid.

Commit 4.C — INV-30 FX-fee separate txn:
- Add `fxFee` field to `recordWithAllocation` envelope (already in §3 signature).
- Add UI control on edit-transaction modal: "FX fee" toggle that reveals an amount input.
- When present, writer spawns child txn with `cat='FX Fee'`, `linkedTo: parent.ts`, `source='fx-fee-auto'`.

Commit 4.D — INV-31 round-up synchronisation:
- Refactor the 4 round-up paths (L9429, L14623, L14627, ~L22159) to fold round-up into `recordWithAllocation` synchronously rather than as a separate post-record call.
- Verify audit log: parent + round-up entries within 100ms.

**STOP — phone-verify on 380px. John tests each invariant scenario. If verified, proceed to Phase 5.**

### Phase 5 — Housekeeping (single commit)

Commit 5.A:
- Append INV-27 through INV-31 to `FINANCIAL-INVARIANTS.md` (text per §5).
- Apply read-order amendments to `FINANCIAL-INVARIANTS.md` line 7 and `CC-PRINCIPAL-ENGINEER-MANUAL.md` §0 (text per §6).
- Update `CLAUDE.md` §3 BRAIN bubble inventory (text per §7).
- Update `FEATURE-MAP.md` sibling-artifacts table + state-shape section to include `BRAIN.balance`.
- Update `CHANGELOG.md` with Bundle 30 entry citing commits, invariants added, FRs resolved.
- Update slyght `CLAUDE.md` §5 (current state) to mark Bundle 30 as shipped.

**No phone-verify required — pure doc changes.** Bundle 30 closed.

### 24-hour deploy watch

Per CC manual §3 step 6: the 24 hours after the Phase 5 push are an extension of verification. If John reports any FR-class bug in that window, root-cause analysis happens before any new bundle starts.

---

## 11. Decisions log (Q1-Q6 answered 2026-05-18)

**Q1 — STOP cadence:** **MIXED.** Per-commit STOP for Phase 1 and Phase 4 (high blast radius). End-of-phase STOP for Phases 2, 3, 5. Integrated into §10 header.

**Q2 — Snapshot strategy:** **BOTH.** In-app `SNAPSHOTS.take('pre-bundle-30')` (CC wires into Commit 1.A as idempotency-guarded init call) AND external JSON export of `localStorage.getItem('slyght_v5')` to `slyght/archive/state-bundle-30-pre.json` (John does in browser before phone-verify of Commit 1.A). Integrated into §10 Phase 1.

**Q3 — INV-30 FX-fee backfill:** **NO.** Forward-only. Bundle 30 ensures new txns are correctly split. Historical annotation deferred to Bundle 31+ via the edit-transaction modal.

**Q4 — INV-29 lock-narrowing migration:** **NO.** Single user, informed user. CHANGELOG entry in Phase 5 documents the lock-semantics change. No re-bless ceremony, no one-time prompt.

**Q5 — Deprecated `update_balance` alias:** **REMOVE IMMEDIATELY in Phase 3.** Same commit updates the system prompt so the alias is unreachable from any in-context AI. Cleaner, fewer paths. Integrated into §4 (removed the deprecated case + updated prompt text).

**Q6 — Phase 5 standalone vs folded:** **STANDALONE.** Doc commits stay separate from code commits. Easier diff review; easier targeted revert if Phase 4 has issues. Integrated into §10.

---

## 12. Rollback plan

If any phase phone-verify fails:

1. `git revert HEAD` on the failing commit. Push.
2. `SNAPSHOTS.restore('pre-bundle-30')` if state corruption suspected.
3. Reload PWA on phone. Verify pre-Bundle-30 behaviour restored.
4. Root-cause analysis surfaced to John before retry attempt.
5. Update this SDD with what went wrong; revise affected phase; re-surface for approval.

If the bundle ships in full but a bug is discovered within 24h:
- Per CC manual §14, that's an unfinished verification, not a "next bundle" item.
- Same revert path; root cause becomes an amendment candidate for the manual.

---

**End of SDD-bundle-30-financial-math-integrity.**

**STOP — awaiting John's approval. No code changes until approved.**
