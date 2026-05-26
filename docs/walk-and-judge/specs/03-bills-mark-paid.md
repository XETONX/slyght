# Spec 03 — Bills: mark-paid · auto-debit · undo

**Story:** Sam's Rent ($1800) is due. Marking it paid must debit cash, write a ledger txn,
and flip the bill's cycle key — and undo must cleanly reverse all three. Auto-debit bills
must process in a batch without double-charging.

**Fixture:** positive (`state-snapshot.fake.json`). BILLS: Rent/Phone/Streaming/Gym/Insurance;
`paidBills["2026-5-Rent-1"]` already paid (ledger-backed) → use a *different* unpaid bill to walk mark-paid.

## Level 1 — entry
Bills/Calendar tab → bill row tile.

## Level 2 — per control
| action | driver | expect S-delta | expect lands |
|---|---|---|---|
| open Bills tab | nav → `goPage` | bill list renders, due markers | — |
| mark Phone Plan ($50) paid | mark-paid handler → canonical bills writer + `recordWithAllocation` | bal −50 · txn +1 (cat Bills) · `paidBills["2026-5-Phone-10"]={paid:true,_txnTs}` | `txn_record`,`balance_apply_delta`,bill-paid audit |
| undo mark-paid | undo handler | reverse txn + balance + clear cycle key | inverse lands |
| auto-debit batch | autoDebit processor (Bundle 31 Item 16) | each due auto-bill debited once, cycle-floor guard prevents re-charge | per-bill `txn_record` |
| edit a bill | bill-edit modal | amt/day/freq update; **`paymentDates` preserved** | bills config write |

## Level 3 — cross-surface (CRITICAL — writer-key vs reader-key)
- **Writer key vs reader key:** mark-paid writes a cycle-relative `paidBills` key; the reader
  (calendar + undo) must read the SAME key shape, or undo silently no-ops. **Walk undo and
  confirm the bill flips back to unpaid** (candidate finding — key mismatch).
- **Dashboard hero** decrements by the bill amount.
- **Daily budget / survival forecast** recomputes (a paid bill frees committed money).
- **Analysis** counts the bill txn under Bills, not discretionary.
- **paidBills history** must be preserved (never sweep historical paid entries — memory note).

## Candidate findings
- Cycle-relative writer-key vs reader-key mismatch → undo may silently no-op [HIGH, pending].
- Bill edit drops `paymentDates` [pending].
- "N days away" countdown wrong for **yearly** bills (Insurance, dueMonth:5) [pending].
