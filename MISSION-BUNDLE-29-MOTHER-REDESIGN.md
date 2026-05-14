# MISSION — Bundle 29 · Mother Redesign + Independent-Operation Foundation

**Status:** SCOPED · pending John's go for Phase 0 · 2026-05-14
**Authors:** Opus 4.7 1M-context (audit + scoping) · CC (implementation)
**Predecessor:** Bundle 28 SHIPPED 2026-05-14 (72 rounds · `slyght/CHANGELOG.md` Bundle 28 close-out)
**Audit anchor:** `slyght/AUDIT-PLAN-MODE-2026-05-14.md` §3.5 strategic synthesis
**Theme:** Close the asymmetric depth gap between PLAN-tab "mother" and Payday Plan canvas "eldest child" · ship the Layer V coverage extension that unblocks all future audits · add the decision-support surfaces per Audit A1 §6 · reduce daily-session burden 60-80% via auto-detect + Quick-Log smarts.

---

## 1. The framing (John 2026-05-14)

> _"PLAN mode is the mother and PAYDAY plan is like the eldest child."_

Bundle 28's eldest child got rich attention (72 rounds). The mother needs the same depth. PLAN-tab Goals tile already has 3-projection cards + per-goal contextual hints + 4-button action rows; the canvas Savings sub has been the thinner mirror. Bundle 29 brings the canvas surfaces UP to the mother's depth — using the canonical `BRAIN.plan.intent.*` layer that shipped in Bundle 28 Phase 0.

Plus four parallel tracks:

1. **Layer V coverage extension** (Phase 0 · "the crux" per John 2026-05-14). Until Layer V navigates into canvas sub-screens + modals, every audit runs with the same gap the Bundle 28 audit hit. Closing this is foundational.
2. **Strategic-synthesis gaps** (Phase 2). The 7 "not accounting for" items inventoried in audit §3.5.Q2.
3. **Decision-support features** (Phase 3 · per Audit A1 §6 strategic verdict). The app is finance-only today and thin on long-horizon — pivot here.
4. **Independent-operation enhancements** (Phase 4). Auto-detect + Quick-Log smarts + receipt-scan = ~60-80% session-burden reduction.

---

## 2. Phase list

### Phase 0 — Layer V coverage extension (the crux)

**Trigger:** John 2026-05-14: "Layer V doesn't navigate into canvas sub-screens or modals — this is HIGH, this is the crux of everything we do today."

**Why first:** without sub-screen + modal captures, Bundle 29's UX iterations would run blind into the same coverage gap that forced the Bundle 28 audit to work around them. Every visual change in Phase 1+ needs a baseline + a post-change diff to verify.

**Scope:**
- Extend `scripts/layerV-capture.js` Section 3+ to navigate into canvas via `openPaydayPlan` programmatically (post-BRAIN+PLAN-init wait per the Bundle-27 TDZ-at-boot quirk · use `page.waitForFunction(() => window.BRAIN && window.BRAIN.plan)`).
- Capture each canvas sub-screen open-state: `payday-bills` · `payday-debts` · `payday-living` · `payday-savings` · `payday-upcoming`.
- Capture canvas modal open-states: `openEditPaydayBonus` (P0.2 affordance) · `openEditPaydayBill` (r49 toggle modal) · `openEditPaydayDebt` (r49 quick-picks) · `openEditPaydaySavings` (R1 goal-context title) · `openEditPaydayKiaExtra` · `openEditPaydayTripAlloc` · `openPaydayAutoAllocate` (r52 NEW BUCKET tags) · `openPaydayLockPlan` · `explainAnnualProvisions` · `explainMaxPerDay`.
- NEW (post-R2): `openManageProvisions` modal.
- NEW (post-P0.2): canvas with "Pay landed today?" pill visible (paydayReceived=false fixture) AND post-marked state (paydayReceived=true).
- Fix `#19 plan-edit-trip-modal` selector bug (Bundle 28 audit cross-cut §F finding).
- TDZ-at-boot mitigation: long initial wait via `page.waitForFunction` before any `page.evaluate` of `openX()` functions.

**Estimated commit count:** 2-3 commits (script extension · run + verify · cleanup).
**Estimated LOC:** ~150 LOC added to `scripts/layerV-capture.js`.

### Phase 1 — Tier-3 intent-driven canvas Savings (Mother redesign)

**Trigger:** R1 quick-fix shipped Bundle 28 round 72 closed the "Property Deposit / Freedom Buffer invisible" complaint as a presentation enrichment. Full redesign brings canvas Savings into structural parity with PLAN-tab Goals tile.

**Anchor SDD:** `docs/sdd/SDD-2026-05-14-intent-driven-goal-subtitle.md` (R1) provides the quick-fix pattern; this phase writes the new full SDD (`SDD-2026-XX-XX-intent-driven-savings-canvas-full.md`).

**Scope:**
- Canvas Savings sub-screen iterates `BRAIN.plan.intent.*` as primary source (goals + trips + provisions).
- Per-goal rows match PLAN-tab Goals tile depth: 3-projection table (current monthly / post-WRX / with bonus) · per-goal contextual hint · 4-button action row (✏️ · + Add · ✅ · 🗑️).
- Bucket section becomes secondary "Buckets backing your goals" group.
- Provisions section gets explicit edit affordance (mirrors PLAN-tab nav-row).
- KIA Extra section unchanged.
- `openEditPaydaySavings` modal expanded to allow inline goal-target edit + bucket reassignment.
- Override schema preserved (`savings:<bucketName>` keys still resolve).

**Risk:** medium-high. Touches the core surface John interacts with most. Requires careful before/after Layer V diff (Phase 0 dependency).

### Phase 2 — Strategic-synthesis gaps

The 7 "not accounting for" items from audit §3.5.Q2:

1. **Cycle-progress strip on canvas** — "current pace · projected end-of-cycle" with weekly checkpoints. Post-lock cycle-progress visible without opening detail screens.
2. **Bonus-confidence slider** (`bonus.confidence` 50/75/100% schema field). Weighted projection math.
3. **Trip-overage reconciliation** (`trip.actual` schema). Post-trip modal when `trip.endDate < today && !reconciled`.
4. **Income-change prompt.** When `S.income` audit-log shows recent edit, "Income changed in the last 30 days? Re-run your plan" banner.
5. **Surprise-expense reactive flow.** "$X over budget — auto-suggest reallocations" reactive flow. Pipes through AI affordability query.
6. **Super in retirement framing** (might defer Bundle 30 retirement-canvas). Surface a "gross income · super contribution · take-home" breakdown.
7. **Goal-completion celebration + redirect.** When a goal hits target, "🎉 Freedom Buffer complete — redirect $X/mo to Property Deposit?" with one-tap acceptance.

### Phase 3 — Decision-support features (Audit A1 §6 pivot)

Per Audit A1 strategic verdict: "App is helping at payday-cycle level (good). Long-horizon is thin (no retirement, no debt-race, no tax). Bundle 29+ MUST pivot to decision-support features."

1. **Debt Payoff Race tool.** John has $25,000 WRX listed + KIA loan $23,214 — selling WRX could clear all non-rent debts in <90 days. Tool walks: "if you sell WRX for $X, here's how the cascade pays down: KIA → Michael → Bowie → free $780/mo for goals."
2. **Retirement Readiness Canvas.** Super $63,429 at 8.5% growth → $4.6M at retirement (from current Income Simulator projection). Wrap as a Canvas-style surface with milestones (1 year · 5 years · retirement).
3. **Annual Sinking Funds row in PLAN canvas.** Currently provisions live on PLAN-tab nav-row (R2) + canvas Essentials (r47). Add a dedicated PLAN-tab card showing the sinking funds' progress (Rego & Insurance bucket pace toward each lumpy bill).

### Phase 4 — Auto-detect + Quick-Log enhancements

The session-burden-reduction track. Targets ~30-50 → ~20 interactions/cycle.

1. **Auto-tick bills on detected payments** (existing `autoMatchBillsToTxns` + `autoDetectBillPayments` per code-grep). Enhancement: UNDO-toast pattern with "We marked Optus $194 paid (matched txn 2026-05-15 21:43). Tap to confirm/undo."
2. **Smart Quick-Log defaults.** Pattern-detect from recent txns. "Looks like Woolworths Kirrawee groceries? Auto-fill $X / 'Food/Coffee'. Tap to log or edit." AI-assist on the modal.
3. **Receipt-scan flow** (John morning ask). Camera → OCR → product + price + vendor. Bundle 29 deliverable per his explicit request.

### Phase 5 — Narration + rigidity gaps (P1 next session items)

The audit §3.5 "showing-someone" + "too fixed" P1/P2 list:

1. Debts sub `🏠 VIA RENT` / `🤖 AUTO` legend caption.
2. KIA Extra label verb-first ("Pay down KIA faster (avalanche/snowball)" vs current "KIA extra · pay over the minimum").
3. Untick affordance on ticked rows (long-press OR small × button).
4. Per-cycle `cycleEndDate` override (when John's actual payday shifts).
5. Tap-bar-segment explainer ("How do I shift $X from Living to Savings?" — auto-allocate prefill).
6. Pre-lock tick `alert()` L11048 → toast or inline hint (UX contract §6 violation).
7. Canvas Savings empty-state for goals section when no buckets.
8. "Add new savings target" hint phrasing review.
9. 14 boot self-test reachability entries batch-add (per audit §F).

### Phase 6 — Hygiene + TDZ-at-boot investigation

Hygiene items queued throughout Bundle 28:

1. **TDZ-at-boot investigation** (Bundle 27 OPEN-BUG L1646/L11246/L13111 family). 12 boot-self-test failures fire on Playwright early-load. Root cause: `const BRAIN`/`const PLAN` declarations evaluated after the boot-self-test `setTimeout` callback fires. Fix shape: either move boot-self-test later, or move BRAIN declaration earlier, or make BRAIN tests defensive against undefined.
2. **Drop legacy `S.tripDefs` / `S.goalDefs`** once all readers migrate to intents (Phase 1 dependency).
3. **Cleanup migration for test-pollution intents** (Test goal · Kia detail in `S.planIntents`).
4. **`BRAIN.config.setIncome` auto-propagate** to `S.activePlan.income.netPay` (drop manual sync at L10270 in openEditPaydayBonus).
5. **`BRAIN.allocation.lock` atomic** — stamp `S.activePlan.lockedAt` itself (drop manual stamp at openPaydayLockPlan L10465-9).
6. **`S.bonuses` vs `S.activePlan.income.bonus` boundaries** clarified or consolidated.
7. **Window-global `_billEditMode`** → component state.
8. **Stale `paidBills['Google Microsoft-1']` key** — verify seedV26 ran or add cleanup migration.
9. **Working-tree hygiene from Bundle 28 close** (the 4 files swept into `60eabde` via `git add -A` — `# PLAN-MODE...txt`, `LAYER-V-DEEP-ANALYSIS-2026-05-13.md`, `slyght-state-2026-05-13 (1).json`, `state-snapshot.json.pre-r58.bak`). Decision needed: keep, gitignore, or move to docs/archive/?

---

## 3. Phasing rules

- **Phase 0 ships first and standalone.** Foundation for everything else.
- **Phase 1 (Mother redesign) requires Phase 0 captures as before/after baseline.**
- **Phase 2-5 can interleave with phone-verify rounds** (per Bundle 28 pattern).
- **Phase 3 (decision-support) requires SDDs + ADRs.** New surfaces, architectural.
- **Phase 4 (receipt-scan) requires camera-API permission UX + OCR vendor selection** — likely Tier-3 SDD + ADR for the OCR vendor decision.
- **Phase 6 hygiene runs in parallel** — no strict ordering, opportunistic during phone-verify rounds.

---

## 4. Open questions (need John's call before kicking off Phase 0)

1. **Layer V capture timing**: today's run produced 52 captures in ~30s. Adding ~15-20 sub-screen + modal captures → ~50s. Tolerable, or stage Phase 0 as a second `npm run` command (`npm run layerV:deep`)?
2. **Receipt-scan vendor**: ABBYY Cloud OCR (paid) · Google Vision API (paid) · Tesseract.js (free, slower, less accurate) · or defer pending vendor research? Bundle 29 Phase 4 scope.
3. **Decision-support Phase 3 ordering**: Debt Payoff Race tool first (highest urgency · WRX sale unlocks $25k) OR Retirement Readiness Canvas first (already partially built via Income Simulator)?
4. **Phase 6 hygiene #9**: the 4 swept-in files — leave, gitignore, or move to docs/archive/?

---

## 5. Done predicates (Bundle 29 close)

- Phase 0 Layer V coverage extension shipped + verified via re-run on fixture state.
- Phase 1 Tier-3 canvas Savings redesign shipped + Layer V before/after diff verified.
- All 7 strategic-synthesis gaps (Phase 2) either shipped or queued to Bundle 30 with explicit reason.
- At least 2 of 3 Phase 3 decision-support surfaces shipped.
- At least 2 of 3 Phase 4 auto-detect/Quick-Log enhancements shipped.
- All 9 Phase 5 narration + rigidity items shipped OR explicit wontfix.
- TDZ-at-boot investigation produces either a fix OR an ADR explaining why we accept the noise.
- Legacy mirror drops landed (tripDefs · goalDefs).
- ARCHITECTURE.md §13 roadmap updated.
- `MISSION-BUNDLE-29-MOTHER-REDESIGN.md` archived to `docs/archive/` per Audit A1 §5.

---

## 6. Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Phase 1 canvas Savings redesign breaks existing override flow | HIGH | Preserve `savings:<bucketName>` override key shape. Layer V diff before/after. Boot self-test new render path. |
| Phase 0 Layer V script's `page.evaluate` of `openX()` hits TDZ | MEDIUM | Long `waitForFunction(() => window.BRAIN.plan)` before any `page.evaluate`. Workaround per Bundle 28 round 72 pathway-walk attempt that failed. |
| Phase 3 decision-support pulls scope into Bundle 30 retirement-canvas territory | MEDIUM | Phase 3 deliverables scoped narrow per Audit A1 §6 wording; defer broader retirement to Bundle 30. |
| Phase 4 receipt-scan vendor lock-in | MEDIUM | ADR before vendor selection. Free Tesseract.js for v1; paid vendor only if quality blocks. |
| Phase 6 TDZ-at-boot fix breaks other surfaces | LOW | TDZ is silent-noise today (audit-log + console.error only). Fix is contained to script-evaluation-order — no surface-render impact expected. |

---

## 7. Stakeholders + cadence

**Per John 2026-05-14:** session-by-session cadence with phone-verify rounds between code-touching rounds. Layer V `--local` baseline before each round; diff against post-fix capture before declaring done.

**Per Audit A1 quarterly cadence:** next 6-lens structural audit fires either at Bundle 32 (mid-July) OR trigger-based (revert / "horrid" rejection / 3rd cross-surface duplicate found / false-clean gate / measurable missed decision).

**Per CC-PRINCIPAL-ENGINEER-MANUAL §11 noticed-list obligation:** every end-of-session ships 3-5 noticed items with ACTION + WHEN per AMENDMENT-001.

---

## 8. Next action (today)

**Ship Phase 0 — Layer V coverage extension.** No SDD needed (extension of existing pattern · `scripts/layerV-capture.js`). Ship + run + verify + commit. Get the foundation in before anything in Phase 1+ touches user-visible canvas.
