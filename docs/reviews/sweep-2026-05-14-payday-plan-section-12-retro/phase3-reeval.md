# Phase 3 — Critical re-evaluation

Three structured passes.

## Pass A — Phase 1 holes

Re-scanning each frame for items I likely missed first pass.

### Frame 01
- I called the cycle string "paradoxical." Re-read: it literally says "next payday begins this cycle ✓ Paid 14 May". Now I read it as: "the next payday (which is today, May 14) begins THIS cycle that you're now planning for. Your payday LANDED today." So it's NOT paradoxical — it's announcing that today is payday for the new cycle. The previous cycle's date range "14 Apr → 14 May" is shown because that's the OLD cycle just closing. **Revision:** F-cycle-copy demotes from anomaly to UX-clarity-improvement (different copy is still desirable but not as urgent as I framed).

### Frame 05
- The 🚫 max marker is at $66/day position. The slider's $66 position on a [$20-$200] range = ((66-20)/180)×100 ≈ 25.5%. From the slider's left edge that's ~80px in on a 320px wide slider. Visually that's where I see it. Marker chip extends 5-6px below baseline due to top:42px placement on a ~28px-padded wrap. Yes, overlaps "Last 30 days".
- I did NOT inspect the 🎯 marker's exact dollar value vs recommended logic. Re-checking: shown as 🎯 $60. Per my code, recommendedFloor = round((recent_avg + 10) / 5) * 5 = round(73/5)*5 = $75. But display says $60. **Hmm — divergence.** Let me re-check: clamp is `Math.min(_rec_raw, maxAffordablePerDay * 0.9)` = min(73, 66*0.9=59.4) = 59.4. Round to nearest 5 = 60. ✓ So $60 is correct after clamp. My earlier reading was wrong — recommended IS $60. Phase 2 reasoning holds.

### Frame 07
- I didn't note that "Saved so far: $0 of $900" — but the trip Darwin's fixture shows `budget:900`, not `saved:0`. The "0" might be reading from the wrong field. Let me verify by checking PLAN.getTrips() output shape: { id, name, emoji, budget, saved: derived from S.savingsBuckets, gfSplitting, ... }. If no bucket linked, `saved` defaults to 0. So $0 is the trip's `.saved` derived field, which is correct pre-Apply. Not a finding.

### Frame 08
- I missed: the "in 'China Holiday' bucket" subtitle copy on China holiday row should be subtle. Re-read: it IS subtle (text3 grey). Good.
- I missed: "Other savings goals" section heading is partially obscured by the toast. Property Deposit row still visible. Not a new finding — same toast overlap.

### Frame 11
- I missed: the proportion bar segment widths AFTER auto-applied. Bills ~30%, Debts small, Savings ~17%, then living. Hard to read without pixel measurement but looks reasonable.

### Frame 16
- The Live-Preview rows showed "$1,000 buffer · max $45 · floor $25 · cycle remainder $1,609" all in GREEN. But buffer increase by $636 SHOULD show as `kind: warn` (negative impact). My _attachLivePreview kind classes — I made the buffer change with `kind: bufferDelta > 0 ? 'pos' : bufferDelta < 0 ? 'warn' : ''`. So buffer increase shows pos (green). That's WRONG — increasing buffer = decreasing max-affordable, which is what user usually doesn't want when funds are tight. Should be amber/warn. **F-11 candidate.** Re-reading my code at `index.html:11023`: yes I set `kind: bufferDelta > 0 ? 'pos' : bufferDelta < 0 ? 'warn' : ''`. Backwards — bigger buffer is conservative move, but in tonight-context, it eats into max. Either way the kind signals are debatable. **Revision:** soften to neutral `kind: ''` for buffer delta — let the max-affordable kind do the warning work.

### Frame 17
- 🚫 max marker now in slightly different position because max changed from $66 to $45. At $45 on [$20-$200] → ((45-20)/180)*100 ≈ 13.9%. Marker shifted LEFT compared to frame 05. Yes, that's correct. Both markers are at the LEFT half of the slider now — visually clustered. The 🎯 $40 + 🚫 max chips overlap horizontally (both around 13-15%). Re-eval: marker overlap horizontally too, not just vertically. Need horizontal jitter when they're close. **F-04 expanded** — both horizontal AND vertical overlap concerns.

### Frame 19
- I didn't check if the bonus.amount actually changed when user picked the $1,000 chip vs Custom. In frame 19, $1,000 chip is active. Was the prior state $1,341 (carry-forward from Scenario A)? Yes per frame 18. So user re-selecting $1,000 chip OVERWRITES the Custom $1,341. **Suggests Custom-typed values get dropped on chip re-select.** Re-check: `_readQuickPickValue` returns the picked chip value OR custom input value, prefer the active chip. So clicking $1,000 deselects custom → returns 1000. The custom $1,341 is lost. **F-12 candidate.** Should custom values persist if user reopens modal? Or should there be a confirmation when overwriting a custom-typed value? Likely the latter is overkill — but a small "previous: $1,341" sub-line in the modal could help.

### Frame 20
- Re-check: "+$1,000 bonus ✓ LANDED" — bonus row says LANDED but the top-of-screen status pill still says "Pay landed today?" → tap-to-mark-landed. So they ARE inconsistent (LANDED + Pay landed today?). I already flagged as F-05.

### Frame 21
- The "$12 now → -$5,546 left to cover this cycle" — $5,546 vs earlier $5,205. Difference $341. Scenario C bonus was $1,000 not $1,341, so total income was $8,282 (not $8,623). Diff in income $341 → diff in projection $341. Math correct.

### Cross-frame observation I missed
- Every locked canvas (frames 13, 21) shows the SAME values for Bills $5,248 6 of 15 paid, Debts $718 2 active, etc. Locked plan SHOULD snapshot these. But the values come from current S not from `S.activePlan.lockedSnapshot`. Re-check: `getSnapshot` always reads live S. So if S.debts changes post-lock, canvas reflects the new value, not the locked snapshot. **Potential issue: locked plan can "drift" if underlying data changes.** Not visible in this sweep but worth flagging. **F-13 (low / structural).**

## Pass B — Phase 2 confidence audit

Where did I declare a why-chain "grounded" but only made a plausible inference?

### F-01 (Savings double-count)
- Grounded at file:line ✓. Code path verified. CONFIDENT.

### F-02 (Math sub-line)
- Grounded at file:line ✓. Visual math verified against frame numbers. CONFIDENT.

### Drift cycle dates stuck
- I claimed bonus.included=true carried from prior cycle. Re-check fixture: `S.activePlan.income.bonus: { amount: 0, included: false, status: 'expected' }`. So bonus.included was FALSE in the original fixture. But the canvas shows $1,500 bonus in frame 01 — so SOMETHING set bonus.included=true. Possibilities: (a) prior test cycle's rollover-carry, (b) my rolloverIfNeeded carries `expected` bonus across cycles. Re-check carry logic: `index.html:19121-19132` — preserves bonus when included=true AND status='expected' AND amount>0. But fixture says included=false amount=0. So rollover-carry can't be the source.
- ALTERNATIVE: Frame 01's S.activePlan might have been MUTATED by a prior canvas open in the harness's session (the harness reuses one browser tab). Layer V Section 10/11 tests might have set bonus=$1,500 status='expected' BEFORE Section 12 ran, then the cycle ended, rollover fired, bonus carried.
- ✅ Re-grounded: Section 11 capture #74 sets bonus=$1,500 chip active. State persists across Section 10→11→12 within the same harness run. By the time Section 12 runs, fixture has been mutated. Each section affects the next.
- **OQ updated:** Layer V harness state-isolation issue. resetToCanvasRoot only navigates, doesn't reset S.activePlan.

### F-05 (LANDED vs paydayReceived)
- I framed as Open Question. Re-check if there's actual code-grounded decision: `index.html:11141` (lock handler) only fires markPaydayLanded if `bonus.included && bonus.status === 'confirmed' && !S.paydayReceived`. So immediate fire on bonus save would change the contract. CONFIRMED as a design question for John, not a bug.

### F-08 (Lock-shortfall ignores provisions)
- Re-check: `index.html:10937` reads `const remainder = snap.derived.freeTotal;`. freeTotal omits provisions. So yes, lock can fire when provisions push real shortfall to negative.
- ✅ Re-grounded: real bug.

### F-09 (Streak inflation)
- Re-check `S.activePlan.streak`. Per Bundle 28+ design, streak ≡ consecutive cycles locked. Currently increments unconditionally. Risk: unlock + relock within same cycle inflates. The actual streak should be cycle-bound.
- ✅ Re-grounded. F-09 valid finding.

## Pass C — Pre-hypothesis check (surprise is the signal)

Pre-hypothesis (from pre-flight):
> Frame 08 will show $500 header correctly (post-Batch D fix)
> Frame 10 will show Darwin $500→$755 delta (post 7dd37c8 fix)
> Frame 13 banner will be visible but the toast partially overlaps content — likely Finding
> Some scenario captures were taken BEFORE the latest visual polish pushes
> 4-8 Findings ranging from cosmetic to structural

Reality:
- Frame 08 $500 header: ✓ (matched prediction)
- Frame 10 Darwin delta: ✓ (matched prediction)
- Frame 13 toast overlap: ✓ (matched prediction)
- Latest polish pushes landed in captures (post-re-run): ✓
- **Findings count: 13 (F-01..F-13), more than predicted 4-8.** Surprise: structural double-count was hidden — savings count actually computes correctly per my new logic, but Apply doesn't clean up trip-id overrides → ghost allocation persists into lock validation
- Additional surprises:
   - **Surprise 1:** F-01 (savings double-count) is BLOCKING for John's tonight planning — if he allocates to a trip then auto-allocates, the trip allocation persists as a hidden ghost in his savings.total. His "remainder" displays wrong, and lock validation underestimates shortfall.
   - **Surprise 2:** Math sub-line equation (F-02) — clean visible bug I shipped in earlier Batch B without noticing. Equation as printed doesn't balance.
   - **Surprise 3:** Cycle copy paradox isn't actually paradoxical — it's announcing "today is payday for the new cycle". Re-read changed my interpretation.
   - **Surprise 4:** Streak inflation (F-09) — bug I introduced unintentionally.
   - **Surprise 5:** Rollover deferral has no user escape hatch. Stuck in "cycle ended" purgatory until 12h pass or work clears.

## Additions to Phase 1 + 2

(These are revisions emerging from Phase 3 critical re-eval. Folded back rather than separate list.)

- F-01 effort estimate: ~30 min naive → 60 min adjusted. Two write paths to update (Apply auto-create OR setOverride dedup).
- F-02 effort: ~15 min naive → 30 min. Cosmetic but display-math.
- F-04 EXPANDED: markers overlap both vertically AND horizontally when max + recommended values are close. Need to also detect proximity and offset horizontally.
- F-09 effort: ~30 min naive → 60 min. Need cycleId tracking field on streak.
- F-11 NEW: buffer-modal Live-Preview color semantics for buffer delta — current pos/warn classification is debatable. Soften to neutral.
- F-12 NEW: bonus-modal chip re-select overwrites Custom value without prior-state hint.
- F-13 NEW: locked plan reads live S, not lockedSnapshot — values can "drift" if underlying data changes mid-cycle.
- F-14 (cycle copy clarity) demoted from anomaly to optional improvement.

## Confidence summary

| Finding | Phase 2 grounding | Re-eval confidence |
|---|---|---|
| F-01 Savings double-count | file:line ✓ | HIGH — confirmed bug, blocking |
| F-02 Math sub-line equation | file:line ✓ | HIGH — visible math display bug |
| F-03 Toast persistence overlay | file:line ✓ | HIGH — cosmetic but consistent |
| F-04 Slider markers overlap (V+H) | CSS positioning ✓ | MEDIUM — depends on visual taste |
| F-05 LANDED vs paydayReceived | Open Question | LOW — needs John's design call |
| F-06 Scenario B doesn't trigger IMPOSSIBLE | scenario math ✓ | HIGH — harness fix, not app |
| F-07 Delete-trip-button placement | code ✓ | MEDIUM — UX clarity |
| F-08 Lock-shortfall ignores provisions | file:line ✓ | HIGH — financial-math bug |
| F-09 Streak inflation on relock | file:line ✓ | MEDIUM — edge case but ships |
| F-10 No actionable hint when projection<0 | render ✓ | HIGH — common state for John |
| F-11 Buffer kind-color semantics | CSS class ✓ | MEDIUM — debatable taste |
| F-12 Chip overwrites Custom silently | code ✓ | LOW — minor |
| F-13 Locked plan reads live S | structural ✓ | LOW-MEDIUM — needs separate sweep |
| F-14 Cycle copy clarity | render ✓ | LOW — optional |
| Rollover deferral escape hatch | Open Question | MEDIUM — depends on John's preference |
