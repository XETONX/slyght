# CHANGELOG

> Per-bundle ship log. Format per `CC-PRINCIPAL-ENGINEER-MANUAL.md` §8.
> Newest entries at top. One section per bundle.
>
> For phase-level engineering notes during in-progress bundles, see `BUNDLE-NN-NOTES.md`.
> For superseded ship prompts and design docs, see `docs/archive/` (going forward) or `/archive/` (pre-Bundle-28 historical).
> For architecture decisions, see `docs/adr/`.
> For pre-implementation designs, see `docs/sdd/`.

---

## Bundle 28 — IN PROGRESS (started 2026-05-13 13:33 AEST)

**Theme:** PLAN-mode deep dive + canonical-writer migration of the intent layer.

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
