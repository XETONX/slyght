# Spec 07 — Bills / Calendar (full surface)

**Story:** Sam's recurring bills (Rent, Phone, Streaming, Gym monthly; Insurance yearly) drive
the calendar, the "due soon" markers, and the committed-money math. Add, edit, delete, mark-paid
(Spec 03), auto-debit. The cycle math must be correct for monthly AND yearly.

**Fixture:** positive (`state-snapshot.fake.json`). BILLS array has monthly + 1 yearly (Insurance dueMonth:5).

## Level 1 — main UI
Bills/Calendar tab → bill list + calendar view + "due soon"/"N days away" markers. Screenshot.

## Level 2 — per control
| action | driver | expect | lands |
|---|---|---|---|
| open Bills | nav | list + calendar, due markers correct | — |
| add bill | add-bill modal | new BILLS row (name/amt/day/freq/tag) | bills write |
| edit bill | edit modal | fields update, **`paymentDates` preserved** | bills write |
| delete bill | delete | row removed, **paidBills history NOT swept** | bills write |
| mark paid | Spec 03 | bal −amt, cycle key set | `txn_record`,`balance_apply_delta` |
| toggle auto-debit | autoDebit flag | bill flagged; batch processes once | per-bill txn |

## Level 3 — cross-surface
- **Committed money / daily budget** reflects bills due this cycle (Spec 06).
- **Dashboard hero** decrements on mark-paid.
- **Analysis** bill txns counted under Bills, not discretionary (filter-scatter).
- **Yearly bill** "N days away" must compute against dueMonth, not assume monthly. Walk Insurance.
- **paidBills history** preserved across delete + cycle rollover (memory note).

## Candidate findings
- 3-way "N days away" wrong for yearly bills [pending].
- cycle-relative writer-key vs reader-key mismatch (Spec 03) → undo no-op [HIGH].
- bill edit drops `paymentDates` [pending].
- BILLS ↔ ANNUAL_PROVISIONS double-count risk (memory) [pending].
