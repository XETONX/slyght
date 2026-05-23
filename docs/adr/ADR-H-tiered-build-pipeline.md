# ADR-H — Tiered Build Pipeline (Ledger-Walk-Gated)

**Status:** Draft (2026-05-23)
**Author:** CC + John (in dialogue)
**Trigger:** P0-5 misdiagnosis on 2026-05-23 — Drone L flagged Allianz CTP + KIA Rego as "phantom paid flags" from snapshot inspection alone. Both were legitimate early payments backed by debit txns 5-6 days prior. The pipeline was about to ship a "fix" that would have flipped $1,028 of already-spent money back to "owed" in the catastrophic direction. John caught it. The methodological gap exposed: drones were diagnosing state-derived bugs from snapshot + flag inspection without walking the txn ledger to prove the flags were ledger-backed.

---

## Context

Across the 2026-05-21 to 2026-05-23 multi-session sweep, the team converged on a working pattern: parallel investigation drones → collector synthesis → council push-gate. This pattern shipped four clean bundles (Pass 2, 32a, Phase A, Pass 3) and was beginning to generalize. Two refinements landed during the 2026-05-23 session:

1. **John's "council" framing** — bigger changes route through a structured go/no-go artifact (Guardian + INV + FEATURE-MAP + priorities), not vibes. Easy fixes route through parallel build-agents with implementation manuals.
2. **Opus's "conformance tier" addition** — between Analyse and Build, an architectural-fit verification asks "does this change cohere with the system?" Bidirectional: routes work back when fit fails. Severity-gated: blocks NEW misfits, flags pre-existing drift.

Both were correct additions but neither would have caught the P0-5 misdiagnosis, because both check fit + scope, not diagnostic validity against ground truth.

The missing tier is **Ledger Walk** — Step 0, before any investigation can claim a state-derived bug.

---

## Decision

The slyght build pipeline is a **6-tier process**. Tiers run in order. Each tier may route work backward (re-investigate / re-scope) or forward (with verdict + evidence).

### 0. LEDGER WALK

**Job:** Reconstruct today's state from txn events. Prove every derived value (flag, total, headroom, audit entry) reconciles to source events in `S.txns` + `S._auditLog`. Surface ledger-orphans (derived state with no event backing) and ledger-extras (events without derived-state reflection).

**Standing rule:** No state-derived finding may promote to bug status without ledger walk evidence. Flags are derived convenience; txns are ground truth. Never trust a flag the ledger doesn't back, and never override a flag the ledger does back.

**Tooling:** `scripts/recon/ledger-walk-paidbills.js` (today's seed). Generalize to `ledger-walk-debts.js`, `ledger-walk-buckets.js`, `ledger-walk-cycle-totals.js`, `ledger-walk-full.js`.

**Outputs:**
- Ledger-verified state model
- Per-paidBills-key verdict: BACKED / ORPHAN / AMBIGUOUS
- Per-debt verdict: paid:true backed by markPaid txn? viaRent excluded correctly?
- Per-bucket-saved verdict: bucket.saved matches sum of allocation events?
- Per-cycle-total verdict: snap.derived sums reconcile to recordWithAllocation envelope outputs?

**Cost:** ~30s per script per session; full walk ~2-3 minutes. The retro-cost-vs-misdiagnosis-cost ratio is overwhelming.

### 1. GATHER

**Job:** Parallel investigation drones (read-only) build the map.

**Discipline:**
- Each drone brief explicitly requires ledger-walk evidence for any state-derived claim
- "I saw the flag" is not evidence; "I saw the flag AND the matching txn at ts X" is
- Drones may surface ORPHAN claims (flag-without-txn) but must label them as orphans, not bugs

**Outputs:** Per-drone findings with file:line + ledger evidence per state-derived claim.

### 2. ANALYSE

**Job:** Collector synthesizes drone outputs. Routes by risk: safe-now (small, mechanical, code-structural) vs needs-review (substrate-shaping, cross-cutting, values-call-gated).

**Discipline:** Risk routing only. Does NOT verify architectural fit (that's Conformance) or ledger backing (that's Ledger Walk).

### 3. CONFORMANCE

**Job:** Architectural-fit verification + diagnostic-validity check. Bidirectional. Severity-gated.

**Checks:**
- **Mapped?** Exists in FEATURE-MAP. New surface needs FEATURE-MAP entry.
- **Labeled?** Concept named per vocabulary registry. New calc that introduces an unlabeled number is drift being born.
- **Linked?** Wired to canonical readers/writers, not floating.
- **Canonical-or-parallel?** Reusing existing canonical computation or inventing a parallel one that will drift?
- **Invariant coverage?** Which FINANCIAL-INVARIANT preserved; need new one?
- **Future-coherent?** Fits queued bundles + planned architecture, doesn't quietly make next month's work harder.
- **Diagnostic validity?** State-derived claim has ledger-walk evidence? (NEW per 2026-05-23)

**Severity gate:** BLOCK new misfits being introduced. FLAG pre-existing drift it touches but doesn't require fixing-the-world to ship one bug. Otherwise every hotfix gets held hostage to the entire backlog.

**Bidirectional routing:**
- Unmapped surface → back to drone: "map this before we touch it"
- Parallel calculation → back to collector: "this should reuse `getCanonicalSurplus`, not invent — re-scope the fix"
- State-derived claim without ledger evidence → back to drone: "walk the ledger first" (NEW per 2026-05-23)
- Missing invariant coverage → up to council: "this needs INV-NN defined before build"
- Conflicts with planned bundle → flag to John: "this fix and queued aiContext work collide, sequence them"

### 4. BUILD

**Job:** Parallel build-agents execute commits per implementation manual.

**Manual format:**
- file:line + old text + new text (exact diff scope)
- Smoke spec file path + assertions to add
- Verification commands: `npm run smoke && npm run guardian`
- Expected diff size; agent MUST NOT touch outside named files
- Report-back format

**Sentinel-per-commit:** every commit gates on `npm run smoke && npm run guardian` GREEN before surfacing.

### 5. COUNCIL

**Job:** Push verdict per commit. Structured artifact, not vibes.

**Council artifact:**
```
## Council review — <commit subject>

Diff scope: <files touched, LOC delta>
Guardian 4-layer: <PASS/FAIL per layer>
Sentinel: <smoke count, scenario-walk, conservation receipt>
Invariants: preserved <list>; new <INV-NN if any>; violations <none/list>
FEATURE-MAP impact: <new entries / amended entries>
Ledger-walk basis: <which ledger walk(s) backed the diagnosis>
Priority justification: <why this commit, this session, vs deferring>
Risk: <named risks, mitigations>
Verdict: GREEN / HOLD / ESCALATE-TO-JOHN
```

Trusts upstream tiers. Council does NOT re-derive architectural questions (Conformance handled) or re-verify ledger evidence (Ledger Walk handled). Council confirms: gates green + push justified.

GREEN → CC surfaces diff + verdict; John approves push.
HOLD → CC surfaces why; commit defers.
ESCALATE → values call needed before push.

---

## Consequences

**Positive:**
- Methodological gap closed: state-derived diagnoses can no longer ship from snapshot-only inspection
- Clear separation of concerns: each tier has one job
- Bidirectional routing prevents misfit work from progressing
- Severity gate prevents the pipeline from becoming a roadblock
- Council trusts upstream tiers, avoiding re-derivation

**Negative / tradeoffs:**
- Adds ~3-5 minutes per session for ledger walk (acceptable vs misdiagnosis cost)
- Conformance tier complexity grows (now includes diagnostic-validity check)
- Each tier needs explicit handoff format; freeform messages don't carry the structured verdict
- The pipeline is heavier than 4-tier; not every session needs every tier (single-line typo fixes shouldn't gate on Ledger Walk)

**Mitigation for the "too heavy" risk:**

Define **lightweight track**: trivial commits (typo, comment, doc, single-line refactor with no state touch) skip Ledger Walk + Conformance, go straight Gather → Build → Council. Threshold: if a commit doesn't read or write state, doesn't add a new calc, doesn't touch a render-side reader, doesn't change a canonical writer — lightweight track. Otherwise full pipeline.

---

## The Human Verdict block (intent-drift gate)

**Added 2026-05-23, after P0-5 misdiagnosis demonstrated that technical correctness ≠ "right for John."**

### Why this exists

Ledger Walk catches **factual** drift (does the analysis match the txns). Conformance catches **architectural** drift (does it fit the system). Neither catches **intent** drift — a fix that's technically correct, fits the architecture cleanly, passes every Guardian layer, AND silently encodes the wrong policy for John.

The backwards P0-5 was exactly this. Date-anchored guard was clean code, conservation held, Guardian green, smoke would have passed. But it encoded the policy "future-billDate paid flag is suspect" when John's actual policy is "I pay big bills early on purpose." Technical council would have shipped it. Hero would have lurched −$88 → −$1,116 the next morning.

**The trust-corruption argument is the gate's whole reason to exist:**

> A wrong number changes John's actual spending decisions. State-corruption is reversible (fix-forward); trust-corruption isn't (decisions already made on the wrong number compound). Even when persisted state is intact, a fix that makes the user-visible number lie in the wrong direction can do real damage before the next session catches it. The Human Verdict block exists to prevent the "technically perfect, humanly wrong" ship.

### The three axes — every Council artifact carries this block

#### 1. Impact — does it change a number John sees? by how much? in which direction?

Quantify the user-visible delta on the most-watched surface (hero / safeToSpendHeadroom / projectedEndBalance / 7-day burn / TO RECOVER levers / strip footer). Name the magnitude and direction explicitly. "More honest" / "More harsh" / "More lenient" / "More optimistic" — never just "changes the math."

**Thresholds:**
- **PASS** — no user-visible number changes, OR magnitude <$50.
- **FLAG** — hero / headroom swing ≥$50 AND below the HALT threshold. Requires John's explicit acknowledgment before push (logged "John saw + proceeded"). Not silent — silent FLAG collapses into PASS.
- **HALT** — hero / headroom swing ≥ max($100, 10% of current cash). The threshold scales UP with balance: $100 floor stops low-balance noise; 10% above $1k means the alarm fires when a swing of that size should actually worry John. CC may NOT unilaterally push; requires John's policy answer.

Rationale on the threshold direction: $100 at $5k matters less than at $800. The larger-of-two rule means HALT fires at $100 when cash is low, scales to $500 when cash is $5k, $1,500 when cash is $15k. A constantly-firing alarm gets ignored; calibration is the gate's effectiveness.

#### 2. Reversibility — recovery path + trust-corruption surface

Distinguish between failure modes:
- **PASS** — fix-forward only. No state mutation, no migration, no persisted artifact. If the fix is wrong, next smoke run catches it, no real-world damage.
- **FLAG** — fix-forward but trust-corruption surface exists. The user-visible number, if wrong, would alter John's spending decisions in the window before discovery. Acknowledgment required.
- **HALT** — irreversible state mutation (migration, persisted change to S.txns / paidBills / activePlan that can't be cleanly rolled back), OR trust-corruption magnitude (a wrong morning-after number that John would act on substantively).

The trust-corruption framing matters because state-corruption alone is a tractable failure mode (revert + fix), while trust-corruption persists in John's mental model and decisions even after the code is fixed. A morning showing "you're $1,116 underwater" leads to skipping coffee, cancelling weekend plans, asking Mum for money — those decisions don't get reversed when the bug is fixed in the afternoon.

#### 3. Decision-gate — does this encode a values judgment that's John's call?

The fix may be technically structural while silently choosing a policy. Triggers — if ANY apply, the decision-gate fires:

- **(a)** Change in a render reader that produces a number on a visible tile (hero, NW, MAX PER DAY, TO RECOVER, burn card, strip footer, debts grid).
- **(b)** Change affects classification (paid vs unpaid, fixed vs discretionary, viaRent vs immediate, bought vs planned, included vs excluded).
- **(c)** Change touches a canonical writer's contract semantics (what it writes, when, with what source tag, with what audit shape).
- **(d)** Change interprets ambiguous state (early vs late, intended vs accidental, current-cycle vs prior-cycle).
- **(e)** Change touches a threshold / default / rule that FIRES AUTOMATICALLY without John in the loop (auto-debit detection, notification triggers, survival-mode tripwire, cap logic, retry policy, anything that mutates without explicit user gesture).

Pure structural fixes (delete-the-double-debit, swap-reader-from-legacy-to-canonical, helper-rename, comment-cleanup) PASS the decision-gate automatically — they don't encode policy.

**Verdicts:**
- **PASS** — none of (a)-(e) apply.
- **FLAG (with citation)** — one or more triggers fire, BUT John has stated the relevant policy in a prior session / artifact (CDB item, ADR, memory pin). Commit message cites the policy source. Acknowledgment required.
- **HALT** — one or more triggers fire AND no prior John-policy on record. CC may not decide; requires John's policy answer before any code is written.

P0-5's backwards version: trigger (b) fired (paid-vs-unpaid classification), trigger (d) fired (interpretation of "future-billDate + paid flag"), trigger (e) fired (auto-debit pre-flag behavior). Three triggers, no prior policy. Verdict: HALT. The technical council would have shipped; the Human Verdict block blocks.

### Composite verdict logic

Per axis, one of {PASS, FLAG, HALT}. Composite:
- **Any axis HALT → composite HALT** — commit does not ship. John's policy answer required first.
- **Any axis FLAG → composite FLAG** — commit holds for explicit acknowledgment ("John saw + proceeded" logged in commit message). Push allowed after acknowledgment.
- **All PASS → composite SHIP** — push proceeds through normal Council gate.

### Format — slots into Council artifact

```
HUMAN VERDICT — <commit subject>

Impact:         <user-visible change, magnitude, direction>
                <verdict: PASS / FLAG / HALT, threshold reasoning>
                  
Reversibility:  <state mutation surface + trust-corruption surface>
                <verdict: PASS / FLAG / HALT>
                
Decision-gate:  <which triggers (a)-(e) fired, if any>
                <verdict: PASS / FLAG (cite policy) / HALT (specify question for John)>

Composite verdict: SHIP / FLAG-NEEDS-ACK / HALT-NEEDS-POLICY
```

### Why this complements the existing tiers

Three orthogonal axes — factual / architectural / intent — each catches a failure mode the others can't:

| Tier | Catches | Misses |
|---|---|---|
| Ledger Walk (Step 0) | factual drift (analysis doesn't match txns) | architecturally fine bugs; values mismatches |
| Conformance (Step 3) | architectural drift (parallel calcs, unmapped surfaces, vocabulary drift) | factually-wrong-but-architecturally-fine code; policy mismatches |
| Human Verdict (in Step 5) | intent drift (values mismatch, trust-corruption risk, automatic-firing rules without John's blessing) | factual / architectural issues (handled by other tiers) |

The three axes are the slyght-specific failure-mode triangle. Each session's commit lands at the intersection: factually true, architecturally clean, intent-aligned with John. Any one missing = the commit isn't ready.

---

## Standing rules codified

1. **Ledger is ground truth.** `paidBills`, `debt.paid`, `status:'bought'`, `_isCorrection` flags, `MODEL.*` derived values, `snap.derived.*` are all derived convenience. Source of truth is `S.txns` + `S._auditLog`.

2. **Verify flags against ledger before claiming bugs.** The rule:
   - `paid:true + matching debit txn → LEGITIMATE` (even if billDate future — early payment is valid)
   - `paid:true + NO matching debit txn → SUSPECT` (real phantom-flag bug)
   - `paid:false → unpaid`

3. **Standing investigation order:** Ledger Walk first, snapshot inspection second. Snapshot tells you what the system BELIEVES; ledger tells you what HAPPENED. Bugs live in the gap.

4. **Roadmap is additive.** Each session reads prior session-memory + roadmap, walks the ledger fresh, extends the path forward — never restarts, never re-derives settled architecture, always builds in the verified direction.

5. **The misdiagnosis lesson is permanent.** Future sessions reading this ADR understand: a flag without ledger backing is suspect; a flag WITH ledger backing must be respected even when temporal intuition disagrees (early payment example).

6. **The Human Verdict is the intent gate.** Technical correctness ≠ right-for-John. Every Council artifact carries a Human Verdict block answering three questions: does this change a user-visible number (impact), what's the recovery and trust-corruption surface (reversibility), does it encode a values judgment that's John's call (decision-gate). Trust-corruption matters even when state isn't corrupted: a wrong number changes John's actual spending decisions in the window before discovery. The gate exists to prevent the "technically perfect, humanly wrong" ship. See "## The Human Verdict block" above for axis thresholds, verdict states, and composite logic.

---

## Related artifacts

- `scripts/recon/ledger-walk-paidbills.js` — seed implementation
- `docs/sessions/2026-05-22-session.md` — session memory containing CDB-01 to CDB-37
- `docs/sessions/2026-05-22-session-retro.md` — retro of the misdiagnosis + lessons
- `CC-PRINCIPAL-ENGINEER-MANUAL.md` — to be amended with Section 16 "Ledger Walk discipline"
- `CLAUDE.md` §8 — to be amended with "Ledger Walk before state-derived diagnosis"
- `MEMORY.md` — to be updated with the standing rule

---

## Open questions

- **Q1:** Lightweight track threshold — codify the exact predicates (no state read/write, no new calc, no canonical writer touch, no render-side reader) or leave to operator judgment?
- **Q2:** Ledger walk runtime — is 2-3 minutes too long if it gates every session? Should there be cached state walks per fixture?
- **Q3:** When a flag is AMBIGUOUS (matches multiple txns — the YouTube Premium-18 duplicate case), is that auto-surfaced to John or auto-resolved by some heuristic (latest match wins)?
- **Q4:** Does the Council tier ever re-walk the ledger as a sanity check, or does it fully trust the Step 0 walk that informed the build?

These are deferred for resolution as the pipeline gets exercised.
