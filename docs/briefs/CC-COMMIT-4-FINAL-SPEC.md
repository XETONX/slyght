# CC Commit 4 — Final Spec: Harsh Cashflow-Truth Hero

The substrate is shipped (Commits 1-3). `snap.derived.safeToSpendHeadroom` + `snap.derived.cashflowReceipt` exist and reconcile to John's validated numbers. Commit 4 wires them onto the screen.

**Scope discipline — read this first.** This is NOT the Bundle 33 alive redesign. It wires the true number + harsh framing + dynamic recovery into the CURRENT dashboard structure. No new motion language, no View Transitions, no spring physics, no chat-bubble system rebuild — those are Bundle 33. Commit 4 = make the existing hero show the true number, harshly, with a recovery path and a dynamic burn callout. Functional and honest, not the full reskin. If you find yourself rebuilding the dashboard's structure, stop — that's scope creep into 33.

The mockups John approved are the CONTENT reference (what the number/receipt/recovery/burn say and how they're colored), not a mandate to rebuild the app's visual system.

---

## PREREQUISITE — resolve before shipping Commit 4

The phone symptom investigation (cautious-mode flash + state reverting on hard refresh) must be resolved FIRST. If there's a real cache/state-revert bug (sw.js cache, Theme J lost-state), Commit 4's hero would revert on refresh too — don't wire a new hero onto a surface that doesn't persist. Confirm: pull fresh snapshot, screenshot the live dashboard, reconcile pushed-vs-in-KV-vs-read-back, confirm whether it was just "Commit 4 not shipped" (expected) or a real persistence bug. Resolve, then build Commit 4.

---

## What Commit 4 delivers

Replace the dashboard hero (currently shows `S.bal`) with the safe-to-spend system:

### 1. The hero number
- Display `snap.derived.safeToSpendHeadroom` as the hero, mono font, large.
- Sub-label: `safe to spend · {daysRemaining} days to payday`.
- When negative: blunt failure line — `you're over by ${abs(headroom)} · runs dry {runDryDate}`. The run-dry date is computed: the date `S.bal` hits zero at current burn pace (NOT at floor pace — at the actual recent discretionary rate, because that's the real trajectory).
- When positive: `${headroom} flex · ${perDayFlex}/day to payday`, and if there's a recent under-floor streak, the momentum line (see §5).

### 2. The receipt sub-line (non-negotiable, the trust mechanism)
- Render `cashflowReceipt` as visible math: `${cash} − ${billsStillDue} bills − ${livingRemaining} living = ${headroom}`.
- Mono font. Each term color-coded (cash green-ish, bills pink, living amber, result by state).
- This is what makes the number believable and depersonalizes it — the gap is visibly mostly locked living cost, not recklessness. Same receipt pattern as Bundle 32.5/32.6.

### 3. Color logic — FULL coral when over (John's call: maximally harsh)
- `headroom >= 0` → green state (logo, top accent bar, hero number, badge all green).
- `headroom < 0` → full coral state: top accent bar coral, logo coral, hero number coral (`#ED93B1` number, `#D4537E` accents), "over budget" badge, nav active-accent coral. The WHOLE screen reads "over."
- No amber middle tier for negative — John chose harsh: negative = coral, full stop. (Reserve a deeper/distinct treatment only if a genuinely-unrecoverable state is ever defined; not in this commit.)

### 4. The "TO RECOVER" block (the hand out of the hole — only renders when negative)
Concrete levers, each with the RESULTING headroom computed live next to it. Render 3, in this priority:
- **Floor-drop levers** — `Hold $25/day → ${resultAt25}`, `Hold $20/day → ${resultAt20}`. Compute the resulting headroom at each floor. (Floor ≥ $20; below isn't realistic living.)
- **The dynamic discretionary lever** — `No {topDiscretionaryCategory} {N} days → +${saved}`. THIS IS THE KEY ONE (see §6). Names John's actual biggest cuttable leak this cycle, computed from transaction categories.
- Pick the 3 most effective; the smallest-pain lever that closes the gap should be visible.

### 5. Reactive momentum (positive/recovering state)
- When John has spent under floor for ≥2 consecutive days, show the streak: `up ${recovered} in ${N} days — holding under ${actualAvg}/day`.
- The number visibly climbs as behavior improves — harsh when failing, rewarding when fixing. This keeps the harsh state from becoming ignorable wallpaper; the number is a live scoreboard, not a static verdict.
- Optional momentum card: `{N}-DAY STREAK UNDER FLOOR` with the projected payday-arrival surplus.

### 6. The dynamic burn card (the FIFA-week early warning)
This is the card that does the job the app failed at this cycle. On the dashboard, prominently:
- `7-day burn: ${burn7d} · ${perDay}/day · ${multiple}× floor`
- Below or as the recovery lever: name the SINGLE BIGGEST DISCRETIONARY CATEGORY this cycle by name and amount.
- **Discretionary category set (category-based, ships now):** FIFA packs / gaming, Uber Eats / takeaway, coffee, weed, food-out. Tag these categories as discretionary. The card surfaces whichever is the biggest spend this cycle, by its real name and number.
- Dynamic: this cycle it might be `Gaming $157` or `Takeaway $280`; it adapts to where the money actually went. NOT hardcoded "FIFA."
- Rank discretionary categories, surface the top one as the named lever. The accountability bite is naming the OPTIONAL drain (gaming/weed/takeaway), not the necessary spend (groceries/fuel) — weight the discretionary set above necessities so the card calls out what John can actually cut.
- (Behavioral baseline — "above your normal food spend" — is a LATER enhancement once there's history. Category-based now.)

### 7. Plan demoted to nav (John's call)
- The planning-view number ("$369 to allocate") moves OUT of the dashboard hero entirely. It belongs in the PLAN tab.
- Dashboard answers "now" (safe-to-spend); PLAN answers "this cycle's allocation." Different surfaces, different jobs.
- Cash-now (`S.bal`) stays on the dashboard as a small secondary anchor/footer line, distinct from the hero — `${S.bal} in account now`.

### 8. The one-time bills correction reveal
- On the FIRST load after Commit 4 ships, the bills section shows the correction: `$5,638 → $219 real` (the app showing it fixed its own phantom-bills lie — a trust moment).
- Subsequent loads settle to clean `$219 due`. Use a one-shot flag (like the seed/migration flags) so the reveal fires once.

---

## Build approach

Small render change on top of existing substrate. The numbers all exist in `snap.derived` already — Commit 4 is display logic, color logic, and the dynamic-category computation, not new financial math.

- **New:** `getTopDiscretionaryCategory(cycleDate)` reader — ranks the discretionary category set by spend this cycle, returns `{name, amount, daysCovered, projectedSaving}`. This is the only genuinely new logic; everything else is rendering `snap.derived` fields.
- **Recovery lever computation** — reuse the existing headroom formula at different floor inputs (`computeHeadroomAtFloor(n)`); no new math, just re-evaluation.
- **Color state** — derive from `headroom` sign; apply the coral/green class set across the dashboard shell.
- **Run-dry date** — compute from `S.bal` / recent-burn-rate (not floor rate).
- **One-shot bills-reveal flag** — mimic the seed-flag pattern.

## Regression Sentinel — gate every step
- 171 existing smoke + new Commit 4 cases green before commit.
- Conservation: the receipt math must reconcile (`cash = headroom + billsStillDue + livingRemaining`).
- Guardian 4-layer PASS. Boot self-test for `getTopDiscretionaryCategory` reachability.
- Acid test: load `live-2026-05-21.json`, boot, assert the hero displays the headroom number (−$137 modulo the Moshtix endDate item), the receipt math matches, the dynamic category names John's real top discretionary leak, full coral state renders, Plan number is absent from dashboard.

## Smoke cases (new)
- Hero shows `safeToSpendHeadroom`, not `S.bal`.
- Negative → full coral class set applied across shell; positive → green.
- Receipt math reconciles to headroom.
- Recovery levers compute correct resulting headroom at $25/$20 floor.
- `getTopDiscretionaryCategory` returns the real biggest discretionary category (test with a fixture where gaming > takeaway, and one where takeaway > gaming — confirm it adapts).
- Dynamic lever names the category + correct projected saving.
- Streak/momentum renders when ≥2 under-floor days; absent otherwise.
- One-shot bills reveal fires once, then clean.
- Plan number absent from dashboard hero; present in PLAN tab; cash-now secondary present.

---

## Values calls — all answered, none open
- Color: full coral negative (harsh). LOCKED.
- Discretionary set: FIFA/gaming, Uber Eats/takeaway, coffee, weed, food-out, category-based. LOCKED.
- Named leak = biggest DISCRETIONARY (cuttable), not biggest-overall. LOCKED.
- Bills reveal: one-time correction then clean. LOCKED.
- Plan: demoted to PLAN tab, cash-now secondary on dashboard. LOCKED.
- Streak/momentum: in, reactive scoreboard. LOCKED.

If anything genuinely new surfaces during build, halt and surface — but the design is locked, this should be mechanical.

---

## NOT in Commit 4 (scope fence)
- The full alive redesign (motion, View Transitions, spring physics, count-ups, chat-bubble rebuild) — **Bundle 33.** The mockups are 33's north star, not Commit 4's mandate.
- Warn-at-log-time (the FIFA-pack interceptor that fires when John goes to spend, not just on the dashboard) — **Sub-bundle 2.** Commit 4's burn card is the passive dashboard version; the active interceptor is next.
- Behavioral discretionary baseline ("above your normal") — later, needs history.
- Calc-duplication collapse + writer-bypass closure — **Sub-bundle 3.**

## Sequence
1. Resolve the phone symptom investigation (prerequisite).
2. Ship Commit 4 (this spec) — Sentinel-gated, acid-tested.
3. John phone-verifies: reload, hero shows the true harsh number with receipt + recovery + dynamic burn, full coral when over, Plan in nav, persists across refresh.
4. Then Sub-bundle 2 (warn-at-log-time).

This is the commit that makes slyght finally tell John the truth on its own — harsh, with a way out, naming his real leak. The day's whole sweep was the road to building this right.
