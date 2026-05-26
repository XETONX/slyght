# CC Beast Mode — Phase 1 (Autonomous Sweep) + Phase 2 (Bundle 23 Scoping)

You shipped four clean bundles in four sessions (Pass 2 · 32a · Phase A · Pass 3) using the five-practice recipe. Substrate column 4 is closed. Now the mode shifts: from tightly-scoped execute-on-locked-spec to **autonomous audit with independent judgment**. Same recipe, wider surface. Beast mode means the recipe applied broadly — NOT the recipe abandoned. Scope discipline still holds; the difference is YOU are now generating the findings, not executing someone else's list.

This is two phases. Do Phase 1 fully and surface before Phase 2.

---

## STEP 0 — Fresh auth + snapshot + vision (before anything else)

The fixture loop is live now (Phase A + 32a). Start every sweep from real current state, not the May 19 fixture.

1. **Refresh auth + pull live state.** Pull John's current canonical state from KV (`device:366fcb8c…:state-full-snapshot` via the authenticated `/pull-full-state`). Run `npm run fixture:fresh` so the working fixture reflects his actual phone state — current balance, txns, plan intents, the lot. Confirm the pull succeeded and the fixture is current (check `state-full-meta` timestamp is recent).

2. **Hand the design assistant the numbers.** Once you have live state, surface a clean snapshot summary back to John: current balance, payday date + amount, committed outflows before payday (bills, Mum payment, anything fixed), Darwin total/covered/uncovered, and any other claims on the balance between now and payday. John's design-side assistant needs these to compute a manual safe-to-spend figure while the allocation calc is being fixed. This is time-sensitive — John is at ~$800 with limited runway and genuinely cannot tell from PLAN mode what's safe to spend. Surface this BEFORE the deep sweep.

3. **Vision-analyse the UI.** Before reading the code's flows, look at the actual rendered app. Capture/inspect the live screens (Dashboard, PLAN canvas, Bills, Trip detail, Trip edit, Transaction log, payday plan flow). Build your understanding of the user-facing flows from what's actually on screen — what the user sees, where numbers appear, where they conflict, where a flow dead-ends. This grounds the code audit in real user experience rather than just static analysis. Two known visible bugs to confirm and root-cause:
   - **Bug 1 (cosmetic):** Upcoming trips list renders `[object Object]`. Pass 3 changed `covered[]` to `[{name, amount}]` objects; a list renderer still treats entries as strings. Edit form works correctly. Find the renderer, map to `.name`.
   - **Bug 2 (HIGH PRIORITY, substrate-shaped):** PLAN mode allocation math is wrong. "Over committed by $167" with no resolution path. Dropping safety buffer by $100 did NOT recompute. Darwin's ~$800 trip coverage is NOT kicking in — PLAN allocation doesn't reflect that trip-window days are covered by trip budget. Pass 2 made `getSurvivalForecast` trip-aware; the PLAN allocation calc ("free to allocate" / "over committed") appears to be a SEPARATE code path that never got the trip-uplift treatment. This is the core question the app exists to answer — what's safe to spend — and it's broken.

---

## PHASE 1 — Autonomous sweep

Go through the codebase with independent judgment. You are hunting for problems nobody has told you about yet. For everything you touch or find, ask the beast-mode questions (below). Produce a ranked findings report. Surface to John before fixing anything substrate-shaped; fix cosmetic issues forward as you go (and log them).

### The beast-mode questions — apply to every finding

For each thing you find or every place you'd change code, reason through:

1. **Downstream impact** — what else reads this? What breaks if I change it? Map the blast radius before touching.
2. **Future implications** — what scenarios am I NOT covering that future code touching this will hit? What assumption am I baking in that'll bite later?
3. **BRAIN vs MODEL alignment** — is the code I'm touching aligned with the BRAIN bubble architecture (canonical writers, audit, source tags) or is it legacy MODEL-era code that bypasses canonical paths? Is my change moving it toward BRAIN or entrenching MODEL?
4. **Conservation** — does this preserve the render-truth/conservation invariants? Can I prove it, or am I hoping?
5. **Single source of truth** — is the same value computed in more than one place? If I fix it here, is there a sibling computation elsewhere that drifts?

### What to hunt for

- **Calculation duplication** — the same number computed two different ways in two places. Bug 2 (allocation vs forecast trip-awareness) is exactly this class. Find every instance where a value is derived in multiple code paths that could diverge. The forecast/allocation split is the known one — are there others?
- **Naming drift** — similar concepts with different names, OR different concepts with confusingly-similar names. Known suspects from design review: "Free To Allocate" vs "Still Uncommitted" vs "$367 to allocate" (same number, three labels?). "Daily Living $30/day" appearing as both an essential AND a daily cap card. Trip "active" vs trip "current spend bucket." Map every term that refers to money-state and flag synonyms + homonyms.
- **Flow dead-ends** — places a user reaches a state with no resolution path. "Over committed by $167" with no obvious "here's how to fix it" is one. Walk every flow to a terminal state and ask: can the user always move forward?
- **Stale recalc triggers** — state changes that should recompute a derived value but don't. The buffer-drop-didn't-update is one. Find every derived display value and verify its recompute fires on every input that should affect it.
- **Substrate-didn't-reach-surface gaps** — Pass 1-3 built canonical substrate, but is every USER-FACING calc actually reading from it? Or are there surfaces still computing off legacy paths / stale caches / MODEL-era logic? The allocation calc is the prime suspect. Audit which surfaces read canonical vs which still compute independently.
- **BRAIN/MODEL boundary violations** — places where MODEL-era code writes state without going through BRAIN canonical writers (no audit, no source tag, no invariant enforcement). These are correctness risks.

### Output of Phase 1

A findings report (`docs/audit/2026-05-21-beast-sweep.md`), ranked by severity:
- Each finding: what it is, where (file:line), severity, the beast-mode-question analysis (downstream impact / future implications / BRAIN-MODEL alignment / conservation / SSOT), and YOUR recommended fix approach.
- Separate the findings into: **cosmetic (fix-forward immediately, log it)**, **substrate-shaped (surface, don't touch until John triages)**, and **architectural (needs a bundle of its own — e.g. if allocation trip-awareness is a real follow-up bundle, scope it as one)**.
- Feature-map update: as you sweep, reconcile `FEATURE-MAP.md` against what the code actually does now. Flag stale entries, missing entries, drift between documented and actual behavior.
- Explicit call on Bug 2: is it a patch, or is it a "Pass 2.5 / make-PLAN-allocation-trip-aware" bundle? Scope it honestly. If the allocation calc needs the same trip-aware treatment the forecast got, that's a real bundle, not a five-minute fix.

### Fix-forward vs surface (the autonomy line)

- **Fix-forward immediately** (and log in the report): cosmetic bugs (Bug 1 object render), obvious dead code, clearly-safe naming alignment that touches only display strings, comment/doc drift. Low blast radius, no calc change, no state-shape change.
- **Surface, don't touch until John triages**: anything touching a calculation, state shape, a BRAIN writer, conservation, or any value the user makes decisions on. Bug 2 is surface-first. When in doubt, surface.

Apply the recipe to fixes you do make: investigation first, reuse patterns, structural design, smoke specs as bug-hunters, document during. A fix without a smoke spec that would have caught the bug is not done.

---

## PHASE 2 — Bundle 23 scoping (cloud sync)

Only after Phase 1 is surfaced and John has triaged. Don't start Phase 2 inside Phase 1.

Bundle 23 (cloud sync) is now genuinely unblocked: Phase A gives per-device namespacing, Pass 3 gives a canonical store, 32a gives push-on-save + pull. The pieces exist. Bundle 23 is making multi-device actually work.

Scope it — don't build it yet. Surface a plan:
- **Multi-device replay** — how does device B get device A's state? Pull-on-open? The canonical state shape replays cleanly now (Pass 3), but what's the trigger and the merge?
- **Conflict resolution** — last-write-wins is what the storage layer does today. Is that acceptable for multi-device, or do you need vector clocks / per-field merge / a conflict UI? What happens if John edits on phone and laptop while one is offline?
- **Sync protocol** — push-on-save exists (32a). Is pull-on-open enough, or do you need real-time? Cron-based reconciliation? What's the actual sync loop?
- **Offline-first** — the app is a PWA, works offline. How does offline state reconcile on reconnect?
- **The Phase B intersection** — Bundle 23 moves data between devices. SECURITY.md Phase B (encryption at rest under passphrase-derived key) is the natural pairing — multi-device sync of plaintext is a worse security posture than single-device. Does Bundle 23 need Phase B first, or can they ship independently? Flag the dependency.

Output: `docs/bundle-23-scope.md` — the plan, the values calls, the Phase B dependency call, the recommended build order. Surface before building.

---

## The arc

Phase 1 sweep → triage → fix the calc diffs (Bug 2 + whatever the sweep finds) → Bundle 23 cloud sync → clean slate → AI layer (Bundle 33) → UI redesign (alive design system, already specced). Each stage wants a clean foundation under it. The sweep is what makes the foundation clean — it's the difference between building the AI layer on substrate you trust vs substrate you hope.

Don't rush to Bundle 23. The sweep IS the value right now — it's what catches the class of bug (allocation/forecast drift) that tightly-scoped passes miss precisely because nobody pointed at it.

---

## Guardrails (beast mode is not unscoped mode)

- Surface the findings report before fixing anything substrate-shaped. You generate findings autonomously; John triages what gets touched.
- Don't leave half-finished threads. Every fix-forward is fully shipped (smoke spec + green + documented) or it's surfaced-not-touched. No "started touching this everywhere" sprawl.
- Conservation invariants and the 146 existing smoke specs stay green at every commit. A sweep that breaks substrate is worse than no sweep.
- If a finding turns out to be a real bundle (architectural), scope it and surface — don't try to fix a bundle-sized problem inside the sweep.
- SECURITY.md and FINANCIAL-INVARIANTS.md boundaries hold throughout.
- Autonomy contract CLAUDE.md §11 still governs.

---

## Start sequence

1. Fresh auth + pull live state + `fixture:fresh`.
2. Surface the snapshot summary to John (balance / payday / committed / Darwin) — time-sensitive, do this early.
3. Vision-analyse the live UI, confirm Bug 1 + Bug 2.
4. Run the autonomous sweep with the beast-mode questions.
5. Produce the ranked findings report + feature-map reconciliation.
6. Fix-forward cosmetics; surface substrate-shaped findings.
7. Surface Phase 1 complete → John triages → then Phase 2 Bundle 23 scoping.

Fifth application of the recipe, widest surface yet. Think actively. Question everything. Map the blast radius. Beast mode with guardrails.
