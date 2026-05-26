# Spec 05 — Savings: goals + trips (full surface)

**Story:** Sam manages three savings intents — Darwin Trip (✈️ trip), China Holiday (🇨🇳 trip),
Rainy Day Fund (🌧️ goal). Add, edit, fund, complete, archive, delete. Each is backed by a
`savingsBuckets[]` row + a `planIntents[]` intent; the two MUST stay in sync.

**Fixture:** positive (`state-snapshot.fake.json`).

## Level 1 — main UI
Savings tab → list of 3 goal tiles (saved/goal, %, account). Screenshot the whole surface.

## Level 2 — per tile / button
| action | driver | expect S-delta | expect lands |
|---|---|---|---|
| open Savings tab | nav | 3 tiles render with correct % | — |
| tap a goal tile | tile open | detail modal (history, contribute) | — |
| add money to goal | savings contribute → `recordWithAllocation` (bucket dest) | **bal −amt** AND **bucket.saved +amt** | `txn_record`,`balance_apply_delta`,`bucket_saved_change` |
| add new goal | add-goal modal → `BRAIN.savings` + write `planIntents` intent | new bucket + new intent (synced) | bucket-add audit |
| edit goal (name/target) | goal-edit modal | bucket AND intent both update | edit audit |
| mark goal complete | complete handler | persists completed state | complete audit |
| archive ($0) goal | archive move | bucket → archive, history preserved | archive audit |
| delete goal | delete (native confirm?) | bucket removed, **no orphan intent** | delete audit |

## Level 3 — cross-surface
- **Add money MUST debit `S.bal`** — confirm at Dashboard hero (FR-01/02 class: code-read says
  add-savings may credit `bucket.saved` without debiting `S.bal` → **NW inflates**). HIGH.
- **Net Worth** (Dashboard + Analysis) unchanged by an internal transfer (INV-06).
- **Plan canvas** Savings sub-screen shows the same buckets/targets (intent ↔ bucket sync).
- **Round-up destination** (China Holiday) receives round-ups (Spec 02) — confirm tile climbs.

## Candidate findings
- add-savings credits `bucket.saved` but never debits `S.bal` → NW inflates [HIGH].
- goal-edit doesn't write canonical intent (reverts on reload); mark-complete doesn't persist.
- `rainy-day` (intent id) vs `Rainy Day Fund` (bucketId) — id-vs-name mismatch → broken linkage.
- orphan buckets on delete; native `confirm()` in delete (CLAUDE.md §8 violation).
