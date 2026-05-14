  # PLAN-MODE TOTAL AUDIT — Bundle 28 first-patch · Winnie-the-Pooh honey-jar protocol

  You are Claude (Opus 4.7 1M-context) executing this prompt yourself with full context from this conversation already loaded. Don't re-discover what you've already read. The contract is
  `slyght/CC-PRINCIPAL-ENGINEER-MANUAL.md` — outranks this prompt where they conflict. Surface conflicts to John before acting.

  ## What success looks like tonight

  John opens the app this evening for his Darwin-cycle planning session. He logs that payday landed, adds the bonus, allocates the cycle, walks the trip math, adjusts daily-living, sees a coherent picture of
  "I can / can't afford this and here's why." The audit + P0 fixes from this session make tonight's planning session WORK. If the audit ships beautifully but tonight's session is still confusing, the prompt
  failed.

  ## Three phases, hard gates between

  Pre-flight → STEP 1 (plan-of-attack + confirm gate) → STEP 2 (audit only + confirm gate) → STEP 3 (P0 fixes only). No `--auto` this session. Wait for "go" at every gate.

  ---

  ## CONTEXT YOU ALREADY HAVE (don't re-read unless changed)

  - Bundle 28 is at round 71, not "scoped." CHANGELOG.md is source of truth for what shipped overnight.
  - Rounds 46–71 landed substantial PLAN-mode work: "showing Mum" badges + summary (r46), Annual Provisions as 4th Essentials category (r47), bill Paid/Deferred toggle (r49), Monthly bills full-cycle view +
  denser rows (r50–r51), viaRent debt bar fix (r64), Property Deposit closed-loop (r69–r70), header + weather-chip polish (r71). **Intentional. Don't undo without explicit approval.**
  - App-state truth (audit anchors on this): bal $11.72 · payday 15 · `paydayReceived: false` · `activePlan.bonus: undefined` · 4 active debts · 3 buckets · 2 trips · 2 goals.
  - John has been paid in bank but HAS NOT logged it in the app — deliberate, for tonight's session. Early-payday + bonus-stickiness fixes are ENABLERS of tonight, not catch-up.
  - 3 modified working-tree files (GUARDIAN.md / audit/allow-list.json / runtime-report.json) are guardian-run artifacts. Noise.
  - 3 untracked files known: LAYER-V-DEEP-ANALYSIS-2026-05-13.md · slyght-state-2026-05-13 (1).json · state-snapshot.json.pre-r58.bak.
  - `state-snapshot.json` matches the live dump byte-for-byte. Layer V renders against app-current truth.

  ---

  ## PRE-FLIGHT GATES (one line per gate, PASS/FAIL · observation)

  1. **Working-tree shape** — only the 3 known guardian artifacts modified AND only the 3 known untracked files. Any other diff/untracked → STOP, surface.
  2. **Correct branch** — main, up-to-date with origin.
  3. **App-state freshness** — `state-snapshot.json` reflects current app-state (bal $11.72, paydayReceived false, no bonus). Bank-vs-app divergence is deliberate; not a freshness problem.
  4. **Tooling** — `npm run guardian-static`, `npm run runtime`, `npm test`, `node scripts/layerV-capture.js --help` all run cleanly. Output last runtime-report.json timestamp.
  5. **FEATURE-MAP read** — per manual §3 Step 1 (already done from this conversation).
  6. **Memory reconciled** — older slyght-* memories predate r46–r71; CHANGELOG outranks memory.

  ---

  ## FAILURE-MODE FENCE (your known pathologies — don't do these)

  - **Don't presume yesterday's P0s are still P0s.** Many shipped in r46–r71. Check CHANGELOG before flagging "missing."
  - **Don't undo r46–r71 work.** Annual Provisions on Essentials, Mum-readable summary, FIXED/YOURS badges, viaRent bar fix — intentional. Don't re-fix what shipped.
  - **No commentary code.** Comments only for non-obvious WHY.
  - **No defensive over-engineering.** Trust internal contracts.
  - **No premature abstraction.** Three similar lines before extraction.
  - **No doc proliferation.** ONE audit doc + SDDs for non-trivial P0s + ADR sketches if Tier 3 deliberation produces an architecture proposal. Nothing else.
  - **No persona-voice prose.** John's voice is resolution, not tone.
  - **No vision-alone fixes.** Cross-check screenshot observations against render source or DOM.
  - **No bypassing canonical writers.** Every state mutation through `BRAIN.<domain>.<verb>` + typed `BRAIN.SOURCES` tag.
  - **No backwards-compat shims.** Delete dead code; no `_OBSOLETE_*` placeholders.
  - **Memory writes capped at 3** with proper frontmatter shape.
  - **Don't trust stale memory over CHANGELOG.**

  ---

  ## PERSONA DIRECTIVE — resolution, not voice

  Audit at John's RESOLUTION. He notices: generic placeholders · same fact rendered two ways on one screen · visuals without explanation · numbers that don't propagate · state that wipes on navigation ·
  sections that don't belong · affordance asymmetry · off-by-N values that read wrong.

  Match that resolution. Engineering prose in writing. ≤1 John-voice verdict line per surface.

  ---

  ## DELIBERATION PROTOCOL — when adjacent work / scope / architecture pulls at you

  Last night's session worked because CC didn't just narrowly execute — it ran internal multi-lens deliberation against a team of personas before continuing OR surfacing, then fed the synthesis back into the
  next decision. This protocol formalises that. It REPLACES the rigid "never reframe / never adjacent / never propose architecture" rules. Those rules were over-tight — they would have blocked last night's
  best calls.

  ### The five personas

  When you encounter something that pulls at you (an adjacent surface looks broken · current scope feels wrong · a BRAIN bubble overlap looks like it wants consolidation · a new bubble looks like it should
  exist · a writer feels wrong-named · a math invariant feels weak), run the room:

  1. **Principal engineer** — is this architecturally sound? Does it canonicalise or create a parallel path? Will future-CC understand it cold? Blast radius?
  2. **Design lead** — does this fit the UX contract (manual §6)? Mental model? Mum-readable test? 380px viewport? Affordance symmetry?
  3. **Continuous-improvement leader** — is this a real improvement or noise? Does it compound (closes a bug class, lifts a constraint, removes a future failure mode) or just add surface? Is it the leverage
  point or a symptom-patch?
  4. **Financial-logic guardian** — does this risk math drift, invariant violation, audit-log gap, untraceable change, round-trip instability? Are there other surfaces computing the same number that would
  diverge?
  5. **John as user** — does this help his tonight session AND his next 6 months? Or is it engineer-noise / portfolio polish? Would removing it be felt?

  Synthesis after running the room: convergence (all five agree) → do · split (3+ vs 1-2) → surface to John with the dissent named · 1-2 against majority → strongest objection must be answered before
  proceeding.

  ### Three tiers — depth scales by stakes

  **Tier 1 — Adjacent work observation (during audit / fix work)**
  Trigger: walking a surface, you notice a sibling surface or unrelated bug. Surface looks shipworthy AND inside PLAN-mode AND blast radius ≤ 1 file.
  Protocol:
  - Run the room (1 line per persona).
  - If 4+ converge → inline in the audit doc's surface section under `### Adjacent observations`. Continue current surface. Re-evaluate at end of audit (might lift to P1/P2 in summary).
  - If split → surface inline as a 🟡 with the dissent named, don't start.
  - If 4+ against → don't do, note it as anti-pattern observation.
  - If the adjacent work is OUTSIDE PLAN-mode → always surface as Noticed with ACTION + WHEN, never start.

  **Tier 2 — Scope reframe (current work feels wrong)**
  Trigger: current scope feels off-target — wrong surface, wrong fix shape, wrong sequencing, or work-as-defined would ship a known-broken thing.
  Protocol:
  - Run the room (paragraph each persona).
  - Write a 3-paragraph synthesis: what's the current scope · what's the proposed reframe · which personas favour each + why.
  - **Surface to John BEFORE acting.** Wait for explicit "reframe" or "stay the course."
  - If `--no-pause` later granted: proceed on majority view, log the deliberation inline in the audit doc / commit body.
  - Logged whether actioned or not — future sessions inherit the reasoning trail.

  **Tier 3 — BRAIN architecture proposal (new bubble · merge bubbles · rename canonical · restructure writer family)**
  Trigger: you've observed structural overlap, missing canonical surface, or a pattern that wants to be a bubble. BRAIN is the load-bearing convention of the codebase; changes need DEEP THOUGHT not rapid
  sweep.
  Protocol:
  - Run the room twice — first pass FOR the proposal, second pass AGAINST.
  - Add two more personas: **future-CC** (will this confuse the next reader cold?) and **future-John in 6 months** (will this still serve him after the codebase grows another 5k lines?).
  - Write an SDD (`docs/sdd/SDD-2026-05-14-<name>.md`) and an ADR sketch (`docs/adr/ADR-NNN-<name>.md` Status: proposed).
  - **Surface to John. Wait for explicit "build it" or "queue it."** No code touches the bubble surface before approval.
  - If queued: ADR moves to `docs/archive/` with `<name>-proposed-queued-bundle-NN.md` naming. Future bundle picks it up.

  ### Anti-patterns (drift watch)

  - **Rationalising a pet idea through the room.** If 4 of 5 personas reject and you "interpret" the one in favour as the deepest signal, you've biased the room. Run an honest second pass naming the bias.
  - **Skipping the room for "small obvious" changes.** Small obvious changes that touch BRAIN, canonical writers, or anything in §6 UX-contract / §7 financial-contract aren't small. Run the room.
  - **Logging deliberation but ignoring its synthesis.** The room's synthesis binds. If you log "design lead rejected this on contrast grounds" and ship it anyway, you're using the protocol as cover, not
  guidance.
  - **Running the room then forgetting to surface to John at Tier 2/3.** The deliberation is for both you AND John. Hiding it defeats the point.

  ### What the protocol DOES NOT permit

  - Tier 3 deliberation does NOT skip the SDD/ADR step or the "wait for John" gate. Architecture proposals at minimum land as queued docs, never as silent commits.
  - The protocol does NOT permit reframing the prompt itself mid-session. If the AUDIT SCOPE feels wrong, that's Tier 2 — surface and wait, don't quietly redefine.
  - The protocol does NOT permit destructive ops without explicit John approval regardless of room consensus.

  ---

  ## STEP 1 — PLAN OF ATTACK (confirm gate)

  Output ≤700 words:

  1. **r46–r71 reconciliation of John's morning ask.** For each of his items — bonus sticky-state · early payday recognition · generic goals (Freedom Buffer / Property Deposit) · duplicate buckets (China 3×) ·
   Annual Provisions removal · "Add new savings target" upgrade · duplicate FIXED bubble · red/blue legend · Shopping List section · long-term scanner — state: **SHIPPED IN ROUND-X** (cite commit) ·
  **PARTIALLY SHIPPED — gap is …** · **STILL OPEN** · **NO LONGER APPLIES BECAUSE …** Anchor every line to CHANGELOG or current code. Load-bearing — get it right.
  2. **PLAN-mode surface inventory** as of post-r71. Floor ≥10. Seed from FEATURE-MAP.md, verify against current `index.html`. Flag any drifted FEATURE-MAP row.
  3. **Plan of attack** — audit order · audit-doc commit cadence · expected P0 list after audit · what you won't touch · which morning items survive as P0 candidates after reconciliation.
  4. **One end-of-step-1 question** — single highest-leverage clarification before STEP 2.

  STOP. Await "go."

  ---

  ## STEP 2 — AUDIT (scrape every drop)

  Single deliverable: `slyght/AUDIT-PLAN-MODE-2026-05-14.md`. Write incrementally, commit every 2–3 surface sections.

  ### 2.0 — Live state capture
  - Run `node scripts/layerV-capture.js --local`. Verify PLAN-mode + canvas + sub-screens + modals navigation works. Any blank capture = STEP 2 finding, surface inline.
  - Read each PNG with multimodal vision. Cross-check every visual observation against render source OR DOM snapshot.
  - Reference dump timestamp at audit doc top. App-state IS the truth.

  ### 2.1 — Walk every surface
  For EACH PLAN-mode surface, append:

  ```
  ## SURFACE: <name>
  **Capture:** `<png path>` · **State anchor:** `<dump ts>`

  ### Round-46-to-71 reconciliation (FIRST)
  Has this surface been touched in r46–r71? Round + commit + what changed + whether John's morning complaint about it still applies (or shipped, or partial + remaining gap).

  ### What's on screen (engineering description)
  Numbered list of every visible element. Concrete.

  ### Specific-vs-generic
  Every label/placeholder/name/value — John's real data or generic? Cite index.html line numbers.

  ### Interactive element trace
  Per tap/input/toggle: WRITE path · CONSUMER set · PROPAGATION · CONFLICT.

  ### 8-grep audit (for any value this surface mutates)
  1. Direct `S.X =` sites · 2. Direct `S.X` reads outside canonical · 3. BRAIN readers · 4. Render consumers · 5. BRAIN.audit.append references · 6. AI context blocks · 7. Test fixtures · 8. seedV* migrations.
  1-grep = failure. Eight or it didn't happen.

  ### Number divergence
  Per number: formula + line · other renderers · agreement · fix shape if divergent.

  ### Static text audit
  Per non-data string: earns its space? · stale phase-language? · matches John's mental model?

  ### Empty state
  Zero-data render path verified.

  ### Transition check
  Enter from where? · exit to where? · state on re-enter (persisted or wiped)?

  ### Density check
  Tap targets ≥44px · text ≥12px · no grey-on-grey small text · fits 380px · passes 4-question density check.

  ### Tonight-session check
  Will this surface help or hurt tonight's planning (log payday → bonus → allocate → Darwin → living)? Specific.

  ### Adjacent observations (Tier 1 deliberation results)
  Anything noticed during this surface walk that's outside this surface but inside PLAN-mode. One line per finding with the room's verdict. Outside-PLAN-mode adjacent observations → Noticed list at the doc
  bottom, not here.

  ### Verdict
  🟢 ship-quality · 🟡 fixable this session · 🔴 needs John's call
  ```

  ### 2.2 — Cross-cutting passes (once)

  **A. Duplicate canonicalisation map.** Every named entity → table of entity · surface · role · current data shape. Verify Phase 0 (seedV25) collapse worked. Flag entities still appearing 2+ times outside
  intent layer.

  **B. Formula coherence table.** Per Audit A1 root cause #2 — every top-level PLAN-mode number → metric · renderers · formulas · agree? Verify r28.0.5's 5-renderer migration held. Flag post-r28.0.5
  divergence.

  **C. Audit-tag coverage.** Grep every `BRAIN.audit.append` in PLAN-mode write paths. Untagged write = Layer 1 violation. List.

  **D. Stale string sweep.** `alert(` · `"Phase ` · `"coming` · `"TODO` · `"WIP` · `"stub` · hardcoded names that should be dynamic. File:line list.

  **E. BRAIN overlap observation — deliberation-eligible.** For each BRAIN bubble PLAN mode touches, list methods called + note overlaps. If a Tier 3 deliberation produces an architecture proposal, append the
  SDD reference and the room's synthesis (FOR pass + AGAINST pass). DO NOT touch code — proposal goes to John via SDD + ADR sketch, queued unless explicitly approved this session.

  **F. Boot self-test coverage.** Every PLAN-mode entry point — boot self-test entry present? Gap list.

  **G. Legacy mirror audit.** S.tripDefs / S.goalDefs vs S.planIntents — drift check.

  ### 2.3 — Vision UI pass
  Per capture: contrast · crowding · visual debt · CTA hierarchy · empty-state design. Each finding: screenshot ref + source cross-check + verdict.

  ### 2.4 — Summary
  - **Counts.**
  - **Tonight-session readiness verdict.**
  - **Prioritised fix list:** P0 (must ship today) · P1 (next session) · P2 (this bundle) · queued (next bundle, ACTION + WHEN).
  - **🔴 list:** every needs-John-call item consolidated.
  - **Tier 3 architecture proposals (if any):** linked SDDs/ADRs, awaiting John's call.

  ---

  ## CHECKPOINT — STEP 2 → STEP 3 GATE

  After committing + pushing:
  - 3-paragraph summary: counts · top-3 P0s with one-line fix shape · tonight-session readiness verdict · any Tier 3 proposals awaiting your call.
  - STOP. Await "go for fix sprint."

  ---

  ## STEP 3 — P0 FIX SPRINT (audit-driven)

  ONLY audit P0s. Sticky-state and early-payday EXPECTED but not assumed.

  ### Expected P0 candidates (verify against audit)

  **P0.1 — Bonus sticky-state.** Live state has `activePlan.bonus: undefined`. Tonight John needs to add bonus + see it propagate. Repro the wipe. Investigate `BRAIN.plan.setBonus` persistence, getSnapshot
  envelope, canvas root re-read path, confirm-handler render trigger. One atomic edit per function. Boot self-test + guardian-runtime entries.

  **P0.2 — Early payday recognition.** Live state has `paydayReceived: false`; John wants the in-app affordance to walk through it tonight (not a catch-up sync). Verify no such affordance exists; add
  `BRAIN.plan.markPaydayLanded(ts, source)` + SOURCES tag `PAYDAY_MANUAL_LANDED` + UI affordance (audit determines pattern). `_resolveNextPayday` / `_resolvePreviousPayday` honour `actualPaydayTs` for current
  cycle. Boot self-test + guardian-runtime.

  **P0.N — audit-driven** in priority order.

  ### Per-fix discipline
  - SDD in `docs/sdd/` for any non-trivial fix BEFORE coding.
  - Read bytes BEFORE edit. ONE atomic `str_replace` per function.
  - After commit: `npm run guardian-static && npm run runtime && npm test` green or fix-forward.
  - Performance smoke: time canvas render if render work added; surface >100ms.
  - Push immediately. Don't batch.
  - After fixture / state-snapshot touches: `npm run runtime`.

  ---

  ## SHIP DISCIPLINE

  - Commit per fix with descriptive body (manual §3 Step 7).
  - New BRAIN method → boot self-test entry.
  - New structural invariant → guardian-runtime check.
  - Update BUNDLE-28-NOTES.md, FEATURE-MAP.md, CHANGELOG.md as you go.
  - ARCHITECTURE.md §11 only if architectural surface changes (Tier 3 territory).
  - No allow-blocks without justified reason + removal condition.

  ---

  ## HARD RULES (do not violate)

  - NEVER re-add NRMA to BILLS.
  - NEVER sweep `paidBills`.
  - NEVER ship a value-shape change without an 8-grep audit.
  - **Scope reframe gated by Tier 2 deliberation + John approval.** (Replaces "never reframe.")
  - **Adjacent work gated by Tier 1 deliberation. In-PLAN-mode adjacent → inline + audit-doc logged. Out-of-PLAN-mode adjacent → Noticed only, never started.** (Replaces "never start adjacent.")
  - **BRAIN architecture proposals gated by Tier 3 deliberation + SDD + ADR sketch + John approval before any code.** (Replaces "never propose architecture.")
  - NEVER ship a fix on vision-read alone.
  - NEVER mimic John's voice in commits or doc.
  - NEVER write a second MD doc this session besides the audit + SDDs + Tier 3 ADR sketches if any.
  - NEVER undo r46–r71 work without explicit approval.

  ---

  ## DONE PREDICATES (all must be TRUE)

  - [ ] Every PRE-FLIGHT GATE passed (or waived).
  - [ ] PLAN-mode surface inventory ≥10 verified against current index.html.
  - [ ] Audit doc covers EVERY surface.
  - [ ] Every surface entry has all 12 subsections incl. r46-r71 reconciliation FIRST and Tier 1 adjacent-observations log.
  - [ ] Cross-cutting passes A–G all completed.
  - [ ] Vision UI pass completed.
  - [ ] Audit doc summary has hard counts AND tonight-session readiness verdict.
  - [ ] All P0s shipped · pushed · green.
  - [ ] Boot self-test entries for every new BRAIN method.
  - [ ] SDD for every non-trivial P0.
  - [ ] Tier 3 proposals (if any) have SDD + ADR sketch landed and surfaced.
  - [ ] FEATURE-MAP + CHANGELOG + BUNDLE-28-NOTES updated.
  - [ ] No new MD docs besides audit + necessary SDDs + Tier 3 ADR sketches.
  - [ ] No r46–r71 work undone without approval.
  - [ ] Memory writes ≤3.
  - [ ] **John's tonight planning session can run end-to-end against shipped code.**

  ---

  ## END-OF-SESSION DELIVERABLE

  - All commits pushed.
  - `AUDIT-PLAN-MODE-2026-05-14.md` final state pushed.
  - Memory updates (≤3): `slyght_plan_mode_audit_2026_05_14` · `slyght_persona_audit_pattern` (the room methodology + tier protocol — explicitly reusable) · `slyght_bundle_28_round_72plus_landed`.
  - Noticed list per manual §3 Step 8 — severity-tagged, ACTION + WHEN.
  - Tier 3 proposal queue (if any): list of SDDs/ADRs awaiting your call.
  - ONE "next session pick-up" block.
  - ONE end-of-session question if any 🔴 needs your call.

  ---

  ## CONFIRMATION GATE — BEFORE PRE-FLIGHT

  When this prompt is pasted, do NOT auto-start. Output:

  1. **Three-line restatement** of the mission.
  2. **One-line pre-flight condition** (clean tree minus 3 known artifacts · app-state as truth · no auto flags · deliberation protocol active).
  3. **One question** — single highest-leverage clarification.

  Then STOP. Wait for "go." On "go," proceed to PRE-FLIGHT GATES.

  ---