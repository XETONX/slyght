# Bundle 28 — Working Notes

> Running ledger maintained during Bundle 28 implementation.
> Captures: code observations, outside-the-box ideas, deferred work,
> session-spanning context. Sibling to MISSION-BUNDLE-28 + AUDIT-A1.

---

## Phases shipped (in order)

| Commit | Phase | What |
|---|---|---|
| `22ef496` | 28.0 | PLAN.intents canonical entity + seedV25 migration (additive, no UI) |
| `65289c5` | 28.0.1 | Hygiene quick wins: B28-1/2/3/12/15 + helpers (_paydayExitToTab, _paydayProgressBar, openEditPaydayKiaExtra) |
| `6eb7034` | 28.0.1+ | Round 3 forward fixes: "+ Add bucket" → openAddBucketModal, footer label, KIA toast try/catch |
| `bdda17b` | 28.0.2 | **z-index sandwich fix** — `.modal-overlay` 200→600, `.recon-overlay` 300→620, `showToast`/`undo-toast`/`offline-badge` 400/500→800. Closes the entire layering bug class for any modal/toast opened above the canvas. |
| `b7fb6ed` | — | Layer V captures #41+#42 visually verifying the z-index fix |

---

## Observations carried over (not yet fixed)

### Code-level

- **Stale `S.tripDefs` / `S.goalDefs` mirror after seedV25** — Phase 0 leaves the legacy arrays in place so `PLAN.getTrips`/`getGoals` shims keep working unchanged. Bundle 29 candidate: drop the legacy arrays once readers migrate.
- **`renderSavingsBuckets` is dead code** — function exists at L6783 but its target `#savings-buckets-content` doesn't exist in the new IA's DOM. Always returns early. Safe to delete in a hygiene round.
- **`renderAll` calls `renderAnalysisTab` when `pg-spend` is active** (L5017) — `pg-spend` is the Analysis tab (legacy naming). Future rename for clarity: `pg-spend` → `pg-analysis`.
- **`getGenuineSurplus()` (L2292) coexists with `BRAIN.plan.getSnapshot`** — legacy and canonical. Audit A1 noted this. Bundle 29 candidate: migrate callers, delete legacy.
- **MI-13 banner not visible in fresh fixture** — Layer V step "open MI-13 details" reports the banner isn't there. Could be that the fresh state doesn't trigger MI-13. Note for testing: build a fixture that triggers each invariant for full visual-regression coverage.
- **`getDiscretionarySpend` (lax filter) vs `computeSpentInRange` (strict filter)** — two parallel discretionary calculations. Source of OPEN-BUGS #6/#7/#8. Phase 28.0.5 territory.

### UX-level

- **"Savings" lives in two places** — Payday canvas Savings sub-screen (cycle allocation) AND should live in PLAN mode (long-term storage per John's feedback). Currently bucket-edit UI is buried behind a dead DOM ID (#savings-buckets-content). Bundle 29 candidate: surface buckets in PLAN mode root.
- **Borrowed-from-person flow is fragile** — John mistagged $500 Mum-loan as Income, double-counted with debt entry. Fix candidates: (a) new "Loan from person" category that auto-creates a debt + cash entry atomically, (b) AI nudge after recon: "this looks like a loan from a person, want to reclassify?".
- **TIGHT-mode classification can mislead** — when borrowed money is logged as income, the math is wrong but the classification was correctly responding to the wrong inputs. Possible add: weight debts by urgency (days until due) when computing immediate-pressure mode.
- **Auto-allocate has no preview** — user has no way to see what auto-allocate WILL do before committing. Phase 28.5 covers Full/Remainder modes but not preview UI. Note for Phase 28.5+: show a diff card before commit.

---

## Outside-the-box ideas (sparked while looking at code)

- **Sticky toast for critical actions** — balance corrections, payday-lock, etc. could persist 5-10s with an "Undo" button instead of 3s silent fade. Increases trust + recovery.
- **Long-press to expose edit/delete on txn rows** — current tap opens edit modal. Long-press could surface delete inline without opening modal. Faster correction path.
- **Optimistic UI on tick** — current tick has a brief delay while BRAIN.plan.tickItem runs. Make the tick visually flip immediately, then re-render after commit. Feels snappier.
- **AI as reclassification suggester** — when balance recon fires with a diff matching a recent income txn within $5, AI could surface: "this balance bump matches your recent +$500 logged 1 hour ago. Was that a loan from someone?" — would have caught John's Mum-loan mistag.
- **Time-frame zoom on every number** (P3 from REWRITE-COMPARISON §19) — tap any $X to see "this is $X this cycle / $Y this month / $Z this year". Universal pattern, Bundle 29+.
- **PLAN-mode "story mode"** — narrate the user's money journey via the plan: "Your next 14 days: rent leaves on day 4, salary lands day 15, China bucket grows $40 mid-cycle..." Conversational summary of the plan a-z. Could pipe through AI.
- **Heartbeat-based stale-data warning** — if balance hasn't been updated in 7+ days, banner: "Last balance update: 8 days ago. Tap to refresh."
- **Snapshot-on-Quick-Log toggle** — power-user feature, snapshot every txn for max recoverability.

---

## Deferred to later bundles (with reasoning)

| Item | Defer to | Why |
|---|---|---|
| Phase 28.7 TDZ cleanup at L1646/11246/13111 | TBD | Audit-log entries from those line refs are stale (lines shifted post-Phase 0). New entries should stop accumulating. Revisit if NEW errors appear post-Phase-0. |
| Savings-buckets in PLAN mode root | Bundle 29 | Cross-surface UX work; needs design pass. |
| `getGenuineSurplus` migration | Bundle 29 | Audit A1 §3 leverage debt #3; needs care to not break Dashboard surplus card. |
| Phase 7 worker crons (weekly digest, end-of-cycle recap, deferred-rollover) | Bundle 29 | CF Worker repo work; outside slyght/. |
| Borrowed-from-person canonical flow | Bundle 29 | Schema design — needs "loan from person" category that atomically creates txn + debt. |
| KIA Loan ground-truth reconciliation ($14,486 under-report) | Bundle 29 | Memory entry `slyght_kia_loan_ground_truth.md` documents. Needs Firstmac CSV import path. |
| Net Worth Trend math fix (OPEN-BUGS #13) | Bundle 29 | Memory entry `slyght_nw_trend_off_by_orders.md`. |
| Rules-as-data refactor | Bundle 30 | Audit A1 §5.5 strongest-shift. Big scope. |
| Cloud sync (Gist) | Bundle 23 (post-28) | Per Audit A1 §6 sequence. |

---

## Phase 28.2 — tile reorder (executing this turn)

- Swap L17546 (renderWrxCard) with L17550 (renderAllocateTile) in renderPlanMode
- Update inline tile-order comment to reflect time-axis principle from MISSION §3.2
- Layer V baseline capture before/after

## Phase 28.0.6 — Ask AI auto-fill (executing this turn)

User asked: "should chat box be auto filled with a prompt regarding allocation plan for payday? and then AI has access to that specific model and all information to actually discuss with me what to do, what auto allocation suggests, what trips i have upcoming, bills, unexpected purchases that has advised me to be more cautious this month etc etc?"

Approach:
- On `openPaydayAskAI`, navigate to chat as before
- Pre-fill the chat input with a templated question that:
  - Asks the AI to walk through the current cycle's plan
  - Cites the user's payday in N days, free amount, top intent, top debt
- Auto-submit OR leave for user to send (user choice — defer to leave-for-user for safety; lets them edit before sending)
- Chat system prompt already has full BRAIN.plan.getSnapshot context (Bundle 27 Phase 7)

## Phase 28.0.5 — cross-tile canonicalisation (executing this turn)

Audit-first approach:
1. Identify the 5 renderers and what each computes today
2. For each, determine if it diverges from MODEL.todaySpent / canonical helper
3. Migrate only the divergent ones (don't change what's already aligned)
4. Add Layer 1 rule `cross-tile-metric-canonical`

---

## Layer V verification log

| Capture | Phase | Verified |
|---|---|---|
| #38 dashboard-balance-edit-input | r2 balance | ✓ |
| #39 modal-recon-balance | r2 balance | ✓ |
| #41 modal-add-bucket-over-canvas | z-index fix | ✓ ON TOP of canvas |
| #42 toast-over-canvas | z-index fix | ✓ visible above canvas |
| #14 plan-top (this turn) | 28.2 tile reorder | Pending re-capture |

---

— end working notes —
