# ADR-001 — Canonical writer + BRAIN audit pattern

Date: 2026-05-13
Status: accepted
Driver: Bundle 28 rounds 10–21 — completed canonical-writer coverage across 13 BRAIN bubbles

## Context

slyght is a single-file PWA (`index.html` ~24,000 lines) where all financial state lives in one global `S` object plus a handful of sibling globals (`BILLS`, `MODEL`). Pre-Bundle-8 every `S.X = value` write was inline at the call site — no validation, no audit trail, no observability for the AI agent. This produced multiple shipping bugs:

- Bundle 7 banner regression — value-shape change had no readers grep, broke 3 surfaces
- Bundle 27 hot-fixes — `savingsObj` ReferenceError + drift divide-by-zero from ad-hoc mutations
- Round 12 (Bundle 28) — txn delete idempotency bug, $200 over-credit, root cause: array-index binding on a fragile mutation site
- Round 11 (Bundle 28) — txn-edit balance sign inverted; bug hidden in inline code, surfaced only after centralisation

These were rooted in the same problem: mutation sites with zero observability and zero typed entry point.

## Decision

Every state mutation in slyght routes through a **canonical writer** — a typed function on a `BRAIN.<bubble>` namespace that owns the field. The pattern is:

```
BRAIN.<bubble>.<verb><Field>(value, source [, opts]) → { ok, before?, after?, reason? }
```

### Rules

1. **One writer per field family.** `BRAIN.assets.setSuperBalance`, `BRAIN.config.setApiKey`, `BRAIN.chat.addUser` — never inline `S.X = value`.

2. **Source tag is mandatory.** Every writer takes a `source` parameter. The source must be a member of `BRAIN._SOURCE_SET` (a frozen `Set` matching the `BRAIN.SOURCES` enum). Unknown sources return `{ ok: false, reason: 'unknown-source:...' }`.

3. **Audit append is automatic.** Writers MUST call `BRAIN.audit.append({ type, source, ts, ... })` after the mutation. This is non-negotiable — the AI agent reads the audit log to introspect what happened.

4. **Privacy: store length not content for sensitive fields.** `BRAIN.chat.addUser` records `length` not the message body. `BRAIN.config.setApiKey` records `<set>` / `<unset>` markers not the raw key.

5. **Return `{ ok, ... }` always.** Callers check `r.ok` and surface errors via `showToast` / `alert`. Never assume success.

6. **Validation at the writer.** Type checks, bounds checks, format checks all live inside the writer. Callers don't repeat them.

7. **Stable IDs not array indices.** For collection writers (txn delete, bucket delete), bind by stable timestamp / id, never by fragile array position. Lesson from OPEN-BUGS #43.

### Reader API

`BRAIN.audit` exposes:
- `recent(n)` — last N entries (count-based)
- `since(ts)` — entries after timestamp
- `summarizeRecent(ts)` — grouped by type
- `query({type, typePrefix, source, sourcePrefix, sinceTs, untilTs, predicate, limit})` — full filter (Bundle 28 round 20)

The AI agent self-introspects via `query()` — "show me every chat event in the last hour", "all WRX-state changes this week".

### Canonical bubbles (13 as of Bundle 28 round 21)

| Bubble | Owns | Seeded |
|---|---|---|
| `BRAIN.audit` | `S._auditLog` + `S.reconLog` mirror | Bundle 8 |
| `BRAIN.savings` | `S.savingsBuckets` (push/saved/update/remove) | Bundle 8, full canonical by Bundle 28 round 5 |
| `BRAIN.dashboard` | Today's spend canonical readers | Bundle 10 |
| `BRAIN.transaction` | `S.txns` (push, update, reclassify, removeByTs, removeByTsWithBalance) | Bundle 11, full canonical by Bundle 28 round 10–12 |
| `BRAIN.bills` | `S.paidBills` + bill lifecycle | Bundle 14 |
| `BRAIN.debts` | `S.debts` + WRX proceeds allocation | Bundle 15 |
| `BRAIN.summary` | Plain-language summaries | Bundle 19 |
| `BRAIN.assets` | `S.{wrxValue, wrxStatus, mumAccountBalance, superBalance, cc, ccLimit, carloan, kiaEarlyRepayFee, ...}` | Bundle 24, full canonical by Bundle 28 round 13/19 |
| `BRAIN.config` | `S.{income, payday, weekdayBudget, weekendBudget, debtStrategy, roundUpsEnabled, apiKey, apiAlertThreshold}` | Bundle 22 v3, full canonical by Bundle 28 round 15/21 |
| `BRAIN.allocation` | Payday plan persistence | Bundle 26.1.5b |
| `BRAIN.plan` | `S.activePlan` overrides + intents | Bundle 27, Phase 0 collapse Bundle 28 |
| `BRAIN.chat` | `S.chatHistory` | Bundle 28 round 14 |
| `BRAIN.cycle` | `S.paydayReceived` lifecycle | Bundle 28 round 17 |

## Consequences

### What becomes easier
- **Single-site bug fixes.** Round 11's balance-sign flip was a one-line change inside `BRAIN.transaction.update`. Pre-Bundle-28 it would have required touching every caller.
- **AI agent observability.** `query()` over `BRAIN.audit` is now the agent's primary introspection API.
- **Forensics.** "What changed?" is a query over a typed audit log, not a diff of localStorage.
- **Privacy boundary.** Sensitive data (API keys, chat content) stays out of the audit log because the writer controls what to record.

### What becomes harder
- **Adding state requires writer overhead.** Each new field needs a `set` method + source tag + audit entry. Higher ergonomic cost for one-off scalar fields.
- **Indirection in stack traces.** A failing balance update shows `BRAIN.transaction.update` in the trace, not the call site. Mitigation: writers include source tag in `{ ok: false }` returns and audit entries.
- **Source-tag enum maintenance.** Every new writer or call context needs a new tag entry in `BRAIN.SOURCES` + `BRAIN._SOURCE_SET`. 60+ tags exist as of round 21.

### What we accept
- The pattern is verbose for trivial scalar setters. We accept the verbosity because consistency at scale matters more than line count.
- Some state is sanctioned to bypass (load/seed/migration paths, snapshot restore). These are explicitly allowed in guardian rules and commented as `⚙️ sanctioned` in the audit table.

## Alternatives considered

**A. Proxy-based S object with auto-audit on every set.** Rejected because:
- Validation logic needs to live SOMEWHERE — pushing it into property setters scatters it.
- Proxies opaque in stack traces.
- Source attribution still requires explicit caller cooperation; a proxy can't infer the source from `S.x = 5`.

**B. Centralised "store" with action types (Redux-ish).** Rejected because:
- slyght is single-file vanilla JS; introducing a store framework violates the no-build-step constraint.
- Action types and reducers are exactly what `BRAIN.SOURCES` tags + canonical writers are, minus the framework.

**C. Direct mutation + post-hoc audit log inspection.** This is the pre-Bundle-8 status quo. Rejected because it produced the bugs in the Context section.

## Cross-links

- Manual: `CC-PRINCIPAL-ENGINEER-MANUAL.md` §5 (canonical-writer function shape) and §7 (financial math invariants).
- Bundle 28 working ledger: `BUNDLE-28-NOTES.md` canonical-writer audit table.
- Round-by-round implementation: `CHANGELOG.md` rounds 10–21 (Bundle 28).
- OPEN-BUGS #42 + #43 — bugs that the centralised pattern made single-site fixable.
