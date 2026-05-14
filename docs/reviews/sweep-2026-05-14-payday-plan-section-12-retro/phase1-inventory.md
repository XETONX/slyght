# Phase 1 — Per-frame inventory

Sweep: 2026-05-14 / payday-plan-section-12-retro / 21 frames
Walked end-to-end with multimodal vision. "Obscured" means I couldn't read it in this capture (not a guess).

## Cross-frame baseline

- **Active cycle displayed:** "Cycle 14 Apr → 14 May · Cycle ended — next payday begins this cycle" — persists across ALL frames despite cycleEndDate being today. Rollover deferred by the 12h-grace guard (bonus.included=true on entry → hasWork=true → defer).
- **Paydayreceived banner:** "✓ Paid 14 May" green pill in TOP-RIGHT on every frame EXCEPT Scenario C frame 20 (where the script explicitly reset paydayReceived=false). Returns to "✓ Paid 14 May" by frame 21 when lock triggers markPaydayLanded.
- **Toast persistence:** the "📋 New cycle started — $X bonus carried forward" toast from frame 01's rollover lingers through frames 02-06 and even covers content in frames 03, 05, 06, 08-12. Multi-second persistence overlays modal Live-Preview rows.
- **Locked banner copy:** "Plan locked DD MMM · 🔥 N cycle streak" + microcopy + RE-PLAN button (amber gradient) — only on locked frames 13 and 21.

## Frame-by-frame inventory

### Frame 01 — scenario-A-canvas-root-fresh
- **Inferred state:** rollover just fired carrying $1,500 bonus from prior cycle; paydayReceived=true; bonus.amount=1500, status='expected', included=true
- **Visible text:** "$8,782 money coming in" · "+$1,500 bonus" · amber EXPECTED pill · "$12 now → -$5,046 left to cover this cycle" · "New cycle started — $1,500 bonus carried forward" toast
- **Value of interest:** bonus = $1,500 (NOT $0 as Scenario A pre-condition expected — carried from prior test cycle)
- **Anomalies:** Toast covers Essentials total row · "Cycle ended" + "Paid 14 May" together reads contradictorily
- **A11y:** OK

### Frame 02 — scenario-A-bonus-modal-fresh
- **Inferred state:** modal opened over canvas in state 01; $1,500 chip pre-selected from S.activePlan.income.bonus.amount
- **Visible text:** "Pay & bonus this cycle" · "Net pay this cycle: 7282" · Include toggle ON · chips with $1,500 active green pill · "Status: Expected (not in account yet)" · Live-Preview "Net pay $7,282 · Bonus $1,500"
- **Value of interest:** bonus chip $1,500 pre-active (reads from carried-forward state)
- **Anomalies:** persistent toast partially covers Live-Preview cycle remainder row
- **A11y:** chevron rendering correctly on Status dropdown ✓

### Frame 03 — scenario-A-bonus-1341-custom-filled
- **Inferred state:** Custom button tapped, "1341" typed in custom input; all chips de-selected
- **Visible text:** Custom input ring amber (focus) · "1341" · chips de-activated · status dropdown chevron · Live-Preview shows "Cycle remainder $1,609" (rest obscured by toast)
- **Value of interest:** bonus changing $1,500→$1,341 reflected in Live-Preview cycle-remainder
- **Anomalies:** Live-Preview rows "Bonus $1,341" + "Money coming in $8,623" OBSCURED by lingering frame-01 toast — unreliable visual feedback during entry
- **A11y:** Live-Preview obscured by toast

### Frame 04 — scenario-A-canvas-after-bonus
- **Inferred state:** bonus saved at $1,341; canvas re-rendered
- **Visible text:** "$8,623 money coming in" · "+$1,341 bonus" amber EXPECTED pill · "$12 now → -$5,205 left to cover this cycle" red · Remainder $1,609 · "✓ Pay + bonus updated" toast
- **Value of interest:** bonus row updated to $1,341 ✓
- **Anomalies:** Toast overlapping Essentials total row · projection red is mathematically correct given fixture
- **A11y:** OK

### Frame 05 — scenario-A-daily-living-card
- **Inferred state:** navigated to daily living sub-screen
- **Visible text:** "$25/day × 30 days = $750" · Status 👀 Tight (amber) · "Math says you can afford up to $66/day" · 🎯 $60 marker (blue) · 🚫 max marker (red, partially obscured) · "Last 30 days you actually spent $63/day — $38/day over your floor" · "Safety buffer for surprises $364"
- **Value of interest:** maxAfford=$66, status=Tight, recommended=$60
- **Anomalies:** 🎯 + 🚫 markers extend INTO the "Last 30 days" recent-avg text row (the "30" digit partially obscured by the markers)
- **A11y:** Visual overlap between slider markers and adjacent content

### Frame 06 — scenario-A-savings-sub-fresh
- **Inferred state:** savings sub-screen, no Darwin allocation yet
- **Visible text:** "$0 allocated" header · "Pool to allocate: $1,245 left to split across goals" · sub-line "$1,907 surplus − $364 safety buffer = $1,245" · Upcoming Trips: Darwin only $0/$900 in 23d · Your savings goals: China holiday ($97/$5000 2%) + Freedom buffer ($0/$9000 0% stored in Rainy Day Fund) · Other savings goals (Property Deposit) · "Gifts & Celebrations" and "Rego & Insurance" correctly HIDDEN
- **Value of interest:** savings.total=$0, allocatable=$1,245
- **Anomalies:** Math sub-line says $1,907 − $364 = $1,245 but actually $1,907 − $298 provisions − $364 buffer = $1,245. **Provisions silently subtracted but not in displayed equation. Equation as printed doesn't balance.**
- **A11y:** Math display misleading

### Frame 07 — scenario-A-darwin-alloc-500-picked
- **Inferred state:** Darwin trip modal · $500 chip active
- **Visible text:** "Allocate to Darwin" · "Saved so far: $0 of $900" · "Need ~$300/week to hit it before the trip" · $500 chip green active · Live-Preview rows: "This cycle into Darwin: $500 · Trip progress: 0%→56% · Still need before trip: $400 · Pool still free: $1,109" · "🗑 Delete this trip" red full-width button
- **Value of interest:** trip alloc UI shows progress preview cleanly
- **Anomalies:** "Delete this trip" semantic unclear — does it delete the trip definition (S.tripDefs), the bucket, or the per-cycle allocation? Wide red full-width button is a dangerous affordance for an unclear action
- **A11y:** Touch targets fine but action ambiguous

### Frame 08 — scenario-A-savings-sub-after-darwin
- **Inferred state:** Darwin saved at $500 (override key: savings:trip-darwin-2026)
- **Visible text:** "$500 allocated" header ✓ · "Pool to allocate: $745" · sub-line "$1,407 surplus − $364 safety buffer = $745" · Darwin row $500 · 23d · China + Freedom + Property Deposit
- **Value of interest:** savings header counts trip-id override ✓ (post-fix verified)
- **Anomalies:** Math sub-line again says $1,407 − $364 = $745 (omits $298 provisions) · Darwin row checkbox unchecked but $500 shown — pre-lock state can't tick yet so checkbox is purely decorative pre-lock
- **A11y:** Math display misleading

### Frame 09 — scenario-A-canvas-after-darwin
- **Inferred state:** back to canvas after Darwin save
- **Visible text:** "$8,623" · "+$1,341 EXPECTED" · "-$5,205 left" · proportion bar with small green Savings segment · Remainder $1,609 (unchanged) · "✓ $500 → Darwin" toast
- **Value of interest:** savings bar segment widened
- **Anomalies:** Remainder unchanged because remainder = totalToPlan − essentials (NOT savings). But user might reasonably expect "$500 → Darwin" to reduce a visible number on canvas root. Bar widening is the only signal.
- **A11y:** Inconsistent user mental model

### Frame 10 — scenario-A-auto-allocate-with-darwin-set
- **Inferred state:** Auto-allocate modal opened with Darwin $500 pre-set
- **Visible text:** Already covered: Bills $5,248 + Debts $718 + Daily living $750 + Annual provisions $298 + Safety buffer $364 · ALLOCATABLE $1,245 green · **Darwin "1st cycle" tag · $500 strikethrough → $755 +$255** ✓ · China holiday "200d" $385 with reasoning "↳ 200d out · 2% complete — push it forward · in 'China Holiday' bucket" · Freedom buffer $105 with "↳ starting from $0 · in 'Rainy Day Fund' bucket" · footnote about 1st cycle
- **Value of interest:** allocatable=$1,245 (= surplus) · Darwin current→proposed delta visible ✓
- **Anomalies:** Bottom footnote partially obscured by persistent toast · Darwin shows "1st cycle" tag suggesting no bucket exists, but the savings-sub list in frame 08 already has a Darwin trip row. The trip-id override coexists with the synth-bucket creation that Apply will trigger. **Foreshadows F-01 double-count.**
- **A11y:** Delta UI works well

### Frame 11 — scenario-A-canvas-after-auto-applied
- **Inferred state:** Apply tapped, auto-allocate persisted across 3 goals (Darwin, China, Freedom)
- **Visible text:** same headline values · wider proportion bar Savings segment · "✓ Auto-allocated across 3 goals" toast
- **Value of interest:** **savings.total now includes Apply allocations PLUS the lingering trip-id override** (F-01)
- **Anomalies:** Toast over Essentials total
- **A11y:** OK

### Frame 12 — scenario-A-lock-confirm-modal
- **Inferred state:** Lock modal opened post-apply
- **Visible text:** "🔒 Lock this cycle's plan?" · After locking copy (3 bullets) · ⚠️ **"Buffer is tight ($162 vs $364 floor)"** amber warning · Cancel + Lock buttons
- **Value of interest:** freeTotal=$162 reported to lock modal
- **Anomalies:** **$162 in freeTotal implies $1,608 in commitments above essentials. Auto-allocate result was $1,245. Difference: $363 ≈ leftover trip-id Darwin override ($500 manual) overlapping with new Darwin bucket ($755 auto). Confirms double-count.** Lock is ALLOWED even though after provisions ($298), real free is $162 − $298 = −$136. Lock-shortfall check ignores provisions.
- **A11y:** Lock allowed in shortfall state — financial-math risk

### Frame 13 — scenario-A-canvas-locked
- **Inferred state:** post-lock
- **Visible text:** AMBER LOCKED BANNER: 🔒 Plan locked 14 May · 🔥 2 cycle streak · RE-PLAN button ✓ · no drift banner ✓ (grace period working) · all other elements same as frame 11
- **Value of interest:** locked banner visible ✓
- **Anomalies:** Toast "Plan locked — tick items..." overlaps Daily living row content · Streak shows "2 cycle streak" but this is the FIRST lock in this session — streak field is from carry-forward of prior test cycles · Cycle dates "14 Apr → 14 May" persist — locked plan refers to a CLOSED cycle, mental-model odd
- **A11y:** Banner works ✓

### Frame 14 — scenario-B-canvas-fresh
- **Inferred state:** Scenario B "reset" — resetToCanvasRoot ran but bonus.amount and bonus.included carry over from Scenario A end state (and unlock state)
- **Visible text:** $8,623 / +$1,341 EXPECTED / -$5,205 / Remainder $1,609 / "New cycle started — $1,341 bonus carried forward" toast
- **Value of interest:** scenario isolation broken — bonus.amount carried
- **Anomalies:** resetToCanvasRoot doesn't actually reset S.activePlan.income — only navigates the UI
- **A11y:** Layer V harness limitation

### Frame 15 — scenario-B-buffer-modal-fresh
- **Inferred state:** Buffer modal opened from Daily Living
- **Visible text:** "Safety buffer" · chips $0-$1,000 + Custom · Live-Preview: Safety buffer $364 · Max affordable / day $66 · Your current floor $25/day · Cycle remainder $1,609 · "Higher buffer = lower max affordable per day" hint
- **Value of interest:** maxAfford=$66 baseline
- **Anomalies:** Toast persistent at bottom (from Scenario A)
- **A11y:** OK

### Frame 16 — scenario-B-buffer-1000-preview-impossible
- **Inferred state:** $1,000 chip active
- **Visible text:** Safety buffer $1,000 · Max affordable / day $45 · Your current floor $25/day · Cycle remainder $1,609 · Live-Preview values green
- **Value of interest:** maxAfford drops $66→$45 (–$21 = $636 ÷ 30 days). Math is correct.
- **Anomalies:** Floor $25 < max $45 → status will be Tight at worst, NOT Impossible. **Scenario name is misleading.** To trigger IMPOSSIBLE, buffer would need to be ~$1,725.
- **A11y:** Misnamed scenario

### Frame 17 — scenario-B-daily-living-impossible
- **Inferred state:** Buffer saved $1,000 · returned to daily living card
- **Visible text:** $25/day × 30 days = $750 / Status 👀 Tight amber / "Math says you can afford up to $45/day" / 🎯 $40 marker / 🚫 max marker stacked below ✓ / "Last 30 days $63/day — $38/day over your floor" / Safety buffer $1000 / "✓ Safety buffer: $1000" toast
- **Value of interest:** floor $25 still ≤ max $45 → status Tight (NOT Impossible despite scenario name)
- **Anomalies:** Markers stack vertically ✓ but still overlap recent-avg text row · Scenario didn't trigger IMPOSSIBLE — would need buffer > ~$1,725 to do so · Status pill copy "Tight" without explaining WHY tight (recent avg far above floor, not buffer-related)
- **A11y:** Marker overlap remains

### Frame 18 — scenario-C-canvas-fresh
- **Inferred state:** Scenario C reset · paydayReceived force-set to false
- **Visible text:** identical to frame 14 except top label now shows "Pay landed today?" GREEN pill (NOT "✓ Paid 14 May") because paydayReceived was force-reset to false in scenario C setup
- **Value of interest:** paydayReceived=false visible in pill
- **Anomalies:** Bonus.amount still $1,341 from prior scenario — scenario isolation still broken for bonus value
- **A11y:** Layer V harness limitation

### Frame 19 — scenario-C-bonus-confirmed-status
- **Inferred state:** bonus modal · $1,000 chip · status dropdown "Confirmed"
- **Visible text:** chips $500-$3,000 + Custom · $1,000 active green · "Status: Confirmed (already landed)" · Live-Preview: Net pay $7,282 · Bonus $1,000 (rest obscured by toast)
- **Value of interest:** status='confirmed' selected
- **Anomalies:** Status dropdown chevron rendering correctly ✓ / Live-Preview obscured by toast
- **A11y:** OK

### Frame 20 — scenario-C-canvas-after-confirmed-bonus
- **Inferred state:** post-save · before lock
- **Visible text:** "$8,282 money coming in" · "+$1,000 bonus ✓ LANDED" GREEN pill · "$12 now → $1,736 left when next pay hits" green · "Pay landed today?" green pill in top right · paydayReceived still false (lock hasn't fired yet) · Remainder $1,268 · "✓ Pay + bonus updated" toast
- **Value of interest:** bonus.status='confirmed' surfaces as green LANDED pill ✓ / paydayReceived NOT yet flipped (lock pipeline only fires on lock)
- **Anomalies:** Projection-label says "when next pay hits" — accurate while paydayReceived=false. But bonus says LANDED, which implies money's in the account. **Semantic mismatch:** LANDED ≠ paydayReceived in the data model, but to a user, "money has landed in my account" naturally means paydayReceived=true. Two different state flags drifting apart.
- **A11y:** Inconsistent state representation

### Frame 21 — scenario-C-canvas-locked-paydayLanded
- **Inferred state:** post-lock · markPaydayLanded fired due to bonus.confirmed
- **Visible text:** header "✓ Paid 14 May" green pill ✓ · Plan locked banner 14 May · 🔥 3 cycle streak ✓ · "$12 now → -$5,546 left to cover this cycle" projection-label adapted ✓ · "+$1,000 bonus ✓ LANDED" green pill · "Plan locked — tick items as you handle them · 🔥 3 cycle streak · 🪙 payday recorded as landed" toast (truncated)
- **Value of interest:** Lock fires → paydayReceived=true → "✓ Paid" + projection-label adapts ✓
- **Anomalies:** Daily living row partially covered by toast
- **A11y:** Pipeline works end-to-end ✓

## Interactivity map (consolidated across frames)

| Element | Type | Where it appears | Confidence |
|---|---|---|---|
| Back arrow `<` | nav button | every canvas top-left | H |
| Sync chip top-right | icon button | every canvas | H |
| "Pay landed today?" / "✓ Paid DD MMM" pill | toggle/state-display | top of canvas | H |
| 🔒 RE-PLAN button (amber) | button | locked frames 13, 21 | H |
| Money-coming-in row ✏️ pencil | button | every canvas | H |
| EXPECTED / LANDED bonus pill | display only | bonus row | H |
| Proportion bar segments | display only | every canvas | H |
| Essentials nav rows (Bills/Debts/Daily living/Annual provisions) | button | every canvas | H |
| Remainder after essentials tile | display (possibly tappable for explain) | every canvas | M |
| Daily living slider | input range | frames 05, 17 | H |
| 🎯 / 🚫 markers | display (overlay) | frames 05, 17 | H |
| Safety buffer row | button | frames 05, 17 | H |
| Quickpick chips | toggle buttons | every modal | H |
| Custom button + input | toggle + text-input | every quickpick modal | H |
| Status dropdown | select | bonus modal | H |
| Include bonus toggle | switch | bonus modal | H |
| Cancel / Save / Lock / Apply buttons | button | every modal | H |
| 🗑 Delete this trip (red full-width) | DANGEROUS button | frame 07 | M (semantic unclear) |
| Trip/bucket rows + checkbox | row tap (pre-lock) · tick (post-lock) | savings sub | H |
| Auto-allocate split rows (covered / allocatable / split) | display | frame 10 | display only |
| Toast | display only · obscures content | every frame | H |

## Accessibility & UX (consolidated)

- **Contrast:** all text ≥4.5:1. Red projection on white passes. Amber EXPECTED pill on white passes.
- **Touch targets:** all chip buttons ≥44px ✓ · row navigation ≥44px ✓ · "🗑 Delete this trip" full-width red button is over-tappable for an irreversible action — should have confirm step
- **Toast positioning:** bottom:180px z-index 800 means it overlays everything including modal Live-Preview rows (frame 03 cuts off Bonus + Money coming in rows). Long-lived toast persistence across multiple frames obscures content
- **Slider markers:** vertical stacking fixed but row extends into adjacent text — needs more vertical buffer below slider
- **Cycle copy:** "Cycle ended — next payday begins this cycle" is paradoxical — conflates "previous cycle just ended" with "this new cycle just began"
- **Math sub-line:** "$X surplus − $Y buffer = $Z" in savings pool omits the $298 provisions subtraction — equation as printed doesn't balance

## Open questions surfaced in Phase 1

- **OQ1** — Why does Scenario B/C "fresh canvas reset" carry the bonus from Scenario A? Is resetToCanvasRoot supposed to reset state, or only navigation?
- **OQ2** — When rollover is deferred by the 12h-grace guard, how does the user advance to a new cycle? Is there a "Start new cycle" affordance, or do they wait 12h+?
- **OQ3** — The 🗑 Delete this trip button in frame 07 — does it delete the trip definition (S.tripDefs), the bucket, both, or the per-cycle allocation? File-line grounding needed.
- **OQ4** — Frame 12 lock-confirm shows "$162 vs $364 floor" tight-buffer warning. Lock is allowed despite the math implying provisions push it negative. Is provisions intentionally excluded from the lock-shortfall check, or oversight?
- **OQ5** — Frame 20 shows "✓ LANDED" bonus pill but "Pay landed today?" prompt is also visible — bonus.status='confirmed' diverges from paydayReceived flag. Should LANDED bonus auto-flip paydayReceived, or are these intentionally independent?
