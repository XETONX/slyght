# Spec 10 — Debts (full surface)

**Story:** Sam owes Sam $400 and Jordan $250 (avalanche strategy). Plus the car loan ($8k of
$20k). Pay down, add, edit, mark paid-off ($0 → archive), change strategy. The debt figures
must match between the Dashboard summary, the Debts sub-screen, and the Payday canvas.

**Fixture:** positive (`state-snapshot.fake.json`). debts: Sam 400, Jordan 250; carloan 8000/20000.

## Level 1 — main UI
Debts surface (sub-screen). Screenshot. List of debts + strategy + car loan.

## Level 2 — per control
| action | driver | expect | lands |
|---|---|---|---|
| open Debts | nav | list, avalanche order, balances | — |
| pay down a debt | debt-pay → `recordWithAllocation` | bal −amt · debt.amt −amt · txn (Debt repayment) | `txn_record`,`balance_apply_delta`,debt audit |
| add debt | add modal | new debts row | debt write |
| edit debt | edit modal | fields update | debt write |
| mark paid-off ($0) | pay to 0 | debt → 0; **archive UI?** (candidate: none) | debt write |
| change strategy | strategy toggle | avalanche↔snowball reorders | config write |

## Level 3 — cross-surface (FR-07)
- **Debts sub-screen vs Payday canvas** debt figures must agree (FR-07: they disagree —
  memory, INV-11/INV-18). Walk both, compare each debt. HIGH.
- **Dashboard debt summary** = sub-screen total. Walk + compare.
- **A debt-repayment txn** must appear in Analysis OUTFLOW (Spec 08), not discretionary.
- **Net worth** liabilities side drops when a debt is paid (INV-06).

## Candidate findings
- FR-07: Debts sub-screen disagrees with canvas [HIGH].
- no $0-archive UI (debt sits at $0 with no way to clear) [pending].
- native `confirm()` ×3 in debt flows (CLAUDE.md §8) [pending].
