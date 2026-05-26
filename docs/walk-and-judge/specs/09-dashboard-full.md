# Spec 09 — Dashboard (full surface, ~43 actions)

**Story:** The home screen is where Sam lands. Cash hero, MAX-PER-DAY, net worth, payday
countdown, goal tiles, debt summary, Quick Log FAB. Every number must be tappable → explainer
(CLAUDE.md §8) and every number must agree with its source-of-truth surface.

**Fixture:** positive (`state-snapshot.fake.json`).

## Level 1 — main UI
Dashboard. Screenshot full surface. Inventory every tile + tappable number.

## Level 2 — per tile
| tile / action | driver | expect | lands |
|---|---|---|---|
| cash hero | `getLiveBal` | = bal 4800 | — |
| tap hero → explainer | hero explainer | breakdown | — |
| MAX-PER-DAY | `getDynamicDailyBudget` (Spec 06) | today's allowance | — |
| net worth | NW computation (INV-06) | assets − liabilities | — |
| payday countdown | payday calc | days to payday 15 | — |
| WRX / Super tiles | assets readers | $25k each | — |
| goal mini-tiles | savings readers | Darwin/China/Rainy % | — |
| debt summary | debts reader | Sam $400 + Jordan $250 | — |
| Quick Log FAB | `openQuickLogModal` :10154 | modal (Spec 02) | — |

## Level 3 — cross-surface (the coherence contract — INV-14, FR-06)
- **Payday countdown** must show the SAME value here, in Plan canvas, and anywhere else
  (FR-06: 3 different values across surfaces — memory). Walk all three, compare. HIGH.
- **Net worth** must equal Analysis NW (INV-06). Walk both.
- **MAX-PER-DAY** must equal Plan floor (Spec 06 CDB-30). Walk both.
- **Debt summary** must equal Debts sub-screen + canvas (FR-07). Walk all three.
- **WRX** has two writer paths — confirm both write the same value.

## Candidate findings
- FR-06: payday countdown 3 values across surfaces [HIGH].
- `explainMaxPerDay` formula ≠ card formula [pending].
- WRX two writer paths diverge [pending].
- `fmt` vs `fmtC` formatting inconsistency [pending].
