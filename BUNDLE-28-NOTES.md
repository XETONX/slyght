# Bundle 28 — Working Notes

> Running ledger maintained during Bundle 28 implementation.
> Captures: code observations, outside-the-box ideas, deferred work,
> session-spanning context. Sibling to MISSION-BUNDLE-28 + AUDIT-A1.

---

## Phases shipped (in order)

| Commit | Phase | What |
|---|---|---|
| `22ef496` | 28.0 | PLAN.intents canonical entity + seedV25 migration (additive, no UI) |
| `65289c5` | 28.0.1 | Hygiene quick wins: B28-1/2/3/12/15 + helpers (_paydayExitToTab, _paydayProgressBar, openEditPaydayKiaExtra) |
| `6eb7034` | 28.0.1+ | Round 3 forward fixes: "+ Add bucket" → openAddBucketModal, footer label, KIA toast try/catch |
| `bdda17b` | 28.0.2 | **z-index sandwich fix** — `.modal-overlay` 200→600, `.recon-overlay` 300→620, `showToast`/`undo-toast`/`offline-badge` 400/500→800. Closes the entire layering bug class for any modal/toast opened above the canvas. |
| `b7fb6ed` | — | Layer V captures #41+#42 visually verifying the z-index fix |
| `381735d` | 28.2/0.5/0.6 | PLAN-mode tile reorder + canonicalise renderers (`buildSpendingPivot`) + Ask AI auto-fill |
| `16726cd` | — | `BRAIN.transaction.reclassify` + Convert-to-Loan + MAX PER DAY tappable + delete `renderSavingsBuckets` dead code |
| `1a3b80d` | — | Bucket lifecycle canonical writers (`BRAIN.savings.addBucket/updateBucket/removeBucket`) + 4 callers migrated |
| `1268e24` | round 5 | Ask-AI math + Analysis filter + Convert-loan + bucket↔intent link + delete buttons on trip/goal/bucket cards |
| `2d4e85f` | round 6 | **PLAN_MODAL hoisted out of `#plan-mode` stacking context** (root cause of round-4 sandwich recurrence); Analysis filter applied at real renderer `buildSpendingPivot`; delete-goal handler; Ask-AI prompt refocused with dates |
| `977e04a` | round 7 | Debt category fragmentation tip + goal-edit refreshes canvas + Ask-AI math breakdowns + MAX PER DAY explainer rebuilt |
| `9de16dc` | round 8 | Delete-goal full cycle (intent removal + canvas refresh — previously missed) + `FEATURE-MAP.md` directory |
| `a1b0ce2` | round 9 | Delete affordances in canvas (trip + bucket — sibling-card audit miss) + MAX PER DAY rich HTML cards + debt-tip hierarchy reformat |
| `315431c` | infra | Manual moved into repo (`CC-PRINCIPAL-ENGINEER-MANUAL.md`) + `docs/{adr,sdd,archive,manual-amendments,ops}/` scaffolded + `CHANGELOG.md` initialised with back-fill |
| `57a3d72` | gate-cleanup | Cleared 2 pre-existing FAILs (`no-hardcoded-bill-name` L12118, `no-third-discretionary-filter-array` L14846) + AMENDMENT-001 (structured Noticed format) |
| `8d3dea8` | round 10 | Canonical writers `BRAIN.transaction.update` + `BRAIN.transaction.removeByTsWithBalance` + migrated `saveEditedTransaction` + `deleteEditedTransaction`. Closes the biggest remaining ❌ in the canonical-writer audit. OPEN-BUGS #42 logged for suspect-sign math direction (math preserved for now, flip after phone-verify confirms). |
| `5473366` | round 11 | Phone-verified OPEN-BUGS #42 confirmed (John: "editing to $80 brings it back up instead of further down"). One-line sign flip in `BRAIN.transaction.update`. Centralisation from round 10 made this a single-site change instead of touching every caller. |
| `a2094d5` | round 12 | OPEN-BUGS #43 — txn delete idempotency. John saw $200 drift from one rapid-tap delete. Pre-round-12 modal stored array idx; after first splice idx pointed at different row; second tap deleted wrong row + bumped balance again. Fix: migrate hidden field idx → stable ts + clear-on-delete + silent no-op on not-found. Drift recovery path documented in OPEN-BUGS #42/#43 (dashboard hero balance edit → `recordCorrection`). |
| `71375d1` | round 13 | WRX state canonical writers: `BRAIN.assets.setWrxValue` + `BRAIN.assets.setWrxStatus`. Migrated 3 sites (`setWrxStatus` global function, `saveWrxValue`, chat actions `mark_wrx_listed` + `mark_wrx_sold`). Audit log now captures WRX lifecycle (listed → sold → KIA cleared) — John's highest-stakes flow with zero observability pre-Bundle-28. |
| `6bc8158` | round 14 | New `BRAIN.chat` bubble (12th bubble): `addUser` / `addAssistant` / `clear` / `list`. Migrated 7 push sites in `sendChatMessage` (1 user, 4 error, 1 success, 1 catch) + 1 clear in `clearChat`. AI integration pathway is now on the canonical writer + audit. Privacy: audit stores message `length` not `content` (audit log holds 500 entries, chat content stays in `S.chatHistory` capped at 50). |
| `a3b615b` | rounds 15–19 | Canonical-writer queue cleanout. Round 15: `BRAIN.config.setApiKey` (4 sites migrated, centralised localStorage mirror + audit). Round 16: NOTIFY audit hooks on `add`/`refresh`/`dismiss`/`clearAll`. Round 17: new `BRAIN.cycle` bubble (13th) for `paydayReceived` lifecycle (3 sites; unifies cosmetic-flag cleanup). Round 18: `BRAIN.audit.appendReconLog` mirrors reconLog into unified audit. Round 19: `BRAIN.assets.setKiaEarlyRepayFee` + `resetKiaEarlyRepayFee`. All remaining ❌s in the canonical-writer audit table closed (except S.bal partial which spans many flows and S.kiaMinPayment which has no writer surface). |
| `<next>` | round 20 | `BRAIN.audit.query(criteria)` — full-filter AI introspection helper. Supports `type` / `typePrefix` / `source` / `sourcePrefix` / `sinceTs` / `untilTs` / `predicate` / `limit` (all optional, ANDed). Unlocks queries like "every chat event in the last hour" (`typePrefix:'chat_', sinceTs:Date.now()-3600000`), "all WRX-related state changes this week", "txn edits by canonical writer since Tuesday". Closes a Noticed item from round 14 ("natural follow-up is a `BRAIN.audit.query` reader so the AI agent can self-introspect"). |
| `7db306e` | round 72 P0.1 | Bonus persistence through `rolloverIfNeeded` (SDD-2026-05-14-bonus-rollover-preserve). `prevPlan.income.bonus` carries to `newPlan` when `status='expected'`. New audit type `plan_bonus_carried_to_new_cycle`. Toast on rollover includes carry. Root cause of John's recurring "bonus wipes on re-open" complaint. |
| `7db306e` | round 72 P0.2 | `BRAIN.plan.markPaydayLanded(ts, source)` (SDD-2026-05-14-mark-payday-landed). New canonical writer, new SOURCES tag `PAYDAY_MANUAL_LANDED`, canvas-root pill affordance + wrapper `markPaydayLandedToday`. Defers to `BRAIN.cycle.markPaydayReceived` for `S.paydayReceived` flag — no duplicate writer logic. Plus cycle-end-day copy fix ("0 days left" → "Cycle ended — next payday begins this cycle"). |
| `b91ec2f` | round 72 R1 | Intent-driven goal subtitle on canvas Savings sub (SDD-2026-05-14-intent-driven-goal-subtitle). Reverse-lookup bucket → intent → goalDef. Property Deposit renders as "Other savings goals · via Mum-managed savings"; Freedom Buffer renders as "Freedom Buffer · stored in Rainy Day Fund". Modal title gets goal-context. Override schema unchanged. Tier-3 full redesign queued Bundle 29 Mother-redesign theme. |
| `f651d59` | round 72 R2 | PLAN-tab Annual Provisions converted to single nav-row "🏦 Manage provisions · $X/mo · N items ›" → `openManageProvisions` modal with per-row edit. Canvas Essentials remains the read surface (r47); PLAN-tab nav is the manage surface. Single source of truth. |
| `f651d59` | round 72 R3 | Canvas Mum-summary bubble dropped (r46 deliberate, John 2026-05-14 confirmed redundant). Proportion bar caption promoted to coloured-dot legend with category labels. Closes "red and blue bar has no legend" properly. |

---

## Observations carried over (not yet fixed)

### Code-level

- **Stale `S.tripDefs` / `S.goalDefs` mirror after seedV25** — Phase 0 leaves the legacy arrays in place so `PLAN.getTrips`/`getGoals` shims keep working unchanged. Bundle 29 candidate: drop the legacy arrays once readers migrate.
- **`renderSavingsBuckets` is dead code** — function exists at L6783 but its target `#savings-buckets-content` doesn't exist in the new IA's DOM. Always returns early. Safe to delete in a hygiene round.
- **`renderAll` calls `renderAnalysisTab` when `pg-spend` is active** (L5017) — `pg-spend` is the Analysis tab (legacy naming). Future rename for clarity: `pg-spend` → `pg-analysis`.
- **`getGenuineSurplus()` (L2292) coexists with `BRAIN.plan.getSnapshot`** — legacy and canonical. Audit A1 noted this. Bundle 29 candidate: migrate callers, delete legacy.
- **MI-13 banner not visible in fresh fixture** — Layer V step "open MI-13 details" reports the banner isn't there. Could be that the fresh state doesn't trigger MI-13. Note for testing: build a fixture that triggers each invariant for full visual-regression coverage.
- **`getDiscretionarySpend` (lax filter) vs `computeSpentInRange` (strict filter)** — two parallel discretionary calculations. Source of OPEN-BUGS #6/#7/#8. Phase 28.0.5 territory.

### UX-level

- **"Savings" lives in two places** — Payday canvas Savings sub-screen (cycle allocation) AND should live in PLAN mode (long-term storage per John's feedback). Currently bucket-edit UI is buried behind a dead DOM ID (#savings-buckets-content). Bundle 29 candidate: surface buckets in PLAN mode root.
- **Borrowed-from-person flow is fragile** — John mistagged $500 Mum-loan as Income, double-counted with debt entry. Fix candidates: (a) new "Loan from person" category that auto-creates a debt + cash entry atomically, (b) AI nudge after recon: "this looks like a loan from a person, want to reclassify?".
- **TIGHT-mode classification can mislead** — when borrowed money is logged as income, the math is wrong but the classification was correctly responding to the wrong inputs. Possible add: weight debts by urgency (days until due) when computing immediate-pressure mode.
- **Auto-allocate has no preview** — user has no way to see what auto-allocate WILL do before committing. Phase 28.5 covers Full/Remainder modes but not preview UI. Note for Phase 28.5+: show a diff card before commit.

---

## Outside-the-box ideas (sparked while looking at code)

- **Sticky toast for critical actions** — balance corrections, payday-lock, etc. could persist 5-10s with an "Undo" button instead of 3s silent fade. Increases trust + recovery.
- **Long-press to expose edit/delete on txn rows** — current tap opens edit modal. Long-press could surface delete inline without opening modal. Faster correction path.
- **Optimistic UI on tick** — current tick has a brief delay while BRAIN.plan.tickItem runs. Make the tick visually flip immediately, then re-render after commit. Feels snappier.
- **AI as reclassification suggester** — when balance recon fires with a diff matching a recent income txn within $5, AI could surface: "this balance bump matches your recent +$500 logged 1 hour ago. Was that a loan from someone?" — would have caught John's Mum-loan mistag.
- **Time-frame zoom on every number** (P3 from REWRITE-COMPARISON §19) — tap any $X to see "this is $X this cycle / $Y this month / $Z this year". Universal pattern, Bundle 29+.
- **PLAN-mode "story mode"** — narrate the user's money journey via the plan: "Your next 14 days: rent leaves on day 4, salary lands day 15, China bucket grows $40 mid-cycle..." Conversational summary of the plan a-z. Could pipe through AI.
- **Heartbeat-based stale-data warning** — if balance hasn't been updated in 7+ days, banner: "Last balance update: 8 days ago. Tap to refresh."
- **Snapshot-on-Quick-Log toggle** — power-user feature, snapshot every txn for max recoverability.

---

## Deferred to later bundles (with reasoning)

| Item | Defer to | Why |
|---|---|---|
| Phase 28.7 TDZ cleanup at L1646/11246/13111 | TBD | Audit-log entries from those line refs are stale (lines shifted post-Phase 0). New entries should stop accumulating. Revisit if NEW errors appear post-Phase-0. |
| Savings-buckets in PLAN mode root | Bundle 29 | Cross-surface UX work; needs design pass. |
| `getGenuineSurplus` migration | Bundle 29 | Audit A1 §3 leverage debt #3; needs care to not break Dashboard surplus card. |
| Phase 7 worker crons (weekly digest, end-of-cycle recap, deferred-rollover) | Bundle 29 | CF Worker repo work; outside slyght/. |
| Borrowed-from-person canonical flow | Bundle 29 | Schema design — needs "loan from person" category that atomically creates txn + debt. |
| KIA Loan ground-truth reconciliation ($14,486 under-report) | Bundle 29 | Memory entry `slyght_kia_loan_ground_truth.md` documents. Needs Firstmac CSV import path. |
| Net Worth Trend math fix (OPEN-BUGS #13) | Bundle 29 | Memory entry `slyght_nw_trend_off_by_orders.md`. |
| Rules-as-data refactor | Bundle 30 | Audit A1 §5.5 strongest-shift. Big scope. |
| Cloud sync (Gist) | Bundle 23 (post-28) | Per Audit A1 §6 sequence. |

---

## Noticed-item discipline (per AMENDMENT-001 proposal, 2026-05-13)

Every end-of-session "Noticed" item now follows the structured format:

`[priority] [type] <observation> → ACTION: <what> → WHEN: <this session | next code-touching round | Bundle NN | by <YYYY-MM-DD>>`

- "WHEN" must be concrete. No "TBD", "later", or "soon".
- If actionable in-session and not blocked, action it and report as shipped (not noticed).
- Future-bundle items get echoed into that bundle's deferred table.

### Retroactive application to 2026-05-13 surfacing (commit `315431c`)

1. **[MEDIUM][gate-fail] `no-hardcoded-bill-name` L12118 Teachers Health**
   → ACTION: add `guardian-allow-block` justifying TDZ-driven duplication
   → WHEN: this session → **shipped in next commit** ✓
2. **[MEDIUM][gate-fail] `no-third-discretionary-filter-array` L14846**
   → ACTION: promote `_DEBT_CATS` to module-level `_DEBT_CATEGORIES_SET` canonical
   → WHEN: this session → **shipped in next commit** ✓
3. **[LOW][infra] 116 untracked Layer V PNGs in `captures/`, not gitignored**
   → ACTION: decide policy — gitignore + LFS for ship-blocking ones, or commit all
   → WHEN: Bundle 29 hygiene phase (LOW because they don't gate; storage cost only)
4. **[LOW][debt] `scripts/bundle-15.2-cleanup.js` one-off untracked**
   → ACTION: move to `archive/scripts/` or delete after confirming idempotent re-run not needed
   → WHEN: Bundle 29 hygiene phase

---

## Artifact discipline going forward (per manual §8 + §3 Step 7)

Established 2026-05-13 alongside Bundle 28 infra commit (manual moved into repo + `docs/` scaffolded + `CHANGELOG.md` initialised).

**Session-end checklist additions** (these now run BEFORE every `git push`):

1. **`CHANGELOG.md`** — append phase/round entry under the active bundle's section. New bundle = new H2 section at the top. Format per manual §8. Include commit SHAs + phone-verify status.
2. **`FEATURE-MAP.md`** — if a surface was added/moved/deleted, update the directory section. If a self-correction lesson emerged, add to Self-correction queue.
3. **`docs/adr/ADR-NNN-*.md`** — write BEFORE the architectural commit (not after). One ADR per decision.
4. **`docs/sdd/SDD-YYYYMMDD-*.md`** — write BEFORE non-trivial implementation. Trivial fixes don't need SDDs — note in active `BUNDLE-NN-NOTES.md`.
5. **`docs/manual-amendments/AMENDMENT-NNN-*.md`** — when a recurring mistake emerges, propose an amendment per manual §15 (don't silently edit the manual).

**Folders to create on first use** (per manual §5 — "create when first needed, don't dump in root"):
- `docs/adr/` — scaffolded with README 2026-05-13. First ADR pending.
- `docs/sdd/` — scaffolded. First SDD pending.
- `docs/archive/` — scaffolded. For going-forward superseded docs (pre-Bundle-28 archive lives at `/archive/`).
- `docs/manual-amendments/` — scaffolded. First amendment pending.
- `docs/ops/` — scaffolded. First runbook pending (snapshot-restore + redeploy are good candidates).

**Authority ranking** (per manual §0): manual outranks ship prompts outranks ruflo-init `slyght/CLAUDE.md`. When `CLAUDE.md` conflicts with manual practice (e.g. it says "never save MDs to root" but slyght's pattern is root MDs), manual wins.

---

## Phase 28.2 — tile reorder (executing this turn)

- Swap L17546 (renderWrxCard) with L17550 (renderAllocateTile) in renderPlanMode
- Update inline tile-order comment to reflect time-axis principle from MISSION §3.2
- Layer V baseline capture before/after

## Phase 28.0.6 — Ask AI auto-fill (executing this turn)

User asked: "should chat box be auto filled with a prompt regarding allocation plan for payday? and then AI has access to that specific model and all information to actually discuss with me what to do, what auto allocation suggests, what trips i have upcoming, bills, unexpected purchases that has advised me to be more cautious this month etc etc?"

Approach:
- On `openPaydayAskAI`, navigate to chat as before
- Pre-fill the chat input with a templated question that:
  - Asks the AI to walk through the current cycle's plan
  - Cites the user's payday in N days, free amount, top intent, top debt
- Auto-submit OR leave for user to send (user choice — defer to leave-for-user for safety; lets them edit before sending)
- Chat system prompt already has full BRAIN.plan.getSnapshot context (Bundle 27 Phase 7)

## Phase 28.0.5 — cross-tile canonicalisation (executing this turn)

Audit-first approach:
1. Identify the 5 renderers and what each computes today
2. For each, determine if it diverges from MODEL.todaySpent / canonical helper
3. Migrate only the divergent ones (don't change what's already aligned)
4. Add Layer 1 rule `cross-tile-metric-canonical`

---

## Cross-reference inspection queue (per John 2026-05-13)

> Directive: every feature/data-store/text-box needs (a) a semantic
> relation reference, (b) a BRAIN canonical writer hook so audit log
> captures changes + AI agent can read/write, (c) clean data flow in
> AND out. When I touch a tile, flag the pathways that touch it for
> inspection.

### Pathways made canonical this turn ✓

- `convertEditedTransactionToLoan` → routed through new `BRAIN.transaction.reclassify(ts, patch, source)` writer. Audit log captures before/after shape. AI agent could call this method directly. ✓
- `renderTrend` + `renderCatBreakdown` + dashboard pace tile → routed through `getDiscretionaryByCategory` / `computeSpentInRange` canonical helpers. ✓
- `_buildPaydayAskAIPrompt` → reads `BRAIN.plan.getSnapshot()`. Pure, canonical. ✓
- `explainMaxPerDay` → reads `getLiveBal`, `MODEL.daysToPayday`, `getBillsDue`, `getActiveDebtsDueBeforePayday`, `getTodaySpent`. All canonical readers (modulo legacy fn names — see below). ✓

### Whole-app canonical-writer audit (John 2026-05-13: "CURRENT AND PLAN")

Mapped every direct `S.X = ...` / `S.X.push` / `S.X.splice` site. Categorised
by what state they touch. ✓ = canonical writer in place, ❌ = direct mutation
(needs BRAIN method), ⚙️ = sanctioned (load/seed/migration), 🔄 = added this
session.

**Entity collections (highest stakes — multi-reader state)**

| Field | Direct sites | Canonical writer | Status |
|---|---|---|---|
| `S.txns` (push) | 1 (BRAIN.transaction.record body) | `BRAIN.transaction.record` | ✓ |
| `S.txns` (mutate field) | `saveEditedTransaction` 🔄 | `BRAIN.transaction.update` 🔄 (Bundle 28 round 10) | ✓ this session |
| `S.txns` (reclassify) | `convertEditedTransactionToLoan` 🔄 | `BRAIN.transaction.reclassify` 🔄 | ✓ this session |
| `S.txns` (splice) | `deleteEditedTransaction` 🔄 | `BRAIN.transaction.removeByTsWithBalance` 🔄 (Bundle 28 round 10) | ✓ this session |
| `S.debts` | All canonical via `BRAIN.debts.{add,markPaid,unmark,update,delete}` | ✓ |
| `S.paidBills` | All canonical via `BRAIN.bills.{markPaid,unmark}` + helpers | ✓ |
| `S.savingsBuckets` (push add) | `saveNewBucket` 🔄 | `BRAIN.savings.addBucket` 🔄 | ✓ this session |
| `S.savingsBuckets[i].saved` | All canonical via `BRAIN.savings.setBucketSaved` | ✓ |
| `S.savingsBuckets[i].{name,goal,account,notes}` | `saveBucketModal` 🔄 | `BRAIN.savings.updateBucket` 🔄 | ✓ this session |
| `S.savingsBuckets` (splice) | `deleteBucket` 🔄 + `confirmDeleteGoal` 🔄 | `BRAIN.savings.removeBucket` 🔄 | ✓ this session |
| `S.planIntents` | `BRAIN.plan.intent.{add,update,remove,setBucket}` | ✓ Phase 0 |
| `S.activePlan` (overrides/ticks/savings/floors) | `BRAIN.plan.{setOverride,clearOverride,tickItem,untickItem,...}` | ✓ Bundle 27 |
| `S.tripDefs` / `S.goalDefs` | `PLAN.saveTrip` / `PLAN.saveGoal` (legacy non-BRAIN) | ⚠️ legacy shim — Bundle 29 migrate to BRAIN.plan.intent |
| `S.notifications` | `NOTIFY.{add,dismiss,clearAll,refresh}` 🔄 | NOTIFY methods now emit `BRAIN.audit` entries on every mutation (Bundle 28 round 16). Not a separate bubble — NOTIFY stays as its own module but is now observable through `BRAIN.audit`. | ✓ this session |
| `S.reconLog` | `confirmRecon` 🔄 | `BRAIN.audit.appendReconLog(entry, source)` (Bundle 28 round 18) — keeps the separate forensic log AND mirrors into the unified audit log. | ✓ this session |
| `S.chatHistory` | `sendChatMessage` 🔄 (7 sites) + `clearChat` 🔄 | New `BRAIN.chat` bubble — `addUser` / `addAssistant` / `clear` / `list` (Bundle 28 round 14). Audit captures length not content for privacy. | ✓ this session |

**Scalar fields (single value)**

| Field | Canonical writer | Status |
|---|---|---|
| `S.bal` | `applyBalanceCorrection` + handler-specific math | ⚠️ partial — many flows touch directly (round-up, bill-paid, txn-edit, snapshot restore) |
| `S.income` / `S.payday` / `S.weekdayBudget` / `S.weekendBudget` | `BRAIN.config.set{Income,Payday,WeekdayBudget,WeekendBudget}` | ✓ Bundle 22 v3 |
| `S.debtStrategy` | `BRAIN.config.setStrategy` | ✓ Bundle 22 v3 |
| `S.roundUpDestination` | `BRAIN.savings.setRoundUpDestination` | ✓ Bundle 22 v3 |
| `S.roundUpsEnabled` | `BRAIN.config.setRoundUpsEnabled` | ✓ Bundle 22 v3 |
| `S.mumAccountBalance` / `S.superBalance` / `S.cc` / `S.ccLimit` / `S.carloan` / `S.carloanOriginal` | `BRAIN.assets.set{Mum,Super,Cc,CcLimit,Carloan,CarloanOriginal}` | ✓ Bundle 24 (pending full extraction) |
| `S.wrxStatus` / `S.wrxValue` / `S.wrxSalePrice` / `S.wrxListedDate` / `S.wrxSoldDate` | `setWrxStatus()` 🔄, `saveWrxValue()` 🔄, chat actions 🔄 | `BRAIN.assets.setWrxStatus(status, opts, source)` + `BRAIN.assets.setWrxValue(v, source)` (Bundle 28 round 13) | ✓ this session |
| `S.apiKey` | `Settings EDIT_MODAL` 🔄 + `saveApiKey` 🔄 + `saveChatKey` 🔄 + `openChatKeyModal` 🔄 | `BRAIN.config.setApiKey(key, source)` (Bundle 28 round 15). Centralises validation + localStorage mirror + audit. Audit stores `<set>`/`<unset>` markers — never the raw key. | ✓ this session |
| `S.paydayReceived` / `S.paydayReceivedDate` | `detectPaydayCycleRollover` 🔄 + `confirmHeroBalEdit` 🔄 + `monthlyResetCheck` 🔄 | New `BRAIN.cycle` bubble — `markPaydayReceived` + `clearPaydayReceived` (Bundle 28 round 17). Unifies cosmetic-flag cleanup (paydayBannerDismissed + paydayPlanAutoExpanded). | ✓ this session |
| `S.kiaEarlyRepayFee` | `commitKiaFee` 🔄 + `resetKiaFee` 🔄 | `BRAIN.assets.setKiaEarlyRepayFee` + `resetKiaEarlyRepayFee` (Bundle 28 round 19). Reset preserves the `delete S.kiaEarlyRepayFee` semantics (signals "use default-derived value"). | ✓ this session |
| `S.kiaMinPayment` | (no writer surface in code — stale audit entry) | N/A | ⚙️ N/A — no actual writer site found |
| `S.lastOpenDate` | Direct (L2754) | ⚙️ infrastructure, low value |
| `S.pinHash` | Direct (L1757) | ⚙️ security |
| `S._auditLog` | `BRAIN.audit.append` | ✓ |

**Migration priority for Bundle 29+** (highest value first)

1. `BRAIN.transaction.update(ts, patch, source)` — for `saveEditedTransaction`. Allows amt + handles balance recompute.
2. `BRAIN.transaction.removeByTsWithBalance` — for `deleteEditedTransaction`.
3. `BRAIN.assets.setWrxState(status, salePrice, listedDate, soldDate, source)` — unified WRX writer.
4. `BRAIN.config.setApiKey(key, source)` — with secret-handling discipline.
5. `BRAIN.cycle` — new bubble for paydayReceived flag + cycle lifecycle.
6. `BRAIN.chat.append(entry, source)` — for chatHistory growth.
7. `NOTIFY` → `BRAIN.notifications` extraction.
8. Layer 1 rule `no-direct-savings-buckets-push-splice` — to prevent regression of the migrations above.

### Pathways flagged for inspection (data flow not yet clean)

| Pathway | Currently | Should be |
|---|---|---|
| `saveEditedTransaction` (L4189) | Direct `txn.amt = ...`, `txn.note = ...`, `txn.cat = ...`, `S.bal = ...` direct mutation | New `BRAIN.transaction.update(ts, patch, source)` writer (similar shape to `reclassify` but allows `amt` + handles balance recompute). Add allowed=['amt','note','cat','date','income','_txnType']. Audit log captures full diff. **Defer to Bundle 28.0.7 or 29 — needs balance-recompute logic.** |
| `deleteEditedTransaction` (L4211) | Direct `S.txns.splice` + direct `S.bal = ...` | `BRAIN.transaction.removeByTs(ts)` exists (L16627) and handles audit log. But balance adjustment still inline. Wrap into `BRAIN.transaction.removeByTsWithBalance(ts, source)` that does both atomically. **Defer — low risk, easy migration.** |
| `getBillsDue()` legacy helper | Reads `BILLS` global directly | Probably canonical-enough (it's THE bills reader), but verify it composes with `BRAIN.bills.getThisCycle()` consistently. **Inspect for divergence.** |
| `getActiveDebtsDueBeforePayday()` legacy | Reads `S.debts` directly | Should use `BRAIN.debts.active()` filter or similar. **Inspect.** |
| Chat input pre-fill in `openPaydayAskAI` | Direct `$('chat-input').value = '...'` | This is UI-only side-effect (no state mutation). But future AI agent might want to know "user opened ask-AI from canvas with N context" — could BRAIN.audit.append a `chat_prefill_from_canvas` entry. **Note for future.** |
| `editTransaction` modal show/hide of convert-loan button | Direct `$('txn-edit-convert-loan-btn').style.display = ...` | UI-only, fine as-is. Note: button visibility derived from `txn.income`. |
| MAX PER DAY card tap → `explainMaxPerDay` | Direct read, no state change | Pure read. Fine. |
| `S.weekdayBudget` / `S.weekendBudget` | Read by `getDynamicDailyBudget` | Settings writes route through `BRAIN.config.setWeekdayBudget` (Bundle 22 v3 Phase 0). ✓ |
| `S.bal` mutation in `applyBalanceCorrection` (L5269) | Direct `S.bal = ...` | Wrapped by `BRAIN.transaction.recordCorrection` for the txn side. Balance side stays direct because the legacy contract preserves it. **Acceptable but flag for future canonical-balance-writer pattern.** |

### Round 6 — caught a stacking context regression I missed

John's phone-verify caught that the `+ Goal / + Trip / + Bucket` buttons
opened PLAN_MODAL "under layers" — same z-index sandwich symptom as round 4
but a different root cause this time:

- `#plan-modal-overlay` was a CHILD of `#plan-mode`
- `#plan-mode` has `transform:translateX(0)` (slide animation) which creates
  a NEW stacking context — z-index values on children stack RELATIVE TO
  other children of plan-mode, NOT globally
- So PLAN_MODAL's z-index 601 only competed with siblings inside plan-mode,
  while the Payday Plan canvas (z-index 510) was at the GLOBAL root level
- Net: plan-mode (500) < canvas (510). PLAN_MODAL inside plan-mode is
  CAPPED at plan-mode's 500, never above the canvas

Fix: physically moved `#plan-modal-overlay` OUT of `#plan-mode` to be a
top-level sibling. Now its z-index 601 applies globally.

**Lesson:** z-index alone isn't enough. ALWAYS check the parent's stacking
context (transform, filter, position:fixed with z-index, opacity < 1, etc.).
Adding to inspection checklist for future modal/overlay work.

### Round 6 pathway notes

| Fix | Pathway |
|---|---|
| #2 Analysis tab missing debt/savings (REAL fix) | `buildSpendingPivot` (the actual Analysis renderer) switched from `getDiscretionaryByCategory` to `getAllOutflowsByCategory`. Round 5's migration of `renderTrend`/`renderCatBreakdown` was wasted — their DOM targets (`#trend-view`, `#cat-breakdown`) don't exist in the current Analysis tab IA. Those renderers are now dead code (defer deletion to Bundle 29). Label "Total discretionary" → "Total outflows". |
| #1 Ask AI prompt refocus | Now builds a structured prompt with `## My situation`, `## Upcoming trips` (sorted by start date), `## Long-term goals` (sorted by % complete), `## Annual provisions` (sorted by nextDue), `## Savings buckets`, plus an explicit prompt for prioritisation + formatting hint to AI for paragraphs/emojis/**bold**. Reads from same direct readers; adds PLAN.getTrips/getGoals/getAnnualProvisions for date-aware context. |
| #5a Delete button on goal cards | Added 🗑️ button next to ✅ Mark Complete in `renderGoalCards`. Routes through existing `confirmDeleteGoal(goalId)` — already canonical (uses BRAIN.savings.removeBucket for auto-bucket cleanup per round-4 migration). |

### Deferred for next round (with reasoning)

| Item | Why deferred |
|---|---|
| #3 MAX PER DAY explainer — full math overhaul (Afterpay visibility, timing-aware caps, visual progress bar) | Requires deeper math redesign + visual component design. Need to think through "spend 70/day with 2 days left" rule + how to display it. Better in a focused mini-bundle. |
| #4 Debt tile layout — note text cut off, square layout sub-optimal | Pure CSS work. Needs design pass — list view vs cards, expand-on-tap, etc. Defer to a debt-tab UX bundle. |
| #5b Add Goal modal scroll + keyboard interaction | Mobile keyboard pushing content off-screen is an iOS/Android behaviour; needs `position:sticky` save button OR keyboard-aware viewport adjustment. Defer to a modal-UX hardening round. |
| Delete dead `renderTrend` + `renderCatBreakdown` | Bundle 29 cleanup. They consume the right helper now but render to non-existent targets. |

### Round 5 pathway analysis (per John 2026-05-13 directive)

**Pathways made canonical this round ✓**

| Pathway | Previously | Now | Why |
|---|---|---|---|
| Ask AI prompt (`_buildPaydayAskAIPrompt`) | Read from `BRAIN.plan.getSnapshot` — which sources from `S.activePlan` (LAST LOCKED PLAN, often stale) | Direct readers: `S.bal`, `MODEL.daysToPayday`, `getBillsDue()`, `getActiveDebtsDueBeforePayday()`, `S.savingsBuckets[].saved`, `S.income`, `S.paydayReceived` | john saw $0 balance / 1 day / $5217 bills when reality was $340 / 2 days / different. Direct readers always reflect current state. AI agent can call same readers. |
| Analysis breakdown (`renderTrend`, `renderCatBreakdown`) | Phase 28.0.5 used strict `getDiscretionaryByCategory` (excludes Debt/Savings/Loan) | New `getAllOutflowsByCategory` (excludes income + corrections + roundups, INCLUDES Debt/Savings) | john's "I need to track if money went to a debt or savings transfer". Strict filter still right for `renderCutSliders` ("what to cut"). |
| Convert-to-loan flow | Reclassify only | Reclassify + offer to open `openAddDebtModal` pre-filled (name guessed from txn note, amount = txn.amt, rate = 0%) | john's "no debt tile is added or tracked... converting to loan then doesnt adjust for me to enter more details". Now user gets the full pipeline: reclassify → optional debt entry → adjustable modal → canonical write. |
| `saveNewBucket` | Direct `S.savingsBuckets.push` (round 4) → `BRAIN.savings.addBucket` (canonical) | + `BRAIN.plan.intent.add` (kind=goal, bucketId=name) so bucket also appears in PLAN mode Goals tile | john's "KIA detail bucket shows in Savings plan but doesnt add to PLAN mode dashboard". Both bucket AND intent now exist + linked. |
| `confirmNewGoal` | `PLAN.saveGoal` + `PLAN.writeSavedToSource` (legacy) | + `BRAIN.plan.intent.add` (canonical) | Goal now lives in both legacy + canonical entity stores. Bundle 29 migration drops legacy. |
| `confirmNewTrip` | `PLAN.saveTrip` + `PLAN.writeSavedToSource` (legacy) | + `BRAIN.plan.intent.add` (canonical) | Same — trip in both stores. |
| `renderPaydaySavings` footer | 1 link (+ Add bucket → ) | 3 buttons (+ Goal / + Trip / + Bucket) | john's "should we also have add trip in that allocation screen similar to add goal" |

**Pathways still flagged for inspection (deferred to Bundle 29+)**

| Pathway | Concern | Fix candidate |
|---|---|---|
| `BRAIN.plan.getSnapshot` returns stale data when `S.activePlan` unset | Snapshot's `currentBalance` field reflects S.bal correctly but other fields (income, bills, debts, savings) read from `S.activePlan` not live state | Add a fallback in `getSnapshot` — if `!S.activePlan.cycleEndDate` or it's expired, rebuild from live state. Or expose `BRAIN.plan.getLiveSnapshot()` parallel method that always reads live. |
| `openAddDebtModal` → `saveNewDebt` | Verify it routes through `BRAIN.debts.add(name, amt, opts, source)` canonical writer (per ARCHITECTURE §4) | Inspect the save handler |
| `saveBucketModal` rename of bucket doesn't propagate to linked `PLAN.intents` entry | If user renames "China Holiday" bucket → "China Trip", the intent with `bucketId: "China Holiday"` is orphaned | When bucket renamed via updateBucket, walk PLAN.intents and update any intent whose bucketId matches the old name |
| `PLAN.saveTrip` / `PLAN.saveGoal` still write to legacy `S.tripDefs`/`S.goalDefs` directly | Two stores: legacy + intent. Drift risk if one writer updates without the other | Bundle 29: deprecate PLAN.saveTrip/saveGoal, callers route through BRAIN.plan.intent only. Legacy reads become view-over-intents. |
| `addGoalSavings(goalId)` (renderGoalCards button) | Need to inspect — should route through BRAIN.savings.addToBucket | Verify in next iteration |
| `editGoal(goalId)` modal save | Need to inspect — does it write to intent or just to legacy S.goalDefs? | Probably needs intent update too |

### Broader patterns flagged for inspection

- **Settings form inputs** — Bundle 22 v3 migrated income/payday/budget/debt-strategy to `BRAIN.config.*` writers. **Inspect** the remaining form-input save paths to confirm none still write `S.X = $('s-X').value` directly. Specifically: `s-pin`, any not-yet-audited fields.
- **Modal save handlers** that mutate state directly (saveBucketModal at L6904 — uses `BRAIN.savings.setBucketSaved` ✓; saveNewBucket at L6897 — direct `S.savingsBuckets.push`, should use `BRAIN.savings.addBucket` ... which may not exist yet).
- **Quick Log flow** — uses `BRAIN.transaction.record` ✓ but the category/income flag is set inline; AI couldn't change "this is a Loan" after-the-fact without `reclassify`. Now that `reclassify` exists, **Quick Log could expose "is this a loan?" as a checkbox** that uses reclassify post-save.

### Outside-the-box ideas spawned from John's directive

- **Universal data-flow ledger** — a `BRAIN.dataFlow` namespace that documents, for every state field, its canonical writer/reader + which UI surfaces read it + which renderers consume it. The catalog itself is data, AI can introspect. Bundle 30 candidate.
- **Auto-generate canonical-writer wrappers** — for every form input with `id="s-X"`, auto-derive a `BRAIN.config.setX` writer with audit logging. Eliminates the "I forgot to canonicalise this one" gap. Bundle 30+ infrastructure.
- **Per-txn "explain my impact"** — every Recent Spending row gets a tap-to-see "this txn moved your daily max from $X to $Y, your surplus from $A to $B, your bucket pace by $C". Total transparency. Future bundle.
- **AI as state-shape auditor** — at the end of each bundle, AI walks every state field + every writer/reader and reports gaps. Bundle 30+.

---

## Layer V verification log

| Capture | Phase | Verified |
|---|---|---|
| #38 dashboard-balance-edit-input | r2 balance | ✓ |
| #39 modal-recon-balance | r2 balance | ✓ |
| #41 modal-add-bucket-over-canvas | z-index fix | ✓ ON TOP of canvas |
| #42 toast-over-canvas | z-index fix | ✓ visible above canvas |
| #14 plan-top (this turn) | 28.2 tile reorder | Pending re-capture |

---

— end working notes —
