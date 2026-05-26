# CC Next Session — Ledger Walk maiden run, then ship survivors

Last session the pipeline failed and the failure was caught: P0-5 was diagnosed backwards because the analysis read the `paidBills` flag instead of walking the txn ledger. John paid Allianz CTP + KIA Rego EARLY (deliberately, big bills, didn't want to be blindsided) — the flags were CORRECT, and the proposed "fix" would have un-paid $1,028 of already-spent money and shown −$1,116 instead of the honest ~−$88. Zero commits shipped. Instead the pipeline gained a 6th tier (Ledger Walk, before Gather) — ADR-H, the seed script, pinned memory, the retro all landed.

This session is the Ledger Walk's maiden run. The discipline is: prove it works before trusting anything scoped under the old process.

## Read first
1. `docs/adr/ADR-H-tiered-build-pipeline.md` — the 6-tier pipeline you wrote.
2. `docs/sessions/2026-05-22-session-retro.md` — what was misdiagnosed and why.
3. `~/.claude/.../memory/feedback_ledger_walk_step_zero.md` + `MEMORY.md` — the pinned standing rule.
4. `scripts/recon/ledger-walk-paidbills.js` — the seed Step 0 implementation.

## The non-negotiable first move — Ledger Walk against fresh state

Do NOT ship the queued 7 "structural commits" for momentum first. They were scoped during the session that did NOT walk the ledger — the same session that got P0-5 backwards. Re-verifying them through the new lens is the whole point of the tier existing. Momentum is not a reason to skip the verification we just established as mandatory. (They'll likely survive clean — they're code-structural, not flag-derived — so verification is cheap. But verify, don't assume.)

### Step 0a — Pull fresh, walk the ledger
- Run the wrangler pull (path now known) → `live-2026-05-24.json` (or today's date). Fresh state, not the frozen oracle.
- Extend `ledger-walk-paidbills.js` from paidBills-only to the full reconciliation: every paidBills key, every debt, every bucket, every cycle-total — each verified against `S.txns` with BACKED / ORPHAN / AMBIGUOUS verdicts.
- The rule, codified from last night's catch: **a bill/debt is settled if a matching debit txn exists, REGARDLESS of billDate. Early payment is legitimate. Never override a flag the ledger backs; never trust a flag the ledger doesn't.**
  - `paid:true` + matching txn → BACKED (correct, even if billDate future — John's early-payment case)
  - `paid:true` + no matching txn → ORPHAN (the genuine phantom-flag bug — e.g. the known Stan-7 ~$13 orphan)
  - `paid:false` → unpaid
  - ambiguous match (amount matches but payee/date fuzzy) → AMBIGUOUS, surface for John

### Step 0b — Reconstruct, don't snapshot
- Walk the txn history forward from cycle start: every txn logged, removed, manually adjusted, every change-log entry, every note. Reconstruct HOW today's state was reached, prove the derived state (flags, billsUnpaidTotal, headroom) reconciles to the source events to the dollar. Conservation must hold against the walked ledger, not just asserted.
- Surface: the reconciled headroom (the honest number), the BACKED/ORPHAN/AMBIGUOUS table, and any place derived state disagrees with the ledger.

## Then — re-verify EVERYTHING scoped under the old process

Run the Ledger Walk lens over both batches, not just the drones:

1. **The 13 drone findings** — re-verify each. Which were scoped from flags/snapshots vs from the ledger?
2. **The 9-commit slate, especially:**
   - **P0-5** — re-scope correctly. The real fix is txn-anchored, not date-anchored: verify `paid:true` against a matching txn; if the txn exists it's paid even if early; if no txn, THEN suspect. This is probably the OPPOSITE of what was scoped. Confirm against John's actual Allianz/KIA early payments in the ledger.
   - **P0-6** — was the categorisation walked from real txns (it cited real txn cats, looks ledger-grounded) or inferred? Confirm.
   - **The 7 "structural" commits** (P0-1, P0-2, P0-3a, Break #2, Net-worth C, TO RECOVER bonusLever, CDB-28) — verify none depend on flag-trust. The pure-structural ones (double-debit delete, filter, toLocalISODate) should pass clean; confirm and ship those.

## Then — ship survivors, Conformance + Council gated

Whatever survives the Ledger Walk re-verification ships, per the full ADR-H pipeline: Conformance check (mapped/labelled/linked/canonical/invariant + the #7 keystone trace if P0-5 re-enters) → Build (Sentinel per commit) → Council (push verdict). John approves each push, no autonomous push.

Expected: the pure-structural commits ship clean; P0-5 ships RE-SCOPED (txn-anchored) or defers if the re-scope needs John's input; P0-6 ships if ledger-confirmed.

## John's two open decisions (from the session close)
1. **ADR-H shape** — accept as drafted or refine the four open questions: lightweight-track threshold (when can a trivial commit skip tiers?), walk runtime budget (how deep does the ledger walk go before it's "enough"?), ambiguous-flag handling (auto-surface vs auto-resolve?), council re-walk policy (does council re-walk or trust Step 0's verdict?). Loop Opus on these — they're process-design calls.
2. Entry point — answered above: Ledger Walk first, not the 7-for-momentum. Verification before velocity, especially on the tier's first run.

## Standing rules (now including the new tier)
- Ledger Walk is Step 0, every session, before Gather. Walk the data fresh; trust the settled architecture map; extend the roadmap additively, never restart.
- Flags are derived convenience; txns are ground truth. The catch that created this tier must never recur.
- Conservation + smoke + Guardian + §8 green at every commit. Conformance before Build. Council trusts the fit-verdict.
- John decides; loop Opus for design + process-design calls.

Start: read ADR-H + retro, then Step 0a (fresh pull + extended ledger walk). Surface the reconciled honest number + the BACKED/ORPHAN/AMBIGUOUS table before re-verifying the slate. Walk before you build.
