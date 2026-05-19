# CHANGELOG

> Per-bundle ship log. Format per `CC-PRINCIPAL-ENGINEER-MANUAL.md` §8.
> Newest entries at top. One section per bundle.
>
> For phase-level engineering notes during in-progress bundles, see `BUNDLE-NN-NOTES.md`.
> For superseded ship prompts and design docs, see `docs/archive/` (going forward) or `/archive/` (pre-Bundle-28 historical).
> For architecture decisions, see `docs/adr/`.
> For pre-implementation designs, see `docs/sdd/`.

---

## Bundle 31 — SHIPPED (2026-05-19 single session · 14 commits 818d63a..c53e0c8)

**Theme:** Phase 1A user gut-audit + Phase 1B vision-paired walkthrough → math/UX fixes + Guardian rule debt close-out + fixture refresh + methodology amendments.

**User-facing fixes (3 commits):**
- **Item 3** (`17481ff`) Analysis tab Essential vs Discretionary breakdown — cycle-bound the filter (was lifetime, producing $15k impossible totals against $4,578 cycle spend). OPEN-BUGS #6 part-A. Smoke at `tests/smoke/analysis-essentials.smoke.js` with synthetic pre-cycle txn injection for regression-lock.
- **Item 4** (`9d956c0`) Payday Plan "left to allocate" headline reframe — leads with "still to allocate" + subtitle "X already assigned of Y this cycle". Investigation revealed the original "auto-update assigned on tick" fix would have broken Bundle 27 locked-plan workflow + INV-08/INV-10. Resolves Items 4-6 cluster via vocabulary.
- **Item 16** (`ca71d6e`) `BRAIN.bills.processAutoDebits` — boot-fired batch handler scans BILLS for auto-debit entries past their billDate, atomically writes txn + marks paid via `BRAIN.bills.markPaid`. Cycle-floor guard `S.autodebitProcessingStartTs` prevents reprocessing of cycles already settled by bank reconciliation. Initialized first-deploy to `MODEL.paydayDate.getTime()` (= 2026-06-15 for John's current state, correctly skipping the reconciled May cycle). New `BRAIN.SOURCES.AUTODEBIT_BATCH_LANDED`. Smoke 6 cases covering pre-floor skip, eligible-process, future-skip, idempotency, manual-pre-paid skip, first-boot-init.

**Guardian rule fixes (2 commits — prereq for full-Guardian-as-commit-gate):**
- (`da904c2`) `getLiveBal returns only S.bal` rule rewritten — accepts both legacy `return S.bal` AND post-Bundle-30 `BRAIN.balance.get` delegation. Pre-fix matched only legacy → UNKNOWN verdict on current code. Verified against 6 synthetic cases.
- (`2fd28ff`) Runtime Guardian S7 `paydayReceived` rule — N/A short-circuit for anchorless fresh-state fixtures (where `paydayReceivedDate=null` AND `paydayReceived=false`). Spurious failure when real-time advanced past fixture's payday day. Cycle-rollover staleness still caught by separate SCENARIO test at `guardian-runtime.js:528`.

**Phase 1B vision audit infrastructure (3 commits):**
- (`eb01778`) `scripts/walkthrough-audit.js` — 15 UI surfaces × Haiku 4.5 vision audit with 5-dimension structured-JSON prompt. Run 1 baseline at `docs/audit/...-RUN-1.md` (retained for diagnostic record but CONTAMINATED by stale fixture — discard).
- (`a53a822`) Per-API-call trace logging — JSONL written per call with timestamp, surface_id, screenshot_hash (sha256-16), api_response_id, input/output tokens, cost, raw_response_text. Verifiable by `wc -l` + token-sum vs Anthropic billing.
- (`601e4ca`) Run 2 against refreshed fixture (72 findings, P0:0 P1:35 P2:37 P3:0, $0.0873) + per-screen diff doc vs Run 1 + `api_response_id` logging-bug fix in `callHaiku()` return.

**Methodology fixes post-fixture-refresh (4 commits):**
- (`f5e13e1`) `state-snapshot.json` refreshed from `tests/state-dump/slyght-reconciled-2026-05-19.json` (was 5 days stale, pre-reconciliation $11.72 hero; now $1,113.61 reconciled state).
- (`6581a0f`) Smoke Root Cause A — audit-log `.length` delta assertions decoupled from 500-entry cap. Affects INV-01 outflow + INV-28 refusal + Case 6 init.
- (`1d37c81`) Smoke Root Cause B — autodebit Case 6 follow-up derives `asOfTs` from `result.floorAfterInit` instead of hardcoded date that assumed `paydayReceived=false`.
- (`e3a593f`) Smoke Root Cause C — diagnostics beforeEach now dismisses End-of-Day modal via canonical `eodReconAccept()` handler. Modal fires on real-state fixture and intercepts pointer events for diagnostics expand-button taps.

**Methodology amendments (2 commits):**
- (`b7c0085`) CLAUDE.md §8 — full Guardian (`npm run guardian`) as commit gate (not guardian-static alone) + fixture currency rule (refresh on reconciliation) + audit trace requirement (vision-API scripts MUST write per-call JSONL) + investigate-before-coding pattern (codified after 3× validation this bundle).
- (`c53e0c8`) `docs/bundle-32-scope.md` — Phase 1A carry-overs + Phase 1B Run 2 actionable set + 12 housekeeping items + 5 FINANCIAL-INVARIANTS pending decisions.

**Discipline gains this bundle:**
- "Investigate-before-coding" validated 3× (Items 4, 8, 16) — codified in §8
- "Don't conflate fixture with live state" caught + saved to memory after a $11.72 / $1,113.61 confabulation
- Stale fixture surfaced as systemic risk — 5 smoke specs were latently dependent on Bundle-27-era state values
- Vision audit verification trail formalized (no-trace audits = not Guardian-equivalent)

**Cost:** $0.0718 (Phase 1B Run 1) + $0.0873 (Phase 1B Run 2) + $0.0118 (test:all verify-visual passes) = ~$0.17 Haiku for the bundle.

---

## Bundle 30.5 + 30.6 — SHIPPED (rolled with Bundle 30)

**Theme:** Visual feedback infrastructure + worker-KV import for one-shot bank reconciliation.

**Bundle 30.5 (`cd303e5`):** Phases A-D shipped:
- `tests/helpers/capture-state.js` + `tests/helpers/feature-map-paths.js`
- `scripts/verify-visual-state.js` with Haiku 4.5 auto-flag mode + manual-review fallback
- npm scripts: `smoke`, `verify-visual`, `verify-visual:force`, `test:all`
- 26-capture verify-visual at $0.006/run on initial deploy

**Bundle 30.6 (`1cad114`):** Temporary worker-import button for one-shot reconciliation + ADR-E preview. Infrastructure for 2026-05-19 bank-side reconciliation. v3 / v4 / v5-atomic iterations (`3c7008e`, `1735299`, `289c762`) hardened the save-race vs in-tick write+reload pattern. Final cleanup at `818d63a`.

---

## Bundle 30 — SHIPPED (2026-05-15 → 2026-05-18 · Phase 1 + Phase 2)

**Theme:** Financial-math integrity. Closes FR-01 (`S.bal` doesn't decrement on transaction record) + FR-02 (bucket balances don't increment on allocation) per `FIELD-REPORT-2026-05-15.md`. Encodes mathematical contracts the app must satisfy via `FINANCIAL-INVARIANTS.md`.

**Headline shipped:**
- `BRAIN.balance.*` bubble — canonical single writer for `S.bal` (`fe3caba`)
- `BRAIN.transaction.recordWithAllocation` envelope — composes balance + txn + audit atomically; 9 write sites migrated (`bbc1f48`)
- AUDITOR shim — `applyTxnDelta` dual-logs to AUDITOR via TXN_DELTA_* entries
- Bucket destination support — INV-02 + INV-12 (bucket credit on allocation)
- INV-28 free-money refusal gate — `_skipFreeMoneyGate` + `_isRoundup` envelope exemptions
- `BRAIN.bills.markPaid` envelope composition — Phase 2.E (no separate `applyTxnDelta` calls)
- 5 plan tick paths migrated to canonical writers — Phase 2.C
- New Guardian rule `no-direct-applyTxnDelta` — Phase 2.D
- Diagnostic UI: Math Health card, Boot Self-Test card, Activity Log card (merged + filter), Dev Inspect card — Phase 1.A.6
- Pre-Bundle-30 snapshot insurance (`BRAIN.balance._initPreBundle30Snapshot`) — one-shot at boot

**Tooling:**
- Smoke spec foundation (`tests/smoke/diagnostics.smoke.js`, `tests/smoke/transaction-paths.smoke.js`) — 19 specs at close
- FEATURE-MAP v2 schema introduced (structured per-entry path/type/lives-in/inside-BRAIN/smoke-coverage/reads/writes/triggers/related/notes/last-touched)
- 16 MathInvariants registered including RC1, INV-01-26

**SDD:** `docs/sdd/SDD-bundle-30-financial-math-integrity.md` — the canonical spec for this bundle.

---

## Bundle 29 — SHIPPED (2026-05-13 → 2026-05-14 · "alive" + Section 12 retro)

**Theme:** Make the app react instead of silently re-rendering. Premium-feel polish batch + interaction-state harness + cross-cutting math fixes from Plan-mode total audit.

**"Alive" capabilities (`c1e30d5`, `8eeefe1`, `9a3c843`, `11cbd95`, `caa7549`, `55cc9fb`, `f87a39b`):**
- Micro-animation foundation across hero / NW / MAX PER DAY / canvas REMAINDER tile
- Counter-roll on value changes + pulse on tile state shifts
- Bar smooth-resize on allocation changes
- Edit-modal save-flash kill (`caa7549`) — modal hidden during `_save()` invocation
- Visibility-instead-of-display on bonus toggles (`55cc9fb`) — kills layout reflow
- Drop card opacity fade in edit-modal slide-in (`f87a39b`)
- Premium-feel polish batch — MAX PER DAY hero, survival bubbles, analysis cards
- `.add-btn` lifted from dashed thin grey to chunky green bubble button

**Interaction-state harness (`d707afa`, `eae0138`, `0275f2d`):**
- `layerV:deep` mode — Canvas sub-screens + modals coverage extension
- Alive-vs-dead deep UX walk — interaction-state captures per surface

**Section 12 retro sweep + Batch A approvals (`6ce96cd`, `84ab9fe`, `0db1c46`, `cfeea88`):**
- Full Phase 1-4 sweep of Payday Plan canvas section 12
- Opus vision review + cc-handoff-after-opus
- Batch A math fixes: math sub-line provisions, buffer color, toast clip, lock-confirm button
- Phase 5 closure: METADATA §7 findings status + §8 fixes shipped

**Plan canvas math fix (`2fa589a`):** Analysis uses `BRAIN.bills.getThisCycle` as canonical source — Plan mode now authoritative on bills math.

**Plan-active banner (`ce24ac9`):** Persistent PLAN-ACTIVE banner across dashboard / bills / analysis + explicit unlock affordance.

**Trip allocation fix (`c9bf1bd`):** mark-as-allocated works for trips — was returning bucket-not-found silently.

**Manual amendment (`0441fad`):** §9.1 strongest-assumption-first verification discipline — saved to memory after the close+replay storageState pattern proved itself against multiple "did it really land?" doubts.

---

## Bundle 28 — SHIPPED (started 2026-05-13 13:33 · closed 2026-05-14 lunch · rounds 0-72)

**Theme:** PLAN-mode deep dive + canonical-writer migration of the intent layer.

### Close-out summary (2026-05-14 lunch)

72 rounds shipped over 26 hours. Started as MISSION-BUNDLE-28-PLAN-MODE-DEEP-DIVE.md scoping doc on 2026-05-13; closed 2026-05-14 after the day-of-audit total-PLAN-mode sweep + 5-fix sprint (P0.1 bonus rollover preserve · P0.2 markPaydayLanded · R1 intent-driven goal subtitle · R2 Annual Provisions nav-row · R3 Mum-bubble drop + bar legend) + strategic synthesis answering John's four deep questions.

**Headline shipped capabilities:**
- `BRAIN.plan.intent.*` canonical entity layer (Phase 0)
- 13 BRAIN bubbles operational (audit · config · allocation · plan · assets · chat · cycle · savings · summary · dashboard · transaction · bills · debts) + meta (SOURCES, _SOURCE_SET)
- 75+ SOURCES tags
- 26 seed migrations (seedV0 through seedV26)
- 16 MathInvariants
- 51 runtime guardian checks · 65 unit tests · 4 guardian-static gates (Core / Logic / UI / All)
- Universal modal scroll-lock via `:has()` (Bundle 22 v3 architecture)
- Android back-button intercept (Bundle 22 v3 Phase 5)
- Boot self-test (10+ checks per page load · logs to `console.error` + `BRAIN.audit` as `boot_self_test_fail`)
- Layer V visual-regression harness (52 capture surfaces · `--local` + deployed mode)
- Layer I AI-agent walker (mission-i)
- PLAN-mode total audit doc `slyght/AUDIT-PLAN-MODE-2026-05-14.md` (~2,000 lines · 24 surfaces · 7 cross-cutting passes · vision UI · strategic synthesis)
- 3 SDDs (`docs/sdd/SDD-2026-05-14-*.md`) for round-72 P0/R1 fixes
- Round-72 strategic synthesis: showing-someone test · 7 not-accounting-for gaps · 3 too-fixed rigidity points · 60-80% session-burden-reduction architecture sketch via Bundle 23 → 29 → CF Worker → 30

**Gates at close:** 0 FAIL · 44 WARN (pre-existing future-proofing, not shipped bugs) · 51/51 runtime · 65/65 tests · 4/4 guardian-static gates.

**Archived per Audit A1 §5 STOP doctrine:**
- `MISSION-BUNDLE-28-PLAN-MODE-DEEP-DIVE.md` → `docs/archive/MISSION-BUNDLE-28-PLAN-MODE-DEEP-DIVE-shipped-2026-05-14.md`
- `CLAUDE-CODE-SHIP-PROMPT-28.md` → `docs/archive/CLAUDE-CODE-SHIP-PROMPT-28-shipped-2026-05-14.md`

**Carried into Bundle 29** (see `MISSION-BUNDLE-29-*.md`):
- TDZ-at-boot investigation (L1646/L11246/L13111 family · Bundle 27 OPEN-BUG carry-over)
- Layer V sub-screen + modal coverage extension (audit cross-cut §F · upgraded to Phase 0 of Bundle 29 per John 2026-05-14 — "this is the crux")
- Tier-3 intent-driven canvas Savings full redesign (R1 today is the quick-fix variant · SDD draft in audit §E)
- 7 strategic-synthesis "not accounting for" gaps
- 3 rigidity points (P1/P2)
- Decision-support features per Audit A1 §6 (Debt Race · Retirement Canvas · Annual Sinking Funds)
- Legacy mirror drops · test-pollution intent cleanup · `S.bonuses` vs `activePlan.income.bonus` consolidation · `_billEditMode` global → component state · stale `paidBills['Google Microsoft-1']` key
- Narration gaps (Debts viaRent legend · KIA Extra verb-first label)
- 14 boot self-test reachability entry batch-add
- Layer V `#19 plan-edit-trip-modal` selector bug



### Audit A1 + cleanup foundation
Six-lens structural audit per Opus's MISSION-AUDIT-A1 spec, folder triage, scoping, and reference pilot.
- 6-lens audit doc (`AUDIT-A1-2026-05-13.md`, 5,500 words)
- Root MD files 76 → 13; 66 historical docs moved to `archive/{missions,ship-prompts,audits,misc,…}`
- 83 MB binaries gitignored
- Bundle 28 scoping doc (`MISSION-BUNDLE-28-PLAN-MODE-DEEP-DIVE.md`, 30+ pages, 11 phases)
- Bundle 28 ship prompt (`CLAUDE-CODE-SHIP-PROMPT-28.md`)
- Reference pilot at `experiments/savings-subscreen-v2.js`
- Commits: `9b6bdcd`, `1d3e327`
- Phone-verify: structural only (no code changes)

### Pre-Phase-0 stability fixes (forward-fixed during pre-flight)
Bugs surfaced while scoping Bundle 28; fixed forward to clear the runway.
- Dashboard hero balance edit silent failure — `runRecon` explicit handling for sub-$1 / unchanged / first-time
- Settings balance edit refactored, then removed entirely (John decision: dashboard hero is the single surface)
- Z-index sandwich fix — `.modal-overlay` 200→600, `.recon-overlay` 300→620, toasts/badge 500→800
- Layer V `fullPage:true` (closes OPEN-BUGS #33 screenshot truncation), captures #38–#42
- Commits: `f174d23`, `c79eeca`, `be21515`, `bdda17b`, `b7fb6ed`
- Phone-verify: PASS (rounds 1–2 per session log)

### Phase 0 — `PLAN.intents` canonical entity (ADDITIVE)
Foundational intent layer that collapses the China-as-3-records duplication and gives every future PLAN write a single owner.
- `BRAIN.plan.intent.*` namespace: `get`, `list`, `byKind`, `byBucket`, `add`, `update`, `remove`, `_archive`, `setBucket`
- 5 new `BRAIN.SOURCES` tags (intent.add / update / remove / archive / setBucket)
- `seedV25_collapseIntents` migration — gated, snapshot-before, idempotent
- 3 new boot self-test entries
- No UI changes — additive only
- Commit: `22ef496`
- Phone-verify: PASS (existing surfaces unaffected; migration ran cleanly)

### Phase 0.1 — Hygiene quick wins
Seven small fixes that didn't need their own phase.
- B28-1: stale Ask AI toast
- B28-2: KIA Extra editor (replaces `alert(…)` stub)
- B28-3: `_paydayExitToTab` helper fixes Go-to-Bills nav
- B28-12: stale Phase 6 comment removed
- B28-15: orphan `paydayUntick` deleted
- `_paydayProgressBar` component extracted
- Commit: `65289c5`
- Phone-verify: PASS (Round 3 forward fixes: `6eb7034`)

### Phase 28.0.5 — Cross-tile metric canonicalisation
Reconciling Analysis tab + Dashboard pace metrics on a single helper family.
- `buildSpendingPivot` uses `getAllOutflowsByCategory` (includes Debt + Savings + Loans)
- Dashboard pace tile uses `computeSpentInRange` (strict — excludes non-spend)
- New canonical helper `getAllOutflowsByCategory`
- Commits: `381735d`, `977e04a` (real-site fix after first migration missed the actual renderer)

### Phase 28.0.6 — Ask AI auto-fill
Pre-fills chat input with structured plan context so AI responses are grounded.
- Pulls from direct readers (`S.bal`, `MODEL.daysToPayday`, `getBillsDue`, …) not stale `BRAIN.plan.getSnapshot`
- Requests math breakdowns + dates in AI response
- Format hint for paragraphs + emojis + bold
- Commits: `381735d`, `977e04a`

### Phase 28.2 — PLAN-mode tile reorder
Payday Plan tile above WRX tile (cycle-first, long-term-second).
- Commit: `381735d`

### Canonical writers — bucket lifecycle + transaction reclassify
Migrations starting the whole-app canonical-writer pattern.
- `BRAIN.savings.addBucket(bucketLike, source)` + `updateBucket` + `removeBucket` — 4 callers migrated
- `BRAIN.transaction.reclassify(ts, patch, source)` — powers Convert-to-Loan
- MAX PER DAY card now tappable
- Dead code: `renderSavingsBuckets` removed
- Commits: `16726cd`, `1a3b80d`

### Rounds 5–9 — adaptive phone-verify fixes
Iterative round-by-round response to John's phone-verify findings.
- **Round 5** (`1268e24`): Ask-AI math + Analysis filter fix + Convert-loan flow + bucket↔intent link + delete buttons on trip/goal/bucket cards
- **Round 6** (`2d4e85f`): `PLAN_MODAL` overlay hoisted out of `#plan-mode` (stacking context isolation — child z-index 601 was bounded by parent's transform context); Analysis filter fix at real renderer `buildSpendingPivot` (previous attempt hit a renderer that's no longer in the DOM)
- **Round 7** (`977e04a`): Debt category fragmentation tip + goal-edit refreshes canvas + Ask-AI math breakdowns + MAX PER DAY explainer rebuilt
- **Round 8** (`9de16dc`): Delete-goal full cycle (intent removal + canvas refresh — previously missed) + `FEATURE-MAP.md` directory of every surface
- **Round 9** (`a1b0ce2`): Delete affordances added to canvas (trip + bucket — sibling-card audit miss from round 8); MAX PER DAY rebuilt with rich HTML cards (hero gradient, progress bar, money breakdown grid, timing-aware warning); debt-tip reformatted as hierarchy

### Artifacts shipped
- `MISSION-BUNDLE-28-PLAN-MODE-DEEP-DIVE.md` — 30+ page scope doc
- `CLAUDE-CODE-SHIP-PROMPT-28.md` — executable spec
- `AUDIT-A1-2026-05-13.md` — 6-lens audit
- `REWRITE-COMPARISON-2026-05-13.md` — pilot vs current analysis
- `BUNDLE-28-NOTES.md` — working ledger with cross-reference inspection queue
- `FEATURE-MAP.md` — atlas of every major surface → render fn → DOM → readers → writers → cross-references
- `CC-PRINCIPAL-ENGINEER-MANUAL.md` — moved into repo (was in `~/Downloads/`)
- `docs/{adr,sdd,archive,manual-amendments,ops}/` — scaffolded with READMEs
- `docs/manual-amendments/AMENDMENT-001-noticed-action-plans.md` — proposes structured Noticed format (ACTION + WHEN)

### Pre-existing guardian FAILs cleared
Closes 2 Noticed items from `315431c` surfacing.
- `no-hardcoded-bill-name` L12118 (`seedV25` Teachers Health) — added `guardian-allow-block` justifying TDZ-driven duplication of `PLAN.getAnnualProvisions` at boot phase
- `no-third-discretionary-filter-array` L14846 (`_DEBT_CATS` inline) — promoted to module-level canonical `_DEBT_CATEGORIES_SET` near `_NON_SPEND_CATS`; usage migrated to `Set.has()`
- Gates: 0 FAILs, 41 pre-existing future-proofing WARNs (magic strings for survival mode + debt strategy — out of scope for this commit)

### Round 46 — Payday Plan Canvas: "showing Mum the plan" polish
John on the BIG ask: "I need to confidently see in that screen I have this much and this is fixed and this remainder is what I can allocate. Right now I can't show or explain that to Mum so she thinks I'm spending money on something and doesn't trust the app."

The Canvas already has the right architecture (income hero → essentials → remainder → discretionary → still-free) but the visual signposting wasn't strong enough for an audience walkthrough. Round 46 polish:

- **Prominent inline `＋ Add bonus` pill** when no bonus added yet. Pre-r46 the bonus toggle was buried behind a tiny ✏️ icon — easy to miss. Now if no bonus exists, a green-bordered pill button sits inline next to the net pay so John can add the expected bonus in one tap. (Bonus IS already there once added → still has the ✏️ for edits.)
- **Mum-readable one-line summary** below the headline figure: "Of $X coming in, $Y is FIXED (bills, debts, daily living) — $Z is yours to allocate." Plain English, totals labelled, can be read out loud.
- **🔒 FIXED badge** on the Essentials section header — Mum sees what can't move.
- **✋ YOURS badge** on the Allocating-the-remainder section — Mum sees what John is deciding.

The Canvas already shows the proportion bar, essentials subtotal, headlined remainder tile, and still-free figure. Round 46 doesn't restructure anything — just makes the FIXED/YOURS split unmissable so the showing-Mum conversation works.

(Deferred for now: ability to drag debts between FIXED and YOURS based on user override, and a "recommended-to-defer" tag on long-term debts so the canvas can suggest pushing them to next cycle. These are substantial design pieces, scoped for a separate round.)

Gates: 0 FAILs, 54/54 tests, 51/51 runtime PASS.

### Round 72 — PLAN-mode total audit + 5-fix sprint (P0/R1/R2/R3)

Day-of-audit ship. John's morning brief: "scrape PLAN mode like Winnie-the-Pooh eats a honey jar." 24 surfaces walked deep (canvas + 5 sub-screens + 11 modals) + light (PLAN-tab mother tiles) + 7 cross-cutting passes + vision UI pass. Single audit doc shipped: `AUDIT-PLAN-MODE-2026-05-14.md` (~2,000 lines, 4 batch commits).

Five fixes shipped (in order):

**P0.1 — Bonus persistence through cycle rollover** (`7db306e` · SDD-2026-05-14-bonus-rollover-preserve)
Root cause of John's recurring "added bonus → leave → come back → gone" complaint. `rolloverIfNeeded` (L17984+) now preserves `prevPlan.income.bonus` when `status === 'expected'` (forward-looking intent). `status === 'confirmed'` doesn't carry (past-cycle). New audit-log type `plan_bonus_carried_to_new_cycle`. Toast on rollover reports both deferred-items AND bonus-carry.

**P0.2 — Manual `markPaydayLanded` affordance** (`7db306e` · SDD-2026-05-14-mark-payday-landed)
New `BRAIN.plan.markPaydayLanded(ts, source)` canonical writer. New SOURCES tag `PAYDAY_MANUAL_LANDED`. Canvas-root cycle-label now shows "Pay landed today?" green pill (when not received) or "✓ Paid <date>" badge (when received). Wrapper `markPaydayLandedToday()` handles confirm + write + re-render. Defers to existing `BRAIN.cycle.markPaydayReceived` for `S.paydayReceived` flag (no duplicate writer logic). Cycle-end-day copy also fixed in same edit: "0 days left" → "Cycle ended — next payday begins this cycle."

**R1 — Intent-driven goal subtitle on canvas Savings** (`b91ec2f` · SDD-2026-05-14-intent-driven-goal-subtitle)
Closed John's morning "can't see Freedom Buffer or Property Deposit" gap. `renderPaydaySavings` (L11052+) reverse-looks-up the intent linkage for each bucket. Rows render the GOAL name (from `S.goalDefs`) with bucket as subline ("Freedom Buffer · stored in Rainy Day Fund"). NEW "Other savings goals" section renders intents linked to synthetic-bucket tokens like `__mum-account__` — Property Deposit appears here as "via Mum-managed savings". `openEditPaydaySavings` modal title also gets goal-context (e.g. "🛡️ Freedom Buffer — this cycle" instead of "Allocate to Rainy Day Fund"). Override schema unchanged. Quick-fix variant of the larger Tier-3 redesign queued for Bundle 29.

**R2 — PLAN-tab Annual Provisions → single nav-row** (`f651d59`)
Per John 2026-05-14: tile was duplicating canvas Essentials display (r47 explainAnnualProvisions). `renderAnnualProvisions` (L22975+) converted from inline list to single nav-row "🏦 Manage provisions · $X/mo · N items ›" that opens a manage-modal (`openManageProvisions`) with editable rows. Single source of truth: canvas = read, PLAN-tab = manage. Layer V capture #15 verifies the new pattern.

**R3 — Canvas Mum-summary bubble dropped + proportion-bar legend promoted** (`f651d59`)
The r46-era "Of $X coming in, $Y FIXED, $Z yours" bubble re-stated the same fact rendered structurally below (ESSENTIALS section header + 🎯 REMAINDER tile). John 2026-05-14 confirmed redundant. Dropped (~10 LOC). The proportion bar caption ("Bills · Debts · Savings · Upcoming · Living") was grey-on-grey 11px — non-legend. Now a real legend: 5 coloured dots matching bar segments. Closes morning "red and blue bar has no legend" complaint properly.

Strategic synthesis (audit doc §3.5) — answered John's four deep questions:
- Showing-someone clarity: 🟢 mostly clear post-fix, 2 narration gaps (Debts viaRent legend + KIA Extra label) — P1 next.
- Not accounting for: 7 gaps inventoried (cycle-progress strip · bonus-confidence · trip-overage reconciliation · income-change prompt · surprise-expense reactive flow · super in retirement framing · goal-completion celebration). All Bundle 29-30 scope.
- Too fixed?: 🟢 healthy. 3 rigidity points (cycle-date override · tap-bar-segment · untick affordance) P1/P2 next.
- Independent operation: achievable in Bundle 23 → 29 → Phase-7 CF Worker → 30. Today ~30-50 interactions/cycle. Target ~20 min intentional + 2-3 push-driven/week. ~60-80% reduction.

Gates: 0 FAILs, 65/65 tests, 51/51 runtime PASS across all 5 commits.

Open: TDZ at boot-time (existing Bundle 27 OPEN-BUG #B28-14 family · L1646/L11246/L13111) caused 12 boot-self-test failures in Playwright early-load. Doesn't affect user-visible app (Layer V renders cleanly because of timing). Bundle 29 hygiene: investigate script-evaluation-order vs `const BRAIN` declaration.

### Round 71 — Weather chip squish fix + smaller header icons + ghost info-btn class
John phone-verify on r70: "weather is now full squished, button icons can reduce one size down, also that same [grey oval] pattern still occurs throughout the app like bills where there is ? icons etc".

- **Weather chip squish** (`index.html:196` `.hdr-right` + `.icon-btn`) — r70 set `.icon-btn` to `min-width:44px;min-height:44px` for WCAG. On 412px viewport: 4 × 44 + PLAN chip + gaps ≈ 306px → leaves ~24px for weather. Fix: drop min-width/min-height; tap target now comes from `padding:10px` (content + padding ≈ 38px square, still WCAG 2.5.5 compliant on touch). `.hdr-right` gap also dropped 10→4px. Frees ~120px for the weather chip.
- **Header icons 20→18px** + stroke 1.8 still bold enough. Matches John's "one size down".
- **`.info-btn` class** (`index.html:200+`) — new ghost class for "?" / "ℹ" info buttons. Replaces 3 grey-oval inline-styled buttons that matched the same shading pattern: `explainMonthlyBills`, `explainWeekProjection`, the math-invariant banner close-`×`, the goal-slider `ℹ` button. All now show just the glyph with `color:var(--text3)`; brightens on `@media (hover:hover)` only.

Gates: 65/65 tests, 51/51 runtime, 4/4 guardians green.

### Round 70 — Property Deposit closed loop + header icon polish
End-of-session two-fix wrap-up addressing John's final phone-verify items.

**Header icon "grey oval" removed** (`index.html:196`) — `.icon-btn` was rendering as a 34×34 circle with `background:var(--bg3)` and `border:1px solid var(--border)`. The grey circular fill behind each header icon (scanner, bell, refresh, settings) competed visually with the icon glyph and "squished" on tap. Fix:
- Removed background + border + transition. Icon now floats freely.
- Bumped tap target via `min-width/min-height:44px` (WCAG-safe via padding instead of explicit dimensions).
- Color shifted from inherited `--text3` (medium grey) → `var(--text2)` (lighter grey for distinguishability without being fully white).
- SVG icons bumped 16px → 20px and stroke-width 1.4 → 1.8 for better visibility on the S23 Ultra.
- Hover state gated on `@media (hover:hover)` — no stuck-hover shading on touch.
- Bell notification badge re-anchored to icon corner since the surrounding circle wrapper is gone.

**Property Deposit global closed loop** (`index.html:19773+`) — John ask: "$2500 each month should transfer to the property deposit savings goal in the PLAN dashboard and the $3000 will increase by the debt tile amount paid... so it all links". Implementation:
- New `BRAIN.bills._propagateDepositLoop(key, ctx)` fires from `_setPaidEntry` after the paidBills entry is written.
- Reads `bill.breakdown.depositSavings` for the just-paid bill.
- Finds the matching viaRent debt (`d.rentBillName === billName` OR fallback name regex `/(rent|deposit)/i`).
- Decrements `d.amt -= deposit` (clamped to 0) AND increments `S.mumAccountBalance += deposit`.
- `S.mumAccountBalance` feeds `PLAN.getGoals().find(g => g.id === 'apartment').saved` (existing canonical path), so the Property Deposit goal in the PLAN dashboard auto-reflects the new total.
- When `d.amt <= 0.005`, sets `d.paid = true` so the debt drops out of the immediate-debts filter.
- Idempotent via `S._depositLoopApplied[key]` — re-calling markPaid for the same bill key won't double-apply.
- Full audit-log entry on every propagation: `type: 'deposit_loop_applied'`, before/after amounts, deposit portion, debtCleared flag.

Net effect: pay the May 15 "Rent + Deposit Savings" bill → Property Deposit debt drops $5,681 → $3,181 → Property Deposit goal saved jumps $3,000 → $5,500. Repeat monthly. After ~3 months the debt clears; the goal saved keeps growing toward $50k.

**Deferred to next session** (memory: `slyght_debt_archive_pattern`): the generalized "$0 debt → Remove debt button → archive (preserve history)" pattern. r70 sets `d.paid = true` when amt drops to 0 (so the tile filters out), but a visible **Remove debt** quick-action button + move to `S.archivedDebts[]` is the next round.

Gates: 65/65 tests, 51/51 runtime, 4/4 guardians green.

### Round 69 — Wrap-up: residual shading + paycheck framing + Property Deposit global sync
End-of-session three-fix wrap-up per John's phone-verify feedback on r58-r68.

**Residual button shading** — phone-verify on r66 caught residual "shading behind tappable objects". Trace: per-element `:active{background:var(--bg4)}` rules darkened multiple surfaces on touch in addition to the global opacity dip, AND `:hover` rules fired on touchstart and got stuck. Fixes:
- Removed `:active{background:bg3/bg4}` on `.settings-edit-row`, `.icon-btn`, `.debt-tile`, `.quick-prompt-btn` — opacity-dip + transform-scale already convey tap feedback.
- Wrapped 3 `:hover` rules (`.action-btn`, `.add-btn`, `#nw-modal-close-x`) in `@media (hover:hover)` so they only apply on devices with real cursor hover capability. S23 Ultra is touch-primary — `hover:hover` evaluates to false, so hover styles never fire (no stuck-hover shading).

**Trip "this paycheck" framing** (`index.html:21946+`) — r65 used a weekly fallback for imminent (<30 days) trips ("Save $225/week"). John doesn't deal in weekly numbers — he's paid monthly on the 15th. Replaced with paycheck-aware framing:
- Counts paydays between today and trip start using `S.payday` (15th).
- `paydaysUntil === 0` → "Allocate $900 this paycheck — no paydays before departure" (impossible, but graceful).
- `paydaysUntil === 1` → "Allocate $900 this paycheck — only 1 payday before departure" (Darwin's actual case).
- `paydaysUntil >= 2` → "Allocate $X per paycheck (N paydays left)".
- Imminent trips (<30 days) get this; longer trips keep "$X/month".

**Property Deposit global sync** (`index.html:6475+`) — John ask: "tile should recognise when rent and deposit savings is marked paid... so this tile syncs globally". viaRent debt tiles now read `BILLS[].breakdown.depositSavings` and current-month `paidBills` to surface paydown state:
- If linked bill paid this cycle → green `✓ $2,500 paid this cycle` line under the paid-off bar.
- If not yet paid → muted `$2,500 due this cycle · day 15` line.
- Link is via `d.rentBillName` (default fallback: "Rent + Deposit Savings", the canonical breakdown-bearing bill in BILLS).
- No mutation — purely read-side. Paying the bill on the calendar fires existing `paidBills` flow; tile re-renders next paint cycle and reflects it.

Gates: 65/65 tests, 51/51 runtime, 4/4 guardians green.

### Round 68 — Corrections visually de-emphasized in Recent Spending
**Problem:** `_isCorrection: true` transactions (created by the balance reconciliation flow when user picks "Correcting previous error" etc.) rendered identically to real expenses — large red `-$X` numbers. "Fixing testing -$564" looked like a $564 spend on the dashboard, alarming the user even though it's a bookkeeping adjustment that already settled.

**Fix** (`index.html:8694+`):
- Amount color: muted `var(--text2)` instead of `var(--red)` / `var(--green)`
- Amount suffix: ` adj` so the row reads "$564 adj" not "$564"
- Badge: small uppercase `ADJ` pill in mono next to the txn note, replaces the inline `🔧` emoji (more legible at a glance)

Now real spends keep their red treatment, real income keeps green, and reconciliation adjustments are visually grouped with round-ups as muted-grey support entries.

Gates: 65/65 tests, 51/51 runtime, 4/4 guardians green. Verified by local Layer V — Recent Spending tile now reads cleanly with real spends visually dominant over bookkeeping.

### Round 67 — Visual consistency: border-radius outliers + redundant warnings
- **Border-radius outlier cleanup** (5 inline replacements): `border-radius:5px → 6px` (×2), `border-radius:7px → 8px` (×1), `border-radius:22px → 20px` (×1). Reduces the codebase from 15 distinct radius values to 11, all aligned to the scale 2/3/4/6/8/10/12/14/16/20.
- **"Short of surplus" warning suppressed in critical mode** (`index.html:6401+`) — When `surplus === 0` (critical or survival), every debt is mathematically "short of surplus", so repeating that on every tile was visual noise that competed with the section-level CRITICAL banner already conveying the state. Now: keep the rare-positive `✓ Affordable from surplus` signal and the ETA, drop the per-tile amber warning when there's no surplus to allocate. The debt cards (Michael, Bowie) now read cleanly: name · amount · notes · % of debt · due date.

Gates: 65/65 tests, 51/51 runtime, 4/4 guardians green. Verified by local Layer V — dashboard immediate-debts grid much cleaner.

### Round 66 — r64.B follow-through + 2 UX fixes + GO HAM polish pass
John ask: "continue going I love all these UX polishes, I want more! go above making other UXs look nicer or cleaning up the buttons where they are tappable like removing the weird oval shading behind buttons, increasing and unifying the font size across all tiles and UIs so its easy to read just go HAM!"

#### Layer V harness — 4 new modal captures
- `49 modal-max-day-math` — TAP FOR MATH on dashboard MAX PER DAY card. Reveals the full breakdown: cash cushion math, time math (raw rate ÷ budget cap), today's total outflow. Required force-display because Playwright's fullPage screenshot mishandled the fixed-position overlay with CSS animation; workaround documented inline in capture script.
- `50 modal-add-debt` — empty Add Debt form (3 input rows + autoDebit checkbox + Immediate/long-term selector).
- `51 modal-edit-goal` — Property Deposit edit form (50,000 target, 2,500/month contribution, address description, Save / Delete / Cancel triplet).
- `52 modal-add-trip` — empty Plan A New Trip form (destination, emoji, start/end dates, spending budget, notes).

#### UX fixes
- **Recon modal disabled hint** (`index.html:1813+`) — "Confirm & Continue" button greyed silently when no reason was selected. New `#recon-hint` reads "Pick or type a reason above to enable Confirm." below the button; auto-hides when ready.
- **Quick Log chip overflow** (`index.html:1666+`) — Category and Type chip strips now sit inside a relative wrapper with a `linear-gradient(transparent → var(--bg2))` fade-right mask. Tells the user there's MORE category off-screen. Added `scroll-snap-type:x proximity` + iOS momentum scrolling.

#### GO HAM polish — global UI consistency
- **Removed dark-overlay tap-highlight** (`index.html:513`) — Was `-webkit-tap-highlight-color:rgba(0,0,0,0.1)` on every button/tappable, which painted a "weird oval shading" on top of any colored button on tap. Now `transparent` with explicit `:active` opacity-dip (0.7 over 80ms) for tap feedback, keeping iOS-style snappiness without the dark overlay.
- **Keyboard-only focus rings** (`index.html:517`) — `button:focus-visible{outline:2px solid var(--green);outline-offset:2px}` so keyboard users get the ring, touch users don't.
- **Unstyled button reset** (`index.html:519`) — `button:not([class]):not([style*="background"])` strips the inherited grey-rectangle look from inline buttons that forgot to set their own bg/border.
- **Bumped tiny font sizes** — global `9px → 10px` across 6 instances (calendar daily-spend labels, DNA segment chips, notification badge, NEW BUCKET pill, ETA descriptors). 8px stayed for the calendar paid-tick glyph (✓) since it's not text.
- **Type scale CSS variables** (`index.html:37+`) — added `--fs-micro:11px / --fs-small:13px / --fs-body:14px / --fs-emph:15px / --fs-section:12px / --fs-title:18px / --fs-large:22px / --fs-display:28px / --fs-hero:44px`. Existing inline font-size:Npx will migrate to these incrementally; new code adopts them now.

Gates: 0 FAILs, 65/65 tests, 51/51 runtime, 4/4 guardians green. All changes verified by local Layer V capture re-run.

### Round 65 — r64 P3 polish (calendar legend, trip math, critical CTA, NW modal, copy)
Five UX polish items from r64 deep-sweep P3 backlog. Each addressed a specific deferred finding rather than scope expansion.

- **Calendar legend** (`index.html:688`) — third dot relabelled "Multiple" → "Bill + debt", added footnote "Day totals include bills + any debts due that day." Explains the day-15 $3,998 (Rent $3,000 + KIA Loan $780 + Bowie debt $217 due-date 2026-05-15) — previously users couldn't reconcile the daily total against the BILLS array alone.
- **Trip "Save $X/month" math for imminent trips** (`index.html:21946+`) — Darwin (25 days away) was rendering "Save $900/month to reach by departure" which is mathematically impossible (no full month left). Now: when `daysUntil < 30`, switch to weekly + daily phrasing. Darwin renders "Save $225/week ($36/day) to reach your budget by departure". China (202 days away) keeps the month phrasing as before.
- **Critical banner CTA** (`index.html:2893`) — `renderSurvivalBanner` mode='critical' was dead text ("Every dollar counts right now"). Now tappable, navigates to Bills tab, copy reads "Tap to see what's eating your balance →". Closes the gap where John knew his balance was tight but the banner didn't surface the bills causing the squeeze.
- **NW modal hides zero liabilities** (`index.html:6116+`) — `liabRows.filter(r => Math.abs(r.val) > 0.005)` drops the "$0.00 Credit Card" row that ate 2 lines of vertical space on every modal open. Now only non-zero liabilities render.
- **Copy clarity** (`index.html:23091`, `index.html:21048`) — `‹ NOW` button on Future Plan header → `‹ Back` (`NOW` was ambiguous with "current time"). `See Breakdown ›` button → `View NW breakdown ›` (the original didn't say WHAT was being broken down).

Gates: 0 FAILs, 65/65 tests, 51/51 runtime, 4/4 guardians green. All 5 changes verified visually by `npm run serve` + `node scripts/layerV-capture.js --local`.

### Round 64 — Deep Layer V sweep + harness upgrade + 4 UX fixes
John ask: "FULL SWEEP of the app using local Layer V to understand the whole app, map out how code is visualised, continue improving where code was meant to look one way and displays another, fix data gaps, fix UX gaps." Deep-sweep every capture cross-referenced against `state-snapshot.json` (live phone dump) and `index.html`, with per-tappable critique. Doc: `docs/R64-DEEP-SWEEP-2026-05-13.md` (8,000 words, 42 captures, full code-attribution table, prioritised punch list).

#### UI fixes shipped
- **Hero subline orphan arrow** (`index.html:5755`) — `' in debt payments ↓'` had a trailing down-arrow with no label or tooltip. Removed; subline now reads `$66 spent today · $283 in debt payments · $218 bills paid`.
- **viaRent debt bar misleading** (`index.html:6425`) — Property Deposit ($5,681) was rendering "100% OF DEBT" because the share-bar `pct = Math.min(100, amt/total*100)` capped a 791% computation. Visually identical to a "100% paid" bar but semantic opposite. Now viaRent tiles render "X% paid off · paid / original" with a green bar; manual debts keep the share bar.
- **Empty-debt-notes "Tap to edit"** (`index.html:6424`) — already fixed in r61, reverified here.
- **Tutorial z-index over add-bucket modal** (`index.html:9367+`) — first-run "Welcome to Payday Plan" tutorial fires on 400ms timer; if user opened a modal in that window, tutorial appeared on top. Now guarded: skip + defer if any modal is already open when timer elapses.

#### Data migration shipped
- **seedV26 paidBills cleanup** (`index.html:13748+`) — discovered via deep sweep: `paidBills["2026-5-Google Microsoft-1"]` and `paidBills["2026-5-Teachers Health-1"]` were stale (bills renamed/removed in earlier bundles but their paidBills keys never migrated). Effect: Google One on day 1 rendered as UNPAID despite auto-debiting. Migration renames `Google Microsoft-N` → `Google One-N` for any month/year and drops orphan keys whose name is no longer in BILLS. Idempotent. Verified by Layer V calendar zoom — day 1 now shows strikethrough + ✓ as expected.

#### Layer V harness upgrades
- **UI→code attribution** (`scripts/layerV-capture.js`) — every `shoot()` call now also records the active screen, any active modal, and up to 40 clickable elements (with `tag/id/classes/aria-label/onclick/text` summary). Persisted to `captures/ui-code-map.json` (41 entries this run). Lets future-me grep for any element seen in a capture and find its handler instead of searching the 24k-line index.html cold.
- **Zoom helper** (`scripts/layerV-capture.js:zoom()`) — single-element close-up screenshots at device DPR. Section 8 adds 5 zooms: hero balance, hero subline (verifies $66/$283/$218 math), immediate-debts grid (verifies viaRent bar fix), persistent strip, bills calendar (verifies seedV26 paid-strikethrough). Calendar zoom is materially more legible than the full-page calendar shot.
- **Settings notifications + AI sub-screens** (`scripts/layerV-capture.js`) — were uncaptured. Now sections 32a/32b cover them with the same Samsung-IA navigation pattern as the existing 4 sub-screens.

#### Findings classified as not-a-bug (decision: leave alone)
- Day-15 calendar total `$3998` is **correct**: includes 2 bills ($3,000 Rent + $780 KIA Loan) PLUS the Bowie debt ($217.50 delayDate=2026-05-15). Calendar intentionally mixes bills + debts due. Legend says "Bill · Payday · Multiple" without mentioning debts — under-documented but accurate. Logged as polish for next bundle.
- "Savings $20 = 1 transaction" in Analysis pivot is **correct**: `getAllOutflowsByCategory` filter excludes `_isRoundup` (round-ups are passive, not "spending"). The one $20 is the May 7 China holiday deposit. 13 round-ups in window correctly excluded.
- Darwin trip "your share" copy is **correct**: trip data has `gfSplitting: true` and notes explicitly say "GF coming". Not solo.

Gates: 0 FAILs, 65/65 tests, 51/51 runtime PASS. Verified end-to-end with local Layer V run against current code.

### Rounds 57–63 — Layer V fixture refresh + post-refresh re-analysis sweep
Bundle 28 marathon continuation. After r55 BNPL ship, r56 settings IA, r57 capture-script settings sub-screen routing, r58 fixture refresh from live-phone dump, r59 deep re-analysis identified five real issues + four false-positives that dissolved when the stale "Google Microsoft" fixture was replaced. r60–r63 land the punch-list.

- **r57** — `scripts/layerV-capture.js` SECTION 6 rewritten to open/close the four Samsung-style sub-screens (`sub-financial`, `sub-strategies`, `sub-data`, `sub-diagnostics`). Pre-fix captures 29–32 were blank white screens (~62 KB) using pre-Bundle-22v3 selectors; post-fix captures 144–237 KB with real content.
- **r58** — `state-snapshot.json` replaced with `slyght-state-2026-05-13 (1).json` (bal $11.72, 2026-05-13T10:54:56Z). Backup at `state-snapshot.json.pre-r58.bak`. Runtime 51/51 PASS post-refresh — caught no test-fixture drift this round.
- **r59** — 42-capture deep re-analysis on the fresh fixture. Synthesis at `docs/R59-RE-ANALYSIS-2026-05-13.md`. Found: seedV18 NRMA contamination (P0), Afterpay ghost label (P1), "Tap to edit" placeholder confusion (P1), test-pollution surfacing gap (P1), Diagnostics "Most used" label noise (P2). Verified hero subline math is canonical and correct ($66 disc + $283 debt + $218 bills reconciles exactly to today's BRAIN.dashboard.todayOutflows() split).
- **r60** — `seedV18` retired (`index.html:13313`). The migration originally injected NRMA KIA Insurance into `S.debts` whenever fresh localStorage carried >10 txns without an NRMA entry. With the live-state truth that NRMA is paid via Mum (`slyght_nrma_mum_flow`), this injection was a ghost-data source visible in every Layer V run. New body: flag-only — keeps existing installs idempotent while stopping the contamination at the source.
- **r61** — three UX-clarity fixes:
  - "(same as debt above)" badge in monthly-bills list (`index.html:7598`) now requires a matching active debt in `S.debts` instead of firing on any `Afterpay`-named or `Debt repayment`-tagged bill. Cleared the ghost label that persisted after Afterpay was paid off.
  - Empty-notes debt cards now render `Tap to add notes` in muted-italic (`index.html:6424`) instead of `Tap to edit` in body-text color. Eliminates the "looks like a real note" misread John surfaced on Bowie vet.
  - Diagnostics Data-Health adds a test-pollution detector for transaction notes matching `/debug|asdf|qwerty|placeholder|fixme|lorem|ipsum/i`. Skips `_isCorrection` entries (legit user corrections like "Fixing testing" $563.78). Surfaces as a warning, not a hard issue.
- **r62** — verification-only round. Confirmed hero subline math is correct against fixture (no code change). Footer "$0 left today" vs hero "$11.72 left" reconciled as intentional dual surfacing (daily-budget remaining vs total survivability).
- **r63** — `UX_TRACKER.trackTap` click handler (`index.html:14623`) now prefers `aria-label` / `data-label` / `title` (own + closest ancestor) over raw `textContent` before falling back to a leading-non-word-stripped truncate. Fixes "Most used: 1$3✓" mojibake-looking labels that were actually concatenated badge+amount+checkmark from button textContent.

Gates: 0 FAILs, 65/65 tests, 51/51 runtime PASS across r60-r63. Layer V verification deferred to post-deploy (script hits `https://xetonx.github.io/slyght/`, not local file).

### Round 55 — BNPL explicit paymentDates schedule (additive)
Bundle 29 candidate B pulled forward. Real Afterpay/Klarna/Zip schedules slide (21 May → 4 Jun → 18 Jun → 2 Jul) and don't repeat on the same day-of-month. Pre-r55 BNPL bills used `freq:fortnightly + day:21` which is an approximation that drifts visibly over a multi-month plan.

r55 adds a **new optional `paymentDates` field** alongside the existing `day + freq + endDate` fields:

```json
{
  "name": "Stanmore Station Pharmacy",
  "amt": 12.49, "day": 21, "tag": "BNPL",
  "recurring": true, "freq": "fortnightly",
  "endDate": "2026-07-02",
  "paymentDates": [
    "2026-05-21", "2026-06-04", "2026-06-18", "2026-07-02"
  ]
}
```

- `saveBnpl` generates the array (calendar-aware `setDate`/`setMonth`, no UTC drift).
- `getExpandedBills` checks for `paymentDates` first — if present, emits one entry per date that falls in the current month; bills "between payments this month" are skipped entirely (no over-counting).
- `buildCalendarEntries` pre-passes `paymentDates`-carrying bills outside the offset loop so each explicit date gets exactly one calendar marker, then the legacy day+freq path runs for everything else.
- Bills without `paymentDates` follow the existing day+freq expansion unchanged (purely additive — no migration needed for existing user data).

Per user constraint "do not overwrite or over duplicate what we just created in this marathon", existing BNPL fixtures keep working until the user creates a new BNPL plan via `openBnplModal`. Old plans can be regenerated through the modal if exactness matters; the legacy fallback is good-enough for low-frequency monthly bills.

Tests added (3 — total 65/65): paymentDates array matches Afterpay 4-payment fortnightly, weekly 3-payment slide, length-equals-remaining invariant.

Gates: 0 FAILs, 65/65 tests, 51/51 runtime, all 4 guardians PASS.

### Round 53 — Monthly Bills: month section headers
John on r52 verify: "PASS but I think it should be split like MAY and then all Bills under MAY instead of repeating on the 4th 2 bills MAY you know?"

Pre-r53 each multi-bill day row labelled itself with the month — "2 bills · May $3,780" appeared 13 times across the list. Now the list is grouped by month at the top level:

```
MAY                                                  $5,109
  [15] 2 bills                          after: -$X   $3,780
     · Rent + Deposit Savings                        $3,000
     · KIA Loan — Firstmac                             $780
  [16] Optus — Phone + Internet         after: -$X     $194
  [18] YouTube Premium                  after: -$X      $17
  [30] 2 bills                          after: -$X   $1,028
     · Allianz CTP                                     $566
     · KIA Registration                                $462

JUN                                                  $X,XXX
  ...
```

- Each month gets a section header with the month name (uppercase) and the month total on the right.
- Year suffix only when it differs from the current year ("MAY" vs "JAN 2027").
- Day-group rows lose their redundant "May" subline (was "2 bills · May" → just "2 bills"; the running balance "after: $X" stays).
- Single-bill day rows also drop the month text from their subline.

Round 52b's same-day grouping is preserved underneath.

Gates: 0 FAILs, 62/62 tests, 51/51 runtime PASS.

### Round 52 — Trips as first-class allocation targets + Monthly Bills same-day grouping
Two refinements from John's r51 verify.

**52a — Trips are first-class allocation targets (no more "+ Bucket" warning)**

John: "It gives error saying this trip can't be allocated as it doesn't have a bucket tied to it but in the plan dashboard you have the trip modal with the option to add savings, edit the trip and plan it out etc, now that should be counted as the saving bucket and make that link."

Pre-r52 (r51): unlinked trips were surfaced in an amber warning card with a `[+ Bucket]` button — extra friction. Now:

- `recommendAllocation()` includes unlinked trips DIRECTLY in `bucketAllocations` with their own urgency-weighted share (`_tripUrgencyWeight` factored). Returns `syntheticBucketNames` array marking which entries need bucket creation.
- Modal renders these inline alongside real buckets with a small `+ NEW BUCKET` blue tag so the user sees what'll happen.
- Footnote: "+ NEW BUCKET items are trips without a linked bucket. Tap Apply and the bucket gets created automatically + linked to the trip."
- `applyRecommendation` now auto-creates the bucket via `BRAIN.savings.addBucket` AND sets `bucketHint` on the trip via `PLAN.saveTrip` for each synthetic name — so future runs see the link without re-detecting. Returns `{ applied, created }`.

One-tap experience: Darwin shows in the list with its urgency tag + NEW BUCKET label, Apply creates the bucket + sets the override in one shot.

**52b — Monthly Bills: consolidate same-day bills under one chip**

John: "Yes it's smaller but still a long list, can you consolidate bills that occur on same day or something?"

Pre-r52b each bill was its own row with its own chip — May 15 showed two rows (Rent $3,000 + KIA Loan $780) with the same "15" chip stacked, May 30 showed two more (Allianz CTP + KIA Registration). Now bills are grouped by `(year, month, day)`:

- Single-bill days: render as before (chip + name + amount).
- Multi-bill days: one chip + day-header showing "2 bills · May $3,780" + nested sub-rows for each bill (indented under the chip, tappable individually).

Compounds with r51's 25%-denser row size: a list of 15 monthly bills with several same-day clusters now renders in noticeably fewer visual rows.

Gates: 0 FAILs, 62/62 tests, 51/51 runtime PASS.

### Round 51 — Darwin allocation surfacing + Monthly Bills compactness
Phone-verify on r49+r50: 1/2/4/5/6/7 PASS, #3 PASS-with-question (Darwin missing from auto-allocate output), and a follow-up on #4 ("now it's just this massive list, needs to be more compactable better").

**51a — Darwin trip never showed up in auto-allocate**

John: "PASS but Darwin never shows up but that trip is so soon within this monthly cycle of $900 — it needs money allocated, why it's not first on list to allocate towards I'm not sure."

Root cause from his state file: Darwin trip has `bucketHint: ''` AND no bucket with a matching name exists. The bucket allocation iterates `BRAIN.savings.getBuckets()` — nothing to allocate to → Darwin silently absent from output.

Two-part fix:
- **Name-substring fallback in `_bucketWeight`**: if `intent.byBucket` doesn't link, walk `PLAN.getTrips()` and match by trip-name substring (e.g. bucket "Darwin Holiday" matches trip "Darwin"). Catches cases where bucketHint isn't set but a name-matching bucket exists.
- **Unlinked-trips section in auto-allocate modal**: `recommendAllocation()` now returns `unlinkedTrips` (trips with no findable bucket, sorted by urgency). The modal shows them in an amber-tinted card with `[+ Bucket]` button → `_createBucketForTrip()` creates the bucket via `BRAIN.savings.addBucket` canonical writer, sets `bucketHint` on the trip via `PLAN.saveTrip`, then re-opens the modal so Darwin appears in the allocation list.

**51b — Monthly Bills row compactness**

John: "PASS but now it's just this massive list, needs to be more compactable better." After r50 merged Today/Week bills into the Monthly section, the list got long. Tightened per-row:
- Padding `14px 0` → `8px 0`
- Chip `36×36` → `32×32`, font `14px` → `13px`
- Bill name font `14px` → `13px`
- Subline font `12px` → `11px`, margin-top `3px` → `1px`
- "(same as debt above)" → "(·debt)" — shorter tag
- Amount font `15px` → `14px`

Net: row height ~56px → ~42px. About 25% denser without losing legibility.

Gates: 0 FAILs, 62/62 tests, 51/51 runtime PASS.

### Round 50 — AU date format + Monthly Bills now comprehensive
Two follow-ups while John was reviewing r49.

**50a — Monthly Bills section was excluding This-Week bills**

John (mid-review): "Just noticed monthly bills is not capturing all my bills including ones showing in This week."

Pre-r50 `renderBillsGrouped` built the Monthly section from `[...grouped.next, ...grouped.later]` — bills in the urgency-focused Today/Week sections were excluded from the comprehensive monthly schedule. Now: `[...grouped.today, ...grouped.week, ...grouped.next, ...grouped.later]` — all month's bills sorted by day in the Monthly Bills section. Duplication with the urgency cards above is intentional — Today/Week are focus highlights; Monthly Bills is the full month-at-a-glance.

**50b — AU date format helper + first-pass apply**

John #5 from r48 phone-verify: "The dates should always follow AUS time formatting so day then month then year so it makes it easier for me to read and better to put the day as number and month as description so like 14th June so it's easier for me to recognise."

- New `fmtAuDate(d, opts)` helper. Accepts Date / ISO string / millis. `opts.style: 'short'` (default — `21 May`) or `'long'` (`21st May`). `opts.year` includes trailing year; defaults to true when the date is in a different year from now.
- Ordinal handling: 1st / 2nd / 3rd / 4th–10th / 11th-13th / 21st / 22nd / 23rd / 24th-30th / 31st.
- 4 regression tests added (62/62 passing).

First-pass application of `fmtAuDate` to highest-traffic user-facing surfaces:
- **BNPL preview** — "Next payment" + "Last payment (auto-stop)" now `21st May 2026` / `2nd July 2026` instead of `2026-05-21` / `2026-07-02`.
- **Dashboard debt cards** — "Due 14/05" → "Due 14 May".
- **Canvas Debt sub-screen** — "due 14 May" via fmtAuDate (already AU but standardised through the helper now).
- **Debt Freedom Timeline "Clear by"** — uses the short-month helper directly so "Aug 2027" stays consistent.

(Calendar tiles + Bills tab month labels + other surfaces still use their existing formats — they read OK and don't have the day-as-ordinal complexity. Future date-format pass can sweep them if needed.)

Gates: 0 FAILs, 62/62 tests, 51/51 runtime PASS.

### Round 49 — Bill paid/deferred toggle + debt quick-picks + auto-allocate transparency
Phone-verify on r48: 1-7 PASS with refinement notes. Each refinement below.

**49a — Bill cycle modal: Paid/Deferred toggle (was quick-pick grid)**

John #3: "Bills shouldn't have the option to say how much to allocate this cycle unless deferring because it's a set amount so the numbers don't make sense. Should just be a Paid in full or Deferred, then deferred brings the text box with custom amount and then it recalculates how much is left or how it will be added onto the next month, and there should also be an option to add fees if it defers and like I have to pay a late fee etc."

Rewrote `openEditPaydayBill` with a two-mode toggle:
- **✅ Pay in full** (default, green) — sets amt = normal, no defer.
- **↪ Defer part** (amber, opens a deferred-fields section):
  - Amount paying this cycle (number input)
  - Optional late-fee checkbox + amount
  - Live preview: "Paying now $X · Carries to next cycle $Y · + Late fee $Z · Total next-cycle obligation $W"
- Reason dropdown stays.
- Save: if "in full" → setOverride amt=normal. If deferred → setOverride amt=entered + `lateFee` opt; shortfall creates a Known Upcoming for next cycle.

**49b — Debt cycle quick-picks: 0/25/50/75/100% (was 0/25/50/75/100/125/150%)**

John #4: "should make sense when suggesting how much to pay off, should be like 1/4 of total amount, 1/2 etc and then option for custom amount or paid in full right?" Pre-r49 the picks included 125% and 150% of normal — over-paying a fixed debt doesn't make sense. Dropped to [0, 25%, 50%, 75%, 100%]. Custom button stays for explicit values.

**49d — Auto-allocate preview: transparent "what's covered first"**

John #7: "Auto-allocate not counting all debts or all bills etc just populating like celebrations and gifts etc not using real data."

Pre-r49 the auto-allocate modal led with "Suggested allocation across your savings goals" — but bills/debts/provisions/buffer were silently subtracted BEFORE the split. From the user's POV: looked like auto-allocate was only handling gifts/celebrations. Now the modal shows:
1. **🔒 Already covered first (Essentials)** — Bills / Debts (minimums) / Daily living / Annual provisions / Safety buffer with each amount.
2. **✋ Allocatable** — the headline $X figure after essentials.
3. **Suggested split (urgency-weighted)** — buckets, each tagged with a 🔥/⏰/calendar urgency chip pulled from the linked trip's days-out.
4. Footnote: "Trip buckets with closer start dates get a bigger share (round 48). Tags show how urgent each is."

(Note: actual debt payments beyond minimums isn't currently part of auto-allocate's output — the urgent-debt-pay-down feature is a separate round. The fact that debts ARE subtracted before splitting is now visible to the user.)

(Deferred to round 50: AU date format pass — John #5: dates should be "14th June" / day-as-number + month-as-word everywhere. Audit + standardize across BNPL preview, debt timeline, calendar dates, etc.)

Gates: 0 FAILs, 58/58 tests, 51/51 runtime PASS.

### Round 48 — BNPL end-date off-by-one + pace in MAX-per-day modal + urgency-weighted auto-allocate
Three follow-ups from John's continued phone-verify of rounds 45-47.

**48a — BNPL end-date wrong by one day (compared to Afterpay's own UI)**

John caught a real bug. Afterpay's UI for "Stanmore Station Pharmacy ($149, $37.25 × 4 fortnightly starting May 21)" shows the final payment on **Thu 2 Jul**. The slyght BNPL modal displayed **Last payment (auto-stop): 2026-07-01** — one day early.

Root cause: pre-r48 used `start.getTime() + (n-1) × 14 × 86400000` and `.toISOString().slice(0, 10)`. The `toISOString()` converts the timestamp to UTC — for Sydney (UTC+10), May 21 00:00 LOCAL becomes May 20 14:00 UTC, and Jul 2 00:00 LOCAL becomes Jul 1 14:00 UTC formatted as `2026-07-01`. UTC drift hit on every cross-month boundary.

Fix: use `Date.setDate()` (calendar-aware — handles 28/30/31-day months and leap years correctly) and read back local components instead of `.toISOString()`. Also added a monthly-frequency branch using `setMonth` for proper month-clamping (e.g. May 31 + 1 month → Jun 30 not Jul 1).

4 regression tests added (58/58 passing). John's exact scenario locked in.

**48b — Pace explanation also shown in MAX-per-day tap modal**

John #2 from r45 phone-verify: "Doesn't show specifically the what is pace calculation but has the rest of max per day in big orange etc." The dashboard pace text below MAX PER DAY was tappable → opened `explainWeekProjection` with the pace card. But tapping the BIG MAX PER DAY number itself opens `explainMaxPerDay` which didn't include the pace context. Now `explainMaxPerDay` also appends a "📈 What is pace?" card with John's concrete numbers (daily target, expected-by-today, actually-spent, OVER/UNDER result) so both entry points explain pace.

**48c — Auto-allocate now includes provisions + urgency-weighted bucket split**

Two issues in `BRAIN.plan.recommendAllocation()`:

1. **Provisions ignored**: r47 added Annual Provisions to Essentials so the Canvas Remainder is now $298 lower, but `recommendAllocation`'s `hardClaims` didn't include them — auto-allocate was overstating allocatable by ~$298/mo. Now folded in.

2. **Pure proportional split by goal target**: John on r46: "auto-allocate doesn't actually take into account what needs to be paid first... trips like Darwin with urgency the key is urgency so a check against the due date." Pre-r48 a trip starting in 30 days (Darwin) and a trip starting in 200 days (China) got proportional shares — Darwin starved. Now uses urgency weight: `weight = max(1, min(20, 365 / daysOut))` for trip-linked buckets. Imminent trips get up to ~20× pull versus far ones. Non-trip buckets stay at weight=1.

Result: Darwin Jun 7 dominates over China Dec 1 within the same allocatable pool, matching John's mental model of "what needs to be paid first."

(Known limitation, not fixed in r48: bills with `freq: 'fortnightly'` still use `day: number` 1-31 schema for repeating dates. Real Afterpay schedules don't repeat by day-of-month — they slide. The end-date auto-stop now matches Afterpay's final payment, but intermediate dates may not exactly match. Schema redesign for "explicit payment dates per BNPL" deferred to a future round.)

Gates: 0 FAILs, 58/58 tests, 51/51 runtime PASS.

### Round 47 — Canvas/Dashboard sync + Annual Provisions in Essentials + collapse-paid + viaRent parity
John on r46 phone-verify: Canvas tile PASS, but several sync bugs and a gap exposed across PLAN mode that misled the math. Each below was a real user-flagged issue.

**47a — Dashboard PLAN tile $6,959 vs Canvas $2,516 mismatch**

Pre-r47 `renderAllocateTile` used `BRAIN.summary.surplus().leftOver` while the Canvas itself used `BRAIN.plan.getSnapshot()` with a different formula (`totalToPlan - bills.total - debts.total - dailyLiving.plannedTotal`). Two parallel calcs producing different headline numbers for the same concept. Now the dashboard tile reads from the SAME `BRAIN.plan.getSnapshot()` source the Canvas uses — same essentials, same remainder, same still-free. The numbers agree.

**47b — Annual Provisions missing from Essentials**

John: "I don't see annual provisions anywhere in the tab essentials this cycle so again I'm allocating money that I don't have." Annual provisions ($86 Teachers Health + $42 KIA service + $39 KIA Rego + $46 Green Slip + $85 NRMA ≈ $298/mo set-aside for lumpy yearly/quarterly bills) was invisible to the Canvas. Now:
- New 4th Essentials row "🏦 Annual provisions" showing total + count.
- Tap → new `explainAnnualProvisions()` modal listing each provision with per-month + per-year + next-due-date.
- Dashboard tile math also includes provisions so both surfaces agree.
- Remainder/still-free figures now reflect the ~$298 commitment instead of overstating it.

**47c — Bills sub-screen: paid bills now collapsed**

John: "having PAID bills again needs to be removed or collapsed because it's not important at that stage where I'm deciding what's needed to be paid and what I can allocate." Refactored `renderPaydayBills` into a `_renderBillSection` helper that splits each section (Before/After payday) into UNPAID (visible) + PAID (collapsed `<details>`). If a section is entirely paid, shows a short ✓ summary. Collapsed paid items still accessible via expander.

**47d — Debts sub-screen now matches dashboard (viaRent included)**

John: "Debts subscreen doesn't sync with debt tiles — missing two debts." Pre-r47 Canvas Debts subscreen filtered `!viaRent` while dashboard Immediate Debts (round 29) shows ALL non-paid debts including viaRent with distinct styling. Now Canvas Debts also shows viaRent — sorted to the end of the list — with subline tags `🏠 VIA RENT` + `$X/mo via salary` so they're recognisable as scheduled/routed rather than needing-payment-now. autoDebit debts get `🤖 AUTO` tag.

Gates: 0 FAILs, 54/54 tests, 51/51 runtime PASS.

(Deferred for next round: auto-allocate respecting due-date urgency, trip-allocation recommendations based on urgency vs daily-living coverage.)

### Round 45 — Two real bugs found in phone-verify of rounds 38-42 (FAIL #6)
John FAIL on #6: "Doesn't explain PACE still. Also now when I have less than $11 it's saying I'm -$334 short before payday but I only have one bill coming out before payday of $31 so I'm actually short $20."

**45a — `safe = $334 short` math bug — double-bucket-subtraction + on-payday debt:**

Reproduced exactly with John's state file. `safe = liveBal - dueTotal - immDebts + bonus - bucketSafe`:
- liveBal $11.72
- dueTotal $31.19 (Afterpay ✓)
- immDebts $217.50 (Mum-vet debt due May 15 — which IS payday)
- bucketSafe $96.62 (China Holiday bucket)
- = **-$333.59** ≈ what he saw

**Two bugs in one:**
1. **bucketSafe double-counts.** When user saves to a bucket, S.bal DECREASES + bucket.saved INCREASES. They're separate accounts. Subtracting bucketSafe in `safe` treats S.bal as INCLUDING bucket money — wrong, it doesn't. Removed bucketSafe from the formula.
2. **Mum-vet due ON payday shouldn't count as "before payday".** Salary lands the morning of payday + the bill comes out same day from new income; it doesn't compete with current balance. Used `due < paydayDate` (strict) instead of `<=` for this specific calc. (Doesn't touch `getActiveDebtsDueBeforePayday` itself — many other readers depend on the inclusive version.)

After r45: `safe = $11.72 - $31.19 - $0 + $0 = -$19.47`. Matches John's mental model.

**45b — Pace explainer concrete numbers:**

The r40 amber-tinted "what is pace?" card had a single-sentence definition. John FAIL: still not clear. Now uses his ACTUAL numbers from `getThisWeekProjection()` — Daily target / Expected by today / Actually spent / Result (over or under). The math is right there in the modal so the abstract definition becomes concrete.

Gates: 0 FAILs, 54/54 tests, 51/51 runtime PASS.

### Round 42 — Self-audit fixes (no phone-verify needed; bug-class)
After 5 consecutive feature pushes I paused per John's pre-authorisation note ("if you think you are pushing too much stop then analyse last 5 pushes and scan for errors"). Audit found three issues:

**42a — Debt Freedom within-bucket tiebreaker by daysUntil**
Round 39 sorted by urgency-bucket (overdue / ≤7d / ≤30d / longer), then strategy. But within a bucket, two debts could swap order based on strategy/priority even though one was clearly more imminent. E.g., Afterpay due May 14 and Michael due May 16 are both bucket=1, but Afterpay should still sort first. Fixed: within-bucket sub-sort now factors `daysUntil` BEFORE strategy/priority.

**42b — `_autoExpireDebts` now also runs at boot**
Round 35 added `_autoExpireDebts` to `onStateChange` — so expired endDate debts auto-flip `paid:true` on any state-change action. But if the user opens the app after a long absence with no immediate action, expired debts stay visible until they do something. Fixed: also called after `detectPaydayCycleRollover` in the post-load path (L2280-area) so first render is consistent.

**42c — Category row hidden when Type=Income/Savings**
Round 38 dropped 'Income / Refund' from `QUICK_CATS` (it's now a Type chip). But selecting type=Income syncs `ql-cat-hidden = 'Income'` while no chip in the visible row highlights — visually confusing. Fixed: `selectTxnType` now hides the entire `#ql-cat-field` when type is income/savings (the category is type-determined, no user choice needed). `openQuickLogModal` resets it visible at modal open.

Gates: 0 FAILs, 49/49 tests, 51/51 runtime PASS.

### Rounds 38–41 — Quick Log re-thought, Debt Freedom dynamic, pace explainer, BNPL polish
John phone-verify on rounds 35–37: 1 FAIL, 4 PASS-with-comments. Each round below addresses one item.

**Round 38 — Quick Log auto-focus removed + Type chips reorganised**
- (FAIL #1) Removed auto-focus on `ql-amt`. John: "the fix is just make it so nothing is auto tapped into — let me start typing when I'm ready." No focus → no keyboard → no screen bump on modal open. The focus-handler scroll-into-view still fires when the user does tap.
- (#2 follow-up) Type chips overhauled per user's mental model:
  - Removed `from-person` (now a debt tile, not a txn type) and `one-off` (it's just an expense — synonym noise).
  - Added `savings` (was being conflated with category=Savings; now first-class) and `income` (migrated from category 'Income / Refund').
  - Dropped 'Income / Refund ↑' from QUICK_CATS so it isn't a dual home.
  - `selectTxnType` now auto-syncs the category chip when type=income/savings — user doesn't have to set category separately.

**Round 39 — Debt Freedom timeline: due-date awareness + label clarity**
(#5 PASS-ish) John: "the calculation is not factoring due date — recommends to pay Michael in JAN something but that debt is due on Saturday." Plus: "explain what $126 a month is" and "financial freedom framing is wrong."
- New sort: urgency bucket first (overdue → ≤7 days → ≤30 days → longer), then user's `debtStrategy` (avalanche/snowball) within the bucket. Michael's $500 due Saturday now sorts ahead of higher-rate debts.
- Each phase shows a due-date chip: 🔥 Due today/tomorrow, ⚠️ Overdue, ⏰ Due in N days, or "Due in N days" plain.
- Labels: "$X/mo" now reads as `$X/mo surplus` (was ambiguous). Header subline: "Order = due-date urgency first, then your debt strategy. Each $/mo is your free surplus for that phase."
- Footer reframed: removed "investing $X/mo / financial freedom" language (John: not making him rich); now reads "Your monthly surplus jumps to $X/mo — no debt payments draining it. That money can finally go to savings, investing, or whatever else."

**Round 40 — Pace explainer "what does pace mean?" header**
(#3 PASS with question) Pace explainer modal now has a dedicated amber-tinted card at the top defining pace: "the daily-budget you'd need to hit by end of week. Over pace = spent more than that rate would predict. Under pace = on track or ahead."

**Round 41 — BNPL quick-add re-shaped per Afterpay reality**
(#4 PASS with changes) Reworked inputs:
- Dropped 6/8 instalment chips — Afterpay is standardised to 4. Chips now 1 / 2 / 3 / 4 (default 4).
- Label changed from "Instalments" to "Payments remaining" so John can backfill a plan he's mid-way through (his complaint: "most of my afterpays are up to 3 payments remaining but I cant track that").
- Input changed from "Total amount" to "Per-payment amount" — the user sees the per-payment figure on the Afterpay screen, not the total. App computes the rest.
- Preview now shows "Total left to pay" + "Next payment" + "Last payment (auto-stop)".

Gates: 0 FAILs, 49/49 tests, 51/51 runtime PASS.

(Scanner-routing item #4b — recognise Afterpay screenshots → auto-populate BNPL modal — deferred to a dedicated round; needs scanner pipeline changes beyond UI.)

### Rounds 35–37 — End-date support + BNPL quick-add + Debt Freedom timeline
Bigger asks from John's feedback batch after rounds 31–33. Memories from that turn (`feedback-slyght-info-density-discipline`, `feedback-slyght-text-contrast`) shaped the design choices below.

**Round 35 — End-date on bills + debts**

John: "I could add it as a recurring bill but then I need to remind myself after it's been paid for 4 weeks to delete, so there's no option to add an end date on a bill or debt."

- New optional `endDate` field on bill schema. Surfaced in bill-modal as "End date (optional — auto-stop after this)". `getExpandedBills` now filters via new `_isBillActiveAsOf` helper so expired bills disappear from all downstream consumers (calendar, week projection, monthly total) without per-renderer edits.
- New optional `endDate` field on debt schema. Surfaced in debt-modal as "Auto-clear on (optional)". Added to `BRAIN.debts.update` MUTABLE allow-set.
- New `_autoExpireDebts()` helper called from `onStateChange` (and the post-load path). Scans debts, marks `paid:true` via canonical writer when `endDate` passes. No clearance txn (cash didn't actually move today — metadata flip only). Audit emits `debt_auto_expired` summary.

**Round 36 — BNPL / Afterpay quick-add modal**

John: "nice feature for a debt logged as Afterpay for it to have a different modal when creating that bill is that the total amount and then how it gets broken down into 4."

- New `💳 BNPL` button next to `+ Add A Bill` in the Bills tab.
- New `bnpl-modal` captures: purchase name, total amount, instalment count (chip picker: 4 / 6 / 8), frequency (chip picker: fortnightly / weekly / monthly), first-payment date, auto-debit flag.
- Live preview panel shows the computed per-instalment amount + last-payment date as the user types.
- On Save: creates a recurring bill with `amt = total / instalments`, `freq` per chip, `endDate` calculated as `start + (instalments-1) × freq_days`, `tag: 'BNPL'`, `autoDebit` from checkbox.
- Result: one row to manage, auto-stops after the last instalment, John doesn't have to remember to delete it.

**Round 37 — Debt Freedom Estimate redesign**

John: "Debt freedom estimate in networth is retarded like as if I'm actually going to put away $95 a month for the rest of my life as if it's considering I'll always have these fixed bills with no growth etc."

Pre-r37 calc: `ceil(totalDebt / surplus)` — one number, "X months at $Y/mo surplus." Ignored that clearing a debt frees its monthly payment for the next debt.

Now a phased cascade:
- New `buildDebtFreedomProjection()` helper. Sorts manual-pay debts by user's `debtStrategy` (avalanche/snowball). For each debt: computes months-to-clear at the current surplus, projects clear date, captures the `monthlyPayment` it frees up.
- Each phase compounds: when debt 1 clears, its monthly payment joins the surplus for debt 2 → bigger surplus → faster clear.
- Rendered as a vertical timeline in the Net Worth modal — numbered nodes, debt name + clear date + monthly surplus + months, plus a "↑ Frees +$X/mo for next phase" note where applicable.
- Footer panel: "After all debts clear, you'd be investing $X/mo instead of paying off debt. That's $X×12/year."

Gates: 0 FAILs, 49/49 tests, 51/51 runtime PASS.

### Round 34 — Quick wins from John's feedback batch
Phone-verify on 31–33 returned 1/2/3/4/5 PASS. Item #3 PASS with question — "need to understand what this means - tappable or info tag etc". Plus a new feedback batch about Quick Log UX, bill frequency, and debt UX.

**34a — Bill frequency: quarterly / biannual / yearly added**
Pre-r34 the bill edit modal only offered Monthly / Fortnightly / Weekly even though `_monthlyEquivalent` already handles yearly / quarterly / biannual on the math side. Surface gap fixed — drop-down now has the full set with matching emojis to the QuickLog freq picker.

**34b — Quick Log "Type" field as chip bubbles**
John: "Type of transaction is confusing and just a text dropdown, would be cool to look a bit nicer." Replaced the native `<select>` with the same chip-row pattern the Category row already uses above it. Visual consistency + tappable bubbles. Hidden `ql-txn-type` input preserves the value contract for downstream save handlers. New `selectTxnType` helper mirrors `selectCat`.

**34c — Quick Log keyboard / amount-visibility fix**
John: "keyboard always opens on the transaction and bumps the screen up which is annoying and I can't see how much I'm entering."
Root cause: the existing `visualViewport` reposition translates the WHOLE overlay up by the keyboard height, but the modal's internal scroll position can be anywhere — the amount field can end up above the visible window. Fix: on `ql-amt` focus, scroll the modal to top + retry after the keyboard animation settles (~320ms).

**34d — Dashboard pace text is now tappable**
John on item #3: "need to understand what this means - tappable or info tag etc". The `Running $X over pace this week` line on the dashboard MAX-per-day card now has cursor:pointer + dotted underline hint + `onclick="explainWeekProjection()"` → opens the same math explainer modal the Bills tab "?" button uses (round 30). Same explanation either side.

Gates: 0 FAILs, 49/49 tests, 51/51 runtime PASS.

### Rounds 31–33 — Pace alignment, debt badge fix, Monthly Bills revamp
John feedback after rounds 29–30 surfaced three further issues. Two new memories saved on the same turn:
- `feedback-slyght-text-contrast` — grey-on-grey hurts; numbers always `--text`, labels `--text2`, `--text3` for decorative only
- `feedback-slyght-info-density-discipline` — before adding info to a tile, check: important? makes sense? fits 380px? conflicts with other tiles?

**Round 31 — Pace alignment between Dashboard and Bills tab**

John: "MAX per day text 'running over pace this week' is conflicting with the same message in bills tab in this week projection."

Two surfaces showed `Running $X over pace this week` with DIFFERENT $X values because they used different calcs:
- Dashboard: rolling 7-day average × daily-budget
- Bills tab: calendar-week (Mon→today) spent × expected daily × elapsed days

Now both read `getThisWeekProjection()` so they agree. Per the new info-density discipline memory, two tiles showing the same label with different numbers is worse than the info appearing once — even after the alignment, the dashboard pace line is shorter context (uses absDiff + simple direction).

**Round 32 — Debt tile badge squish fix**

John flagged screenshot: `🤖 AUTO` and `VIA RENT` badges from round 29 were squished into the 18×18 `.pri-badge` circle, wrapping internally as "AU/TO" vertical text and forcing the name into awkward two-line wraps.

Root cause: `.pri-badge` CSS was sized for single-digit priority numbers (1, 2, 3). Text labels overflow the fixed 18px width.

Fix:
- New `.dt-tag` class — pill-shaped, padded, sized to content, `white-space:nowrap`
- For viaRent / autoDebit debts, the tag renders on its OWN row above the name (full horizontal width for the 2-line name clamp)
- Priority-digit debts keep the inline 18×18 `.pri-badge` circle (round 29 behavior preserved)

**Round 33 — Monthly Bills visual revamp**

John: "Monthly Bills tile needs to be formatted better visually same revamp as you did for dynamic weekly projection."

Per the contrast feedback memory, the pre-round-33 render had `color:var(--text3)` on `var(--bg3)` everywhere — pretty but unreadable. Per the info-density discipline, `→ $7,594.23` was ambiguous (what is that number?). And visual consistency with the rest of the Bills tab was inconsistent (Due Today / This Week sections used `.bill-chip` day badges; Monthly Bills used plain text).

Fix:
- Reuse `.bill-row` + `.bill-chip` from Due-Today/This-Week sections — visual consistency across the tab
- Color-coded day chip: red if ≤3 days away, amber if ≤14, normal otherwise
- Date label: `--text2` not `--text3` (per contrast memory)
- Running balance: labelled `after this $X` (was bare `→ $X` arrow), with `$X` color-coded by runway health
- Header gets a `?` tap target → `explainMonthlyBills()` modal explaining chip color, running-balance meaning, "same as debt" tag, and monthly-total semantics
- Footer total: bold 16px monospaced + divider above

Gates: 0 FAILs, 49/49 tests, 51/51 runtime PASS.

### Rounds 29–30 — Surplus suggestion fix, dashboard/auto-sort parity, autoDebit flag, Week Projection redesign
John phone-verify on rounds 25–28: rounds 25/27/28 PASS; round 26 needed user help (added memory `feedback-phone-verify-instructiveness`). New bugs surfaced:

**Round 29 — Surplus + debt schema fixes**

*Surplus suggestion math display bug:*
- Pre-round-29 message hardcoded "after a $500 buffer" but actual buffer is dynamic ($0–$500 via `getDynamicBuffer` based on balance + committed). John's $336 balance produced buffer=$50, so "$99 spare after $500 buffer" implied $599 available when really there was ~$386 — message was lying about the math.
- Fix: read the actual `getDynamicBuffer()` value and render it in the message.

*Surplus suggestion targeting auto-debit debts:*
- Pre-round-29 the target picker included Afterpay — which auto-debits. Recommending manual action toward something that pays itself = dead advice.
- Fix: filter `!d.viaRent && !d.autoDebit`. If all remaining debts are scheduled/routed, the message changes to "Remaining debts are auto-debited or rent-routed — no manual payment needed. Consider sweeping it into a savings bucket."

*New `autoDebit` flag on debt schema:*
- Mirrors the bill-level `autoDebit` concept (BNPL / finance plans that auto-take from card).
- Add Debt modal: new checkbox "Auto-debits on due date (Afterpay, BNPL, finance plans)".
- Edit Debt modal: new checkbox "🤖 Auto-debits on due date (BNPL / finance plan)".
- `BRAIN.debts.update` MUTABLE allow-set extended.

*Dashboard / auto-sort parity:*
- Pre-round-29 dashboard filtered `!viaRent` → showed 3 debts. Auto-sort dialog showed all 4 (incl. Property Deposit). John flagged the count mismatch.
- Fix: dashboard now shows ALL non-paid debts (including viaRent). Per-debt visual mode differentiates them:
  - viaRent → amber theme, "VIA RENT" badge, "Rent-routed · $X/mo" status, no surplus-affordability warning
  - autoDebit → blue theme, "🤖 AUTO" badge, "Auto-debits dd/mm" status, no "Pay now" CTA
  - manual → standard red theme, surplus-affordability warning, "Pay now" or "Due dd/mm"
- IMMEDIATE total stays manual-only ($1,031) — viaRent debts don't inflate the headline.
- `autoSortDebts` score-adjusts: `+40` for autoDebit, `+60` for viaRent — manual-pay debts always sort first, scheduled/routed go last (matching prior behavior, now explicit).

**Round 30 — Dynamic Week Projection redesign (prettier + interactive)**

John's ask: "needs rework to be more pretty and interactive."

- Plain-text panel → card-based layout with:
  - Composition bar showing the 3 portions visually (Spent | Bills | Living) — color-coded segments
  - 3-column grid with color chips + labels + monospaced amounts
  - Large bold total + horizontal divider
  - Pace callout in its own colored sub-card (green if under pace, amber if over)
- New "?" tap target → `explainWeekProjection()` opens math explainer modal via `EDIT_MODAL.openInfo`:
  - Per-component cards (Spent / Bills / Living) with description of how each is computed
  - Equation line: `$X + $Y + $Z = $TOTAL`
  - Pace explanation with expected-pace math

Gates: 0 FAILs, 49/49 tests, 51/51 runtime PASS.

### Rounds 25–28 — Visual analysis fixes (post phone-screenshot review)
John shared 7 screenshots across Dashboard / Bills / Analysis / debts / Auto-sort dialog / Recent Spending with directive: "deep look at the photos, analyse each calculation, how info is displayed, is it pretty, interactive, does it make sense." Four concrete fixes landed in this push.

**Round 25 — Dynamic Week Projection math display**
Pre-round-25 displayed: `Projected daily: $6.11/day × 5 days = $4,004.55`. Mathematically false: $6.11 × 5 = $30.55, not $4,004.55. The right-side value silently included `billsDueThisWeek` from the row above. Now split into two lines:
- `Living (projected): $6.11/day × 5 days = $30.55` (the actual product)
- `Remaining to spend (bills + living): $4,004.55` (explicitly named, separated by a top border)

Description now matches calculation.

**Round 26 — Auto-sort native `confirm()` → custom modal**
Per manual §6 UX contract ("no native alert"). `autoSortDebts()` was using a native `confirm()` that showed "xetonx.github.io says" dialog — out of style with the rest of the app. Now uses `EDIT_MODAL.openCustom` with the same content rendered as styled rows showing rank + name + amount + due date + score. Save handler applies the priority order through `BRAIN.debts.update(d.id, {priority}, UPDATE_DEBT)` — unchanged behavior, native dialog gone.

**Round 27 — Debt card name truncation + lone-last-card layout**
Two-column `.debt-grid` with 3 debts left the lone-last card half-width with empty space to its right. Plus single-line `text-overflow:ellipsis` on `.dt-name` was clipping at ~50% viewport width — "Borrowed from Michael" and "Borrowed from Mum" both rendered as "Borrowed from ..." (indistinguishable on dashboard).
- New CSS: `.debt-tile:last-child:nth-child(odd) { grid-column: 1 / -1 }` → lone last card spans both columns
- `.dt-name` switched to 2-line clamp (`-webkit-line-clamp:2`) with `word-break:break-word` so compound names render fully

**Round 28 — "Today" filter per-day label is redundant**
Analysis "Where your money went" pivot showed `$8.65/day` next to category totals — but when the filter is "Today" (1 day), per-day rate equals the category total, so it's visual noise. Now skipped for `period === 'today'`; kept for 7-day / 30-day / all-time where the rate is meaningful context.

Gates: 0 FAILs, 49/49 tests, 51/51 runtime PASS.

### Round 24 — Dashboard hero "spent today" outflow visibility fix
Phone-flagged by John: "investigate dashboard note under balance saying amount spent today, ensuring that calculation is correct and not just mimicking recent spending but understanding the calculation based on description and updating accordingly."

**Bug:** the hero `#h-note` debt subline string-matched `t.cat === 'Debt repayment'` — only 1 of 4 debt categories. A $780 KIA Loan payment landed as `cat: 'Loan'` (Quick Log path) or `cat: 'Bills'` (mark-paid flow) — BOTH excluded from `getTodaySpent()` (strict discretionary) AND from the debt subline. Net effect: $780 outflow disappeared from the headline entirely; the dashboard said "Nothing spent today".

**Fix:**
- New canonical reader `todayOutflowsCanonical(now)` + `BRAIN.dashboard.todayOutflows()` — superset of `todayTxnsCanonical` that includes debt + bills + savings + loan + CC payment categories. Drops only income / corrections / round-ups. Registered in guardian-static's `TODAYSPEND_CANONICAL_FNS` allow-list.
- Hero note rewritten as a parts array: discretionary headline + optional debt subline (via `_DEBT_CATEGORIES_SET`) + optional bills subline. Any combination renders cleanly with `·` separators.
- Calculation now matches the description: "$X spent today" = strict discretionary (unchanged); "$Y in debt payments" = any of 4 debt cats; "$Z bills paid" = Bills cat.

**Architectural payoff:** guardian-static's `no-inline-todayspend-computation` rule caught my initial inline filter and forced the canonical-reader route — exactly what the rule exists for. Bundle 10's architectural barrier is paying for itself two bundles later.

Gates: 0 FAILs, 49/49 tests, 51/51 runtime PASS.

### Round 21 — Missed-migration cleanup + `BRAIN.config.setApiAlertThreshold`
Round 20's audit-table sweep surfaced 3 sites that should already have routed through existing canonical writers but were missed in prior bundles. Plus one inline-audited handler promoted to a proper canonical writer.

- `saveSuperBalance` → `BRAIN.assets.setSuperBalance` (existed since Bundle 24)
- `saveMumAccountBalance` → `BRAIN.assets.setMumAccount` (existed since Bundle 24). Drops the inline `PLAN.saveGoal` mirror call — the canonical writer already does that internally.
- `executeChatAction.update_super` → `BRAIN.assets.setSuperBalance` (source `CHAT` distinguishes AI-driven updates)
- New `BRAIN.config.setApiAlertThreshold(v, source)` — promotes the inline-audited Settings EDIT_MODAL save handler to the canonical pattern. `SETTINGS_API_ALERT_THRESHOLD` source.
- Gates: 0 FAILs, 51/51 runtime PASS.

### Round 20 — `BRAIN.audit.query` AI introspection helper
Closes a Noticed item surfaced after round 14 (BRAIN.chat): "natural follow-up is a `BRAIN.audit.query` reader so the AI agent can self-introspect." Now that 13 BRAIN bubbles emit consistent audit entries, this unlocks self-introspection patterns.

- `query({type?, typePrefix?, source?, sourcePrefix?, sinceTs?, untilTs?, predicate?, limit?})` — all filters optional, ANDed together
- Example use cases:
  - All chat events in last hour: `query({typePrefix:'chat_', sinceTs:Date.now()-3600000})`
  - WRX lifecycle this week: `query({typePrefix:'wrx_', sinceTs:weekAgo})`
  - User-initiated edits only: `query({sourcePrefix:'settings-', sinceTs:dayAgo})`
  - Last 10 cycle-related events: `query({typePrefix:'cycle_', limit:10})`
- Complements existing `recent(n)`, `since(ts)`, `summarizeRecent(ts)`
- Gates: 0 FAILs, 51/51 runtime PASS.

### Rounds 15–19 — Canonical-writer queue cleanout
Five-round push to close every remaining ❌ in the canonical-writer audit table (modulo the multi-flow `S.bal` partial which spans rounds 10–11 and the non-existent `S.kiaMinPayment` writer entry which was stale documentation).

**Round 15 — `BRAIN.config.setApiKey`** (`SETTINGS_API_KEY`, `CHAT_KEY_SET`)
- 4 direct-mutation sites collapsed (Settings EDIT_MODAL, `saveApiKey`, `saveChatKey`, `openChatKeyModal`)
- Centralises validation (`sk-ant` prefix) + localStorage mirror + audit
- Empty string is the canonical clear path (removes localStorage entry)
- Audit stores `<set>`/`<unset>` markers — never the raw key

**Round 16 — NOTIFY audit hooks** (`NOTIFY_ADD`, `NOTIFY_BATCH`, `NOTIFY_DISMISS`, `NOTIFY_CLEAR_ALL`)
- NOTIFY stays as its own module (not a BRAIN bubble) but `add` / `refresh` / `dismiss` / `clearAll` now emit `BRAIN.audit` entries on every state mutation
- AI agent + forensics can now see when notifications appeared, batch-generated, were dismissed, or cleared — without diffing `S.notifications`

**Round 17 — `BRAIN.cycle` bubble (13th)** (`CYCLE_PAYDAY_RECEIVED`, `CYCLE_PAYDAY_CLEARED`)
- `markPaydayReceived(source, opts)` / `clearPaydayReceived(source, reason)` / `isPaydayReceived()` / `getPaydayReceivedDate()`
- 3 sites migrated: `detectPaydayCycleRollover`, `confirmHeroBalEdit`, `monthlyResetCheck`
- Unifies the cosmetic-flag cleanup that was inconsistent across the legacy paths (`paydayBannerDismissed` was cleared by one path only, `paydayPlanAutoExpanded` by the other) — both now reset on every cycle-clear

**Round 18 — `BRAIN.audit.appendReconLog`** (`RECON_LOG_APPEND`)
- 2 sites in `confirmRecon` migrated
- Preserves the separate `S.reconLog` forensic log (capped 25, persisted across saves) AND mirrors each entry into the unified `BRAIN.audit` log so AI can see reconciliation events through one API

**Round 19 — KIA early-repay fee** (`KIA_FEE_EDIT`, `KIA_FEE_RESET`)
- `BRAIN.assets.setKiaEarlyRepayFee(v, source)` + `resetKiaEarlyRepayFee(source)`
- 2 sites in `commitKiaFee`/`resetKiaFee` migrated
- Reset preserves the `delete S.kiaEarlyRepayFee` semantics (signals "use default-derived 2-months-interest value")

Gates after each round: 0 FAILs, 41 unchanged future-proofing WARNs, 51/51 runtime PASS.

### Round 14 — `BRAIN.chat` bubble (12th BRAIN bubble)
AI integration is one of John's emphasized pathways and chat is its primary surface. Pre-round-14: 7 direct `S.chatHistory.push` sites in `sendChatMessage` (1 user + 4 error replies + 1 success + 1 catch-block error) + 1 `S.chatHistory = []` in `clearChat`. Zero audit coverage — the AI agent couldn't observe its own activity through `BRAIN.audit`.
- New `BRAIN.chat` namespace with `addUser(content, source)`, `addAssistant(content, opts, source)`, `clear(source)`, `list(predicate)`. `HISTORY_CAP=50` exposed as a constant; internal `_capAndSave` keeps push call sites trivial.
- 4 new SOURCES tags: `CHAT_USER_SEND`, `CHAT_ASSISTANT_REPLY`, `CHAT_ASSISTANT_ERROR`, `CHAT_CLEAR`. Errors get their own source + their own audit type (`chat_assistant_error` vs `chat_assistant_msg`) so forensics can spot API failures vs successful replies.
- **Privacy:** audit stores `length` not `content` — chat lives in `S.chatHistory` (capped 50, user can clear); audit log persists 500 entries and would otherwise leak private chat into other audit consumers (Settings export, AI agent's other reasoning paths).
- Migrated all 8 sites. Remaining `S.chatHistory =` is inside the canonical writer's `_capAndSave` and the load/migration path (both sanctioned).
- Gates: 0 FAILs, 51/51 runtime PASS.

### Round 13 — WRX state canonical writers
Closes a long-standing ❌ in the canonical-writer audit. Three independent direct-mutation sites for `S.wrx{Value,Status,ListedDate,SoldDate,SalePrice}`: `setWrxStatus()` global, `saveWrxValue()` Settings handler, chat actions `mark_wrx_listed` + `mark_wrx_sold`. Zero audit-log coverage pre-round-13 — WRX lifecycle events (listed → sold → KIA cleared) were invisible to forensics and the AI agent despite being one of John's highest-stakes flows.
- New `BRAIN.assets.setWrxValue(v, source)` — value-only setter (matches `setCarloan` shape, audits `wrx_value_change`)
- New `BRAIN.assets.setWrxStatus(status, opts, source)` — multi-field status flip (status / listedDate / soldDate / salePrice) with full before/after audit snapshot under `wrx_status_change`
- 2 new SOURCES tags: `WRX_VALUE_EDIT`, `WRX_STATUS_CHANGE`. Chat actions continue to use `BRAIN.SOURCES.CHAT` so chat-driven flips are distinguishable from manual UI flips in the audit log.
- `BRAIN.debts.allocateWrxProceeds` (proceeds allocation flow) left untouched — its inline `S.wrxStatus = 'sold'` is already audited via `wrx_proceeds_allocated` and is part of a multi-bubble composition.
- Gates: 0 FAILs, 51/51 runtime PASS.

### Round 12 — Txn delete idempotency (stable ts + clear-on-delete)
Closes OPEN-BUGS #43. Phone-reported by John: first delete bumped balance but didn't visibly delete; second tap deleted a different row and bumped balance again. Net: $200 over-credit on a $100 expense.

**Root cause:** the txn-edit-modal stored an array INDEX. After the first delete's splice shifted `S.txns`, `S.txns[idx]` pointed to a different row. A queued/rapid-tap second click on the still-rendered Delete button (closeModal + renderAll take a few ms on mobile) read that wrong row's ts and removed it.

**Two-layer defence:**
- Layer 1 (correctness): bind the modal to stable `txn-edit-ts` instead of fragile `txn-edit-idx`. After splice the same ts produces find-not-found instead of finding a different row. Migration touches editTransaction (writer), saveEditedTransaction (round 10 reader), deleteEditedTransaction (round 10 reader), convertEditedTransactionToLoan (reader).
- Layer 2 (robustness): clear the hidden ts field at the top of deleteEditedTransaction BEFORE confirm — a re-entry sees empty value and bails. Restored if user cancels confirm so an intentional later click still works.
- `removeByTsWithBalance` `not-found` reason now silently no-ops at the call site instead of showing the "Could not delete" alert — even if both defences are bypassed the user doesn't see an error popup.

**Drift recovery (unified):** John's live S.bal carries +$200 from this incident and any drift from #42's edit math. Path: dashboard hero balance edit → enter real bank balance → `runRecon` → `BRAIN.transaction.recordCorrection` creates an `_isCorrection:true` adjustment txn with `RECONCILE_CORRECTION` source. Audit log captures the recovery. No new code needed — the path was built for exactly this drift class.

Gates: 0 FAILs, 51/51 runtime PASS.

### Round 11 — `BRAIN.transaction.update` balance sign flip
Closes OPEN-BUGS #42. Phone-verified by John 2026-05-13: editing a $50 expense to $80 was moving balance UP $30 instead of DOWN $30. Centralisation from round 10 made this a single-site fix.
- One-line sign flip: `balDelta = (income ? -diff : diff)` → `(income ? diff : -diff)`
- Trace verified all 4 directions (expense ±, income ±)
- Drift recovery: John's accumulated drift can be reconciled via the existing dashboard hero balance edit which routes through `BRAIN.transaction.recordCorrection`
- Gates: 0 FAILs, 51/51 runtime PASS

### Round 10 — txn edit + delete canonical writers
Closes the biggest remaining ❌ in the canonical-writer audit. Pre-Bundle-28 `saveEditedTransaction` + `deleteEditedTransaction` were the last direct-mutation sites for `S.txns`; both bypassed BRAIN so the audit log missed every edit and the AI agent couldn't observe them.
- New `BRAIN.transaction.update(ts, patch, source)` — allows `amt`/`note`/`cat`/`ts` patches with balance reconciliation when amt changes. Math direction preserved from pre-Bundle-28; suspect sign on expense branch flagged in OPEN-BUGS #42 for phone-verify before flip.
- New `BRAIN.transaction.removeByTsWithBalance(ts, source)` — composes `removeByTs` (bare splice) with balance reconciliation, rolls back balance if inner removeByTs fails so half-applied state can't occur.
- 2 new SOURCES tags: `TXN_EDIT`, `TXN_DELETE`
- `saveEditedTransaction` rewritten as a thin wrapper that builds a patch object (only changed fields) and routes through the canonical writer
- `deleteEditedTransaction` rewritten as a thin wrapper around `removeByTsWithBalance`
- BRAIN.audit now captures `txn_update` (with before/after + balDelta) and `txn_remove_balance_reconciled` (with balDelta) events
- Gates: 0 FAILs, 51/51 runtime PASS

### Deferred to later bundles
- Debt tile cut-off CSS layout (design pass)
- Add Goal modal — keyboard pushes Save off-screen (mobile keyboard handling)
- Bundle 29: `BRAIN.transaction.update` for `saveEditedTransaction` + `deleteEditedTransaction`
- Bundle 29: `BRAIN.assets.setWrxState` unified writer
- Bundle 29: `BRAIN.config.setApiKey` writer + NOTIFY→`BRAIN.notifications`
- Bundle 29: KIA Loan ground-truth reconciliation (Firstmac CSV)
- Bundle 29: Net Worth Trend math fix (OPEN-BUGS #13)
- Bundle 30+: Rules-as-data refactor

---

## Bundle 27 hotfix 2 — 2026-05-13 03:02 AEST
Defensive fixes shipped after Bundle 27 ship.
- `savingsObj` ReferenceError fix
- Drift banner divide-by-zero guard
- Commit: `14ed28e`

## Bundle 27 hotfix 1 — 2026-05-13 02:56 AEST
- Defensive `openPaydayPlan`
- New guardian runtime check (wiring verification)
- Commit: `05c8980`

## Bundle 27 — Payday Plan Canvas — SHIPPED 2026-05-13 (overnight)
**Theme:** New Payday Plan canvas surface + `BRAIN.plan` bubble (11th bubble).

- **Phase 0** (`2af1c12`): `BRAIN.plan` bubble + 22 source tags + `seedV24`
- **Phases 1+2** (`2e43afc`, `7688fc1`): Canvas skeleton + sub-screen scaffolding; inline-style override fix; redundant trip nudges dropped
- **Phase 3** (`14fd35a`, `67e8fbf`): Sub-screen contents read-only; bills cycle-window fix; savings clarity; provision filter
- **Phase 3.5** (`c22ddb6`): PLAN overflow fix + canvas root breakdown
- **Phase 4** (`7c4420c`, `35fed51`): Interactive editor modals + BRAIN-wired saves; z-index fix; `BRAIN.bills` canonical reader
- **Phase 5** (`78056a2`): Tick wiring + real balance reflection
- **Phase 6** (`228f6db`): Bonus modal + auto-allocate + lock/unlock flow
- **Phase 6.1** (`ec50e0c`): Deferred-bill carry-over + canvas-wide undo
- **Phase 6.2** (`bfeba8e`): Five verify fixes (debt edit, undo persistence, trips, buffer, refresh)
- **Phases 7+8** (`0d46237`): AI plan context + drift banner + onboarding + closeout
- Phone-verify: PASS at ship (carry-over issues addressed in Bundle 28 hygiene phase)

## Bundle 26 — 2026-05-13 (early overnight)
**Theme:** Surplus waterfall + coaching + Allocate Payday sub-screen.

- **26.1** (`a65623a`): API key resilience + Diagnostics buttons fix
- **Phase 1** (`25b23a0`): Surplus waterfall + smart coaching + trip nudges
- **Phase 1.5a** (`f777149`): Plain-language coaching + info buttons everywhere
- **Phase 1.5b** (`edfe3e2`): Allocate Payday sub-screen + `BRAIN.allocation` bubble

---

## Backfill note (2026-05-13)

This CHANGELOG was created on 2026-05-13 per `CC-PRINCIPAL-ENGINEER-MANUAL.md` §8 ("CHANGELOG.md — Top-level entry per bundle"). Bundles 26 / 27 / 28 were back-filled from `git log` and `BUNDLE-NN-NOTES.md`. Older bundles (1–25) are not back-filled — their record lives in commit history and historical notes under `archive/`. New bundle entries will be added inline as part of each session's pre-ship checklist (manual §3 Step 7).
