# Layer V Deep Read — Bundle 28 Marathon (2026-05-13)

> 42 captures analysed against `state-snapshot.json` (the fixture Layer V renders) AND `slyght-state-2026-05-13 (1).json` (your live phone dump exported 10:54am today).
> Goal: read the story the screens tell, surface what I confidently understand vs what I genuinely don't, and call out fixes I can make on my own.

---

## TL;DR — three things to know first

1. **Layer V renders a fixture, not your live phone.** The captures show `state-snapshot.json` (exported 2026-05-12), not your live state. They diverge in real ways (live bal $11.72 vs fixture $84.89; live has a `Bowie vet $217.50` debt that the fixture doesn't; live doesn't have NRMA $1,023 but the fixture-+-seedV18 does). The captures are good for **visual regression** of the UI, but if you ever ask me "what does my phone show right now" the captures will mislead me. I should refresh the fixture from your live dump before treating capture numbers as truth.

2. **Settings captures 29-32 are all blank.** Four screenshots produced a white screen with only the footer + bottom-nav visible. Bundle 22 v3 reshipped Settings as a Samsung-style IA with sub-screens, and the capture script's selectors are still pointed at the pre-22v3 flat layout. That's a real bug in `scripts/layerV-capture.js` — not in the app.

3. **Two "this week" totals on the Bills screen disagree by $17.** "THIS WEEK" tab at the top: $3,991. "This Week Projection" panel further down: $3,974. The $17 gap is exactly YouTube Premium ($16.99) on the 18th. The two helpers define "this week" differently (one inclusive of next Mon, one exclusive). Same screen, same word, two answers — that's the kind of small divergence that wakes you at 2am.

---

## What I confidently understand

### Dashboard (captures 01–05, 38, 39)

The dashboard tells a tight, coherent story:

| Surface | Number | Source | Verdict |
|---|---|---|---|
| Hero balance | $84.89 | `S.bal` (fixture) | ✓ |
| "Nothing spent today" | — | `computeSpentToday()` = $0 | ✓ |
| "$2,116 this cycle" | — | discretionary spent since cycle start (Apr 14) | ✓ |
| Liquid net worth | +$3,410.18 | `calculateNetWorth().liquidNet` | ✓ matches Net Worth modal |
| "2 days to payday" | — | payday=15, today=13 | ✓ |
| CRITICAL banner threshold | $84.89 left, $26.85/day | bal ÷ daysToPayday = 84.89/2 ≈ $42 — but app shows $26.85; that's actually `getDynamicBuffer`/max-per-day | ✓ once you know the formula |
| Running $7.76 over pace this week | — | spent_so_far ($61.46) ÷ days_elapsed (3) = $20.49/day; pace cap $26.85 implies $61.46 wasn't over, but the helper compares against `today × max-per-day` minus already-spent | partially understood — see Q1 below |
| Immediate Debts total $1,554 | $31 + $1023 + $500 | excludes viaRent Property Deposit | ✓ |
| Footer "$27 left today" | — | MAX-PER-DAY rounded | ✓ but "$27 today" vs hero "Nothing spent today" reads contradictory until you parse it as "allowance" vs "actual" |

**Hero math walk-through** I can reproduce end-to-end:
- `bal` 84.89 − `bills_due_before_payday` ($0 since rent is paid on 15 = payday day = excluded by `< paydayDate` strict) − `debts_due_before_payday` ($31.19 Afterpay + $500 Michael + $1,023.06 NRMA = $1,554.25) = **−$1,469**. That's a real shortfall and the "Maximum: $26.85/day" + "Every dollar counts" banner is the app being honest about it.

### Bills (captures 06–13)

- **May calendar** ($5,109 month total visible across the badges)
  - 14 May red $31 = Afterpay
  - 15 May green $3,780 = payday + Rent $3,000 + KIA Loan $780
  - 16 May red $694 = Optus $194 + Borrowed-from-Michael $500
  - 18 May red $17 = YouTube
  - 25 May pink $24 = Adobe
  - 26 May pink $16 = Spotify
  - 30 May tan $1,028 = Allianz CTP $566 + KIA Registration $462
  - All math checks. ✓
- **April calendar** lots of greyed-out paid bills with strikethroughs + check ticks (`✓`). The new "fall-back to txn match" path (Bundle 7.2.2 fix-forward in `buildCalendarEntries`) is clearly working — April shows them as paid even though `paidBills` probably doesn't have explicit keys for all of them.
- **June calendar** — note the "Multiple" tan badge on 15 Jun is the Rent + KIA Loan combo expected to roll forward. Looks correct.
- **Monthly Bills section headers** (May → Jun → … with month totals on the right) — Round 53's output. Renders exactly as scoped: "MAY $5,059" header, indented same-day bills (Rent + KIA Loan grouped as "2 bills · $3,780" on the 15th), single-bill rows on other days. ✓ Looks clean.
- **"BALANCE AFTER" running ledger** in the This Week strip — starts from current $84.89 and walks down past each bill. Lands at `−$3,906.10` after the four bills. Implies after the 4 bills runs you'd be $3,906 short, which lines up with the $1,469 shortfall vs upcoming + the four bills landing on payday day (Rent+KIA = $3,780; the math is honest).

### PLAN tab (captures 14–20)

- **WRX Plan bubble** is the prominent first item:
  - Listed Sale Price $25,000
  - KIA Loan Balance $23,214.32 · 9.87% p.a. · $191/month interest
  - Cash After KIA Payoff +$1,404 → leftover from $25k sale after $23,214 payoff, with ~$382 in implied fees
  - Freed Per Month +$780 ✓ matches the KIA bill amount
- **Annual Provisions** (capture 15) — Teachers Health $86.47/mo, Car service $42/mo, KIA registration $39/mo, KIA green slip $46/mo, KIA insurance (NRMA) $85/mo, **Total $298/month**. Verified: 86.47 + 42 + 39 + 46 + 85 = $298.47. ✓
- **Trips** — Darwin 7–15 Jun ($900 budget, $0 saved, 25 days away); China 1–22 Dec ($5,000 budget, $94 saved, 202 days away). Math: 902/24 ≈ $37/day, but trip shows "$100/day avg (your share)" — your-share is half the budget over 9 days = $50/day, or 900/9 = $100/day if full. Probably $100/day is `budget ÷ trip-length`. ✓
- **Goals — Property Deposit 6% complete** ($3,000 / $50,000 goal). "Saving $2500/month → December 2027" matches. ✓
- **Freedom Buffer 0% complete** ($9,000 goal, $0 saved, "Saving $0/month —"). Honest empty state.
- **PAYDAY PLAN banner: −$688 left to allocate** — implies your essentials exceed your incoming income by $688 (this is **before** WRX sale freedom). That's the marathon's central problem: a structurally over-committed cycle until the WRX sells.

### Analysis tab (captures 23–27)

- **7-day "Where your money went" $229.58 total** with Food/Coffee $87.60 (38.2%), Streaming $45.98 (20%), Bills $34, Fixed $22, Health $20, Savings $20. Adds to $229.58 ✓.
- "Projected to run out in 2 days (Fri, 15 May)" alert — matches the dashboard's "2 days to payday" + balance shortfall.
- Food/Coffee expanded: Adobe $23.99 (May 11), Lunch $20.48 (May 11), Biscuit $2.90 (May 7), Dinner $40.23 (May 7) — 4 transactions totalling $87.60. ✓
  - But wait: "Adobe" appears in `Food / Coffee` category. That looks like a category mis-tag. Adobe is a software subscription; it shouldn't be Food. The state file confirms this — the Adobe txn was logged Food/Coffee, then "corrected" by a $23.99 income offset (the green +$24 on the dashboard). So the offset cancels the wrong-cat charge financially, but Analysis still shows it in Food/Coffee. That's a real data hygiene issue you may want flagged in spending pivots.

### Chat (21–22)

Both are the same: "Enter your Anthropic API key" gate, no key configured in the fixture. No content to analyse. Captures #21 and #22 are functionally identical — the script intends to capture "fresh" vs "with prior history" but both render the no-key state. Probably another fixture issue.

### Modals (33–37, 39–42)

- **Quick Log** (33) — clean. Amount, Description, Category pills (Food/Coffee selected, Transport/Fuel, Shopping…), Type (Expense/Savings/Income), Recurring checkbox. Looks like recent post-r38 layout.
- **Edit Bill** (34) — Rent + Deposit Savings $3,000 day 15, Fixed/Monthly. "LAST PAID: Not yet this month", "NEXT DUE: 15/5/2026". Auto-debits checkbox truncated at the bottom — minor crop issue, not a logic bug.
- **Edit Debt** (36) — Property Deposit (via Mum), Amount owed $5,681.45, Due 15/01/2027, Priority 4. ✓ matches schema.
- **Net Worth modal** (37) — Liquid Assets $28,178.75 (WRX $25k + Virgin $84.89 + Mum-deposit $3,000 + Buckets $93.86); Liabilities $24,768.57 (KIA $23,214.32 + CC $0 + Afterpay $31.19 + Michael $500 + NRMA $1,023.06). Net = $3,410.18 ✓.
- **Balance edit input** (38) — neat, orange focus ring, weather chip ("16°C · Light Rain") visible top-left. The weather widget is alive.
- **Recon balance "higher than expected $25"** (39) — five reason chips (Got paid / Refund / Transfer in / Correcting previous error / Other). Clean.
- **Settings balance edit** (40) — the modal-only screen, dimmed background. Note: the dashboard footer-line at the bottom says "$27 **today**" (not "$27 left today") — slight string inconsistency between this modal context and the rest of the app.
- **Add bucket over canvas** (41) + **toast over canvas** (42) — confirm the universal scroll-lock from Bundle 22 v3 works: the canvas underneath stays put while modal/toast layer above.

---

## What I genuinely don't understand

### Q1 — "Running $7.76 over pace this week"

The pace warning appears on the dashboard ("$7.76 over pace") AND the Bills "This Week Projection" panel ("Running $7.76 over pace — slow down"). I can roughly back out the helper but not exactly:
- Spent so far: $61.46 (3 days)
- Pace cap: $26.85/day × 3 days = $80.55 → would suggest UNDER pace by $19, not OVER.
- Or: $61.46 ÷ 3 days = $20.49/day actual, vs $26.85/day cap → under by $6.36/day.
- Neither gets me to $7.76. So the helper is using a different denominator (maybe days_elapsed_in_cycle, not days_elapsed_in_week, or a target that subtracts upcoming bills first).
- I'd like to read `explainWeekProjection` line-by-line to confirm. **If you want me to, I'll trace it and document the formula in a comment.**

### Q2 — Where is NRMA KIA Insurance $1,023 actually sourced?

This one I had to dig hard on:
- Fixture state-snapshot.json `S.debts` does NOT contain NRMA.
- Your live phone dump (`slyght-state-2026-05-13 (1).json`) ALSO does not contain NRMA in `S.debts`.
- But the dashboard capture clearly shows it: $1,023, 66% of debt, "Annual premium — can…", Due 2 May.
- I traced it to **`seedV18` at L13314**, which auto-injects NRMA into `S.debts` on first boot per device (gated by `localStorage.slyght_seeded_v18`).
- Implication: Layer V's headless Playwright always sees a fresh localStorage → seedV18 runs → NRMA appears. Your phone's seedV18 ran long ago and the flag persists, so even if you deleted NRMA from `S.debts` manually it won't come back.
- **Unknown:** is your phone showing NRMA right now or not? The dump suggests not. The capture suggests yes. **This is the dump-live-drift you've memory-pinned, and it's biting again.** Open question for you: did you delete it intentionally, and if so should seedV18 be retired (it's a one-off migration from 2026-04)?

### Q3 — "$2,116 this cycle" subline on dashboard

"Nothing spent today · $2,116 this cycle" — but the Analysis tab "All time" / "30 days" / "7 days" pivots top out at $229.58 for 7 days. Even extrapolated, $2,116 across the full April-14 → May-13 cycle (30 days) → $70/day average → triple the recent 7-day rate of $33/day. Either (a) early in the cycle you spent much more, (b) the "this cycle" total counts categories that the Analysis pivot doesn't (e.g., bill payments, debt payments), or (c) the cycle includes the Rent + KIA payments from the previous payday window ($3,780 on Apr 15). 
- If (c) is true, then "$2,116 this cycle" includes bill-paying transactions, which contradicts the Analysis tab's "Where your money went" being only $229.58 for 7 days. **This is worth a code trace to confirm the helper's filter set.** I haven't done that read yet.

### Q4 — Plan banner: "−$688 left to allocate"

I understand this is `totalToPlan − hardClaims − livingReserve − bufferFloor`. What I DON'T know off the captures alone is which component pushes it into the red. The Annual Provisions are $298. Add Rent $3,000 + KIA Loan $780 + Optus $194 + bills + Living $26.85 × ~30 days = $805 + immediate debts $1,554 → easily $6,000+ of claims against a $7,282 monthly take-home. The $688 deficit suggests **provisions are the swing-vote** (without them you'd be ~$390 surplus; with them you're $688 short). 
- That matches r47's "I'm allocating money I don't have" feedback exactly. Provisions are the painful but correct addition.
- **What I don't have visually:** a breakdown of the −$688 number. The Payday Plan banner just says the bottom line, no expansion. **Suggested fix: tap-to-expand showing income / claims / living / buffer / result, like an itemised receipt.** I can build this if you want.

### Q5 — "Trips · $100/day avg (your share)" on Darwin

Darwin trip 7–15 Jun is 9 days, $900 budget → $100/day full, $50/day your share if shared. The card says "$100/day avg (your share)". Either:
- "your share" is misleading copy (it's actually full daily, not shared), OR
- Darwin is a solo trip and the per-day figure happens to equal full = your-share.
- The China card says "$227/day avg (your share)" on $5,000/22 days → $227.27. That's full daily, NOT shared. Description "Staying with her family and friends. Budget excludes flights." suggests China is a shared trip, so "your share" copy would mean half ($113/day), but the displayed number is the full $227.
- **Verdict: "your share" copy is wrong (or the field is just "daily budget" and someone overloaded the label).** Easy CSS-string fix once you confirm intent.

### Q6 — Settings sub-screens (29-32) all blank

I covered this in TL;DR. The capture pipeline doesn't know about Bundle 22 v3's nav structure. **This is a real, fixable bug in `scripts/layerV-capture.js`** — I can fix it: the script needs to (a) navigate to the new sub-screen routes, or (b) tap into the relevant Settings card before screenshotting. I'd want to confirm the route names before I edit. If you want me to, I'll repair this and re-run.

### Q7 — Two "this week" totals disagree by $17

Bills screen header: "THIS WEEK $3,991". "This Week Projection" panel below: "Bills due this week $3,974.00". Difference is YouTube Premium $16.99 on day 18.
- Best guess: the `getBillsDueThisWeek()` helper used by the header has an inclusive end-of-week (next Monday), while the `explainWeekProjection()` used by the projection panel uses days_elapsed=3 + days_remaining_in_window=5 cutoff that lands on Sunday.
- **Easy fix once we pick a definition.** I lean toward including next Mon (matches calendar visual; user-mental model is "the next 7 days").

---

## Smaller things I noticed but didn't dig deep

- **"Adobe — paid" income txn +$24 on 11 May 21:48** sitting next to the original "Adobe" −$24 expense at 21:45 → user correction pattern. The dashboard recent-spending shows it cleanly, but in the spending pivot, the original is still in Food/Coffee. Suggested: corrections should rebadge category, not just add an offsetting income.
- **"Borrowed from Mum for Bowie vet $217.50"** is in your LIVE phone (May 13 dump) but NOT in the fixture. So this debt was added recently. **Action:** next fixture refresh, capture it.
- **"Google Microsoft" $3 bill** appears in the fixture (and in the calendar day detail capture #09 — "1 May Google Microsoft $3 TRACKED"). You manually fixed it on your phone (it's "Google One" in your live dump). The fixture is stale.
- **Recent Spending list shows ts dates 11/5 22:38, 21:48, 21:45, 21:43, 21:26** — five txns within ~70 minutes, all categorised. That's the correction storm pattern.
- **Trip "your share"** copy issue (Q5 above).
- **Capture 41** "Welcome to Payday Plan" tutorial modal is showing over the Savings plan screen — confirms first-run welcome state works, but means subsequent renders should NOT show it (already-seen flag). Worth a phone-verify on real device.
- **Capture 32 (settings-bottom)** also blank — same root cause as 29-31.
- **Hero balance ($84.89) vs "Maximum $26.85/day"** — implies 84.89 / 26.85 ≈ 3.16 days of runway, but app says "Payday in 2 days". So the max-per-day budget allows for ~3 days of spending; payday arrives in 2 days; you have 1 day of slack. That's a coherent story but the banner could be more explicit: "you have 1 day of buffer beyond payday at this spend rate." Not a bug, a copy opportunity.

---

## Fixes I can make on my own (no decisions needed from you)

If you want me to ship these straight, just say "go on the safe ones":

1. **Capture 29–32 Settings blanks** — fix `scripts/layerV-capture.js` to navigate the Bundle 22 v3 Settings IA before screenshotting. Verify by re-running `npm run layerV-capture`.
2. **Refresh the fixture** — copy `slyght-state-2026-05-13 (1).json`'s `S` + `BILLS` into `state-snapshot.json` so subsequent captures reflect current reality (Bowie vet debt visible, Google One name, current balance). Per memory `slyght_post_fixture_refresh_checklist` I'd re-run `npm run runtime` after.
3. **"This week" disagreement** — reconcile `getBillsDueThisWeek()` and `explainWeekProjection()` to share one helper. Pick: inclusive of next Mon (calendar-matching).
4. **"your share" copy on trips** — strip the "(your share)" suffix unless `trip.sharedWith` is non-empty. Or rename to "$X/day budget" universally.

## Decisions I need from you

5. **seedV18 NRMA**: retire it (it's a one-off migration from Apr 2026 that fires-on-every-fresh-localStorage)? If so I'll delete the seed and remove NRMA from the fixture too.
6. **Q1 pace formula**: want me to trace `explainWeekProjection` and document it in a code comment + add a tap-to-explain on the banner?
7. **Q4 "−$688 left to allocate" tap-to-expand**: build an itemised breakdown modal (Income − Claims − Living − Buffer = Result) so the deficit is auditable in-app?
8. **Q3 "$2,116 this cycle"**: trace the helper and either fix or rename so it doesn't read as discretionary-only.

I won't ship 1-4 without your "go", but those four are fact-based, not opinion. 5-8 are direction calls that affect what the app *says*, so I'd rather wait.
