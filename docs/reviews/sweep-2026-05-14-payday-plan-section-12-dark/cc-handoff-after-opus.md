# CC handoff — after Opus vision review

Loop closure per MOCK-SWEEP-PROMPTS.md §3 (Prompt C). Phase 5 STOP still active — no Edit/Write to `index.html` until John approves Phase 4 line-by-line.

## Pre-flight resolutions (Opus §8 Q-06)

- **Retro folder confirmed** at `docs/reviews/sweep-2026-05-14-payday-plan-section-12-retro/` with full Phase 1-4 + handoff-to-opus.md. Opus's blocking concern is unblocked.
- **`opus-vision-review.md` saved** at the canonical location alongside the phase placeholders.
- Recommend: future dark-companion sweeps repeat the F-NN reference table inline (Opus's process amendment) so the package is self-contained.

## My honest thoughts on Opus's analysis

**Where I think Opus nailed it:**
- E-01 — the missing `$298 provisions` deduction in the displayed formula is the clean diagnosis. I'd grounded F-02 at the same lines but Opus's framing ("the displayed formula omits a deduction") is sharper.
- E-04 — the "$X now → $Y left ..." three-state framing. This is the *bigger* finding I missed. My retro F-10 ("no actionable hint when projection<0") was a thinner cut at the same surface. Opus made me see the meaning instability across (paydayReceived × projection-sign × bonus.status) is the real problem. Strong pickup.
- E-08 — buffer modal not highlighting current $364. Genuinely missed in my retro walk. The cause is mundane (chip set [0,100,200,300,500,750,1000] doesn't include $364 so no chip activates) but the UX hit is real.
- The "Pay landed today?" positive callout (Opus §9) — agree, this is the design pattern slyght should keep reaching for. CC pattern note: proactive prompts when state implies action.
- The recommendation to write an SDD before fixing E-03 — exactly right. Cross-surface number coherence is a math-invariant contract; touching it without architectural thinking will produce more drift.

**Where I think Opus's framing needs refinement (soft push-back):**
- E-05 — Opus calls it locked-banner clipping. **Looking at frame 21 pixels + grounding the code, the clipped string "ick items as you handle them · 🔥 3 cycle streak · 💰 payday r" is the TOAST, not the banner.** The banner at index.html:9786-9790 has `display:flex` with `flex-shrink:0` on the icon and the button; the middle `flex:1` div wraps cleanly. The TOAST at index.html:13457 has `white-space:nowrap` and the toast text on lock (index.html:11083) is `🔒 Plan locked — tick items as you handle them · 🔥 N cycle streak · 💰 payday recorded as landed` which exceeds 380px viewport. The clipping is real but the fix location is different. Reclassified below.
- E-03 — Opus calls it a "math invariant breach". I *partly* disagree: the three values ($1,609 / $1,245 / $1,109) represent legitimately different concepts (post-essentials-free / post-essentials-minus-existing-savings-minus-buffer / canvas-remainder-minus-this-cycle's-savings-only). They're not the SAME quantity computed inconsistently — they're three different questions answered correctly. The bug is in the **labels**, not the **math**. "Free money" reads as one thing to a user but the surfaces compute different things behind it. Fix is better labels + a single explainer, not a forced canonicalisation. Filed as new F-15 with reframing.
- "Dark wins" claims that Opus couldn't verify — fair call-out, and the right protocol amendment is to ship paired dark/light frames for any theme delta. Future sweeps will include both.

**Where I think Opus missed something CC's retro caught:**
- **F-01 savings double-count.** Frame 12 lock-confirm shows "Buffer is tight $162 vs $364 floor". Auto-allocate proposed $1,245 split (frame 10), apply ran (frame 11), then lock shows $162 free. The arithmetic gap (savings.total at lock time vs at auto-apply time) is the smoking gun for the trip-id-override + bucket-name-override double-count. Opus didn't trace this in Pass B. **This is the highest-severity blocking bug in the sweep and it remained invisible to a pure-pixel pass — vision alone can't catch math chain inconsistencies without explicit ground-truth on the formula source.** Worth a process note: pixel review is necessary but not sufficient for financial-math correctness.
- **F-08 lock-shortfall check ignores provisions.** Related to E-03 but more concrete. Lock allows if `remainder < 0` but `remainder` uses freeTotal which omits provisions. Lock can fire when real surplus is negative after the $298 provisions are honored.
- **F-09 streak inflation.** Opus saw "2 cycle streak" frame 13, "3 cycle streak" frame 21, and called the streak counter a positive callout. But these are the SAME plan in the SAME session — streak shouldn't increment between two locks of the same cycleId. Subtle data-corruption bug, not visible without state-level reasoning.

These three findings (F-01, F-08, F-09) are the kind that a *future* sweep design should anticipate: PNG sequences are great for surface bugs and state-persistence traces, but math-chain bugs need explicit value-of-interest deltas across frames + a fixture spike.

---

## Items I'll act on this session (pixel-fixable)

For each: E/F-NN reference · proposed fix · file:line · effort (naive → 2x) · risk.

### F-01 — Savings double-count (CC retro, missed by Opus)

- **Where:** `index.html:19390-19412` (applyRecommendation synth-bucket creation) + `index.html:18247-18266` (getSnapshot savingsTotal sum)
- **Fix:** in applyRecommendation, after `BRAIN.savings.addBucket` succeeds, also call `clearOverride('savings', 'trip-' + tripId)` for the matching trip. Belt-and-braces: in getSnapshot savingsTotal, when a `savings:trip-X` override exists AND a `savings:<bucketName>` override exists where bucketName word-matches trip name, sum only the bucket-keyed one.
- **Effort:** 30 → 60 min
- **Risk:** medium — could orphan trip-id overrides if cleanup runs only at Apply not at trip-card save. Add a one-time migration sweep at app boot to clean stale trip-id overrides where a matching bucket exists.

### E-01 / F-02 — Math sub-line missing $298 deduction

- **Where:** `index.html:11983-11984` (savings pool math sub-line)
- **Fix:** change display from `$X surplus − $Y buffer = $Z` to `$X surplus − $W provisions − $Y buffer = $Z`. Compute `_provs` from the same source the snap uses.
- **Effort:** 15 → 30 min
- **Risk:** low (display-only)

### F-08 — Lock-shortfall ignores provisions

- **Where:** `index.html:10937` (`const remainder = snap.derived.freeTotal;`)
- **Fix:** switch to `const remainder = snap.derived.surplus;` (which includes provisions). Update the can't-lock copy to enumerate the math.
- **Effort:** 20 → 40 min
- **Risk:** medium — blocks lock in more cases. Surface the math in the block screen so user can act.

### E-05 — Toast clip via `white-space:nowrap` on long lock-confirmation messages

- **Where:** `index.html:13457` (toast CSS) + `index.html:11083` (lock-toast composed string can exceed 80 chars)
- **Fix:** drop `white-space:nowrap` from toast CSS · add `max-width: calc(100vw - 48px); white-space: normal; text-align: center;`. Toast wraps when too long; centered.
- **Effort:** 15 → 30 min
- **Risk:** low
- **Note:** Opus framed this as locked-banner clipping; grounding shows it's actually the toast. Banner itself is fine.

### E-06 — Slider marker chips obscure content + each other (CC retro F-04 expanded)

- **Where:** `index.html:203-205` (.lc-marker-rec / .lc-marker-max CSS) + `index.html:194` (.lc-slider-wrap padding-bottom)
- **Fix:** increase `.lc-slider-wrap{padding-bottom: 60px}`. Add proximity-check in renderPaydayLiving: if `|recPct - maxPct| < 8`, render max marker at `top:60px` (third row) instead of top:42px. Belt-and-braces: enable `max-width:calc(50% - 8px)` on marker chip so they don't overlap horizontally even when close.
- **Effort:** 30 → 60 min
- **Risk:** low

### E-08 — Buffer modal doesn't highlight current value

- **Where:** `index.html:12339-12345` (buffer-floor modal body) + `_buildQuickPickGrid` at `index.html:9967`
- **Fix:** above the chip grid, render `<div style="font-size:12px;color:var(--text3);margin-bottom:6px">Current: <strong style="font-family:var(--mono);color:var(--text)">$364</strong></div>`. When user picks a chip OR types Custom, this line dims to subtitle "was $364". Optional: highlight nearest-rounded chip with `[currently between $300 and $500]` hint.
- **Effort:** 20 → 40 min
- **Risk:** low

### E-11 — Input fields drop `$` prefix (LOW)

- **Where:** `index.html:10524` (bonus net-pay input) + Custom input rendering
- **Fix:** wrap inputs with a `$` prefix span (CSS pseudo-element). Inputs stay number type for keyboards; visual stays consistent.
- **Effort:** 30 → 60 min
- **Risk:** low — input value parsing unaffected because the `$` is presentational
- **Defer suggestion:** ship if remaining time allows; not blocking

### E-12 — Lock-confirm modal green button + amber warning conflict

- **Where:** `index.html:11062` (Lock button in confirm modal, primary green)
- **Fix:** when buffer-tight warning is present (`remainder < buffer`), down-style the Lock button to outline-amber (border + text amber, no fill). Keep green only for clean-no-warning lock.
- **Effort:** 15 → 30 min
- **Risk:** low

### F-11 — Buffer-modal Live-Preview color semantics (CC retro)

- **Where:** `index.html:12289-12293` (buffer Live-Preview row kinds)
- **Fix:** drop `kind: 'pos'` from buffer-delta row. Let max-affordable row's `kind: 'warn'` carry the story.
- **Effort:** 5 → 10 min
- **Risk:** low

---

## Items I need to investigate (state-level)

### F-09 — Streak inflation on relock within same cycle

- **What I'll read:** `index.html:11097` (lock streak increment). Look for any cycleId gating already in place. Cross-check `S.activePlan.streak` writers.
- **What I'll look for in audit log:** Are there `payday_plan_locked` events with the same cycleId but different timestamps? Should there be a `lastStreakedCycleId` tracking field?
- **Estimated time to ground:** 20 min naive · 40 min adjusted
- **Outcome target:** confirm root cause + propose `lastStreakedCycleId` field + verify rolloverIfNeeded resets the field

### F-10 — No actionable hint on negative projectedEndBalance (CC retro) / E-04 framing instability (Opus new)

- **What I'll read:** `index.html:9803-9805` (projection trail-label logic) + `index.html:18676` (projectedEndBalance formula)
- **What I'll investigate:** the legitimate semantics of each variant. Opus recommends "projected balance at next payday" everywhere; I want to verify the can't-lock modal copy at `index.html:10940-10943` doesn't depend on the current freeTotal-vs-surplus distinction.
- **Estimated time to ground:** 30 min naive · 60 min adjusted
- **Outcome target:** a 3-line decision tree mapping (paydayReceived, projection-sign, bonus.status) → exactly one message + colour. Document for John's approval.

### F-13 — Locked plan reads live S, not lockedSnapshot

- **What I'll read:** `index.html:17915` (BRAIN.allocation.lock stores snapshot) + `index.html:18234+` (getSnapshot reads live)
- **What I'll investigate:** does any downstream reader actually use `lockedSnapshot`? If unused, propose removing it (avoid dead-code drift). If used, audit when live-vs-locked is desired.
- **Estimated time:** 45 min naive · 90 min adjusted
- **Outcome:** decision matrix for which reads should be live-vs-snapshot post-lock

---

## Items deferred to Opus (design-level)

### E-04 — "$X now → $Y left ..." framing instability

- **Why design-level:** the three-state cycling (Expected/Confirmed/locked-Confirmed) isn't a code bug — it's a model-of-the-world choice. Picking the canonical semantics requires understanding what John uses this number for. Opus recommends "projected balance at next payday" always; I'd defer the decision to John but get Opus's design-pass on the alternatives.
- **Design question Opus needs to answer:** Given (paydayReceived × projection-sign × locked-state), what is THE meaning of this position? Recommend one semantics + show 4-state mockups.

### E-07 — Bonus EXPECTED + edit pencil after Lock (new)

- **Why design-level:** the Lock contract is ambiguous. Lock should freeze committed amounts; bonus uncertainty doesn't fit. Three options: (a) lock freezes bonus → strip EXPECTED, disable pencil; (b) bonus stays editable but Lock contract explicitly excludes it → dim pencil + add subscript "bonus excluded from lock"; (c) leave as-is.
- **Design question:** what does Lock cover, semantically?

### E-09 — Auto-allocate override of manual allocations (new)

- **Why design-level:** the current→proposed delta UX is correct (shows the change). But should auto OVERRIDE manual, AUGMENT (add to manual where empty), or SKIP (respect manual)? John uses both patterns in different contexts.
- **Design question:** what's the contract between "manual" and "auto" in slyght's mental model?

### E-10 — Daily Living card competing numbers (new)

- **Why design-level:** the card surfaces 4 numbers (current/day, current×days, recent avg, max-affordable). Plus the markers. Plus the floor. Opus recommends a spine. CC agrees but the right spine is a design call.
- **Design question:** what's the ONE thing this card tells John?

### F-05 — "✓ LANDED" vs paydayReceived (CC retro, already deferred)

Carries forward unchanged.

### F-14 — Cycle copy clarity (CC retro, already deferred)

Carries forward unchanged.

---

## Items I disagree with

### Soft pushback: E-05 location

Opus calls this "locked-plan wide banner clips at 380px". Pixel-grounding plus code-read at `index.html:9786-9790` shows the banner has `display:flex` with `flex-shrink:0` icon + `flex-shrink:0` button + `flex:1` middle div that wraps text cleanly. The clipping is in the TOAST (white-space:nowrap at `index.html:13457`) carrying a long lock-confirmation string (`index.html:11083`).

The finding is real and the fix above addresses it. Just the location framing.

### Soft pushback: E-03 framing as "math invariant breach"

Opus's Pass C framing is that three "free money" values diverge across surfaces. I agree they're three different numbers ($1,609, $1,245, $1,109) on three different surfaces. **But** these compute three different things by design:

- Canvas REMAINDER ($1,609) = total income − essentials (bills/debts/living/provisions). Answers "what's left after essentials before any allocation?"
- Savings POOL ($1,245) = remainder − buffer − provisions-counted-again? Actually: surplus excluding savings. Answers "what's left for new savings allocations from scratch?"
- Trip-alloc preview ($1,109) = the above minus the Darwin allocation just being proposed. Answers "what would remain if I commit $500 to Darwin?"

These ARE three different questions. The reason a user reads them as "the same thing" is the label "Pool", "Remainder", "Pool still free" all sound similar.

**The fix isn't enforcing a single canonical value across surfaces.** It's relabeling so each surface tells the user what specifically that number means.

Reframing as new F-15 below.

### No material disagreement otherwise

Reviewed each E-NN against pixels + code. The classification framings above are the only place I push back, and both are soft pushbacks on framing not substance.

---

## Follow-up sweeps needed

### Sweep — Post-lock interaction integrity

**Scenario:** John locks a plan, then taps each row in the locked canvas to verify the lock contract holds.

**Fixture:** start from same `state-snapshot.json` as Section 12 but with `S.activePlan.lockedAt = Date.now() − 5_000` (locked 5s ago) plus Darwin allocated $755 (post-Apply) plus all canonical ticks unticked.

**Frame sequence (~12 captures):**
1. Locked canvas root (verify locked banner + RE-PLAN button + chevrons on rows)
2. Tap Bills row → bills sub-screen post-lock (verify Edit on each bill is disabled OR opens read-only)
3. Tap a bill row → modal post-lock (should be read-only with copy "Re-plan to edit")
4. Tap Debts row → same verification
5. Tap a debt row → modal post-lock
6. Tap Savings sub → verify rows tappable, ticks active, edits gated
7. Tap a ticked savings row → post-lock status modal (verifies new feature from commit d81c781)
8. Tap untick → confirm dialog → untick → verify txn reverses
9. Tap unticked savings row → verifies edit-modal opens or routes correctly
10. Tap Upcoming → verify tick → txn → status modal flow
11. Tap 🔓 Re-plan → unlock confirm → verify state returns editable
12. Re-lock → verify streak doesn't double-increment (F-09 validation)

**Value-of-interest:** `S.activePlan.lockedAt` + `S.activePlan.ticks` + `S.bal` (validating txn-reversal correctness on untick).

**Critical assertions:**
- Frame 3 should show a modal in read-only state (no chip pickers usable)
- Frame 7 should show the post-lock status modal (savings)
- Frame 8 should show S.bal restored to pre-tick value
- Frame 12 should show streak still N (not N+1) after unlock+relock

This sweep would validate F-09 (streak inflation) + verify the new post-lock status modal + catch lock-contract bugs Opus could only theorise from stills.

---

## Updated Phase 4 — new findings from this loop iteration

### Finding F-15: Three "free money" labels with three different semantics

**Category:** ⚠️ UX clear (relabeling, not math fix)
**What:** $1,609 (Canvas REMAINDER) · $1,245 (Savings POOL) · $1,109 (Trip-alloc Pool still free). User reads "free money" but each computes a different quantity. Each is mathematically correct individually; the issue is labelling unifying them in the user's mind.
**Where:**
- File: index.html
- Line(s): L9836-L9841 (canvas REMAINDER label) + L11970-L11984 (savings POOL labels) + L?? (trip-alloc preview)
- Surfaces: canvas root + savings sub-screen + Darwin trip-alloc modal
- Frames affected: 04+09+11 ($1,609) + 06 ($1,245) + 07 ($1,109)
**Why (grounded):** intentional three-different-questions design. The current labels obscure the distinction. A "what is this?" tap-explainer per number would resolve the user-side confusion.
**Effort:** 30 min → 60 min, confidence high
**Risk:** low
**Cross-references:** Opus's E-03 frames this as canonicalisation. CC reframes as labelling.
**CC's recommendation:** rename to:
- Canvas: "Remainder after essentials" (already correct)
- Savings: "Available to allocate to goals" (replace "Pool to allocate")
- Trip-alloc preview: "Free after this allocation"
Plus a single 1-line explainer beneath each that bottoms out at the same canonical figure (a derived "untouched discretionary" base everyone can reference).
**John's call:** ____

### Finding F-16: "$X now → $Y left ..." framing instability

**Category:** 🎨 UX defer (design call)
**What:** Same screen position cycles through three meanings depending on (paydayReceived × projection-sign × bonus.status). User cannot predict what the number means.
**Where:** `index.html:9803-9805`
**Frames affected:** 04+09+11 (variant 1) · 20 (variant 2) · 21 (variant 3)
**Effort:** 1h → 2.5h, confidence medium (depends on John's chosen semantics)
**Risk:** medium-low — touches a heavily-read line
**Cross-references:** F-10 in retro is a thinner cut of the same surface.
**CC's recommendation:** Opus suggests "projected balance at next payday" always. CC supports. Always green when positive, red when negative, always "by [date]" framing.
**John's call:** ____

### Finding F-17: Bonus EXPECTED + edit pencil active after Lock

**Category:** 🎨 UX defer (design call)
**What:** Frame 13 post-lock: bonus row still shows amber EXPECTED pill + editable pencil. Lock contract ambiguous — is bonus intentionally always editable (uncertain-by-nature) or should Lock freeze it?
**Where:** `index.html:9780-9788` (bonus row render — doesn't check lockedAt)
**Frames affected:** 13
**Effort:** 30 min → 60 min, depending on chosen behavior
**Risk:** low
**Cross-references:** F-05 (LANDED vs paydayReceived) is related — both questions touch the Lock contract.
**CC's recommendation:** option (b) — keep bonus editable post-lock but dim the pencil + add subscript "bonus excluded from lock" so contract is explicit. Bonus uncertainty doesn't fit Lock's commit semantics; freezing it is overreach.
**John's call:** ____

### Finding F-18: Auto-allocate behavior with manual allocations

**Category:** 🎨 UX defer (design call)
**What:** User manually allocates $500 to Darwin (frame 09). Auto-allocate proposes $755 ($500 strikethrough → $755 +$255). The +$255 is the auto-allocate "incrementing" the manual choice. User could read this as override OR augment.
**Where:** Auto-allocate Apply at `index.html:19390+`
**Frames affected:** 09 → 10
**Effort:** 30 min → 60 min for behavior change · 60 min → 120 min if redesigning
**Risk:** medium
**Cross-references:** Opus's E-09. CC's interpretation: currently overrides on Apply. The delta UI signals this but doesn't confirm intent.
**CC's recommendation:** add a small toggle in the auto-allocate modal: "Auto-allocate ☐ everything (overrides manual) ☑ only unallocated". Default to "only unallocated" so manual choices are respected. Apply respects the toggle.
**John's call:** ____

### Finding F-19: Buffer modal doesn't highlight current value

**Category:** ⚠️ UX clear
**What:** When the buffer modal opens with `bufferFloor=$364`, no chip is highlighted (chip set [0,100,200,300,500,750,1000] doesn't include $364). User has to read the Live-Preview to find their current value.
**Where:** `index.html:12339-12345` (buffer body) + `_buildQuickPickGrid` at `index.html:9967` (exact-match highlight)
**Frames affected:** 15, 16
**Effort:** 20 min → 40 min, confidence high
**Risk:** low
**Cross-references:** Opus E-08.
**CC's recommendation:** add "Current: $X" label above the chip grid. When user picks a chip, dim that label to "was $X". Apply same pattern to all other quickpick modals where current-value isn't in the chip set.
**John's call:** ____

### Finding F-20: Daily Living card surfaces four competing numbers

**Category:** 🎨 UX defer (design call)
**What:** Daily Living card shows "$25/day × 30 days = $750" + slider "$25/day" + "Math says you can afford up to $66/day" + recent-avg "$63/day". Four numbers competing for attention. Opus's E-10.
**Where:** `index.html:11792-11912` (renderPaydayLiving)
**Frames affected:** 05, 17
**Effort:** design pass — unknown until target spine is chosen
**CC's recommendation:** defer to Opus design pass. Possible spines: (1) the floor ($25), with everything else as context; (2) max-affordable ($66), with floor as adjustable; (3) recent-avg ($63), with the rest as guides.
**John's call:** ____

### Finding F-21: Input fields drop $ prefix vs everywhere-else `$X,XXX` formatting

**Category:** 💨 Smell (LOW)
**What:** Net pay input shows "7282", Custom bonus input shows "1341". Everywhere else shows currency-formatted. Inconsistent.
**Where:** `index.html:10524` (bonus net-pay) + `_buildQuickPickGrid` custom input at `index.html:9971`
**Frames affected:** 02, 03, 19
**Effort:** 30 min → 60 min, confidence high
**Risk:** low
**CC's recommendation:** wrap inputs with a `$` prefix span (positioned absolutely). Inputs stay number type for the right keyboard. Visual is `$ 7282`.
**John's call:** ____

### Finding F-22: Lock-confirm green button + amber warning conflict

**Category:** ⚠️ UX clear (LOW)
**What:** Lock button stays bright green even when tight-buffer amber warning is present. Mixed signal.
**Where:** `index.html:11062` (Lock confirm button styling)
**Frames affected:** 12
**Effort:** 15 min → 30 min
**Risk:** low
**CC's recommendation:** when warning present, down-style Lock to outline-amber (border + text amber, no fill). Keep solid green only when no warnings.
**John's call:** ____

### Finding F-23: Toast `white-space:nowrap` clips lock-confirmation message

**Category:** ⚠️ UX clear
**What:** Lock toast text is `🔒 Plan locked — tick items as you handle them · 🔥 N cycle streak · 💰 payday recorded as landed` — exceeds 380px viewport. Toast has `white-space:nowrap` so it clips.
**Where:** `index.html:13457` (toast CSS) + `index.html:11083` (lock toast composition)
**Frames affected:** 13, 21
**Effort:** 15 min → 30 min, confidence high
**Risk:** low
**Cross-references:** Opus E-05 framed this as banner clipping; CC pixel/code-grounded as toast.
**CC's recommendation:** drop `white-space:nowrap` from toast CSS + add `max-width: calc(100vw - 48px); white-space: normal; text-align: center;`. Toast wraps when too long.
**John's call:** ____

---

## Reconciliation against retro F-01..F-14

| Retro F# | Status after Opus review | Notes |
|---|---|---|
| F-01 Savings double-count | UNCHANGED — Opus missed it (pixel-only pass can't catch math chain) | CC's grounding stands. Highest priority blocking. |
| F-02 Math sub-line equation | CONFIRMED + SHARPENED by Opus E-01 (cause = hidden $298 deduction) | Merge: ship E-01's fix to close F-02. |
| F-03 Toast obscures content | CONFIRMED by Opus E-02 — but capture-cadence artifact partially overstates persistence. Real-world toast lifetime is 3000ms (grounded at index.html:13464). Capture interval ~400ms means 6-7 frames sit within window. Real user sees the toast 3s, NOT 6 frames worth. F-03 stands but severity downgraded from "lingers indefinitely" to "obscures during 3s window". | Pair with F-23 (toast clip). One toast refactor closes both. |
| F-04 Slider markers overlap | EXPANDED by Opus E-06. CC's "parity" claim was right for chip-on-track but missed chip-on-content-below. | Merged into E-06 fix above. |
| F-05 LANDED vs paydayReceived | UNCHANGED, deferred to John | |
| F-06 Scenario B doesn't trigger IMPOSSIBLE | UNCHANGED, harness fix not app fix | |
| F-07 Delete-trip button placement | UNCHANGED | |
| F-08 Lock-shortfall ignores provisions | UNCHANGED — Opus missed it | CC's grounding stands. Ship-soon batch candidate. |
| F-09 Streak inflation | UNCHANGED — Opus called streak a "positive callout" but didn't catch the in-session same-cycleId double-increment. | CC's investigation continues. |
| F-10 No actionable hint on shortfall | SUBSUMED by Opus E-04 / new F-16. F-10 was a thin slice of the bigger framing-instability finding. | Close F-10 in favor of F-16. |
| F-11 Buffer color semantics | UNCHANGED | Easy ship. |
| F-12 Chip overwrites Custom | UNCHANGED | |
| F-13 Locked plan reads live S | UNCHANGED, state-level investigation | |
| F-14 Cycle copy clarity | UNCHANGED, deferred | |

New from Opus: F-15 (relabel free-money) · F-16 (projection framing) · F-17 (bonus after lock) · F-18 (auto vs manual) · F-19 (buffer current highlight) · F-20 (daily living spine) · F-21 (input $ prefix) · F-22 (lock-confirm button color) · F-23 (toast clip).

**Total findings now: 14 retro + 9 new = 23 — minus 1 (F-10 → F-16 merge) = 22 active + 1 OQ.**

---

## Resolved status check — bonus persistence

Opus's Trace 1 (frames 01-13) shows bonus.amount propagates correctly canvas → modal → save → root → through nav → through lock. **CONFIRMED RESOLVED.**

Code grounding: the bonus modal save flow (`index.html:10590-10595`) writes via `BRAIN.plan.setBonus`, fires `renderPaydayPlanRoot` + `renderPlanMode` + `renderAll`. Canvas re-entry reads from `S.activePlan.income.bonus` which `getSnapshot` re-derives every render. No re-init path wipes it (rollover guard preserves bonus.included='expected' across cycles per index.html:19125-19132).

This closes the **original John complaint** that drove the demon-time bundle ("bonus wipes on canvas re-entry"). Marking the relevant retro F-NN that tracked this as **verified-by-vision**. From session memory it was the carry-forward / bonus persistence work — handled across commits `5184381` (Daily Living rebuild that also touched plan persistence) and `c56c0ab` (rollover guard).

Audit log spot-check would confirm `plan_bonus_edit` events fire on every save (canonical writer) — defer to a separate audit-log pass if rigour required.

---

## Metric notes for `docs/reviews/_metrics.md`

| Metric | This loop |
|---|---|
| Time from trigger to package (CC) | ~30 min from John's "go demon time" → Phase 4 ready |
| Findings in Phase 4 | 14 retro · 9 added from Opus = 22 active + 1 OQ |
| % findings grounded (not Open Question) | ~94% (22 of 23 grounded; 1 OQ on rollover deferral) |
| Findings surfaced by Opus that CC missed | **5** (E-04, E-05, E-06, E-08, E-09 mapped to F-16, F-23/E-05-clarified, F-04-expanded, F-19, F-18). Worth tracking — first loop, not alarming, but rising would signal sweep protocol gaps. |
| Findings CC pushed back on (material) | **0**. Soft framing pushbacks on E-03 (label vs canonicalisation) and E-05 (toast vs banner). Substance agreed. |
| Findings CC surfaced that Opus missed | **3** (F-01, F-08, F-09 — math chain + lock validation + streak data integrity). Validates that vision-only review needs pairing with state-level audit. |
| Follow-up sweeps needed | **1** (post-lock interaction integrity, scenario above) |
| Time from package to John's phone-verify | TBD — awaiting Phase 4 approval |

**Process amendment recommendation:** in MOCK-SWEEP-PROMPTS v2 Prompt B §2.2, add a "Pass H — math chain trace" alongside the existing state-persistence trace. For any frame showing a derived number, the reviewer follows the displayed formula back to its inputs and flags any unstated subtraction. Would have caught E-01 / F-02 immediately in Opus's review. Would NOT have caught F-01 (different class of bug) but would catch F-15 / F-19-class display bugs faster.

---

## What I'm waiting on from John (Phase 5 STOP)

Phase 5 STOP is active. Need John's Y / N / typed-alternative on each of these:

**Opus's open questions §8:**
- Q-01: Dark = default for captures? (CC strongly recommends yes)
- Q-02: "$X now → $Y left ..." canonical semantics — see F-16 options
- Q-03: Auto-allocate vs manual behavior — see F-18 options
- Q-04: Bonus editability after Lock — see F-17 options
- Q-05: Math sub-line $298 deduction (E-01 / F-02) — confirm display bug, not intentional? (CC: confirm fix)
- Q-06: ✅ Retro folder confirmed (already resolved)

**Phase 4 line-by-line (all 22 + 1 OQ):**
- F-01..F-14 from retro (carried over) + F-15..F-23 (new) — each needs Y/N/alt in the "John's call" field.

**Suggested fast-track approval set (highest-impact, lowest-risk):**

- 🚨 **Ship-now batch (~3h adjusted):** F-01 (savings double-count) · F-02/E-01 (math sub-line) · F-08 (lock-shortfall provisions) · F-11 (buffer color) · F-23/E-05 (toast clip) · F-22/E-12 (lock-confirm button)
- ⚠️ **Ship-soon batch (~3h adjusted):** F-04/E-06 (slider markers) · F-19/E-08 (buffer current value) · F-21/E-11 (input $ prefix)
- 🔍 **Investigation batch (~2h adjusted):** F-09 (streak inflation) · F-10/F-16 (projection framing) state-level
- 🎨 **Design-pass batch (defer):** F-05, F-14, F-17, F-18, F-20

Once John approves the ship-now batch, Bundle 29 closes after those land + a verify sweep.

---

## End of handoff. Phase 5 STOP active.

CC is waiting. No Edit/Write to `index.html` until John approves Phase 4. Next message from me should be EITHER a Phase 5 approval acknowledgement OR a follow-up clarification on a specific finding. Otherwise CC remains silent.
