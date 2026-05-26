# CC Sub-bundle 1 — "What's Actually Safe To Spend" (the hero fix)

The most important bundle slyght has built. It makes the app answer, on its own, the question it exists for: what's safe to spend before payday. You just ran the reconciliation by hand and got the real number (−$83 headroom, 98% phantom bills, bonus excluded from plan). This bundle turns that hand-reconciliation into code. The proof-of-concept already exists — you did it — so this is codify-what-worked, not investigate-from-scratch.

This touches money-math the whole app depends on. Highest blast radius of any bundle. Every safeguard we have applies, maximally. Read this whole brief before spawning anything.

---

## GATING DECISION — answer A.2 before building

**Do NOT start building until John answers A.2.** Everything downstream depends on it.

**A.2 — What is the dashboard hero number?**

The reconciliation made the case concrete: the dashboard showed "$110 to allocate" (planning view, assumes income unspent — a fiction mid-cycle) and "$802.66" (raw cash, before obligations). Neither answers "what's safe to spend." The real number is cashflow-truth: cash − genuinely-still-due − daily-living-to-payday = the −$83 figure.

Recommended (Opus + reconciliation evidence): **hero = cashflow-truth safe-to-spend.** Planning headroom ("to allocate") demoted to a clearly-labelled secondary line. Raw cash stays as the account balance, distinct from safe-to-spend. Three numbers, three clear labels, the right one leads.

CC: surface this to John with the recommendation. Wait for his answer. It's the single most important product decision in slyght — what the app tells him first. Once locked, build.

---

## What this bundle delivers

1. **`BRAIN.bills.isPaidInCycle(bill, cycleDate)`** — the canonical paid-detection reader. Accepts the explicit `paidBills` flag AND the txn-match fallback (amount + payee + date-window — the exact logic the reconciliation used by hand). Every consumer calls this; no more flag-only readers.
2. **Pre-floor reconciliation** — one-shot, mark the already-paid bills paid (the 98% phantom — Rent, KIA, Optus, CTP, rego, debts all have matching txns). Idempotent, audit-logged, surfaced for John to confirm (not silent — A.1 answer).
3. **`totalToPlan` includes confirmed-present income** — the $1,341 bonus is physically in S.bal but `included:false` excludes it from the plan. Confirmed-present income (bonus + vet refund) flows into the plan number. (D2 #8 fix.)
4. **Dashboard hero = cashflow-truth** (per A.2) — the real safe-to-spend number leads; planning + raw cash become labelled secondaries.

The result John sees: open the app, the hero number is −$83 (or whatever's current), bills show the real ~$188 not the phantom $5,638, and the bonus is counted. The app tells him what the hand-reconciliation told him — automatically.

---

## The reconciliation IS the spec and the test fixture

This is the key advantage and the thing that makes flawless-as-possible achievable. You already ran this reconciliation against `tests/state-dump/live-2026-05-21.json` and produced verified numbers. Those become the test oracle:

- The txn-matching rule you used (amount + payee + date-window) → the `isPaidInCycle` implementation.
- The 7 confirmed-paid bills (Rent $3,000, KIA $780, Optus $194, CTP $566, rego $462, Mum $217.50, Michael $550) + the 3 the app caught (Claude $340, YT $17, Pet Ins $60.27) → smoke fixtures asserting these resolve PAID.
- The genuinely-still-due list (Adobe, Spotify, Google One, Bowtie, Stan→now cancelled, Claude Plus, Netflix, Moshtix) = $188.17 → smoke fixture asserting `billsUnpaidTotal` ≈ $188 not $5,638.
- The bonus $1,341 `included:false` physically in S.bal → smoke fixture asserting `totalToPlan` includes it post-fix.
- Conservation: $4,600.91 start + $9,315.67 in − $8,568.28 out = $802.66 → the conservation invariant the whole bundle must preserve.
- The duplicate Pet Insurance Bowtie entry → flag for cleanup (don't let it double-count).
- The FR-01 cycle-start adjustment ($4,544.63 booked May 15, not real in-cycle spend) → confirm it's excluded from burn/projection correctly.

Every fix in this bundle is tested against these real, validated numbers. A fix that doesn't reproduce the hand-reconciliation's output is wrong by definition.

---

## Execution — every tool, every agent, maximal rigor

### Phase 0 — Investigation (parallel, before any code)

The pipeline pattern, applied. Spawn parallel investigation agents:

- **Agent I1 — paid-detection consumers.** Enumerate EVERY reader of bill-paid state (the H1 finding said 12+ surfaces: Dashboard ribbon, WeekProjection, AI prompt L15208, AUDITOR.verifyState L17022, getDynamicBuffer L3605, getGenuineSurplus L2949, snapshot L21069, calendar L4596/4628). Do NOT claim a count — LIST every site with file:line. Each becomes a migration target to `isPaidInCycle`.
- **Agent I2 — totalToPlan income path.** Map exactly where `totalToPlan` is computed, where `bonus.included` gates it, every consumer of `totalToPlan`. The fix point + blast radius.
- **Agent I3 — dashboard hero render path.** Map the current hero number render, the "$110 to allocate" tile, the "$802.66" display. Where A.2's chosen number gets surfaced, what changes.
- **Agent I4 — reconciliation logic confirmation.** Re-verify the hand-reconciliation against the live snapshot one more time — confirm the txn-match rule (amount tolerance, date window, payee match) that correctly identified all 10 paid bills with zero false positives. This rule is the `isPaidInCycle` core; nail its exact parameters.

**Auditor agent** verifies every I-agent's output: file:line real, consumer lists COMPLETE (not "12+" — the actual enumerated list), the txn-match rule reproduces the reconciliation exactly. Bounded re-investigation if any list is incomplete. Nothing proceeds to build until the consumer enumeration is verified complete — a missed consumer is how this bundle would ship a bug.

### Phase 1 — Build, guarded by the Regression Sentinel

Because this changes math every surface depends on, the **Regression Sentinel agent** runs continuously: it holds the 157 smoke specs + 12 scenario-walk + conservation invariants + the new reconciliation-fixture assertions, and verifies them against EVERY proposed change BEFORE commit. Main CC proposes a change → Sentinel runs the full suite → only green proceeds to commit. No change ships without the Sentinel confirming conservation holds and the reconciliation numbers still reproduce.

Build order (each step Sentinel-gated):

1. **`isPaidInCycle` canonical reader** — implement with the verified txn-match rule. Smoke: reproduces all 10 paid-bill detections, zero false positives, the $188 still-due total.
2. **Migrate consumers** — every site from Agent I1's verified list, one at a time, Sentinel-checked after each. The conservation invariant (paid + unpaid = total) must hold after every single migration.
3. **Pre-floor reconciliation** — one-shot mark-paid for bills with matching txns, idempotent, audit-logged, surfaced-for-confirm (not silent). Smoke: runs once, second run is no-op, no data loss, John can confirm/reject.
4. **`totalToPlan` income inclusion** — confirmed-present income flows in. Smoke: bonus $1,341 included post-fix, totalToPlan reflects real money-in.
5. **Dashboard hero (A.2)** — surface the chosen number, demote the others to labelled secondaries. Smoke: hero shows cashflow-truth, planning + cash are present but clearly secondary.
6. **Duplicate Bowtie cleanup + FR-01 adjustment confirmation** — the two data-hygiene items from the reconciliation.

### Phase 2 — Verification before surface

- All 157 existing smoke + new reconciliation-fixture smoke green.
- Scenario-walk 12/12 × 2 runs (watch for the historical 3rd-run flake).
- Guardian 4-layer PASS.
- Conservation invariant proven against the live snapshot: the bundle's output reproduces $802.66 with the real $188 still-due.
- **The acid test:** run the app against `live-2026-05-21.json` and confirm the hero number now reads the real safe-to-spend (~−$83 adjusted for Stan cancellation) WITHOUT any hand-reconciliation. If the app produces the number CC produced by hand, the bundle works.
- Boot self-test extended for the new canonical reader.
- ADR written during, CHANGELOG + SECURITY.md (if touched) + FEATURE-MAP entry for `isPaidInCycle`, all same commit.

---

## Values calls (most pre-answered by the reconciliation)

- **A.1 — reconciliation auto-mark vs confirm:** ANSWERED — confirm, not silent. John can verify his payments precisely; surface "we detect these as paid, confirm?" Evidence: he listed all 7 correctly, ledger matched.
- **A.2 — hero number:** GATING DECISION above. John answers before build.
- **A.3 — QuickLog→markPaid matching:** use the same txn-match rule as `isPaidInCycle` (amount + payee + date-window). Consistent rule app-wide. The QuickLog "this pays bill X" picker is a Sub-bundle 2 enhancement, not blocking here.
- **Txn-match tolerances:** Agent I4 locks the exact amount-tolerance + date-window + payee-match that gave zero false positives on the reconciliation. If any genuine ambiguity surfaces (a txn that could match two bills), surface to John.

Anything else not covered here or by SECURITY.md / FINANCIAL-INVARIANTS — halt and surface.

---

## What this bundle does NOT do (scope fence)

- **Not the burn/pace UI** — that's Sub-bundle 2 (post-log impact reveal, runway visualization). This bundle makes the number TRUE; Sub-bundle 2 makes the burn VISIBLE in real time. Don't pull it forward.
- **Not the full calc-duplication collapse** — that's Sub-bundle 3 (Theme B). This bundle fixes paid-detection + income; the broader duplicate-formula cleanup follows.
- **Not the canonical-writer bypass closure** — Theme F, Sub-bundle 3.
- **Not the alive UI redesign** — Bundle 33. This bundle changes which number the hero shows + its labels, not the visual redesign.

If a fix tempts scope into the above, stop — the fence keeps this bundle shippable. The whole point is the FIRST thing John gets is "the app now tells me the truth," fast and clean, not a months-long mega-bundle.

---

## On "no more issues"

Realistic framing for the ship message: this is the most rigorously-guarded bundle slyght has built — real-data fixtures, full consumer enumeration verified by auditor, Sentinel-gated every change, the acid test of reproducing the hand-reconciliation. That maximizes clean execution. But software touching money-math across 28k lines can still surface edge cases; the Sentinel + the reconciliation oracle catch the regressions we can foresee, and the recon fog-of-war map flags the dark regions to be cautious near. Ship with confidence, phone-verify against live state, and treat any surfaced edge as the next finding — not a failure of the process. The process is what makes the edges rare and catchable.

---

## Surface to John when

- A.2 needs his answer (BEFORE build — gating).
- Build complete + acid test passes (hero reproduces the reconciliation number automatically).
- Any values call beyond the pre-answered ones.
- The duplicate Bowtie or FR-01 adjustment needs a decision.

Start: surface A.2 with the recommendation. On his answer, spawn Phase 0 investigation agents + auditor. Then Sentinel-gated build. Then the acid test. This is the bundle that makes slyght real — the day's whole sweep was the path to building it right.
