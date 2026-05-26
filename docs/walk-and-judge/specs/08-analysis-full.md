# Spec 08 — Analysis (full surface)

**Story:** Sam opens Analysis to see where money went and whether net worth is trending up.
Category breakdown, the filter-scatter (STRICT vs LAX vs OUTFLOW), spend trends, and the
Net-Worth trend vs last month. Numbers must reconcile to the ledger.

**Fixture:** positive (`state-snapshot.fake.json`) — chosen specifically because it has Bills +
Debt-repayment + correction + round-up txns (so the filter-scatter is visible) and a
`monthlyHistory` entry (so NW-trend renders).

## Level 1 — main UI
Analysis tab → category chart + filter toggles + NW trend. Screenshot each view.

## Level 2 — per control
| action | driver | expect | lands |
|---|---|---|---|
| open Analysis | nav | charts render from txns + monthlyHistory | — |
| toggle STRICT / LAX / OUTFLOW filter | filter handler | scatter recomputes; correction/round-up/income classified correctly | — |
| change segment (1m/3m/etc) | seg handler | window changes | — |
| view category breakdown | category agg | totals match ledger sum per cat | — |
| view NW trend | NW-trend reader (monthlyHistory) | delta vs last month is sane | — |

## Level 3 — cross-surface (reconcile to ledger)
- **Category totals** must equal the sum of `S.txns` per category (walk + add up — the
  `_isCorrection` and `_isRoundup` txns must be classified, not double-counted).
- **NW trend** vs `monthlyHistory[last].nw` (17800) — the delta must be correct (memory:
  "NW Trend off by orders" — showed +$90,506 implying wrong baseline). Walk + verify the number.
- **OUTFLOW filter** must include Bills + Debt-repayment txns (not just discretionary).

## Candidate findings
- NW Trend off by orders of magnitude (reads stale/wrong baseline snapshot) [HIGH, memory].
- filter-scatter STRICT/LAX/OUTFLOW misclassifies correction/round-up [pending] (OPEN-BUGS #6/#7/#8/#17).
- segment change may not refresh all sub-charts [pending].
