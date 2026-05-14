# Phase 2 — Why-chains (grounded)

Each why-chain bottoms out at `file:line` / data field / named convention OR an explicit Open Question.

---

## 🔎 Anomaly: Savings double-count (frames 08, 10, 11, 12)

After Scenario A: user manually allocated $500 to Darwin via openEditPaydayTripAlloc, then auto-allocate Apply assigned $755 to a NEW "Darwin" bucket. Both overrides persist, savingsTotal counts both.

- **What does the trip-alloc save do?** → Writes `S.activePlan.overrides['savings:trip-darwin-2026'] = { thisCycleAmount: 500 }`
   - **Why?** → `openEditPaydayTripAlloc` save handler calls `BRAIN.plan.setOverride('savings', 'trip-' + tripId, amt, {}, BRAIN.SOURCES.PLAN_OVERRIDE_SET)` at `index.html:10548`
       - **Why is the key `trip-X` not the bucket name?** → Because at trip-card tap time, no bucket exists for this trip yet (Darwin is synthetic until Apply creates it). Key has to be unique.
           - ✅ Grounded: `index.html:10548`

- **What does auto-allocate Apply do for synth trips?** → Creates a bucket named after the trip + sets bucketHint, then writes `S.activePlan.overrides['savings:Darwin'] = { thisCycleAmount: 755 }`
   - **Why doesn't it also clear the trip-id override?** → Apply iterates `rec.bucketAllocations` and calls setOverride for each by NAME. It never inspects existing trip-id overrides for the same trip.
       - ✅ Grounded: `index.html:19390-19412` (synth bucket creation) + `index.html:19413-19418` (override setting). The cleanup step is absent.

- **What counts savingsTotal?** → Sums both bucket-keyed (`savings:Darwin`) AND trip-id-keyed (`savings:trip-darwin-2026`) overrides.
   - **Why both?** → My Batch D fix (`getSnapshot` rewrite) iterated EVERY `savings:*` key to correctly count trip-only overrides. Without dedup, post-Apply both are counted.
       - ✅ Grounded: `index.html:18247-18266` (the _bucketSavingsFromOv + _tripOrOtherSavings sum)

- **Conclusion:** F-01. Fix in Apply (or in setOverride): when Apply creates a bucket for a trip, clear the trip-id override. Alternatively, savingsTotal should dedupe trip-id ↔ bucket-name pairs via PLAN.getTrips() lookup.

---

## 🔎 Anomaly: Math sub-line equation doesn't balance (frames 06, 08)

Display reads "$1,907 surplus − $364 safety buffer = $1,245". Real: $1,907 − $298 provisions − $364 buffer = $1,245.

- **What is `surplusBeforeBuffer` set to?** → `Math.max(0, freeTotal)` at `index.html:11983`
   - **What is `freeTotal`?** → `totalToPlan − claimedTotal` where `claimedTotal = bills + debts + savings + upcoming + living` (NOT provisions, NOT buffer)
       - **Why does freeTotal omit provisions?** → freeTotal was the original "what's left" formula from Bundle 27. Provisions were added LATER (Bundle 28 round 47) to the canvas remainder formula but NOT retroactively to freeTotal.
           - ✅ Grounded: `index.html:18244` (claimedTotal definition)
- **What is `allocatable` (displayed as $1,245)?** → `snap.derived.allocatableToSavings = max(0, totalToPlan − bills − debts − upcoming − living − provisions − buffer − savings)`
   - ✅ Grounded: `index.html:18302` (allocatableToSavings calculation)
- **Conclusion:** F-02. The displayed equation "surplus − buffer = allocatable" is misleading because surplus here is freeTotal (without provisions) but allocatable subtracts provisions+buffer. To make it balance:
  - Option A: change display to `$X surplus − $Y provisions − $Z buffer = $W` (3-term)
  - Option B: change `surplusBeforeBuffer` to `snap.derived.surplus + savings` (so it represents money before savings+buffer subtract). Then equation is `surplus − buffer = allocatable` and balances.
  - Option B requires also dropping savings from claimedTotal in display reasoning. Cleaner but bigger change.

---

## 🔎 Anomaly: Drift banner suppressed by grace, but cycle dates stuck (frames 04, 13, 14, 18, 20, 21)

Canvas displays "Cycle 14 Apr → 14 May · Cycle ended — next payday begins this cycle" across every Scenario, despite cycleEndDate being today.

- **Why does the cycle string say "Cycle ended"?** → Because cycleEndDate (May 14) ≤ now. Display logic at `index.html:?` reads cycleEndDate and renders this banner.
   - **Why doesn't rolloverIfNeeded create a fresh cycle?** → It tried, but the 12h-grace guard deferred. `hasWork=true` because `bonus.included=true` was carried over from prior test cycle.
       - ✅ Grounded: `index.html:19256-19273` (the rolloverIfNeeded guard I added)
- **What's the user supposed to do?** → No clear path. Wait 12+ hours? Re-plan?
   - ❓ **OQ2 (Open Question for John)** — there's no "Start new cycle anyway" affordance when rollover is deferred. Either:
     - A: rollover should fire regardless of hasWork (carry the work forward — but the script DOES carry bonus + provisions + streak)
     - B: add an explicit "Start new cycle" button when cycle has ended + rollover deferred
     - C: tighten hasWork — only defer if user-meaningful work exists (lockedAt OR overrides). Bonus.included alone shouldn't block — bonus carries forward anyway.
   - **Recommendation:** Option C. The hasWork predicate is too inclusive. Adjust to require lockedAt OR Object.keys(overrides).length>0 — strip the bonus / knownUpcoming clauses since those CARRY through rollover.

---

## 🔎 Anomaly: Toast persistence obscures content (frames 02-12)

The "📋 New cycle started — $X bonus carried forward" toast from frame 01's rollover lingers through 5+ subsequent frames and covers modal Live-Preview rows (frame 03), Essentials total (frames 04, 08), and the auto-allocate footnote (frame 10).

- **What's the toast lifetime?** → Default toast duration, search for showToast.
   - ✅ Grounded: `index.html:13302` (showToast). Default duration likely 3-5 seconds, dismisses via setTimeout.
- **Why does it persist across frame captures?** → Frames are captured ~250-450ms apart (await page.waitForTimeout calls in layerV-capture.js). The toast's setTimeout dismissal doesn't fire faster than capture cadence. Each capture freezes whatever was on screen at that moment.
- **Why does toast overlay modal Live-Preview content?** → Toast z-index 800, modal content z-index 700. Bundle 28.x fix raised toast from 500→800 so it shows above canvas. But modal Live-Preview rows are below 800. Toast wins.
- **Conclusion:** F-03 (cosmetic, mid-priority). Toast positioning at bottom:180px is too high. Lower to bottom:32px so it sits below the typical Save/Cancel button row but doesn't cover content. OR: drop toast z-index below modal content (700) when a modal is open.

---

## 🔎 Anomaly: 🚫 max marker overlaps recent-avg text row (frames 05, 17)

The 🎯 + 🚫 marker chips stack vertically below the slider thumb but the bottom marker's chip pushes into the "Last 30 days you actually spent..." row, partially obscuring the "30" digit.

- **What positions the markers?** → CSS `.lc-marker-rec{top:18px}` + `.lc-marker-max{top:42px}` at `index.html:204-205` (Bundle 29 demon-time stacking fix).
   - **Why top:42px?** → Approximation. Slider height is 6px, thumb height 26px, marker chip height ~16px. So 18px+26px = 44px is roughly the next clear line. I picked 42 — too tight, no padding to the row below.
       - ✅ Grounded: CSS positioning math is off by ~10-15px
- **What's the recent-avg text row's top position?** → Comes after `.lc-slider-wrap` which has padding-bottom:26px (from my Bundle 29 fix earlier). 26px padding-bottom + 6px slider = 32px. Marker chip extends 16px below at top:42px = bottom at ~58px. Padding ends at 32px. Overlap = 26px.
- **Conclusion:** F-04 (cosmetic, low). Increase `.lc-slider-wrap` padding-bottom from 26px → 56px to give markers room below.

---

## 🔎 Anomaly: "✓ LANDED" bonus pill vs paydayReceived flag divergence (frame 20)

Frame 20 shows green "✓ LANDED" bonus pill simultaneously with green "Pay landed today?" pill (paydayReceived=false). User sees "money landed" in one place but "have you been paid?" in another.

- **What drives the LANDED bonus pill?** → `bonus.status === 'confirmed' && bonus.included` at `index.html:9710-9714` (Bundle 29 demon-time bonus status pill)
- **What drives the "Pay landed today?" pill?** → `!S.paydayReceived` (paydayReceived flag)
   - ✅ Grounded: both have distinct sources of truth
- **What does the user mean by "landed"?** → Likely BOTH: bonus + base salary have hit the bank.
- **Why are they decoupled?** → Bonus.status='confirmed' is set in the bonus modal by the user. paydayReceived flips when markPaydayLanded fires (currently only on lock with bonus.confirmed).
- **Why doesn't setting bonus.status='confirmed' immediately flip paydayReceived?** → Bundle 29 demon-time deliberately deferred to lock so the flow has a single trigger point. Modal save → re-render → lock fires → markPaydayLanded.
   - ❓ **OQ5 (Open Question for John)** — should bonus.status='confirmed' save ALSO fire markPaydayLanded immediately, OR is the lock-gate intentional? Argument FOR immediate: matches user mental model. Argument AGAINST: user may set "confirmed" exploratively without committing. Lock = commit point.
- **Conclusion:** F-05 (semantic question, defer to John). Either:
  - A: bonus.confirmed save fires markPaydayLanded (immediate)
  - B: surface a subtle hint near the LANDED pill: "Lock the plan to record payday landed" (clarify the gate)

---

## 🔎 Anomaly: Scenario B's "IMPOSSIBLE" doesn't actually trigger (frames 16, 17)

Scenario B set buffer to $1,000 expecting IMPOSSIBLE state. Captured state is "Tight" because floor ($25) < max ($45). To trigger IMPOSSIBLE, buffer would need to push max below floor ($1,725+ buffer).

- **What's the IMPOSSIBLE trigger?** → `floor > maxAffordablePerDay` in `_computeLivingStatus` at `index.html:11960`
- **Why doesn't B trigger?** → Buffer $1,000 leaves max=$45. Floor=$25 < $45 → not impossible.
   - ✅ Grounded: math is correct, scenario expectation is wrong
- **Conclusion:** F-06 (harness, not app). Scenario B's buffer chip needs to be either Custom $1,750+ OR also push floor up to $50+ to trigger IMPOSSIBLE. Layer V script fix, not app fix.

---

## 🔎 Anomaly: "Delete this trip" button in trip-alloc modal (frame 07)

Wide red full-width button "🗑️ Delete this trip" at the bottom of the Darwin trip-allocation modal.

- **What does it do?** → `confirmDeleteTrip(tripId)` at `index.html:23861`
   - **Does it confirm?** → Yes — `confirm()` prompt at `index.html:23871` with explicit copy "Delete '<name>'?\n\n$X currently saved toward this trip stays in its bucket (we don't lose money). The trip itself + any PLAN.intents link will be removed."
       - ✅ Grounded: `index.html:23861-23892`
- **Conclusion:** OQ3 partly resolved — it has a confirm step. But the BUTTON is still over-tappable in the trip-allocation modal. User taps Darwin to allocate $500, sees a red full-width delete button at the bottom — wrong primary action for the surface. Should be a smaller secondary button at the top of the modal, or moved to a separate "manage" sub-menu.
- F-07 (UX clear, low-medium).

---

## 🔎 Anomaly: Lock-shortfall check ignores provisions (frame 12)

Lock modal shows "Buffer is tight ($162 vs $364 floor)" warning. Lock is ALLOWED. But after the savings double-count fix is applied, free is $662; after provisions $298, $364. With double-count: $162. Either way, the displayed $162 doesn't account for provisions.

- **What blocks lock?** → `if (remainder < 0)` at `index.html:?` — uses `snap.derived.freeTotal` which OMITS provisions.
- **Should it use surplus (which includes provisions) or freeTotal?** → Surplus is the more conservative check. freeTotal misses ~$298/month obligation.
- **Conclusion:** F-08 (financial-math). Lock-shortfall check should use snap.derived.surplus (or surplus + buffer guard) so it can't be locked into a real shortfall after provisions.

---

## 🔎 Anomaly: Streak field carried across test cycles (frames 13, 21)

Frame 13 shows "🔥 2 cycle streak" after the FIRST lock in this test session. Frame 21 shows "🔥 3 cycle streak" after Scenario C's lock. Streak is incrementing across in-session test locks.

- **Where does streak get set?** → `S.activePlan.streak = (+S.activePlan.streak || 0) + 1;` at `index.html:11097` (openPaydayLockPlan save handler).
- **Where does it persist?** → `S.activePlan.streak` survives save + load.
- **Why was it 2 at frame 13?** → State-snapshot.json fixture probably has S.activePlan.streak set to 1 already (legacy from prior runs). Lock fires → 1+1 = 2.
   - ✅ Grounded: `index.html:11097` increments unconditionally on every lock
- **Conclusion:** F-09 (low). Streak should only increment ONCE per cycle. Currently increments on EVERY lock action — if user unlocks + relocks within the same cycle, streak inflates. Add cycleId tracking: only increment if streak hasn't been incremented for this cycleId yet.

---

## 🔎 Anomaly: "$12 now → -$5,205 left to cover this cycle" on canvas root (multiple frames)

Red projected end balance is shown on canvas root. This is John's real fixture financial state — he'd actually be short by $5K by end of cycle. Doesn't prompt action.

- **What is projectedEndBalance?** → `currentBalance + expectedSalaryStill + bonusAmt − (billsUnpaidTotal + debtsUnpaidTotal + livingTotal + upcomingTotal)` at `index.html:18255`
- **What does negative mean?** → Cycle ends in shortfall. User runs out of money before next pay.
- **Is there an actionable hint?** → No. Just shows red.
- **Conclusion:** F-10 (UX clear, high impact). When projectedEndBalance < 0, show an inline "What can I do about this?" link/button → opens the same Can't-Lock options modal but as advisory.

---

## 🔎 Verified working (no findings)

- Bonus EXPECTED / LANDED pill rendering ✓
- Projection-label adapts ("when next pay hits" vs "to cover this cycle") ✓
- Auto-allocate current→proposed delta visible ✓ (push 7dd37c8 fix)
- Auto-allocate filtering (no Gifts & Celebrations / Rego & Insurance) ✓
- Auto-allocate reasoning per row ✓
- Auto-allocate canonical names (with bucket subtitle) ✓
- $5-rounded allocations ✓
- "1st cycle" tag (not "+ NEW BUCKET") ✓
- Locked banner full-width amber ✓
- Drift banner grace period ✓
- Live-Preview styled (rounded card, green accent, mono values) ✓
- Daily Living 5-state model ✓ (Healthy/Tight/Critical visible)
- Recommended + max slider markers stack vertically ✓
- Status dropdown chevron + focus ring ✓
- Bonus.confirmed → markPaydayLanded on lock ✓
- Savings sub-screen "$X allocated" header reads trip-id overrides ✓ (post-Batch D)
- Trip/bucket dedupe (Darwin trip row hidden when bucket exists) ✓

## Open questions remaining for John

- **OQ1** — Layer V harness: resetToCanvasRoot doesn't truly reset S.activePlan. Should it? Or test scenarios should each rebuild fresh state via setBonus/setOverride/etc? (Tooling decision.)
- **OQ2** — When rollover deferred by 12h-grace guard, what's the user's path forward? Options A/B/C in why-chain above.
- **OQ5** — bonus.confirmed save: fire markPaydayLanded immediately or wait for lock?
- **OQ6** — Should the "Delete this trip" button live in the trip-allocation modal at all, or move to a separate manage screen?
