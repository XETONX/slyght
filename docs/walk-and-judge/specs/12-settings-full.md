# Spec 12 — Settings + Diagnostics (full surface, ~57 actions)

**Story:** Settings is where Sam configures income/payday, budgets, round-ups, debt strategy,
push, PIN, API key, and runs diagnostics/reset. Many edits flow into money math, so each must
route a canonical writer + audit, and the 3-stage Reset must be safe.

**Fixture:** positive (`state-snapshot.fake.json`). BRAIN.config bubble (Bundle 22 v3).

## Level 1 — main UI
Settings tab → sub-screens (income, budgets, bills config, savings config, push, security,
diagnostics). Screenshot each sub-screen (Bundle 22 v3 IA: 6 sub-screens, 13 edit modals).

## Level 2 — per control (sample of the 57)
| action | driver | expect | lands |
|---|---|---|---|
| edit income / payday | income edit modal | `S.income`/`S.payday` via canonical | config write |
| edit weekday/weekend budget | budget modal | recompute daily budget (Spec 06) | config write |
| toggle round-ups + destination | round-up config | flag + dest | config write |
| change debt strategy | strategy | avalanche↔snowball | config write |
| toggle push-on-save | push config | **walk only on FAKE (pushOnSaveEnabled stays false)** | config write |
| set PIN | PIN config | `pinHash` set | config write |
| API key field | key config | stored (empty in fixture) | config write |
| Reset (3-stage) | reset flow | 3-stage confirm, snapshot before | snapshot + reset audit |
| diagnostics / boot self-test | diag panel | invariant checks render | — |

## Level 3 — cross-surface
- **Income/payday edit** → Dashboard payday countdown + Plan canvas recompute (FR-06 coherence).
- **Budget edit** → MAX-PER-DAY (Spec 06) + survival forecast.
- **Round-up toggle** → Spec 02 round-up behaviour + destination bucket.
- **PIN set** → nav PIN gate (Spec 13) should now route to pin-screen (candidate: orphaned).
- **Reset** → snapshot taken (SNAPSHOTS.take) before wipe; confirm restore path.

## Candidate findings
- static Settings list (no virtualization) — perf at scale [memory, low].
- push toggle must never flip the fake fixture's `pushOnSaveEnabled` to true during a walk [guard].
- PIN set doesn't wire the boot gate (see Spec 13) [pending].
