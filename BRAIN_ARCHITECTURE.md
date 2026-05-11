# SLYGHT BRAIN Architecture

> **Status:** Draft v1 — feedback from Claude Code requested before lock.
> **Established:** Bundle 8 (commit f9a2b2d) shipped the BRAIN seed.
> **Pattern:** Layered Brain Architecture with Strangler Migration.

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
| `BRAIN.dashboard` | NOW screen: NW strip, calendar, today's spend, hero copy | Pending (Bundle 10 seeds it) |
| `BRAIN.bills` | Bills tab, paid/unpaid lifecycle, autoDetect, MI-13 | Pending (Bundle 11) |
| `BRAIN.transaction` | Quick Log, txn list, edit/delete, round-ups | Pending |
| `BRAIN.chat` | AI chat surface, intent routing into other bubbles | Pending (post-architecture) |
| `BRAIN.analysis` | Spending pivot, cut sliders, forecasts | Pending |
| `BRAIN.settings` | App settings, account info, character config | Pending |
| `BRAIN.savings` | Canonical bucket writer (cross-cutting) | ✅ Bundle 8 |
| `BRAIN.audit` | Append-only ledger of changes with source tags | ✅ Bundle 8 |

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

## Open Questions for CC Feedback

Before this doc locks, the following questions need CC's read:

1. **Bubble boundaries** — does the current split (dashboard / bills /
   transaction / chat / analysis / settings) match how the code
   already naturally clusters? Should any merge or split?

2. **Existing free-standing modules** (PLAN, MODEL, NOTIFY, CHARACTER)
   — which fold into bubbles and when? PLAN → BRAIN.plan or
   BRAIN.dashboard.plan? MODEL stays standalone (cross-cutting
   computation)?

3. **Cross-bubble communication** — when Bills marks a bill paid,
   Dashboard's "today's spend" should update. Direct call
   (`BRAIN.dashboard.todaySpend()` reads fresh) or event-driven
   (Bills publishes, Dashboard subscribes)? Direct call is simpler;
   events scale better.

4. **Audit log retention** — currently capped at 500 entries. Is
   that the right number? Should it shard by bubble (each bubble
   keeps its own 200-entry log)?

5. **Migration ordering** — Bundle 10 seeds `BRAIN.dashboard`. Next
   should be `BRAIN.bills` (paidBills shape already structured) or
   `BRAIN.transaction` (highest write volume, biggest source of
   drift)?

CC: review and respond. Disagreements welcome; this is a draft.
