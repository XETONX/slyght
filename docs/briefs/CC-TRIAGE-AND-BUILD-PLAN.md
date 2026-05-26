# CC Triage + Build Plan — Theme G now, A+B+F campaign next

Phase 1 sweep was excellent. 7 parallel workers + auditor, 0 disputes, 8 themes by disease. This is the triage and the build plan. Parallel-agent architecture applies throughout — same pattern that just worked, extended where it helps.

---

## Triage decisions (locked)

1. **Theme G (secrets) — FIRST, today.** Timer running, small bundle.
2. **Themes A + B + F — ONE thesis: "Single Source of Financial Truth."** Not three bundles. The priority campaign after G. May ship in 2-3 sub-bundles but the thesis is unified.
3. **Themes E (UX dead-ends) + D (vocabulary) — DEFER to UI redesign (Bundle 33).** Design-led; the alive design system already addresses most of D's naming conflicts and E's dead-ends. Don't fix twice.
4. **Theme C (brittle specs) + H (wrangler doc) — housekeeping, lowest priority.** C after the 3 NEEDS-RECHECK resolve.

**Revised order:** G (today) → resolve 2 NEEDS-RECHECK → scope + build A+B+F campaign → Bundle 23 cloud sync (Phase 2) → UI redesign (absorbs E+D) → AI layer.

---

## STEP 1 — Theme G (secrets) — build + surface commands now

Small bundle, mostly John's wrangler commands + a worker proxy. Scope it, surface the exact command list, John executes the auth-required parts.

**F8 — RECON_TOKEN: DELETE (not rotate).** Redundant with device-token `/pull-full-state`. Deletion beats rotation.
- Delete `/recon-payload` + `RECON_TOKEN` const from worker
- Delete `URL_RECON` from index.html
- `wrangler deploy`

**F7 — OpenWeatherMap key: rotate + worker proxy.** OWM doesn't support strict origin restriction, so proxy through the worker.
- John rotates at openweathermap.org → revoke `7fb97ad9...`
- `wrangler secret put OWM_API_KEY`
- New `/weather` endpoint in worker, 10-min KV cache
- Replace `WEATHER.apiKey` in index.html with proxy URL

**Git history scrub** — after both rotations land, single force-push event. BFG or git-filter-repo. John's call, John executes — CC flags, does not autonomously rewrite history.

**Output:** surface John the exact command list + worker proxy code shape. John runs the CF-auth parts. CC ships the code changes (worker proxy endpoint, index.html proxy URL swap, recon deletion) following the recipe — smoke spec for the weather proxy, green before commit.

**Parallel note:** G is small enough it doesn't need parallel agents. One clean pass. But while John executes the rotation commands (his hands, takes a few min), CC should NOT idle — kick off the 2 NEEDS-RECHECK investigations in parallel (Step 2) so the wait is productive.

---

## STEP 2 — Resolve 2 NEEDS-RECHECK (parallel, during G execution)

These gate accurate A+B+F scoping. Run both as parallel investigation agents while John does the G rotations.

**Agent R1 — 3 failing specs.** essentials-lifecycle-split Case 3, plan-reset-cycle Case 2, reset-cycle-ui Case 6. Failed fresh-fixture smoke, contain NO $900 literals. Suspects: EOD modal interception · audit log 500-cap · MODEL.paydayDate drift past paydayReceived=true. Determine root cause. May reveal a separate theme — if so, name it and slot it.

**Agent R2 — 6 raw-S.bal sites inside BRAIN writers.** L24524 etc. Theme F flagged them but only L21681 was deep-verified. Re-read each, confirm whether each is a genuine canonical-writer bypass or a legitimate internal write. This locks Theme F's true scope before the campaign scopes around it.

Both report to an **auditor pass** (same pattern — verify file:line, verify the root-cause claim holds) before findings feed into campaign scoping. Surface both results.

---

## STEP 3 — Scope the "Single Source of Financial Truth" campaign (A+B+F)

The thesis: **every money-number in slyght has exactly one source of truth, computed from what actually happened to the bank — not what the model intended.**

Why A+B+F are one campaign, not three:
- **A (idealized cashflow)** — slyght tracks money by intent, not by what left the bank. Why "what's safe to spend" is broken.
- **B (calc duplication)** — surplus computed 4 ways, daily-living 3, max-per-day 3, discretionary 4, days-to-payday 3, bills-total 2, bucket-saved 3. The same numbers can disagree with themselves.
- **F (canonical-writer bypasses)** — values written outside BRAIN canonical paths (raw S.bal writes, AI chat bypassing markPaid). No audit, no invariant enforcement.

They're conjoined: you can't fix A (make cashflow true) without collapsing B (the duplicate formulas that let the number drift) AND closing F (the bypasses that write untracked values). Fix A alone = fix the number in 1 of 4 places, leave 3 to drift again. The theme-thinking exists precisely to prevent that.

### Scope it with parallel agents

The campaign is large. Map it with parallel investigation agents BEFORE proposing sub-bundle structure. Spawn in parallel:

- **Agent S1 — cashflow truth (A).** Map every surface that shows a money-in/money-out number. For each: does it read intent or bank-reality? The billDate problem (F2), the planning-vs-cashflow divergence (F3), the two paid-detection paths (F5), getBillsDue feeding 12+ surfaces (H1), reconcile-closes-dollars-not-model (H2), PREDICTOR-ignores-paid (H3), HABIT-includes-viaRent (M1). Produce the dependency graph: which surfaces, which readers, what each currently trusts.

- **Agent S2 — calc canonicalization (B).** For each duplicated calculation (D1 surplus ×4, D2 daily-living ×3 = Bug2, D3 max-per-day ×3, D4 bills-total ×2, D5 days-to-payday ×3, D6 discretionary ×4, D7 bucket-saved ×3): locate all instances, determine the canonical home (which BRAIN bubble should own it), map all current callers. Produce the collapse plan: one canonical computation per number, every caller migrated.

- **Agent S3 — canonical writer closure (F).** Every raw-S.bal write + every bypass of a canonical writer (markPaid, etc). Confirmed via R2. Map each to its proper canonical writer. Produce the migration list.

- **Agent S4 — billDate backfill (the data problem inside A).** 18 bills have no billDate. This is a DATA problem not just code — how do due dates get onto existing bills? Investigate: is there cycle metadata to infer from? Recurrence patterns? Or does John manually enter them once? Surface the options — this is a values call.

**Auditor agent** verifies all four agents' maps before synthesis — file:line real, dependency claims hold, canonical-home assignments sound, no false-sibling groupings.

**Main CC** synthesizes into a proposed sub-bundle structure. Likely shape (CC refines):
- Sub-bundle 1: billDate substrate + bill-paid reconciliation (the foundation — A's data layer + F5)
- Sub-bundle 2: calc canonicalization (B — collapse the duplicates, Bug2/32.9 folds in as D2)
- Sub-bundle 3: cashflow-truth surfaces (A's display layer — dashboard shows reality not fiction, F3)
- Sub-bundle 4: canonical writer closure (F — close the bypasses)
- (order/grouping CC's call based on dependency graph)

### Values calls to surface before building

1. **billDate backfill** — how do 18 existing dateless bills get due dates? Manual one-time entry / infer from metadata / recurrence detection? (Agent S4's question.)
2. **Dashboard hero number** — projectedEndBalance (cashflow truth) or remainder (planning)? Both clearly labelled? This is THE F3 design decision — "stop lying to John." It's design-led, so loop the design assistant (Opus) before locking.
3. **QuickLog→markPaid matching** — when John logs a payment, how does it match a bill? Amount+name fuzzy / explicit picker? (F5's fix shape.)
4. **Canonical home per duplicated calc** — which BRAIN bubble owns surplus, daily-living, etc. (Agent S2's output, but some may be genuine values calls.)

Surface the campaign scope + sub-bundle structure + these values calls for John sign-off BEFORE building. Don't start building the campaign until John approves the structure.

---

## Parallel-agent architecture (standing, applies to all steps)

Same pattern that just delivered Phase 1 clean:

- **Main CC** = orchestrator + synthesizer. Spawns workers, holds the picture, theme-synthesizes, makes values calls, talks to John. Doesn't raw-scan.
- **Worker agents** = parallel, one per independent region/question. Spawn in batches, never serialize independent work.
- **Auditor agent** = separate from workers, verifies every finding before it reaches synthesis (file:line real, analysis sound, severity calibrated, siblings genuine, structural-fix-addresses-root). Returns VERIFIED / DISPUTED / NEEDS-RECHECK. Disputes surface in the report, not silently dropped.
- **Principle:** investigation parallelizes, verification centralizes, synthesis stays with the orchestrator.

**New agent type for the build phase — Regression Sentinel.** During the A+B+F build (not just investigation), when collapsing duplicate calcs and closing writer bypasses, a dedicated agent holds the 148 smoke specs + 12 scenario-walk + conservation invariants and runs them against every proposed change BEFORE commit. Because the campaign touches money-math across many surfaces, the blast radius per change is high — the Regression Sentinel is the continuous conservation check. Catches "fixed surplus in the canonical home, broke the 3rd caller that depended on the old wrong value" before it ships. Main CC proposes change → Sentinel verifies invariants hold → then commit.

Don't over-parallelize trivial work. G doesn't need it. The NEEDS-RECHECK and the campaign scoping do.

---

## What stays true throughout

- Conservation + 148 smoke + §8 green at every commit.
- Recipe on every fix: investigation first, reuse patterns, structural design, smoke-as-bug-hunter, document during.
- SECURITY.md + FINANCIAL-INVARIANTS.md boundaries hold.
- Fix-forward cosmetics, surface substrate-shaped, John triages bundle scope.
- CLAUDE.md §11 autonomy contract governs.
- CC provides commands for anything needing John's CF auth / provider access / git history — never autonomous on those.

---

## Sequence summary

1. **Theme G** — scope, surface John the rotation command list, ship the code changes. (Today.)
2. **In parallel during G execution** — Agents R1 + R2 resolve the 2 NEEDS-RECHECK → auditor → surface.
3. **Scope A+B+F campaign** — Agents S1-S4 in parallel → auditor → Main CC synthesizes sub-bundle structure + 4 values calls → surface for John sign-off. (Loop Opus on the dashboard-hero design decision.)
4. **Build A+B+F** — sub-bundle by sub-bundle, Regression Sentinel guarding conservation on every change.
5. **Bundle 23** cloud-sync scoping (Phase 2, was waiting).
6. **UI redesign** (Bundle 33) — absorbs Themes E + D.
7. **AI layer.**

Start with G. Surface me the rotation commands. Kick R1+R2 in parallel while I run them. Then scope the campaign and surface for sign-off before building.

The day started with "PLAN mode can't tell me what's safe to spend." The sweep found why — eight diseases, the core one being slyght tracks intent not reality. This plan fixes the core. After the A+B+F campaign, slyght can finally answer the question it exists to answer.
