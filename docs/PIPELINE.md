# slyght — Standing Development Pipeline (read at the start of EVERY session)

This is not a one-task brief. This is the operating system for all slyght work. Every session, every bundle, every commit runs through this unless John explicitly suspends it. It exists because it was earned — each tier below was born from a specific failure caught during development, and skipping a tier is how that class of failure returns. Read it fully at session start. Re-read any tier before the work that triggers it.

The non-negotiable principle underneath everything: **flags and derived state are convenience; the transaction ledger and the running app are ground truth. Never trust a derived value the source doesn't back. Never ship a number without proving it against what actually happened to John's money.**

---

## Session bring-up — ALWAYS, before any work

1. **Read the durable assets, in order:**
   - This pipeline doc
   - `SECURITY.md` (phase order is non-negotiable; current live phase + committed-next)
   - `docs/adr/ADR-H-tiered-build-pipeline.md` (the full tier specs + standing rules)
   - `MEMORY.md` index + any pinned memories flagged at top
   - The most recent `docs/sessions/*.md` (where the last session left off, the open queue)
   - The relevant SDD if working a scoped bundle

2. **Step 0 — Ledger Walk against FRESH state. Every session. No exceptions.**
   - Pull John's current live state from KV (wrangler direct read, `--remote`, device hash known). NOT the frozen oracle — the oracle is for regression tests; the walk needs today's reality.
   - Walk the full txn ledger forward from cycle start: every txn logged/removed/adjusted, every change-log entry, every note. Reconstruct how today's state was reached.
   - Verify derived state reconciles to source events **to the dollar**: flags, billsUnpaidTotal, headroom, paidBills, bucket totals — each gets a BACKED / ORPHAN / AMBIGUOUS verdict against the ledger.
   - The rule: `paid:true + matching txn → BACKED (legitimate even if billDate future — early payment is valid); paid:true + no matching txn → ORPHAN (suspect, treat unpaid); paid:false → unpaid`.
   - Surface the reconciled honest number + the BACKED/ORPHAN/AMBIGUOUS table BEFORE any analysis or build. If derived disagrees with ledger, that disagreement is the first finding.
   - **Walk the data fresh; trust the settled architecture map; extend the roadmap additively — never restart, never re-derive settled findings, always build in the verified direction.**

3. **Confirm the roadmap position** — read the committed order, state what this session is and isn't, surface to John for triage. Don't assume the queue; confirm it.

---

## The build pipeline — 6 tiers, every piece of work runs through it

```
0. LEDGER WALK   — fresh-state reconciliation (above). Ground truth before anything.
1. GATHER        — parallel investigation drones, deep, assumption-shape (never conclude)
2. ANALYSE       — collector: route by RISK (safe-now vs needs-review)
3. CONFORMANCE   — route by FIT (architectural). Bidirectional, severity-gated.
4. BUILD         — parallel build-agents per manual, Sentinel-gated per commit
5. COUNCIL       — push verdict: technical + Human Verdict (intent). John approves every push.
```

### Tier 1 — Gather
Parallel investigation drones, one per scope question, all tools available. Drones report findings in **assumption-shape with file:line evidence — they never conclude, never claim counts they didn't enumerate** ("12+ consumers" is banned; list all twelve with locations). Spawn more drones UP when the codebase reveals unmapped territory. Severity-gated fidelity: high-severity findings travel with full file:line; trivial ones stay summary.

### Tier 2 — Analyse (collector, routes by RISK)
Sorts findings: safe-to-ship-now vs needs-deeper-review. This is RISK routing, distinct from Conformance's FIT routing. Cost discipline: no auditor pass on a zero-finding drone; no cross-reference until 2+ regions cleared.

### Tier 3 — Conformance (routes by FIT, architectural)
Asks the question Council is too late to ask (Council is at push-time; drift is born at scope-time). For every change, current AND future code:
- **Mapped?** In FEATURE-MAP, or is it orphaned / map stale?
- **Labelled?** Named per the vocabulary registry (no new meaning for an overloaded word)?
- **Linked?** Wired to canonical readers/writers, or floating?
- **Canonical or parallel?** Does it REUSE the canonical calc (surplus, headroom, daily-living, isPaidInCycle) or INVENT a parallel one that will drift? A new calc must justify why it isn't using an existing canonical source.
- **Invariant coverage?** Which INV-NN preserved; does it need a new one?
- **Fits current + planned architecture?** Does it collide with a queued bundle?

**Bidirectional:** routes misfits BACK (to Gather for unmapped surfaces, to Analyse for re-scope, to John for sequencing-with-planned-bundles) or FORWARD with a fit-verdict Council can trust.

**Severity gate (load-bearing — without it Conformance becomes a roadblock on a mid-cleanup codebase):**
- NEW drift introduced by this change → **BLOCK**
- Distant pre-existing drift → **FLAG** (note, don't block)
- Adjacent existing drift the fix naturally touches, same-shape and cheap → **CORRECT in passing**

### Tier 4 — Build
Parallel build-agents with implementation manuals (fix-shape + file:line list + smoke pattern) for mechanical work; direct surgical commits for trivial one-liners (agent dispatch is overhead for a one-line delete). **Regression Sentinel gates EVERY commit:** full smoke suite + conservation invariants + Guardian 4-layer + the reconciliation fixtures, run BEFORE commit. Any red → blocked. Conservation must hold against the walked ledger, not just asserted.

### Tier 5 — Council (push verdict)
Two verdicts per commit, both surfaced as a structured artifact (never vibes):

**Technical verdict:** Guardian 4-layer · Sentinel (smoke count) · Invariants (preserved/new/violated) · FEATURE-MAP impact · Ledger-walk basis (the evidence this fix came from walking txns, not trusting a flag) · Priority justification · Risk.

**Human verdict (intent-drift gate) — three axes:**
- **Impact** — does this change a number John SEES? by how much, which direction (more honest / more lenient / more harsh)? Magnitude alarm: FLAG at >$50 swing (informational, acknowledge-to-push); HALT at >$100 OR >10% of cash, whichever is LARGER.
- **Reversibility** — fix-forward or irreversible state mutation? recovery path? **trust-corruption surface** (a wrong number changes John's real spending decisions — trust damage counts even when state isn't corrupted).
- **Decision-gate** — does this bake in a policy/values judgment that's JOHN's call, not the engineer's? Triggers: (a) render reader producing a visible number, (b) classification change (paid/unpaid, fixed/discretionary, viaRent/immediate), (c) canonical writer contract semantics, (d) interpreting ambiguous state (early vs late, intended vs accidental), (e) any threshold/default/rule that fires automatically without John in the loop. Pure structural fixes (delete-double-debit, swap-reader, rename) auto-PASS the gate.

**Composite:** any HALT → composite HALT (needs John's policy answer); any FLAG → composite FLAG (push allowed but needs John's explicit acknowledgment, logged); all PASS → composite SHIP (push freely). FLAG-WITH-CITATION when the change propagates an already-established, on-record policy — cite the specific prior decision.

**John approves every push. No autonomous push, ever, on money-logic.** Ack protocol: PASS/FLAG-WITH-CITATION on established policy may be BUNDLED; any HALT is INDIVIDUAL; anything that was ever wrong before (or touches a keystone canonical reader) gets INDIVIDUAL scrutiny regardless of verdict.

---

## Standing rules (always in force)

- **Ground truth hierarchy:** running app > txn ledger > derived state > flags. Never invert it.
- **Conservation + full smoke + Guardian 4-layer + §8 green at EVERY commit.** Non-negotiable.
- **Investigation parallelizes; verification centralizes (auditor); synthesis stays with main-CC; decisions stay with John.**
- **Fix-forward cosmetics; surface substrate-shaped; John triages bundle scope.**
- **Document DURING, not after** — ADR/CHANGELOG/FEATURE-MAP/session-memory updated in the same commit as the work. A session-memory file (`docs/sessions/{date}.md`) is maintained live throughout.
- **Scoping and building are different sessions for high-blast-radius substrate.** A finished-looking plan is not a build trigger. Lock scope, stop, build fresh.
- **Loop the design/strategy instance (Opus, in John's chat) for design-led and process-design calls** — hero/UX framing, values calls, sequencing judgment, "is this scope creep," "will this number hurt John." Engineering-CC builds; design-Opus shapes and catches intent; John directs and decides.
- **Attribution:** `Co-Authored-By: Claude Opus 4.7 (via Claude Code)` for engineering; dual-credit design-Opus only when it contributed substantive architecture; `Direction-By: John Dounas` always — the decisive calls and catches are his.
- **CC provides commands for anything needing John's CF auth / git history — never autonomous on those.**
- **Character integrity:** the pipeline's rigor must not drift across long sessions. If the work would make another instance of Claude or a senior Anthropic engineer think the discipline had eroded, stop and re-anchor. Tired-marathon shortcuts are exactly when the pipeline matters most.

---

## Why each tier exists (the WHY — so future-CC never optimizes it away)

Capture this reasoning, not just the shape. A future session that doesn't know WHY will "streamline" a tier back out and reintroduce the failure it was built to stop.

- **Ledger Walk (Step 0)** exists because a bug was once diagnosed BACKWARDS — a fix was scoped that would have flipped legitimately early-paid bills to unpaid, showing John −$1,116 when he was −$88, a $1,028 false-catastrophic. The analysis trusted a flag instead of walking the txns. The walk makes flag-vs-ledger disagreement impossible to miss.
- **Conformance (before Build)** exists because drift is born at SCOPE time, not push time. Catching a parallel-calculation at Council means a wasted build cycle; catching it at Conformance means the manual is redesigned to use the canonical reader before code is written. It must NOT be moved to push-time.
- **Human Verdict (intent-drift gate)** exists because the worst failure mode isn't incorrect code — it's CORRECT code implementing the wrong policy, which passes every technical gate. A bonus-lever once passed technical Council and the early Human Verdict while being a double-count that would have shown a falsely-positive number. In a behavioral-finance app, a wrong number changes what John DOES — trust-corruption is real damage even when state is intact.
- **The PAUSE** (refusing to build when scope is wrong) is itself a tier-level move. A well-engineered solution to the wrong problem is harder to recover from than a bug. The single highest-leverage act of a session can be NOT building — locking scope and stopping when the question isn't settled.
- **Push/delivery verification** exists because push silently dropped data for hours once (139KB blob vs 64KB keepalive cap + Android Chrome backgrounding the PWA mid-debounce on John's S23 Ultra) — every architectural plan assumed "push works" while it didn't. Any bundle that depends on state persisting must verify persistence actually happens on John's real device (Android Chrome PWA on Samsung Galaxy S23 Ultra), not just green smoke.

---

## Session close — ALWAYS

- Update `docs/sessions/{date}.md`: what shipped, what's open, values calls made + why, the verified honest number.
- Update the roadmap doc with any re-sequencing, and SECURITY.md decision-log for any security-relevant call.
- Surface to John: the commit ledger, what's contractually locked, what opens next session.
- If a new failure was caught this session, convert it into permanent process (ADR + memory pin + this doc) — the way every tier above was born. The catch becoming infrastructure is the compounding mechanism.

---

This pipeline is the product as much as the app is. The app gets more trustworthy because the process that builds it defends itself. Run it every time.
