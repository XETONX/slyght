# Session retro — 2026-05-22 / 2026-05-23 (the cashflow-truth sweep + P0-5 misdiagnosis)

**Outcome:** No commits shipped tonight. Session converted to retro after a misdiagnosis caught by John before push. The retro itself is the deliverable: a methodological upgrade (ADR-H pipeline with Ledger Walk as Step 0) codified for every future session.

---

## What happened (chronological)

1. **Session opens (2026-05-22) — multi-tier scoping pipeline run:**
   - 5 Tier-1 drones launched (A-E) — net-worth render, duplicate +Add Debt button, MAX PER DAY card, Sub-bundle 2 log-time interceptor scoping, P0-1/2/3 verification
   - John expanded scope mid-session: 8 more Tier-1 drones (F-M) — chat-action bypass, toISOString sweep, heal-on-read, vocabulary registry, render-side raw-S reads, conservation audit, dashboard "doesn't compute" walk, ASCII mockups
   - 13 drones produced 32 Could-Do-Better (CDB) items spanning Themes A-M
   - Opus added a "Conformance tier" between Analyse and Build (architectural-fit verification, bidirectional, severity-gated)

2. **Tonight execution scoped:**
   - 9 commits: 6 Tier-1 build-agent-direct + 3 Tier-2 council-gated
   - Tier 1: P0-1 payBillNow double-debit · P0-2 knownUpcoming filter · P0-3a toLocalISODate helper · Break #2 runs-dry numerator · Net-worth Option C · TO RECOVER bonusLever
   - Tier 2: P0-5 isPaidInCycle billDate guard · P0-6 markPaid cat:'Bills' · CDB-28 getThisWeekProjection → isPaidInCycle reader swap

3. **Fresh KV pull successful (2026-05-23):**
   - `tests/state-dump/live-2026-05-23.json` (294,065 bytes)
   - bal $781.66, weekdayBudget tightened 30→20 since May 21, bonus $1,341 still excluded

4. **P0-5 surfaced as "biggest money-truth bug on the slate":**
   - Drone L: "AUTO bills marked paid 6 days before they actually charge" — Allianz CTP (day 30) + KIA Rego (day 30) flagged paid today
   - CC: "P0-5 confirmed live and biting" — hero understating obligations by ~$1,028
   - **The diagnosis was wrong.**

5. **John catches the misdiagnosis:**
   - "STOP on P0-5. The two flagged bills are NOT a bug. I paid them EARLY — a few days after payday, deliberately, because they're big bills and I didn't want to get blindsided. The paid:true flag is CORRECT. The money already left my account."
   - Drone L (and CC) had inspected the flag without walking the ledger. Both flags were legitimate early-payment markers backed by debit txns 5-6 days prior.

6. **Ledger walk verifies John's correction:**
   - `scripts/recon/ledger-walk-paidbills.js` (built on the spot) checks every paidBills key against S.txns
   - Allianz CTP — paid 2026-05-17 12:32 ($566 "Allianz CTP — paid" cat:Insurance) — **LEDGER-BACKED**
   - KIA Registration — paid 2026-05-18 13:35 ($462 "KIA Registration — paid" cat:Bills) — **LEDGER-BACKED**
   - 14 of 16 paidBills keys backed by ledger; 1 ORPHAN (`2026-5-Stan-7`, bare `true`, no matching txn); 1 AMBIGUOUS (YT Premium-18 matches 2 candidate txns)
   - Proposed P0-5 fix (date-anchored guard) would have flipped Allianz + KIA Rego back to "owed" — **a $1,028 false-negative in the catastrophic direction**

7. **Session paused. Retro mode.**

---

## What was misdiagnosed (and why)

**The mechanical mistake:** Drone L's investigation pattern was "inspect paidBills key + check billDate against today". The pattern works for catching genuine phantom flags but fails to distinguish phantom-flag from legitimate-early-payment.

**The deeper failure:** The investigation methodology never required ledger-walk evidence for state-derived claims. Drones could surface "this flag looks wrong" without proving the flag was ledger-orphan. Conformance tier (added by Opus) checked architectural fit but not diagnostic validity.

**Why the pipeline didn't catch it:**
- Drone L's brief said "report in assumption-shape" but didn't require ledger backing
- Auditor agents (not run this session) would have verified file:line claims but not the underlying diagnostic logic
- Conformance tier was scoped to architectural-fit (mapped/labeled/linked/canonical), not "did this drone actually walk the ledger?"
- John caught it. The pipeline did not.

**What John was looking for:** The text of his catch reveals the diagnostic discipline expected — "If you'd walked the ledger you'd have found the two early payments and concluded the flag is correct." This is the standing rule that emerged: ledger first, snapshot second.

---

## What survives from this session

### Code-structural findings — survive ledger-walk sanity check (no state inference dependency)

These are pure code reads, ledger-walk-irrelevant. They diagnose bugs in the code itself, not in derived state values:

- **P0-1** payBillNow double-debit at L19949 (Drone E)
- **P0-2** knownUpcoming filter missing at L21215 (Drone E)
- **P0-3a** toLocalISODate helper for cycleStart/End/Id (Drone E + Drone G)
- **Break #2** runs-dry numerator uses S.bal instead of S.bal − unpaid (Drone K)
- **Net-worth Option C** conditional hide on coral (Drone A + Drone M)
- **TO RECOVER bonusLever** additive UI row (Drone L)
- **CDB-28** getThisWeekProjection → isPaidInCycle reader swap (Drone L)

These will go forward in a future session after the pipeline is rebuilt with Ledger Walk as Step 0.

### State-derived findings — held pending ledger-walk re-verification

These claimed bugs from state inspection. Each must be re-verified against the ledger before promotion:

- **P0-5 isPaidInCycle billDate guard** — RE-DIAGNOSED. The real bug is Stan-7 ledger-orphan, not Allianz/KIA. Fix shape changes from date-anchored to TXN-ANCHORED. Magnitude small (P3-class). Fix shape: `isPaidInCycle` Path 1 requires `_txnTs` OR matching debit txn within window.
- **P0-6 markPaid cat:'Bills'** — needs values call (truly-fixed vs discretionary-recurring bills) AND ledger re-walk before fix shape is correct.
- **All Drone L findings beyond #1, #2** (legacy alerts, bonus invisible, Immediate Debts label, three bill-paid readers in same card, etc.) — many are structural BUT diagnosis included some state-derived inferences. Each needs the ledger-walk pass.

### Process artifacts — survive

- `docs/sessions/2026-05-22-session.md` — 37 CDB items, full session memory
- `docs/adr/ADR-H-tiered-build-pipeline.md` — 6-tier pipeline including Ledger Walk
- `scripts/recon/ledger-walk-paidbills.js` — seed implementation of Step 0
- This retro doc

---

## Lessons codified

### 1. Ledger Walk is Step 0 of every session

Codified in ADR-H. The methodological gap that allowed P0-5 is closed by making Ledger Walk a prerequisite for any state-derived bug claim. CDB-34 captures the full rule.

### 2. Flags vs ledger: txns are ground truth

Pinned to memory. Standing rule:
- paid:true + matching debit txn → LEGITIMATE (regardless of billDate)
- paid:true + NO matching debit txn → SUSPECT
- paid:false → unpaid

Future-billDate is NOT evidence of a phantom flag if a matching debit txn exists. Early payment is a legitimate workflow.

### 3. Severity gating in Conformance

Opus's addition stands: BLOCK new misfits, FLAG pre-existing drift. Without the gate the pipeline becomes a roadblock; with it, conformance protects forward without barricading present.

### 4. Roadmap is additive, never restarting

Each session walks the ledger fresh, reads prior session-memory + roadmap, extends the path forward. Never re-derive settled architecture. Build in the verified direction.

### 5. The pipeline is the immunity, not the speed

Opus's framing: the pipeline isn't to ship faster; it's to ensure the changes that DO ship cohere with the system. The four-bundle clean streak before this session was achieved by tight scope + verification discipline. The misdiagnosis is the kind of error that compounds if not corrected at the source.

### 6. Honest acknowledgement when the pipeline fails

This retro IS the corrective. Not a "we'll do better next time" handwave. A structural change to the methodology, documented in ADR-H, persisting beyond any single session.

---

## Queued for next session

1. **Run Ledger Walk Step 0** against fresh state — extend `ledger-walk-paidbills.js` to cover debts, buckets, cycle totals, full reconciliation
2. **Re-verify each Drone L finding** through the ledger-walk lens — promote only the ones with backing
3. **Re-scope P0-5** as txn-anchored Stan-7 cleanup (~P3-class)
4. **Re-scope P0-6** after values call on truly-fixed vs discretionary-recurring bill categorization
5. **Ship the 7 sanity-checked structural commits** if no new misfits surface
6. **Amend CLAUDE.md §8 + CC-PRINCIPAL-ENGINEER-MANUAL.md** with the Ledger Walk standing rule
7. **Update MEMORY.md** with the misdiagnosis lesson as a pinned feedback memory

---

## Closing read

The pipeline gained a tier tonight. The cost was zero commits shipped, one misdiagnosis caught before push, ~3 hours of work that turns into permanent methodology. John's catch wasn't an interruption to be routed around; it was the pipeline working at the highest level (John as final arbiter on diagnostic validity). The corrective is to make Ledger Walk routine so John doesn't have to catch the next one manually.

Tomorrow: re-verify, then build, then ship the verified subset.
