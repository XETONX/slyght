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
