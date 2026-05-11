# SLYGHT BRAIN Architecture

> **Status:** v1.4 — Bundle 15 closes the architectural lift. 5 bubbles seeded; Bundle 11's TXNS_PUSH allow-list closed (no more edge-case exemptions).
> **Established:** Bundle 8 (commit f9a2b2d) shipped the BRAIN seed.
> **Pattern:** Layered Brain Architecture with Strangler Migration.
> **Envelope contract:** writers return `{ ok, ...payload, reason? }` — see Composition Contract section.
> **Composition asymmetry (v1.3):** CREATE writers strict-abort on inner failure; DESTROY writers lenient-on-already-clean.
> **Architectural lift completion (v1.4):** Bundle 15 (BRAIN.debts) closes the last allow-list exemptions. Bundle 16+ is feature/UX work on a defended architecture.

---

## The Layer Model

```
┌──────────────────────────────────────────────────────────────┐
│                        AI AGENT                              │
│   Reads BRAIN. Suggests actions. Executes via BRAIN methods. │
│   No direct S mutation. Same safety rails as UI bubbles.     │
├──────────────────────────────────────────────────────────────┤
│                         BRAIN                                │
│   Single source of truth + canonical writers + audit ledger  │
│   Each bubble's domain helpers live here.                    │
│   Invariants validated on every write.                       │
├──────────────────────────────────────────────────────────────┤
│                       UI BUBBLES                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐ │
│  │Dashboard│ │ Bills   │ │  Plan   │ │  Chat   │ │Analysis│ │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └────────┘ │
│                                                              │
│   Each bubble:                                               │
│   - Owns its UI render path                                  │
│   - Reads BRAIN for canonical data                           │
│   - Writes via BRAIN.<bubble>.<verb>() helpers               │
│   - Never mutates S directly                                 │
│   - Never reads another bubble's internal state              │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
                        S (raw state in localStorage)
                  Only BRAIN methods write here.
                  Guardian rules enforce this at lint-time.
```

---

## Bubble Inventory

Each main app tab is its own bubble. Cross-cutting concerns are shared
services hanging off BRAIN root.

| Bubble | Responsibility | Status |
|---|---|---|
| `BRAIN.dashboard` | NOW screen: NW strip, calendar, today's spend, hero copy | ✅ Bundle 10 (readers don't envelope — nouns can't fail) |
| `BRAIN.bills` | Bills tab, paid/unpaid lifecycle, autoDetect, MI-13 | ✅ Bundle 14, envelope v1.2 + Composition Exception v1.3 |
| `BRAIN.debts` | Debt lifecycle: add / markPaid / unmark / update / delete + WRX alloc | ✅ Bundle 15, envelope v1.2 + Composition Exception v1.3 |
| `BRAIN.transaction` | Quick Log, txn list, edit/delete, round-ups | Pending |
| `BRAIN.chat` | AI chat surface, intent routing into other bubbles | Pending (post-architecture) |
| `BRAIN.analysis` | Spending pivot, cut sliders, forecasts | Pending |
| `BRAIN.settings` | App settings, account info, character config | Pending |
| `BRAIN.savings` | Canonical bucket writer (cross-cutting) | ✅ Bundle 8, envelope v1.2 Bundle 13 |
| `BRAIN.audit` | Append-only ledger of changes with source tags | ✅ Bundle 8 |
| `BRAIN.transaction` | Canonical txn writer + back-ref readers | ✅ Bundle 11, envelope v1.2 Bundle 13 |
| `BRAIN.dashboard` | NOW screen — today/cycle/week spend canonical readers | ✅ Bundle 10 (readers don't envelope — nouns can't fail) |
| `BRAIN.SOURCES` | Frozen source-tag enum + validation | ✅ Bundle 11 |

---

## Bubble Migration Pattern (Strangler Fig)

Each bubble migrates following this exact shape. Bundle 8 proved it
for `BRAIN.savings`. Future bubbles repeat:

**Step 1 — Audit.**
`grep -n "direct mutation pattern" index.html`. List all sites that
mutate this domain's state. Surface findings before any edit.

**Step 2 — Canonical writer.**
Add `BRAIN.<bubble>.<verb>(args, source)` helper. It's the only legal
way to mutate this domain going forward. Internal contract:
- Validates input
- Mutates S (with `guardian-allow:` if needed)
- Appends to `BRAIN.audit` with source tag
- Calls `save()`
- Returns success/failure

**Step 3 — Canonical readers.**
Add `BRAIN.<bubble>.<noun>()` helpers that return derived views.
Bubbles read through these, not directly off S.

**Step 4 — Guardian rule.**
Add `no-direct-<domain>-mutation` to `guardian-static.js`. Future
direct mutations fail static check. Helpers themselves use inline
`guardian-allow:` comments with permanent tags.

**Step 5 — Migrate call sites.**
Each direct mutation gets rewritten to use the canonical writer.
Source tag identifies origin (`'roundup'`, `'plan-add'`,
`'user-edit'`, `'reconcile'`, etc.).

**Step 6 — Verify.**
guardian-static exit 0, runtime/tests pass, phone-verify on bubble's
user-facing surfaces.

---

## Composition Contract (v1.2)

When a canonical writer calls another canonical writer internally,
the rule is **abort-on-inner-failure with envelope propagation**.

Concrete example: `BRAIN.bills.markPaid(bill, source)` (Bundle 14) will
internally call `BRAIN.transaction.record(...)` to create the paired
txn. If `record()` returns `{ ok: false, reason: 'unknown-source:...' }`,
`markPaid` aborts BEFORE flipping `S.paidBills` and returns the same
envelope shape upward — no partial mutation, no orphan paid flag, no
attempted rollback.

**Why no rollback:** JS has no real transactions. Rollback paths fail
too often to trust (e.g., a `splice` after a `push` might race with
another async write; an undo that depends on `_txnTs` might miss a
round-up). Aborting BEFORE the second mutation is the only honest
contract.

**Rule for composition:**
1. Call the inner writer first.
2. If `inner.ok === false`, return `inner` (or a matching envelope
   that includes the inner's reason).
3. Only proceed with the outer mutation if `inner.ok === true`.

**Reason codes are namespaced when bubbling up** so callers two
levels deep can tell which layer rejected: `'inner-source-rejected:...'`,
`'inner-no-bucket'`, etc. Bills bubble exercises this in Bundle 14.

**The envelope shape (canonical):**
- Success: `{ ok: true, ...payload }` — payload fields vary per writer
  (e.g., `{ bucket, oldValue, newValue, delta }` for `setBucketSaved`;
  `{ txn, ts }` for `transaction.record`).
- Failure: `{ ok: false, reason: '<code>', ...context }` — reason codes
  are colon-namespaced for composition (`'unknown-source:<tag>'`).
- Both shapes are truthy in JS. Callers MUST check `.ok`, not the
  envelope object itself. New bool-checking callers are rejected at
  code-review.

**Readers don't envelope.** Nouns (`BRAIN.dashboard.todaySpend()`,
`BRAIN.transaction.findByTs(ts)`) return data directly. Readers can't
fail in the same way writers can — missing data returns sensible
defaults (0, empty array, `undefined`) without wrapping.

---

## Composition Contract Exceptions (v1.3)

The abort-on-inner-failure rule has named exceptions for CLEANUP-
direction operations. `unmark` / `undo` / `delete` operations have the
opposite intent: converge on a clean state. If a downstream cleanup
target is already absent, that's success (we wanted it gone), not
failure. These operations follow LENIENT-WITH-WARNING semantics for
"already-clean" failure modes.

**Current exceptions:**

- `BRAIN.bills.unmark(key)` calling `BRAIN.transaction.removeByTs(ts)`:
  if inner returns `not-found` or `no-txns`, log a warning and proceed
  with the paidBills cleanup. Any OTHER inner failure aborts per
  standard contract (returns `inner-<reason>` envelope).
- `BRAIN.bills.unmark(key)` calling `BRAIN.savings.setBucketSaved` for
  round-up reversal: if inner returns `no-bucket` (bucket was
  renamed/deleted), log warning and proceed. Other failures abort.

**Rule for naming the exception in code:** the composition function
MUST explicitly check the `reason` field and decide per-code. Implicit
lenience is forbidden — every composition either aborts-or-proceeds on
EVERY possible inner reason code. New "already-clean" reason codes
added to inner writers must be re-evaluated by every outer caller.

**Why CREATE-strict / DESTROY-lenient is the right asymmetry:**

- CREATE direction (markPaid, record, setBucketSaved): the goal is to
  establish state. A failed inner write means the supporting record
  doesn't exist, so the outer write would create an orphan flag. Abort.
- DESTROY direction (unmark, removeByTs): the goal is to converge on
  cleanliness. An "already-clean" inner result means the cleanup target
  has converged ahead of us. Proceed and finish convergence.

**Tested.** `tests/brain.test.js` locks both invariants:
- `composition: markPaid default mode aborts cleanly when
  transaction.record fails (strict)` — verifies no paidBills entry
  created when inner record() returns failure.
- `composition: unmark proceeds when removeByTs returns not-found
  (lenient)` — verifies paidBills cleanup completes even when paired
  txn is gone.
- `composition: unmark aborts on UNEXPECTED inner failure (strict for
  non-lenient reasons)` — verifies the per-code check forbids implicit
  lenience.

---

## Invariant Ownership (v1.2)

Invariants live with their domain owner but stay registered cross-
cutting. This preserves the render-time safety net that catches drift
from paths the canonical writer didn't audit (snapshot restore,
`load()` migrations, future bugs that bypass the writer).

**Pattern:**
1. The invariant **logic** lives in `BRAIN.<bubble>.invariants.<name>()`
   — semantic ownership with the domain.
2. The **registry entry** stays in `MathInvariants.invariants[]` and
   calls into the bubble: `check() { return BRAIN.bills.invariants.checkPaidBillsKeyNotFuture(); }`
3. Render-time check runs on every render via `MathInvariants.render()` —
   unchanged. Banner/card UX preserved.

**Why this matters:** If the invariant moved INSIDE the canonical writer
(`BRAIN.bills.markPaid`), it would only fire on paths that go through
`markPaid`. The invariant exists to catch paths that DON'T — exactly
the class of drift it was built for.

**Bundle 14 example:** MI-13 (`paidbills-key-not-future`) logic
relocates to `BRAIN.bills.invariants.checkPaidBillsKeyNotFuture()`.
The registry entry's `check` function changes to call into the bubble.
Banner copy + dismiss/escalation logic unchanged. The relocation is
semantic ownership only, not behavioral change.

---

## Source Tag Vocabulary

Every BRAIN write carries a source tag so the audit log can answer
"where did this change come from?"

**Current tags (BRAIN.savings):**
- `roundup` — auto-rounding on a logged expense
- `undo-roundup` — reversal of a roundup (Bundle 7.2.4)
- `plan-add` — user tapped "+ Add savings" in Plan mode
- `plan-edit` — user edited a goal target in Plan mode
- `manual` — direct edit via Settings bucket modal
- `reconcile` — user-driven sync with bank balance
- `migration` — one-time data migration
- `chat` — AI agent action via chat

**Pattern for new bubbles:** start with a small vocabulary, add tags
as code paths emerge. Audit log should answer "why" not just "what."

---

## The Strangler Antibiotic Discipline

The codebase doesn't get refactored all at once. Old code gets
replaced gradually as it's touched.

**Rules of the antibiotic (current — passive mode):**

1. **When fixing a bug, use new patterns.** Don't introduce new code
   that violates BRAIN architecture.
2. **Don't sweep adjacent code.** If the bug is in `renderDashboard`,
   fix only `renderDashboard`. Don't refactor `renderBills` in the
   same commit.
3. **Surface adjacent debt.** If you notice neighbor code that should
   migrate, log it in the commit message or OPEN-BUGS. Don't fix it.
4. **Each commit moves toward, never away.** No new direct S
   mutations except inside BRAIN canonical writers.

**When to escalate to aggressive mode:**

After 4-6 bundles establishing each bubble's pattern, aggressive
sweep becomes safe. Then fixing one Dashboard bug means refactoring
all Dashboard code into the bubble shape. Don't escalate yet.

---

## Test Coverage Requirement (v1.2)

Every new canonical writer added to BRAIN MUST land with tests in
`tests/brain.test.js` that lock its contract. Minimum coverage per
writer:

- **Happy path:** valid call returns `{ ok: true, ...payload }` with
  the documented payload fields.
- **Source validation:** unknown source returns
  `{ ok: false, reason: 'unknown-source:<tag>' }` AND mutation does
  not occur.
- **Domain validation:** invalid arguments (missing bucket, NaN value,
  negative amt, etc.) return matching `{ ok: false, reason }` envelopes.
- **Side effects:** audit entry emitted with the source tag + relevant
  payload.
- **Reader round-trip:** any back-ref-style reader (e.g., `findByTs`)
  retrieves what the writer recorded.
- **Composition-failure invariant:** when the writer composes with
  another canonical writer (Bundle 14+ pattern), tests must include
  at least one composition-failure case proving abort-on-inner-failure
  semantics — the outer mutation does not occur when the inner returns
  `{ ok: false }`.

Without these tests the envelope contract drifts silently as new
bubbles seed. Locking it at the surface-area-still-small moment
(3 bubbles after Bundle 13) makes future migration safer.

---

## Known Gaps (queued)

- **Snapshot restoration audit emission.** `load()` is exempt from
  every guardian rule because it restores S from localStorage. But
  snapshot restoration writes don't emit `BRAIN.audit` entries — the
  audit log silently misses the most consequential mutations
  (full state replay). Future bundle: on restore, emit a single
  synthetic `{ type: 'snapshot_restore', from, ts }` audit entry.
  Tracked: Bundle 16 candidate after Bills + Debts bubbles land.
  Bundle 15 reserved for envelope retrofit completion if needed.
- **`BRAIN.savings` and `BRAIN.dashboard` retrofit to {ok, reason?}
  envelope.** ✅ Resolved in Bundle 13 (envelope landed for savings;
  dashboard readers stay nouns — they can't fail).
- **`window._pendingBillPayKey` / `_pendingBillPayAutoDebit` globals.**
  ✅ Resolved in Bundle 14 — folded into `BRAIN.bills._pendingPay`
  with `setPendingPay` / `clearPendingPay` / `consumePendingPay` API.
- **MI-13 invariant cross-cutting registry vs Bills ownership.**
  ✅ Resolved in Bundle 14 per Invariant Ownership pattern (v1.2):
  logic in `BRAIN.bills.invariants.checkFutureKeyNotPaid()`, registry
  entry stays in `MathInvariants.invariants[]` and delegates via
  TDZ-safe fallback.
- **Bundle 11's three TXNS_PUSH allow-list exemptions** (applyBalanceCorrection
  / confirmWrxAlloc / markDebtPaid). ✅ Resolved in Bundle 15:
  applyBalanceCorrection routes through `BRAIN.transaction.recordCorrection`;
  confirmWrxAlloc loops through `BRAIN.debts.markPaid(id, WRX_ALLOCATE)`;
  markDebtPaid is a thin shim around `BRAIN.debts.markPaid`. The
  TXNS_PUSH_WRITER_FNS set shrinks from 5 → 2 (just `record` + `load`).
  Architectural lift complete.
- **Reconciliation correction txns + WRX sale allocation + debt-
  cleared txn.** Edge-case writers exempt from `no-direct-txns-push`
  in Bundle 11. Reconciliation moves into BRAIN.transaction with a
  `RECONCILE` source path in Bundle 14+. WRX/debt-cleared land with
  `BRAIN.debts` bubble (Bundle 15).
- **PLAN, MODEL, NOTIFY, CHARACTER fold into bubbles.** PLAN folds
  into `BRAIN.dashboard.plan` per Q1; MODEL stays standalone (pure
  derivation, no domain owner); NOTIFY decomposes when bills/dashboard
  bubbles seed; CHARACTER folds into analysis. Tracked: Bundles 16-18ish.

---

## What BRAIN Does NOT Do

To prevent scope creep:

- **No business logic in BRAIN.** It's a data/persistence/audit layer.
  Forecast math, debt strategy, survival mode calc — those live in
  bubbles (or shared modules like MODEL).
- **No UI in BRAIN.** Bubbles render. BRAIN supplies data.
- **No async / network in BRAIN core.** External calls (push notifs,
  AI inference) sit in dedicated modules (NOTIFY, future AGENT) that
  read BRAIN.
- **No magic.** Every BRAIN method does one thing, named after what
  it does, with a source tag for accountability.

---

## Naming Conventions

**Writers (verbs):** `BRAIN.<bubble>.<verb>(args, source)`
- `BRAIN.savings.setBucketSaved(name, value, source)`
- `BRAIN.bills.markPaid(bill, source)` *(future)*
- `BRAIN.transaction.record(txn, source)` *(future)*

**Readers (nouns):** `BRAIN.<bubble>.<noun>(...)`
- `BRAIN.dashboard.todaySpend()` *(Bundle 10)*
- `BRAIN.bills.dueBeforePayday()` *(future)*
- `BRAIN.savings.bucketByName(name)` *(future)*

**Audit:** `BRAIN.audit.append({type, ...payload, ts, source})`

**Internal helpers (not part of public surface):** prefix with
underscore. `BRAIN._validate*`, `BRAIN._migrate*`.

---

## The AI Agent's Place

Eventually (post-architecture, Bundle 18+) the AI agent sits ABOVE
BRAIN and:

1. **Reads** any bubble's canonical state via `BRAIN.<bubble>.<noun>()`
2. **Writes** only through `BRAIN.<bubble>.<verb>(args, source: 'chat')`
3. Has the same safety rails as the UI — can't bypass invariants,
   can't write to S directly, can't read another bubble's internals
4. Surfaces decisions to user, executes with confirmation
5. Cannot delete user records autonomously (hard rule)

This is why BRAIN matters even before AI. The agent needs a clean
surface to act through. Building BRAIN now makes the agent
straightforward later.

---

## Resolved Questions (v1.2)

The five open questions from v1 received CC feedback in the Bundle 11
handoff. Resolutions locked in v1.2:

1. **Bubble boundaries.** Split holds (dashboard / bills / transaction /
   chat / analysis / settings). PLAN folds under `BRAIN.dashboard.plan`
   (not its own bubble). Bills↔Transaction overlap on `paidBills._txnTs`
   resolved by composition pattern (Bills calls into Transaction via
   `findByTs`/`removeByTs`).

2. **Free-standing modules.** MODEL stays standalone (pure derivation,
   no domain owner). PLAN → `BRAIN.dashboard.plan`. NOTIFY decomposes
   into bubble-specific generators pushing into shared `BRAIN.notifications`
   cross-cutting concern (Bundle 17ish). CHARACTER → `BRAIN.analysis`.

3. **Cross-bubble communication.** **Direct calls**, not events. Bundle
   10 already proved direct works (BRAIN.dashboard reads MODEL on
   demand). Defer events until a real need surfaces (e.g., AI agent
   reactive flows post-Bundle-18).

4. **Audit log retention.** 500-entry cap holds. No sharding — unified
   ledger has the value (cross-bubble forensics). If retention becomes
   an issue: bump cap → archive >30d entries → shard only if real-time
   query perf degrades.

5. **Migration ordering.** **Transaction first** (Bundle 11), then
   **envelope retrofit** (Bundle 13), then **Bills** (Bundle 14), then
   **Debts** (Bundle 15). Rationale: Transaction is highest write volume
   + provides `_txnTs` primitive that Bills depends on; envelope retrofit
   before Bills so Bills doesn't bridge two return contracts.
