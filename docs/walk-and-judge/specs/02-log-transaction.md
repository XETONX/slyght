# Spec 02 — Log a transaction (the core Quick Log writer)

**Story:** Sam buys a $4.50 coffee and logs it. This is the most-used action in the app; it
must decrement cash, append a txn, fire a round-up if enabled, and never touch a goal unless
a destination is chosen.

**Fixture:** positive (`state-snapshot.fake.json`). Round-ups ON → China Holiday.

## Level 1 — entry
Dashboard → Quick Log FAB → `openQuickLogModal` index.html:10154.

## Level 2 — per control
| action | driver | expect S-delta | expect lands |
|---|---|---|---|
| open modal | `openQuickLogModal` :10154 | modal, category chips | — |
| pick "Food / Coffee" | chip handler | category set | — |
| enter $4.50 | fill | — | — |
| submit (spend) | `quickLogTxn` :10311 → `recordWithAllocation` :24524 | bal −4.50 · txns +1 | `txn_record`,`balance_apply_delta` |
| round-up fires | round-up logic (`_isRoundup`) | China Holiday +0.50 · extra txn | `bucket_saved_change` (round-up dest) |
| pick "Income" | chip | sign flips to credit | — |
| submit income | `quickLogTxn` :10311 | bal +amt · `income:true` txn | `txn_record`,`balance_apply_delta` |
| undo (toast) | undo handler | reverses last txn + balance | `txn_reverse` / inverse `balance_apply_delta` |

## Level 3 — cross-surface
- **Dashboard hero** (`getLiveBal`) reflects new bal immediately.
- **MAX-PER-DAY / daily budget** tile recomputes (the spend reduces today's headroom).
- **Analysis** category totals + filter-scatter include the new txn (STRICT/LAX/OUTFLOW).
- **Round-up** destination bucket (China Holiday) tile updates on Savings tab.
- A logged **"Bills"-category** txn must NOT auto-mark a bill paid (only mark-paid does — Spec 03).

## Candidate findings
- Round-up writes via `_isRoundup` — confirm it routes through canonical writer + audit (not raw push).
- Income vs spend sign handling at :10311 — confirm income never decrements a bucket.
- `fmt` vs `fmtC` currency formatting inconsistency on the toast vs hero [pending].
