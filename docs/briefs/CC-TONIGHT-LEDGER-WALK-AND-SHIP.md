# CC TONIGHT — Ledger Walk now, ship survivors now

Doing it tonight, in the right order. The constraint is sequence, not timing: the Ledger Walk tier exists because the old flag-trusting process got P0-5 backwards, so nothing scoped under that process ships until the Ledger Walk re-verifies it. That's a dependency, not a bedtime. Run the walk, ship what survives — all tonight.

## Order of operations (non-negotiable sequence)

### 1. Fresh pull
Wrangler pull (path known) → today's dated file. Fresh state, not the frozen oracle.

### 2. Ledger Walk — the maiden run, NOW
Extend `scripts/recon/ledger-walk-paidbills.js` from paidBills-only to full reconciliation: every paidBills key, every debt, every bucket, every cycle-total, verified against `S.txns`.

The rule, codified from tonight's catch:
- `paid:true` + matching debit txn → **BACKED** (correct even if billDate future — John's early-payment case: he paid Allianz CTP + KIA Rego early on purpose)
- `paid:true` + no matching txn → **ORPHAN** (genuine phantom-flag bug — the known Stan-7 ~$13)
- `paid:false` → unpaid
- fuzzy match → **AMBIGUOUS**, surface for John

Walk the txn history forward from cycle start — every txn logged/removed/adjusted, change-log entries, notes — reconstruct how today's state was reached, prove derived state (flags, billsUnpaidTotal, headroom) reconciles to source events to the dollar.

**Surface before building:** the reconciled honest headroom, the BACKED/ORPHAN/AMBIGUOUS table, any derived-vs-ledger disagreement.

### 3. Re-verify the slate through the walk
- **The pure-structural commits** (P0-1 payBillNow double-debit delete, P0-2 knownUpcoming filter, P0-3a toLocalISODate helper, Break #2 runs-dry numerator, Net-worth C, TO RECOVER bonusLever) — these don't touch flag-state. Confirm clean against the walk. Expected: all pass.
- **P0-6** (markPaid cat:'Bills') — confirm it was walked from real txns (it cited real cats, looks ledger-grounded). If confirmed, ships.
- **P0-5** — RE-SCOPE txn-anchored, the opposite of what was scoped: verify `paid:true` against a matching txn; if txn exists it's paid even if billDate future; only ORPHAN flags are suspect. Confirm against John's actual Allianz/KIA early-payment txns in the walked ledger.

### 4. Ship survivors tonight — Conformance + Council gated
Everything that survives the walk ships now, full ADR-H pipeline: Conformance (mapped/labelled/linked/canonical/invariant, #7 keystone trace if P0-5 re-enters) → Build (Sentinel per commit) → Council (push verdict). **John approves each push — no autonomous push.**

## What ships vs what waits — the honest split
- **Ships tonight (likely 5-6):** the pure-structural commits + P0-6 if ledger-confirmed. These survive the walk clean because they don't depend on flag-trust. No reason to wait.
- **P0-5:** ships tonight IF the re-scope is clean and John eyeballs the ledger-walk output confirming the early-payment logic. It's a keystone reader (22 consumers) — the one piece where John confirms the txn-anchored logic against the reconciliation before it lands. If anything's unclear, P0-5 + its dependent (CDB-28) defer; the rest still ship tonight.

## The acid test (tonight)
After the survivors land + `fixture:fresh`, re-pull: the hero should hold at the honest ~−$88 (NOT swing to −$1,116 — that was the backwards P0-5 fix; John paid those bills early, the flags are correct). The honest number staying honest after the fixes IS the proof the walk worked and the substrate is sound.

## Standing rules
- Ledger Walk is Step 0 — walk the data fresh, trust the settled architecture map, extend the roadmap additively.
- Flags are derived convenience; txns are ground truth. The catch that created this tier must never recur.
- Conservation + smoke + Guardian + §8 green every commit. Conformance before Build. Council trusts the fit-verdict. John approves every push.

Start now: fresh pull → ledger walk → surface the reconciled table → re-verify slate → ship survivors. Walk, then build. Tonight.
