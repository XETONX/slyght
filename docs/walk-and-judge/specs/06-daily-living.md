# Spec 06 — Daily living: buffer · provisions · max-per-day

**Story:** Sam needs to know "how much can I spend today without breaking the month?" That's the
MAX-PER-DAY / daily-budget surface, fed by buffer + annual provisions (sinking funds). The
number must be ONE number, computed one way, shown consistently.

**Fixture:** positive (`state-snapshot.fake.json`); also overcommitted for the squeeze case.

## Level 1 — main UI
Dashboard MAX-PER-DAY card + the daily budget detail (tap-through). Screenshot both.

## Level 2 — per control
| action | driver | expect | lands |
|---|---|---|---|
| view MAX-PER-DAY card | `getDynamicDailyBudget` / `getGenuineSurplus` | shows today's allowance | — |
| tap card → explainer | `explainMaxPerDay` | breakdown modal | — |
| add a provision (annual) | provisions add | sinking-fund row; should route canonical writer | provision audit |
| change weekday/weekend budget | settings → budget | recompute | config write |
| log a spend (Spec 02) | `quickLogTxn` | allowance drops | `txn_record` |

## Level 3 — cross-surface (CDB-30 two-store split)
- **Plan floor vs MAX-PER-DAY hero** must agree (memory CDB-30: confirmed two-store split —
  Plan floor ≠ MAX-PER-DAY hero). Walk both, compare the number. HIGH.
- **`explainMaxPerDay` formula vs the MAX-PER-DAY card formula** must be identical (candidate:
  they differ). Walk explainer, read its math, compare to card.
- **Provisions ↔ Bills overlap** (NRMA/Teachers Health/Rego/Green Slip exist in both surfaces —
  memory): confirm provisions don't double-count against Bills.
- **Survival forecast** uses the same surplus basis.

## Candidate findings
- CDB-30 two-store split: Plan floor ≠ MAX-PER-DAY hero [HIGH].
- `explainMaxPerDay` formula ≠ MAX-PER-DAY card formula [pending].
- provisions bypass canonical writer / audit [pending].
