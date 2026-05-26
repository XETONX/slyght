# CC Reconnaissance — Fog-of-War Mapping via Tiered Intelligence Pipeline

A complete reconnaissance system: deep-explorer drones mapping the unmapped regions of slyght, filtered up through a four-tier verification pipeline with feedback loops, so Main CC receives only verified, cross-referenced, theme-aligned intelligence. Built for MAX-plan parallelism. This supersedes the flat drone→auditor→CC pattern and becomes the standing investigation engine for anything large.

Run AFTER Theme G + the two hotfixes (Bug-1.5, Bug-1.6) ship, in PARALLEL with the A+B+F campaign scoping (S1-S5) — regions don't overlap, and recon findings should widen the campaign scope BEFORE it locks rather than after.

---

## PART 1 — THE MISSION

### Recon, not hunt

The Phase 1 sweep was hypothesis-driven ("we think bills/allocation/cashflow are broken, confirm it"). This is reconnaissance — no hypothesis, just "map what these regions actually do and flag where reality diverges from what we assume." Everything found so far was near the fire, the surfaces John was already poking at. The dangerous bugs are in regions nobody's looked at in weeks — code that "works fine" because nobody stress-tested it against John's real messy state. R1 proved it: 3 specs assumed brittle were guarding real invariants the code violated; nobody suspected until fresh state hit them. That is what fog hides.

A drone builds **ground truth** about a region nobody understands anymore, then flags where ground truth diverges from assumption. The deliverable is not "found bug X" — it is:

> "Here is what this region actually does. Here is where it surprised me. Here is the assumption it makes that real usage could break, and whether that condition is reachable."

Every finding MUST be in that shape: **region assumes X → under condition Y, X breaks → Y is reachable / not / reachable-only-via-Z.** Anything that's just "this looks weird" is noise — drop it. Reachability is mandatory: a broken assumption behind an unreachable condition is logged low/none severity.

### Recon maps, it does NOT fix

Pure intelligence-gathering. Findings feed the same triage John is running. No drone wanders off changing code in a region John hasn't decided to touch. No commits from recon. Conservation + smoke + §8 untouched.

---

## PART 2 — SCOPE OF REVIEW (what gets mapped)

### Project files in scope

The drones map the actual codebase, not an abstraction. Core files that MUST be covered:
- `index.html` — the monolith. All BRAIN bubbles, snap.derived, MODEL, planIntents, all renderers, all UI. The primary territory.
- `slyght-worker/src/index.js` — worker endpoints, auth, KV, cron, the new /weather proxy + Phase A auth (just deployed — verify it).
- `slyght-worker/wrangler.toml` — config, secrets binding, KV namespace, cron triggers.
- `sw.js` + `manifest.json` — service worker, cache strategy, PWA install/offline boundary.
- `tests/smoke/*` + `tests/scenario-walk.js` + scripts — what's actually asserted vs what's assumed; the fixture handling.
- `FINANCIAL-INVARIANTS.md`, `SECURITY.md`, `FEATURE-MAP.md`, `CLAUDE.md`, `docs/*` — the documented contracts. Drones flag where docs diverge from code (doc drift is its own fog).

If a drone discovers a file or module not in this list that's part of its region, it maps it and notes it to the collector.

### Recently-deployed changes — VERIFY, don't assume

Code shipped today/recently must be verified as actually-working in deployed reality, not assumed-good because it committed green:
- **Theme G** — /weather proxy live? OWM key flowing through worker, not client? recon-payload + RECON_TOKEN actually deleted from deployed worker? `wrangler tail` shows clean weather requests?
- **Phase A** — auth enforcement live on all protected endpoints? Bootstrap migration intact? (Verified once, re-confirm nothing regressed.)
- **Bug 1 / Bug-1.5 / Bug-1.6** — the fixes deployed and behaving on live state, not just green in smoke?
- **32a fixture loop** — push-on-save + pull actually round-tripping?

A drone assigned to "recently-deployed verification" confirms each against live/deployed state. Deployed-and-verified is different from committed-and-green.

### Snapshots — bundle where needed

Where a drone's region depends on live state to reason correctly (cashflow, allocation, bills, anything numeric), it pulls/uses the fresh KV snapshot (`device:366fcb8c…:state-full-snapshot`) rather than the stale baseline fixture. Bundle the relevant snapshot slice into the finding so the collector + CC can see the actual data the finding was reasoned against. Findings reasoned against stale fixtures are flagged as such (this is exactly how the baseline-fixture lucky-zeros hid Bug-1.5/1.6).

### UI screenshots — capture state

Vision is part of recon. For UI regions:
- If a UI was FIXED recently (Bug 1 trip-list legibility) and no post-fix screenshot exists → capture one, verify the fix renders correctly in reality.
- If a UI region has NEVER been screenshot-mapped → capture current state as ground truth.
- Screenshots of edge states where reachable (empty states, $0 balance, error states, mid-trip) — capture what the user actually sees in the corners nobody looks at.
- Each UI finding pairs the screenshot with the code path that produces it, so "what the user sees" and "what the code does" are mapped together.

---

## PART 3 — THE FOG BANKS (drone regions)

Spawn parallel deep-explorer drones, one per region. Starting map (not the limit — drones and the collector can identify new banks):

- **Drone 1 — MODEL-era legacy.** Pre-BRAIN code still running, MODEL-path bypasses, assumptions predating canonical architecture. (Theme F found some; map the rest.)
- **Drone 2 — Rare-use features.** China trip (Dec, outside every cycle tested), annual provisions, seasonal/calendar-boundary logic, anything that's never executed against real state.
- **Drone 3 — Edge states.** $0 balance, negative balance, mid-trip cycle reset, payday landing while a bill is overdue, bonus toggled mid-cycle, overlapping trips, survival mode triggers. Which are reachable + unhandled.
- **Drone 4 — Integration seams.** notifications × weather × location × survival-mode × City2Surf-countdown. The context-aware notification logic — many conditions, rarely all exercised together.
- **Drone 5 — PWA / offline / sync.** Service worker, cache strategy, reconnect behavior, push subscription lifecycle, Phase A auth × offline state, the install flow.
- **Drone 6 — Dates / timezone / cycle-boundary.** Cycle rollover, payday detection, trip-window boundaries, _parseDateLocal (Pass 2), DST, the bills-with-no-billDate problem. Where bodies are buried; R1 already hinted at paydayDate drift.
- **Drone 7 — Recently-deployed verification.** Theme G + Phase A + the hotfixes + 32a loop, confirmed against deployed/live reality.
- **Drone 8 — Doc-vs-code drift.** FEATURE-MAP / FINANCIAL-INVARIANTS / SECURITY / CLAUDE.md vs what the code actually does. The FEATURE-MAP got only a quick survey in Phase 1 (~5 stale entries flagged) — full pass here.

Drones have ALL tools and skills available — code read, grep, vision/screenshot, snapshot pull, wrangler tail, test execution (read-only — they observe, don't commit). They are the deep explorers; give them depth.

---

## PART 4 — THE FOUR-TIER PIPELINE

### Tier 1 — Drones (deep explorers)
Many, parallel, one per region. The ONLY tier reading raw code/UI/state at depth. Each produces: discovery notes + SHORT summary + ranked issue list (severity × reachability), every finding in the assumption-shape, with bundled snapshot slices + screenshots where relevant. **Authority: reports ranked discovery, never concludes global significance.**

### Tier 2 — Auditors (one per drone or cluster)
Verify every claim against actual code/state (file:line real, behavior accurate, reachability genuine). Filter noise. Revamp + recalibrate the analysis. 
- **Backpressure DOWN:** if a drone's sweep is under-summarized, a claim won't verify, or a region feels under-explored → ping the drone to re-explore that SPECIFIC thread (surgical, not "redo the region"). Drone re-investigates, auditor reconfirms. Bounded to 2 round-trips, then escalate the uncertainty itself upward as a flagged item.
- **Request more drones UP:** if an auditor surfaces a PATTERN or an underlying thinking-scheme the current drone allocation doesn't cover ("this isn't just a date bug, there's a whole class of X across regions I'm only seeing the edge of") → it requests the collector/final agent spawn ADDITIONAL drones to map the newly-revealed territory. This is how the map grows when reality is bigger than the initial fog banks.
- **Authority: verify + filter + send-back-down + request-new-drones-up, never re-scope the mission or make values calls.**

### Tier 3 — Collector / Synthesizer (the final agent)
Above the auditors. Streaming (works on verified clusters as they arrive, doesn't wait for all drones). It:
- Collects verified summaries, **cross-references across regions** (a finding in region A explains/compounds one in region F — the connections no single drone sees).
- Verifies coherence — do regional pictures fit, or do two verified findings contradict (a tier erred)?
- **Backpressure DOWN:** when cross-ref reveals a gap, pushes targeted re-investigation down through the relevant auditor → drone.
- **Spawns new drones** on auditor request (or its own cross-ref insight) when a pattern/underlying scheme needs fresh territory mapped. Communicates back DOWN where a region needs re-framing against a newly-discovered theme.
- Folds everything into the THEME MAP — aligns each finding to existing themes (A/B/C/F/G/etc.) or names new ones. Ensures all code, themes, and findings are aligned and mapped to one coherent picture.
- **Authority: synthesize + cross-reference + request-recon + spawn-drones + re-frame-down, never makes values calls.** Passes only coherent, verified, cross-referenced, theme-aligned intelligence up to CC.

### Tier 4 — Main CC
Receives ONLY the collector's verified, cross-referenced, theme-aligned output. Makes values calls. Talks to John. Decides bundle scope. Does not process raw findings.

---

## PART 5 — FLOW DISCIPLINE

### Compression up, fidelity preserved for signal
Each upward handoff increases density, decreases volume:
- Drones → Auditors: discovery + ranked issues + snapshots/screenshots (detailed, regional)
- Auditors → Collector: verified-deltas only (what survived, recalibrated)
- Collector → CC: themes + cross-references + implied values calls (dense, global)

**Severity-gated fidelity (critical):** compression is lossy for noise, LOSSLESS for high-severity signal. High-severity findings travel up with full file:line evidence + snapshot + screenshot intact at every tier. Low-severity travel as one-liners. When unsure if something is signal, it travels at full fidelity and the tier above decides. The density gain comes from dropping noise, never from flattening signal.

### Backpressure rules (the feedback loops)
- **Bounded retries:** auditor↔drone capped at 2 round-trips per thread; then escalate the ambiguity up as a flagged item, don't ping-pong.
- **Targeted re-investigation:** send a SPECIFIC thread back down, never "redo the whole region."
- **Drone-spawn on pattern:** auditors/collector can request new drones UP when a pattern reveals unmapped territory — the map grows to fit reality.
- **Streaming synthesis:** collector works on cleared clusters as they arrive; one slow region doesn't block the rest.

### Authority boundaries (no tier oversteps)
- Drones REPORT (ranked discovery), never conclude.
- Auditors VERIFY + FILTER + send-down + request-drones-up, never re-scope or make values calls.
- Collector SYNTHESIZE + CROSS-REFERENCE + spawn-drones + re-frame-down, never makes values calls.
- Main CC DECIDES — values calls, bundle scope, John communication.

### Cost discipline (MAX-appropriate, not wasteful)
Tiers must EARN their existence: no auditor for a zero-finding region; no cross-ref pass until 2+ regions cleared; don't force a simple region through every tier ceremonially; bounded retries cap worst-case loop cost. MAX parallelism is spent on ACCURACY and reduced CC load — not tier theater. A genuinely simple region: drone + light audit is enough.

---

## PART 6 — OUTPUT

Add to the audit doc: `## Reconnaissance — Fog-of-War Map (Tiered Pipeline)`

- **Per region:** ground-truth summary (what it actually does), assumptions it makes, reachable broken-assumption findings (in the shape), severity (gated by reachability), bundled snapshot slice + screenshot where relevant.
- **Recently-deployed verification:** Theme G / Phase A / hotfixes / 32a confirmed against deployed reality (pass/fail per item).
- **Theme alignment:** every verified finding folded into the theme map — matched to A/B/C/F/G/etc. or named as a new theme. New drones spawned during the run noted with what pattern triggered them.
- **Confidence map:** per region — mapped + cross-verified / mapped-needs-deeper / confirmed-fine / still-dark. Plus pipeline provenance per high-severity finding (which drone, survived audit in N passes, cross-references to other regions).
- **Doc drift:** FEATURE-MAP / invariants / SECURITY / CLAUDE.md divergences from code.

This map is a DURABLE ASSET — future bundles check "am I touching a well-mapped region or a dark one?" and bring caution to the dark ones.

---

## THE PRINCIPLE

Many deep explorers with every tool at their fingertips. A verification gate at every handoff. Feedback loops that send work back down (bounded) and request fresh drones up (when reality is bigger than the map). Compression that drops noise and preserves signal. One collector connecting regions no single drone sees, aligning all code + themes + findings into one coherent picture. Main CC receiving only what's verified, cross-referenced, theme-aligned, and framed for decision.

Investigation parallelizes and goes deep. Verification happens at every tier. Synthesis connects across regions and grows the map to fit reality. Decisions stay with CC + John. Clear the fog — the next R1 is hiding in it.
