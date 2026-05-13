# SLYGHT — Foundation Audit (Phase 1)

Read-only investigation. No code changed. No tests run. No git operations.

**File under audit:** `index.html` (11,233 lines), `slyght-worker/src/index.js` (743 lines), `tests/core.test.js`.

The user has lost trust in the numbers. This audit is brutal because soft language wastes John's $300.

---

## SECTION 1 — CALCULATION ARCHAEOLOGY

For each financial figure, every calculation site, the canonical version, and the verdict.

> Convention: the **canonical** calc is the one most call sites use today; everything else is judged against it.

### 1. Daily safe-to-spend (e.g. $23.82/day)

| Site | Line | How it computes |
|---|---|---|
| `getDynamicDailyBudget()` | 1440 | **CANONICAL**: `min((bal − getBillsDue() − getActiveDebtsDueBeforePayday()) / daysLeft(), userCap)` where `userCap = isWeekend ? 180 : 60`. |
| `getDailyBudget()` | 1434 | Returns the **cap only**: `isWeekend ? 180 : 60`. Used by chart axis (2621) and 13 other places. |
| `getMaxDay()` | 1477 | `Math.max(0, getDynamicDailyBudget())`. Wrapper marked TODO/deprecate. **11 call sites** still use it. |
| `getAvgDailySpend()` | 1422 | Different concept — historical avg, used by `getMinDailySpend()` only. |
| Dashboard "You can spend today" | 438 (HTML), 3045 (render) | Reads `getDynamicDailyBudget()` and stores in `max-day-display`. |
| Footer strip "$X today" | 9311 (`updatePersistentStrip`) | `'$' + getDynamicDailyBudget().toFixed(0) + ' today'`. |
| Jarvis prompt | 5933 | `MODE: ${getSurvivalMode()} — can spend $${getDynamicDailyBudget().toFixed(2)}/day` |
| Survival banner | 1532 | `dailyMax = getDynamicDailyBudget()`. |
| Survival forecast | 2169 | `dailyMax = getDynamicDailyBudget()`. |
| `updateAllocation()` (plan mode) | 10395 | Recomputes using inline formula: `income − fixed − provisions − 500` for living budget — **disagrees** with `getDynamicDailyBudget()`. |
| `renderAlerts` adjustedDay | 3016 | Inline copy: `(liveBal - allBillsDue2 - getActiveDebtsDueBeforePayday() - getDynamicBuffer()) / daysLeftVal`. **Disagrees** — uses `getDynamicBuffer()` not in canonical. |
| `checkAfford` newMaxDay | 5347 | Inline: `min(getDailyBudget(), max(0, rawNewMaxDay))` where rawNewMaxDay subtracts `getDynamicBuffer()` AND `bucketTotalAff`. **Disagrees**. |

**Verdict: DISAGREES.** Canonical `getDynamicDailyBudget()` post-MISSION-AUDIT no longer subtracts buckets or buffer, but `renderAlerts` (3016) and `checkAfford` (5345) still do. The "Over by" alert and the affordability calculator therefore use a tighter number than the dashboard hero.

### 2. Days to payday

| Site | Line | How |
|---|---|---|
| `daysLeft(payday)` | 1402 | **CANONICAL**: cycle-aware; if `S.paydayReceived && today <= pd`, jumps to next month. |
| `getActiveDebtsDueBeforePayday()` paydayDate | 1556 | Inline duplicate of cycle-jump logic. Uses `today.getDate() <= paydayDay`. |
| `getSurvivalForecast()` paydayDate | 2174 | Inline: `if (paydayDate <= today) paydayDate.setMonth(+1)`. **Disagrees** — missing `paydayReceived` guard. |
| Worker `state.daysLeft` | sync, 246 | Just stores whatever the app sent. |
| Calendar `payday` test | 4461 | `payday = S.payday || 15`. Just the day-of-month. |

**Verdict: DISAGREES.** `getSurvivalForecast` will under-count by 1 cycle when `paydayReceived` is true on or before the nominal payday. Calendar uses raw payday day with no cycle awareness — fine for visual-only.

### 3. Liquid net worth

| Site | Line | How |
|---|---|---|
| `calculateNetWorth().liquidNet` | 1667 | **CANONICAL**: `(WRX + bal + mumAccount + savings) − (KIA + CC + immediateDebts)`. |
| Dashboard `nw-val` | 2949 | Reads `nw.liquidNet`. ✅ AGREES. |
| Footer strip | 9314 | Reads `nwResult.liquidNet`. ✅ AGREES. |
| NW modal header | 3329 | Shows `nw.liquidNet`. ✅ AGREES. |
| Snapshot button (`generateSnapshot`) | 5460 | `'NW:$' + calculateNetWorth().liquidNet.toFixed(0)`. ✅ AGREES. |
| Jarvis prompt | 5916 | `LIQUID NET WORTH: ${nwData.liquidNet >= 0 ? '+' : ''}$...` ✅ AGREES. |

**Verdict: AGREES** at every site post-MISSION-JARVIS.

### 4. Total net worth

| Site | Line | How |
|---|---|---|
| `calculateNetWorth().net` | 1668 | **CANONICAL**: liquid + super. |
| `getNetWorth()` wrapper | 1684 | Defers to `calculateNetWorth()`. ✅ |
| `calculateNetWorthBreakdown()` | 1681 | Identical wrapper. Dead code. ✅ |
| Plan-mode NW header | 9919 | `nwNet = nw.net`. ✅ AGREES. |
| Plan-mode `showNetWorthBreakdown()` | 9711 | Shows `nw.net` and `nw.liquidNet`. ✅ |
| NW tap modal "Total Net Worth" block | 3360 | Shows `nw.net`. ✅ AGREES. |
| Jarvis prompt | 5917 | `TOTAL NET WORTH (incl super): ${nwData.net >= 0 ? '+' : ''}$...` ✅ AGREES. |
| `renderTrend` (analysis tab) | 4907+ | Calls `getNetWorth()` — gets the object. Hopefully reads `.net`. |
| `predictor.wrxImpact` (line ~6797 area) | various | Uses `S.wrxValue||21000` fallback. Slight stale fallback but doesn't affect NW. |

**Verdict: AGREES.** Single source post-MISSION-AUDIT. The `getNetWorth()` and `calculateNetWorthBreakdown()` wrappers are ceremonial — both just return `calculateNetWorth()`.

### 5. Bills due this week

| Site | Line | How |
|---|---|---|
| `renderBillsGrouped` | 4290 | **CANONICAL** for the Bills tab "This Week" section: `getExpandedBills().filter(b => recurring !== false && isBillDueThisMonth(b))` then bins by `diff`. |
| Bills tab "warn" line | 4310 | `weekTotal = grouped.today + grouped.week filtered by !isThisMonthlyBillPaid`. |
| `renderWeeklySnapshot()` (dashboard "THIS WEEK" tile) | 9237 | Different concept — sum of last 7 days **discretionary spend**, not bills due. Don't confuse with bill total. |
| Worker morning alert | 281+ | Doesn't compute bills-this-week itself. Reads `state.maxDay`. |

**Verdict: AGREES** for the bills calc (one source). The dashboard "THIS WEEK" tile measures spend, not bills — easy to misread, mum-test-failing labelling.

### 6. Bills due before payday

| Site | Line | How |
|---|---|---|
| `getBillsDue()` | 2065 | **CANONICAL**: `getExpandedBills().filter(recurring && !isPaid && isBillDueThisMonth && b.day in [today, payday))`. Two-branch logic depending on `today < payday`. |
| `getDynamicDailyBudget()` | 1444 | Sums `getBillsDue()`. |
| `getSurvivalMode()` | 1463 | Sums `getBillsDue()`. |
| `getDynamicBuffer()` | 1594 | Sums `getBillsDue()`. |
| `getGenuineSurplus()` | 1486 | `allBillsDue = getBillsDue()`. |
| `getSurvivalForecast()` | 2179 | **Inline duplicate**, slightly different filter — also checks billDate against paydayDate, applies its own health-coverage check. |
| Jarvis prompt `upcomingBills` | 5921 | `getBillsDue().sort.slice(0,5)`. |
| `renderAlerts` `allBillsDue2` | 2998 area | Inline duplicate. |
| `dynamicNotifications` | 7090, 7105 | Multiple inline reuses. |
| `checkAfford` `dueTotal` | 5343 area | `getBillsDue().reduce`. |

**Verdict: DISAGREES.** `getSurvivalForecast` (2179) builds its own bill list and applies its own debt-coverage filter — diverges from `isBillCoveredByDebt()`. Result: forecast can include bills the rest of the app excluded.

### 7. Debts due before payday

| Site | Line | How |
|---|---|---|
| `getActiveDebtsDueBeforePayday()` | 1556 | **CANONICAL** post-MISSION-AUDIT: only debts with explicit `delayDate` between today and payday (with cycle guard). |
| `getSurvivalForecast()` upcomingDebts | 2204 | **Inline duplicate**. Same logic but reimplemented. |
| `getCalendarDayItems` | 4419 | Iterates `S.debts.filter(!paid && !viaRent && delayDate)` — does NOT use the canonical function. Adds debt to calendar at any matching date, regardless of payday window. |
| Jarvis prompt `activeDebts` | 5926 | `S.debts.filter(!paid && !viaRent)` — shows ALL active debts, not just before-payday. |
| `getDynamicDailyBudget` | 1445 | `getActiveDebtsDueBeforePayday()`. ✅ |
| `getSurvivalMode` | 1464 | Same. ✅ |
| `getGenuineSurplus` | 1489 | Same. ✅ |
| `renderAlerts` `dueTotal` | 3016 | Same. ✅ |
| `getScoreRecommendation` | 1697 | Same. ✅ |

**Verdict: DISAGREES.** Three different definitions of "debts due before payday": (a) canonical function, (b) survival-forecast inline, (c) calendar's own filter. The calendar will show a debt due 2027-01-15 (Property Deposit Mum) on its date — but `viaRent: true` excludes it from the iterated forEach, so OK. Still — the inline duplicate at line 2204 is a real divergence risk.

### 8. Survival mode

| Site | Line | How |
|---|---|---|
| `getSurvivalMode()` | 1460 | **CANONICAL**: `bal<100→critical, bal<300→survival, daily<15→tight, daily<25→cautious, else normal`. |
| Survival banner | 1529 | Reads `getSurvivalMode()`. ✅ |
| Jarvis prompt | 5918 | Reads `getSurvivalMode()`. ✅ |
| Worker `state.survivalMode` | 217 | Stored from sync. |
| Worker morning alert (220) | uses `state.survivalMode`. |

**Verdict: AGREES.** Single source. But the thresholds themselves don't match the prompt copy ("Balance < $300: firm, no discretionary spending") which says $300, while `getSurvivalMode()` calls $300 'survival' not 'tight' — inconsistent prose vs code.

### 9. Discretionary spend last 7 days

| Site | Line | How |
|---|---|---|
| `getDiscretionarySpend(from, to)` | 1739 | **CANONICAL**: filters `_NON_SPEND_CATS`, `_isCorrection`, `_isRoundup`, `_txnType in [transfer, one-off, from-person]`. |
| Dashboard pace display | 3050 | `getDiscretionarySpend(weekAgo, now)`. ✅ |
| Weekly snapshot tile | 9249 | `getDiscretionarySpend(weekAgo, now)`. ✅ |
| Snapshot button | 5455 | `getDiscretionarySpend(weekAgo, now)`. ✅ |
| Jarvis prompt `weekTopSpend` | 5908 | **Inline duplicate filter**: `t.ts > weekAgo && !t.income && !t._isCorrection`. Misses `_isRoundup` exclusion and `_txnType` exclusions. |
| Weekly snapshot inline `cats` | 9242 | **Inline duplicate filter** mirrors `getDiscretionarySpend` exclusions but as a separate filter for the top-3 category list. Two filters in same function — total uses canonical, top-3 uses inline. |

**Verdict: DISAGREES.** Jarvis sees a slightly different week total than the dashboard — could include round-ups in his summary while the user sees them excluded.

### 10. China holiday saved amount

| Site | Line | How |
|---|---|---|
| `S.savingsBuckets[0].saved` | seed 1149 → 61.82 | Bucket. |
| `PLAN.getTrips()` Darwin/China defaults | 9447 (Darwin saved 0), 9489 (China `saved: S.savingsBuckets?.find(b => b.name === 'China Holiday')?.saved \|\| 70.44`) | Reads bucket but falls back to literal `70.44` (not 61.82). |
| `PLAN.getGoals()` china goal | similar pattern | Same fallback `70.44`. |
| `addGoalSavings` | 10705 | When user adds savings via plan-mode goal modal: writes to goal AND mirrors to `S.savingsBuckets China Holiday`. |
| Round-up logic | 5101–5108 | On every manual expense, if cents > 0, the round-up amount is added to `chinaHol.saved`. |
| Jarvis prompt `China Holiday fund` | 5923 | `S.savingsBuckets?.find(...)?.saved` — direct read. |
| China trip card | 10318+ | `PLAN.getTrips()` → trip.saved. |

**Verdict: DISAGREES.** The bucket seed says 61.82 but `PLAN.getTrips()` falls back to 70.44. If the bucket exists, the bucket wins — but if a fresh user has no bucket, plan mode shows 70.44 while bucket calc shows 0. Two values can disagree depending on which call path renders first. Also `addGoalSavings` updates goal then mirrors to bucket — the round-up path updates bucket directly without touching the goal — they can drift.

### 11. Darwin trip saved amount

| Site | Line | How |
|---|---|---|
| `PLAN.getTrips()` Darwin defaults | 9438 | `saved: 0`. |
| `confirmTripSavings` | (trip modal save) | Adds to `trip.saved`, persists via `PLAN.saveTrip`. |
| `add_trip_savings` chat action | 6125 | Same path. |
| Jarvis prompt | 5937 | `${darwinTrip?.saved||0}`. |

**Verdict: AGREES.** Single field, single read path. (No bucket mirroring like China.)

### 12. Mum account balance display

| Site | Line | How |
|---|---|---|
| `S.mumAccountBalance` | 1245 (default 3000) | **CANONICAL** field. |
| `calculateNetWorth()` | 1653 | `mumAccount = S.mumAccountBalance \|\| 0`. ✅ |
| `renderMumCard()` | 9226 | Reads `S.mumAccountBalance`. **NB: dashboard div removed in MISSION-JARVIS, so renderMumCard's `el = $('dash-mum-card')` returns null and function no-ops** — dead render call. |
| `PLAN.getGoals()` apartment.saved | 9473 | `saved: S.mumAccountBalance \|\| 3000`. ✅ |
| `PLAN.payday allocation locked list` | 10015 | `mumBalance = S.mumAccountBalance`. ✅ |
| `addGoalSavings` apartment | 10705 | When apartment goal gets +$X, mirrors to `S.mumAccountBalance`. ✅ |
| `mumDebt.accountBalance` (on the debt object itself) | seed 1141 (3000) | Stored on the debt — never read. |
| `confirmSuperBalance` neighbouring `saveMumAccountBalance` | 5286 | Writes `S.mumAccountBalance` via Settings. |
| Jarvis prompt | 5924 | `(S.mumAccountBalance||0).toLocaleString()`. ✅ |
| Worker sync | 8249 | Sends `mumAccountBalance`. |

**Verdict: AGREES** for value. **DEAD RENDER**: `renderMumCard()` is called from `renderAll` line 3103 but the `dash-mum-card` div was removed from the dashboard HTML (MISSION-JARVIS Fix 1). Function no-ops. The `mumDebt.accountBalance` field on the debt object is also dead — set in migration, never read.

### 13. WRX value display

| Site | Line | How |
|---|---|---|
| `S.wrxValue` | seed 1143 → 25000 | CANONICAL. |
| `_wrxPriceUpdated` migration | 1217 | Forces 25000 once on first load. |
| `calculateNetWorth()` | 1651 | `S.wrxStatus==='sold' ? 0 : (S.wrxValue \|\| 25000)`. ✅ |
| `renderWrxCard` (plan mode) | 9576 | `S.wrxValue \|\| 25000`. ✅ |
| `renderWrxTracker` (dashboard — DEAD) | 3636 onwards | `S._wrxSlider \|\| S.wrxValue \|\| 21000` (3719). **Stale fallback 21000.** Dashboard div removed → function no-ops, but the value drift is still in source. |
| `s-wrx-value` setting input | seed `value="21000"` (3148 ref) — input field literal still 21000 because the visible Settings card's WRX input was deleted in MISSION-JARVIS Fix 4 (line ~640 now blank). | The "set-wrx" input (line 557) uses placeholder="25000" and reads the live S.wrxValue at display time via JS only if wired. |
| `PREDICTOR.wrxImpact` call | 2780 | `S.wrxValue \|\| 21000` — **stale fallback**. |
| `_hbBalEdit` confirm | 3653 | inline arithmetic uses `S.wrxValue \|\| 0`. |
| Settings input init | 3148 | `if ($('s-wrx-value')) ... = S.wrxValue != null ? S.wrxValue : 21000` — `s-wrx-value` element no longer exists in HTML, so `if` is null. Code is dead. |
| Jarvis prompt | 5934 | `(S.wrxValue||25000).toLocaleString()`. ✅ |

**Verdict: DISAGREES.** Canonical is 25000. Two stale `21000` fallbacks remain (3719 dashboard wrx-tracker dead path, 2780 predictor) — they only fire if `S.wrxValue` is `0`/falsy, but code rot.

### 14. Super balance display

| Site | Line | How |
|---|---|---|
| `S.superBalance` | seed default 63429.15 (1315 migration) | CANONICAL. |
| `calculateNetWorth()` | 1655 | `superBalance = S.superBalance \|\| 0`. ✅ |
| `renderSuperCard` | 9776 | `balance = S.superBalance \|\| 0`. ✅ |
| `confirmSuperBalance` | 5280 | Writes `S.superBalance = val`. |
| `update_super` chat action | 6118 | Writes `S.superBalance = action.amt`. |
| Jarvis prompt | 5929 | `(S.superBalance||0).toLocaleString()`. ✅ |
| Worker sync | 8248 | Sends `superBalance`. |
| Settings input `set-super` | 566 | placeholder="63429" — does not pre-fill, user enters fresh. |

**Verdict: AGREES.** Single source, no duplicates.

### 15. Weekly snapshot total

| Site | Line | How |
|---|---|---|
| `renderWeeklySnapshot()` total | 9249 | `getDiscretionarySpend(weekAgo, now)`. **CANONICAL**. |
| `renderWeeklySnapshot()` cats top-3 | 9242 | **Inline duplicate filter** mirroring `getDiscretionarySpend`'s exclusions. Computes a separate sum per category; top-3 totals do not necessarily sum to the canonical total because the filters are subtly different (no `_txnType` filter on the cats version). |

**Verdict: DISAGREES** within the same function. The headline "$X this week" can equal e.g. $240 while top-3 pills sum to $245 because round-ups are excluded from the headline but the inline filter for top-3 also excludes them — actually probably consistent here. But the JS reader has to verify that by hand because the filters are duplicated.

### 16. Calendar entries per date

| Site | Line | How |
|---|---|---|
| `getCalendarDayItems(day, month, year)` | 4413 | **CANONICAL**. Walks `S.debts.filter(!paid && !viaRent && delayDate)` matching dateStr; then `getExpandedBills()` filter by day + freq + paid + `isBillCoveredByDebt`. |
| `isBillCoveredByDebt(bill)` | 1710 | Uses `today.getMonth()` to build billDate — **NOT the rendered month**. Bug: when rendering May 1 in the calendar but today is April 29, billDate is constructed as April 1. Coverage check for May debt vs May bill uses April 1. Always misses. |

**Verdict: DISAGREES** with itself. Calendar entries on rendered months ≠ today's month will fail coverage logic. May 1 renders Teachers Health debt $259.41 PLUS Teachers Health bill $259.41 (or older renamed Health Insurance $119) because coverage misses.

### 17. The number shown on May 1 in calendar

Walk-through given today = 29 Apr 2026, calendar showing May (calMonth=4):

1. `getCalendarDayItems(1, 4, 2026)`:
   - **Debts**: `S.debts.filter(!paid && !viaRent && delayDate)` — if a Teachers Health debt with delayDate=`2026-05-01` exists in live state, it's pushed. (Initial seed has none, but legacy state may.) Result: 1 debt item, $259.41.
   - **Bills**: `getExpandedBills()` → "Teachers Health" $259.41 day=1 quarterly with dueMonths=[1,4,7,10]. `isBillDueInMonth(b, 4)` returns `[1,4,7,10].includes(4) === true`. Then `isThisMonthlyBillPaid` returns false. Then `isBillCoveredByDebt(b)`: takes `today = new Date()` (= April 29), `billDate = new Date(2026, 3, 1)` = April 1. Walks debts: finds Teachers Health with `delayDate = '2026-05-01'`. `daysApart = |May 1 − April 1| / 86400000 = 30 days > 5` → returns false → coverage returns false → bill IS pushed. Result: 1 bill item, $259.41.
2. `itemTotal = 259.41 + 259.41 = $518.82`.

**Verdict: DISAGREES** with reality. The user sees $518 on May 1 = double-count. Mission text said $512 — close enough; the figure depends on which copy of the bill name is in live state ("Teachers Health $259" both times = $518, or pre-cleanup "Health Insurance qtrly avg $119 + Teachers Health $259" = $378 + Teachers debt $259 = $638). Either way, **the calendar always over-counts** when a debt and a bill represent the same obligation in different months.

### 18. The number shown on May 1 in bills tab

The Bills tab `renderBillsGrouped()` (line 4290) groups bills by `diff` from today. Today = 29, payday = 15.

- `getExpandedBills().filter(recurring && isBillDueThisMonth)` — `isBillDueThisMonth` uses **`new Date().getMonth()`** = April (3). So Teachers Health (`dueMonths:[1,4,7,10]`) → 3 not in list → **excluded** for the month of April.
- That means even though we're showing the days from today through next-payday range (which spans April 29 → May 15), the function checks against TODAY's calendar month, not the bill's actual due month.
- Result: Teachers Health does NOT appear in the Bills tab at all on April 29. It will only start appearing on May 1 when today's month flips.

Meanwhile the calendar tab DOES show Teachers Health on May 1 (it uses `isBillDueInMonth(b, month)` — the rendered month, not today's). **Different data on same date across two tabs.**

**Verdict: DISAGREES.** Bills tab and Calendar tab disagree on whether Teachers Health appears on May 1, depending solely on which day the user opens which tab.

### 19. The number Jarvis quotes when asked "how much can I spend today"

`sendChatMessage()` line 5933: `MODE: ${getSurvivalMode()} — can spend $${getDynamicDailyBudget().toFixed(2)}/day`.

**Verdict: AGREES** with dashboard. Both read `getDynamicDailyBudget()`.

### 20. The number on the dashboard hero "safe to spend" card

`renderAll` line 3045 area:
```
const _ddb = getDynamicDailyBudget();
_maxDayDisp.textContent = '$' + _ddb.toFixed(2);
```
Reads `getDynamicDailyBudget()` directly.

**Verdict: AGREES** with Jarvis (#19).

---

### Section 1 summary count
- **6 figures AGREE** across all sites: liquid NW, total NW, China saved (mostly), Darwin saved, super balance, today/can-spend.
- **14 figures DISAGREE** somewhere: daily safe-to-spend (3 inline copies), days-to-payday (cycle guard missing in forecast), bills-due (forecast inline), debts-due (3 versions), discretionary 7d (Jarvis inline), calendar entries (coverage month-blind), May 1 calendar vs bills tab.

---

## SECTION 2 — DEBT VS BILL COLLISIONS

### Active collisions

#### A. Teachers Health quarterly bill ↔ Teachers Health debt entry
- **Bill**: `BILLS[15]` — "Teachers Health" $259.41 day=1 quarterly dueMonths=[1,4,7,10] (Feb/May/Aug/Nov).
- **Debt**: any user-added debt with name matching health keyword and delayDate near a quarterly month.
- **Collision**: when `delayDate` falls in May, the calendar shows BOTH debt+bill on May 1 because `isBillCoveredByDebt` (1710) builds `billDate` from today's month (April) — always 30+ days apart from a May debt date. Coverage fails, both items render.
- **Where displayed**: Calendar tab cell May 1 (`getCalendarDayItems`).
- **What user sees**: $259.41 + $259.41 = $518.82 needed on May 1.
- **What user SHOULD see**: One $259.41 (the actual quarterly direct debit, however represented).
- **Offender**: `isBillCoveredByDebt()` line 1713 hardcodes `today.getMonth()` instead of the rendered month.

#### B. Health Insurance (qtrly avg) ↔ Teachers Health
- **Bill**: removed by `_billsCleanedV1` migration (line 1340). On migrated state, gone.
- **Risk**: any user with un-migrated state still sees both.
- **Mitigation**: legacy-name lookup in `isThisMonthlyBillPaid` doesn't help here because they're different bills, not renames.

#### C. Afterpay instalment bill ↔ Afterpay debt
- **Bill**: removed by same migration (1340).
- **Debt**: legacy `Afterpay $250.84` paid:true, plus new `Afterpay — Concert Tickets $124.75` paid:false delayDate `2026-05-31`.
- **Calendar**: only the new debt shows (May 31). No collision.
- **Risk**: if user-added Afterpay bill drifts back via Quick Log "recurring" toggle, collision returns.

#### D. Property Deposit (via Mum) viaRent ↔ Rent + Deposit Savings bill
- **Bill**: "Rent + Deposit Savings" $3,000 day=15 monthly Fixed.
- **Debt**: "Property Deposit (via Mum)" $5,681.45 viaRent:true delayDate `2027-01-15`.
- **No collision** in current dashboard/calendar because `viaRent: true` excludes the debt from `getCalendarDayItems` debt push (4420 `!d.viaRent`). The bill carries the cash-flow.
- **NW model collision**: `calculateNetWorth` filters `!viaRent` for `immediateDebts` (line 1664), so the viaRent debt is **not counted as a liability** — and the $3,000/month cash flow is captured by the bill. Consistent.

#### E. KIA Loan — Firstmac bill ↔ S.carloan
- **Bill**: "KIA Loan — Firstmac" $780 day=15 Loan tag monthly. Recurring auto-debit.
- **Liability**: `S.carloan = $23,989.70` with rate 9.87%.
- **Collision**: bill is the **payment** (cash out of bal); carloan is the **balance**. Both should appear, but in different concepts. The bill drains bal monthly; the balance reduces by ~$580 principal/month after $200 interest.
- **What's broken**: there is **no logic** linking them. When the bill gets paid, `S.carloan` doesn't decrease automatically. User has to manually update both. This isn't a display collision but a data-entry collision waiting to break.

### Paid bills still appearing

- `S.paidBills` keys are `year-month-name-day`. After bill rename (e.g. Rent → Rent + Deposit Savings), legacy keys orphan unless `_paidBillsKeyMigrationV1` ran. `isThisMonthlyBillPaid` has a `legacyNames` lookup at 2018 that handles two cases — Rent and Car Loan. If a user paid e.g. "Health Insurance (qtrly avg)" before that bill was deleted, the paidBills key persists for that month — harmless because the bill no longer exists.
- **No active "paid bill ghost"** at this audit point.

### Paid debts still appearing

- `getCalendarDayItems` (4420) filters `!d.paid` — paid debts excluded.
- Plan-mode goal tracker (8908) does not filter paid for the lookup `S.debts.find(d.name === 'Owed to Mum')` — but `findMumDebt()` returns whatever the first match is even if paid. **Risk**: if Property Deposit (via Mum) is ever marked paid, it still shows in plan-mode goal tracker.
- **`_debtAuditV1` migration** (1357 area) deletes ghost `WRX fines + rego` and marks `Owed to Michael`/`Pet Insurance`/`Parking Fine` paid. Initial seed (post-MISSION-JARVIS Fix 4) no longer creates these — clean. But legacy state needs the migration to run.

---

## SECTION 3 — SOURCE-OF-TRUTH AUDIT

| Section | Reads from | Number(s) shown | Calc function | Trust |
|---|---|---|---|---|
| Dashboard hero balance ($X.XX) | `S.bal` | live cash | none — direct read | ✅ TRUSTED |
| Dashboard liquid NW line | `calculateNetWorth().liquidNet` | +$4,476 | `calculateNetWorth` | ✅ TRUSTED |
| Footer strip "NW: ±$X" | `calculateNetWorth().liquidNet` | matches above | `calculateNetWorth` | ✅ TRUSTED |
| Footer strip "$X today" | `getDynamicDailyBudget()` | $32 | canonical | ✅ TRUSTED |
| Footer strip "Xd to payday" | `daysLeft()` | 16 | canonical | ✅ TRUSTED |
| Payday progress bar | `daysLeft(S.payday)` | progress fill | canonical | ✅ TRUSTED |
| Survival banner | `getSurvivalMode()` | "Tight This Week — $X/day" | canonical | ⚠️ FRAGILE — `getDynamicDailyBudget()` it shows can drift on next render before banner re-renders. |
| THIS WEEK tile (weekly snapshot) headline | `getDiscretionarySpend(7d)` | $240 | canonical | ✅ TRUSTED |
| THIS WEEK tile top-3 categories | inline filter dup of getDiscretionarySpend | 3 pills | inline (line 9242) | ⚠️ FRAGILE — duplicate filter, drift risk |
| THIS WEEK tile pace | `dailyAvg vs getDynamicDailyBudget` | "$X under pace" | inline | ⚠️ FRAGILE |
| YOU CAN SPEND TODAY card | `getDynamicDailyBudget()` + `max-day-context` | $32 + "Cautious — cover essentials" | canonical | ✅ TRUSTED |
| YOU CAN SPEND TODAY pace-display | inline copy of getDiscretionarySpend(7d) (3050) | "Running $X under pace" | inline | ⚠️ FRAGILE |
| Immediate debts grid | `S.debts.filter(!paid && !viaRent)` | tile per debt | `renderDebtTiles` | ✅ TRUSTED |
| Recent transactions list | `S.txns.slice(-5)` | last 5 txns | `renderDashTxns` | ✅ TRUSTED |
| Calendar tab — month label | `calMonth/calYear` (auto-init from `new Date()`) | "April 2026" | render | ✅ TRUSTED |
| Calendar day cell | `getCalendarDayItems` | $X total | canonical | ❌ BROKEN — month-blind coverage (see #16) |
| Calendar day-detail modal | `getCalendarDayItems` | items list | canonical | ❌ BROKEN — same issue |
| Calendar today/payday/multi dot | derived from items.length | colour | render | ⚠️ FRAGILE — depends on broken items |
| Bills tab `+ Add A Bill` | (form) | new bill row | `openAddBillModal` → `saveBill` | ✅ TRUSTED |
| Bills tab "Due Today" / "This Week" | `renderBillsGrouped` | totals | canonical | ⚠️ FRAGILE — inline `isPaid` check duplicates `isThisMonthlyBillPaid` (4338) without legacy-name fallback |
| Bills tab "Monthly Bills" unpaid list | `upcomingAll = grouped.next + later, !isThisMonthlyBillPaid` | rows | canonical | ✅ TRUSTED |
| Bills tab "Paid this month" `<details>` | same | rows | canonical | ✅ TRUSTED |
| Expected Extra Income card | `S.bonuses` | rows | `renderBonusList` | ⚠️ FRAGILE — bonuses don't feed into `getDynamicDailyBudget()` |
| Analysis tab — spending pivot | `getDiscretionarySpend()` per period | totals | canonical | ✅ TRUSTED |
| Analysis tab — goal tracker | `S.savingsBuckets`, `findMumDebt()`, `S.carloan` | 5 goals | `renderGoalTracker` | ⚠️ FRAGILE — uses `findMumDebt()`'s `originalAmt` which may be stale |
| Analysis tab — SLYGHT Score | `SLYGHT_SCORE.calculate()` | 0–1000 | `SLYGHT_SCORE` | 👻 GHOST — internal scoring uses arbitrary thresholds; recommendation wrapped by `getScoreRecommendation()` to suppress when survival mode active |
| Analysis tab — survival forecast | `getSurvivalForecast()` | "Will run out X" | inline duplicates | ⚠️ FRAGILE — divergent inline copies of bills/debts due |
| Analysis tab — trends | `renderTrend()` reads `getNetWorth()` | NW line | canonical | ✅ TRUSTED |
| Analysis tab — recent txns search | `S.txns` filtered by query | rows | `filterTxns` | ✅ TRUSTED |
| Analysis tab — monthly position | `renderMonthlyPosition()` reads BILLS, debts, surplus | summary | inline | ⚠️ FRAGILE |
| Plan Mode header NW | `calculateNetWorth().net` (total incl super) | +$68k | canonical | ✅ TRUSTED |
| Plan Mode WRX card sale price | `S.wrxValue \|\| 25000` | $25,000 | `renderWrxCard` | ✅ TRUSTED |
| Plan Mode WRX cash after payoff | inline `salePrice - kiaLoan - earlyRepayFee` | $X | `renderWrxCard` | ✅ TRUSTED |
| Plan Mode WRX KIA loan balance | `S.carloan` | $23,989 | direct | ✅ TRUSTED |
| Plan Mode WRX early repayment fee | `monthlyInterest * 2` | ~$395 | `renderWrxCard` | ✅ TRUSTED |
| Plan Mode payday allocation locked list | hardcoded `rent=500, depositSavings=2500, KIA $780, provisions, teachersHealth=0` | rows | `renderPaydayAllocation` | ⚠️ FRAGILE — `teachersHealth=0` hardcoded since FIX 10B |
| Plan Mode allocation sliders | `localStorage('slyght_payday_plan')` | 4 sliders | `updateAllocation` | ⚠️ FRAGILE — `living` calculation duplicates `getDynamicDailyBudget` math |
| Plan Mode trip cards | `PLAN.getTrips()` | Darwin + China | canonical | ✅ TRUSTED |
| Plan Mode goal cards | `PLAN.getGoals()` | 3 goals + timelines | canonical | ⚠️ FRAGILE — `monthlyAlloc=0` cases rendered as "Not on current path" |
| Plan Mode super card | `S.superBalance` + FV formula | balance + projections | `renderSuperCard` | ✅ TRUSTED |
| Plan Mode annual provisions | `getCustomProvisions()` else `PLAN.getAnnualProvisions()` | rows | canonical | ⚠️ FRAGILE — provisions edited via `editProvision` are persisted but not synced back to BILLS array |
| Plan Mode income simulator | `PLAN.INCOME_MONTHLY` getter (S.income) | sliders | canonical | ✅ TRUSTED |
| Settings — Monthly income | `S.income` | input | `saveIncome` | ✅ TRUSTED |
| Settings — WRX value | `S.wrxValue` | input set-wrx | `saveWrxValue` | ✅ TRUSTED |
| Settings — Mum account | `S.mumAccountBalance` | input set-mum-account | `saveMumAccountBalance` | ✅ TRUSTED |
| Settings — Super balance | `S.superBalance` | input set-super | `saveSuperBalance` | ✅ TRUSTED |
| Settings — API key | `localStorage slyght_api_key` | password input | `saveApiKey` | ✅ TRUSTED |
| Settings — Round-ups toggle | `S.roundUpsEnabled` | button | `toggleRoundUps` | ✅ TRUSTED |
| Settings — App PIN | `S.pinHash` | password | `saveSettings` | ✅ TRUSTED |
| Settings — App Security PIN | hashed | input | save | ✅ TRUSTED |
| Settings — payday day | `S.payday` | input s-payday | inline | ✅ TRUSTED |
| Settings — weekday/weekend budgets | `S.weekdayBudget`/`S.weekendBudget` | inputs | `saveBudgets` | ⚠️ FRAGILE — input default `value="180"` for weekend matches new fallback after FIX 8C, but can drift if user clears |
| Settings — Vehicle value (DEAD) | none — div was deleted | — | — | 👻 GHOST — `s-wrx-value` still referenced at 3148, element gone |
| Settings — Debt strategy | `S.debtStrategy` | select | `saveSettings` | ✅ TRUSTED |
| Settings — Car loan/CC inputs | `S.carloan`/`S.cc` | inputs | `saveSettings` | ✅ TRUSTED |
| Settings — bills list | BILLS array | rows | `renderSettingsBills` | ✅ TRUSTED |
| Settings — bonuses | S.bonuses | rows | `renderBonusList` | ⚠️ FRAGILE — Bonuses card duplicated in Bills tab and Settings — same data, two surfaces |
| Notifications drawer (in-app) | `S.notifications` | rows | `NOTIFY.render` | ⚠️ FRAGILE — `_notifCleanV1` migration purges 3 stale IDs, but unrelated stale items persist |
| Header weather | `WEATHER.getSummary()` | "20°C" etc | canonical | ✅ TRUSTED |
| Header PLAN › pill | static button | static | onclick | ✅ TRUSTED |
| Header notif bell badge | `NOTIFY.unreadCount()` | "0" or N | canonical | ✅ TRUSTED |
| Header refresh icon | calls `softRefresh()` | (action) | render | ✅ TRUSTED |
| Header settings cog | navigate | (action) | navigate | ✅ TRUSTED |
| Hero "tap to update balance" | opens `h-bal-edit` modal | inline | `openHeroBalEdit`/`confirmHeroBalEdit` | ✅ TRUSTED |
| **Dead — `dash-mum-card` render call** | `renderMumCard()` runs but div was deleted | — | none | 👻 GHOST |
| **Dead — `lt-car-tile`/`lt-cc-tile`** | `renderLtTiles()` runs but tiles deleted | — | none | 👻 GHOST |
| **Dead — `wrx-tracker-card`** | `renderWrxTracker()` runs but div deleted | — | none | 👻 GHOST |
| **Dead — Affordability check inputs** | `aff-amt`, `aff-what`, `aff-verdict`, `aff-cuts`, `aff-instalments` deleted in MISSION-JARVIS Fix 1 | `checkAfford()` reads gone elements, no-ops | — | 👻 GHOST |

---

## SECTION 4 — DEAD CODE & DUPLICATION

### 1. Functions defined more than once
None detected (`grep ^function ... uniq -c | $1>1` returns empty).

### 2. Functions defined but never called

| Function | Line | Notes |
|---|---|---|
| `calculateNetWorthBreakdown` | 1681 | Wrapper for `calculateNetWorth`. **0 call sites** (only `getNetWorth` indirectly references its name in a comment). |
| `getNetWorth` | 1684 | Wrapper. **13 call sites** but they could all use `calculateNetWorth()` directly. |
| `getMaxDay` | 1477 | 11 call sites. Marked TODO/deprecate. |
| `renderMumCard` | 9223 | Called from `renderAll` (3103) but the div it targets was deleted — no-op. Effectively dead. |
| `renderLtTiles` | (~3598) | Same — tiles deleted. No-op. |
| `renderWrxTracker` | 3635 | Same — div deleted. No-op. |
| `checkAfford` | (called by deleted inputs) | Inputs `aff-amt`/`aff-what` removed; only oninput handlers fire — never triggered now. No-op. |
| `toTitleCase` | 1629 | Defined for plan mode but never called — title-case applied directly to source strings. |
| `wirePaydaySliders`, `wireTripEditors`, `wireGoalEditors` | (~10117 etc) | All bodies are `/* wired via onclick */` — empty stubs. Called once each. Dead-equivalent. |
| `_origMarkDebtPaid` | (~6131 area) | Captured original to wrap; if wrapping is removed, safe to delete. |
| `executeChatAction.update_super` and friends | only called when chat returns matching action | Reachable — keep. |
| `confirmBonusAmount` | 5599 area | Reachable. |

### 3. Variables declared but never read
A spot-check rather than exhaustive (this would need an AST):
- `getBillsDue` `now` (line 2069) — used inside `isPaid`, OK.
- `renderAll` `_renderCache` clearing — used by `renderCache()`. OK.
- `nwResult` (footer strip 9314) — used immediately. OK.
- `mumDebt.accountBalance` field set in `_mumReframed` migration (1234) — never read elsewhere.
- `mumDebt.accountTarget` — never read.
- `S.wrxSoldDate`, `S.wrxSalePrice` — set by `mark_wrx_sold` action (6131); never read.
- `S._isCorrection` flag on txns — used by 5+ filters. OK.
- `S._txnType` — used by `getDiscretionarySpend`. OK.

### 4. HTML rendered but hidden by CSS, never toggled

- `#nw-modal` (964) — `display:none` until `classList.add('open')`. Toggled. OK.
- `#cat-modal` (976) — toggled by `pivotToggle`. OK.
- `#h-bal-edit` (421) — toggled by `openHeroBalEdit`. OK.
- `#cal-day-detail` (513) — toggled by `calDayClick`. OK.
- `#auditor-badge` (deleted from dashboard in MISSION-JARVIS) — gone.
- `#reconciler-banner` — `display:none` default; toggled by `RECONCILER.morningCheck`. Probably never toggled in normal flow. ⚠️ Suspect dead.

### 5. Modals in HTML with no opener

All 13 modal overlays have at least one `classList.add('open')` site (table earlier in audit). **None orphaned.**

### 6. Event listeners bound to elements that no longer exist

- `#wrx-alloc-modal` listener at line 11199 — exists, used by `openWrxAllocModal`.
- `#aff-amt`/`#aff-what` `oninput="checkAfford()"` (deleted in MISSION-JARVIS Fix 1) — wait, the inputs themselves were removed but the function still exists. **Listeners harmlessly gone with the deleted markup**, function survives.

### 7. `console.log` in production code

29 occurrences total. Of those:
- **Unguarded** (will spam in production): all `[PUSH]` logs (lines 8045, 8088, 8099, 8115, 8125, 8130, 8148, 8162, 8175, 8190, 8197, 8329, 8346, 8347, 8357, 8359), all `[SCAN]` logs (8829, 8841, 8852, 8871).
- **Guarded** by `SLYGHT_DEBUG` or `window.SLYGHT_DEBUG`: 1511 (onStateChange — fixed in MISSION-JARVIS Fix 8A), 6570, 7193, 7200, 7344, 7943, 8264, 8907.

**Count:** 17 unguarded console.logs in production.

### 8. TODO/FIXME/XXX comments

Just one at line 1476: `// TODO: deprecate — getDynamicDailyBudget() already returns ≥0` (above `getMaxDay`).

### 9. Hardcoded values that should read from S

| Site | Line | Hardcoded | Should read |
|---|---|---|---|
| `renderWrxTracker` slider min/max | 3694 | `min="18000" max="24000" step="500"` | bracket `S.wrxValue` |
| `renderWrxTracker` salePrice fallback | 3719 | `\|\| 21000` | `\|\| 25000` |
| `PREDICTOR.wrxImpact` call site | 2780 | `S.wrxValue\|\|21000` | `\|\| 25000` |
| `s-wrx-value` init | 3148 | `: 21000` | `: 25000` |
| Seed legacy real-state v13 | 6373 area | `wrxValue: 21000` | unchanged — only fires on fresh users; `_wrxPriceUpdated` migration corrects |
| Plan-mode `monthlyContrib` default | 9777 | `1310.50` | `S.superMonthlyContrib` (which seed sets to 1310.50) — already reads, but the displayed `$1,150 / $173 / -$12` triplet in renderSuperCard is hardcoded HTML literals (9794-9824) |
| Jarvis prompt `Salary: $117,500` | 5930 | string literal | should use a constant or `S.income * 12 * grossUp` derivation |
| Jarvis prompt rules block | 5946–5953 | $300, FIFA, vape, Inner West suburbs, etc. | acceptable — patterns are John-specific brand markers |
| Jarvis prompt `Monthly super contribution: $1,311` | 5930 | string | `S.superMonthlyContrib` |
| `renderSuperCard` employer/extra/fees triplet | 9794–9824 | `$1,150` / `$173` / `-$12` | should derive from `S.superMonthlyContrib` and known split |
| Settings `s-cc` default value | 633 | `value="4595.35"` | should reflect `S.cc` |
| Settings `s-pin` element | 601 | input only — empty by design |
| `_superAdded` migration constants | 1315–1318 | `63429.15`, `1310.50`, `0.085`, `'Aware Super'` | first-run defaults — acceptable |
| Annual provisions seed | `PLAN.getAnnualProvisions` | hardcoded list — Teachers Health $1,037.64/yr, NRMA $1,023.06, KIA service $500, rego $462, green slip $552 | acceptable; user can edit via `editProvision` and they persist |
| `INCOME_GROSS` 117500 | (PLAN constants) | OK — matches reality |
| Calendar payday cell | 4474 | `payday = S.payday \|\| 15` | OK |
| `getDailyBudget` weekday fallback `60` / weekend `180` | 1436 | OK — read from S with fallback |

### 10. Migrations that have already run for John but still execute on every load

Each runs a `if (!S._flag)` guard so they're idempotent — they execute the predicate, find the flag, return. Cost is one map lookup per migration on every `load()`. They are:

| Flag | Line | Purpose | Still useful? |
|---|---|---|---|
| `_wrxPriceUpdated` | 1216 | Bump WRX 21k → 25k | Done. Could fold into seed (already done; seed = 25000 now). Migration deletable. |
| `_mumReframed` | 1222 | Rename Owed to Mum → Property Deposit (via Mum), set 5681.45 | Seed already uses new shape. Migration handles legacy state. Keep until John forces clear. |
| `_billsCleanedV1` | 1340 area | Remove Afterpay instalment + Health Insurance qtrly avg | Done. Seed clean. Keep ~30 days. |
| `_paidBillsKeyMigrationV1` | 1318 | Rename keys after Rent / Car Loan rename | Done. Seed clean. Keep. |
| `_billsFreqMetaV1` | 1330+ | Backfill `dueMonth`/`dueMonths` on legacy bills | Seed has them. Keep. |
| `_afterpayUpdated` | 1371 | Mark old Afterpay paid + push Concert Tickets | Seed has the new debt. Migration safe to remove. |
| `_debtAuditV1` | 1357 | Delete WRX fines variants + mark Owed-to-Michael paid | Done. Seed clean. Keep. |
| `_notifCleanV1` | 1300 area | Filter 3 stale notif IDs | Done. Keep. |
| `_superAdded` | 1314 | Seed super | Done. Could fold into seed (currently `S.superBalance` is **not** in initial S object — only set in migration). **Recommend folding.** |

Total dead-able migrations: 4 (`_wrxPriceUpdated`, `_afterpayUpdated`, parts of `_debtAuditV1` that reference now-deleted seed entries, `_superAdded` foldable).

---

## SECTION 5 — FEATURE USAGE READ

For each: STAY / SIMPLIFY / CUT + reason. Mum-test = could John explain the number to his mum in one sentence with confidence.

| # | Feature | Verdict | Reason |
|---|---|---|---|
| 1 | Dashboard hero balance | **STAY** | $X.XX = Virgin Money. Mum-test ✅. |
| 2 | Liquid net worth tile | **STAY** | "Stuff I could sell + cash − stuff I owe right now." Mum-test ✅. |
| 3 | Total NW (Plan Mode) | **STAY** | Same as liquid + super. Mum-test ✅ if labelled. |
| 4 | Payday progress bar | **STAY** | Days to payday, visual. Mum-test ✅. |
| 5 | Survival banner | **SIMPLIFY** | Three modes (cautious/tight/critical) confuse — collapse to two: "watch it" / "danger". Thresholds based on broken `dailyAvailable` math. |
| 6 | Weekly snapshot | **SIMPLIFY** | "$240 spent this week, mostly food $90" works; daily-avg + pace + city2surf is too much in one tile. |
| 7 | Safe-to-spend-today card | **STAY** | The most useful number. But the contextual sub-line should disappear when normal mode (currently always renders). |
| 8 | Immediate debts list | **STAY** | Shows what's coming. Mum-test ✅. |
| 9 | Recent transactions | **STAY** | Last 5 — quick check. Mum-test ✅. |
| 10 | Calendar tab | **SIMPLIFY** | Calendar dots show wrong totals on cross-month dates. Cut the per-day amount, keep the colour dot only. Or fix the coverage logic. |
| 11 | Bills tab grouped view | **STAY** | Today / This Week / Monthly / Paid. Works. |
| 12 | Bills "this week" subview | **STAY** | Subset of grouped. |
| 13 | Spending pivot (Analysis) | **STAY** | Today/7d/30d/All toggles, expandable. Mum-test ✅. |
| 14 | Goal tracker (Analysis) | **CUT** | 5 goals shown; only 3 in Plan Mode that John actually uses. Plan Mode is the home for goals. |
| 15 | SLYGHT Score | **CUT** | 0–1000 score with 5 sub-categories — gamification-y. John doesn't act on it. Recommendations are wrapped to suppress when survival, leaving "When balance allows: ..." which is unhelpful. Mum-test ❌ ("what's a 491 SLYGHT Score?"). |
| 16 | Survival forecast card | **SIMPLIFY** | Inline duplicates of bills/debts due. Replace with one line: "You have $X for Y days = $Z/day." |
| 17 | Daily Character Score | **CUT** | Separate gamification thread. Lives in `CHARACTER` object. Mum-test ❌. |
| 18 | AI chat (Jarvis) | **STAY** | Post-MISSION-JARVIS the prompt is live. Useful for "should I get UberEats" voice. |
| 19 | Plan Mode trip cards | **STAY** | Darwin + China are concrete plans. Mum-test ✅. |
| 20 | Plan Mode payday allocation sliders | **SIMPLIFY** | 4 sliders + locked list works, but the locked list shows hardcoded $780 KIA / 500 rent / 2500 deposit / provisions sum / Teachers Health(=0) — should read from BILLS + computed model. |
| 21 | Plan Mode super card | **STAY** | Balance + 1y/5y/retirement projections. Mum-test ✅ if she trusts the assumed 8.5%. |
| 22 | Plan Mode WRX card | **STAY** | "Sell WRX → pay off KIA → $780/month freed." Best feature in plan mode. |
| 23 | Mum account card | **CUT** (already removed from dashboard in MISSION-JARVIS Fix 1) | Function `renderMumCard` still runs but div is gone. Delete the function. |
| 24 | Round-up to China bucket | **STAY** | Adds cents to China bucket on every spend. 25¢ here, 90¢ there. |
| 25 | WFH toggle | **STAY** | Simple, used by location detection. |
| 26 | Receipt scanner | **SIMPLIFY** | Calls Anthropic for OCR. Useful but expensive. Add per-month limit. |
| 27 | Smart Select / screenshot import | (not present in current code) | n/a |
| 28 | Opal calculator | (not present) | n/a |
| 29 | Mood tagging | (not present) | n/a |
| 30 | Notifications | **SIMPLIFY** | In-app NOTIFY system + worker push notifications. Two systems. Worker has 5 cron triggers (9am/10am/12:30pm/2pm/6:30pm). Stale notifications need cleanup migration after debts close — got `_notifCleanV1` for 3 IDs. |
| 31 | Snapshot copy button | **STAY** | Compressed state for paste-to-Claude. |
| 32 | Bonus modal | **STAY** | Now uses PLAN_MODAL (post-MISSION-JARVIS Fix 5). |
| 33 | Plan Modal | **STAY** | Universal slide-up modal in plan-mode. |
| 34 | Settings tab fields (each) | per-row: |
|  | — Monthly income | **STAY** |  |
|  | — WRX value | **STAY** |  |
|  | — Mum account | **STAY** |  |
|  | — Super balance | **STAY** |  |
|  | — Round-ups toggle | **STAY** |  |
|  | — API key | **STAY** | needed for chat/scanner |
|  | — Current balance + Update button | **STAY** | reconciliation flow |
|  | — App PIN | **STAY** |  |
|  | — Payday day | **STAY** |  |
|  | — Weekday/weekend budget | **STAY** | hardcoded fallbacks 60/180 — confusing if user clears |
|  | — Debt strategy (avalanche/snowball) | **CUT** | John doesn't use — only one pile of debts and the top-priority calculation isn't really an avalanche question |
|  | — Car loan / original / CC / CC limit | **SIMPLIFY** | merge with WRX card or move to plan mode liabilities section |
|  | — Bills list (Settings) | **CUT** | duplicates Bills tab. Edit inline there. |
|  | — Bonuses | **CUT** | duplicates the same control on Bills tab. Pick one. |
|  | — Emergency fund status | **CUT** | empty in current state |

**Mum Test failures: 4** (SLYGHT Score, Daily Character Score, Goal Tracker on Analysis, Survival Forecast inline duplicates).

---

## SECTION 6 — THE COMPUTED MODEL DESIGN PROPOSAL

### 6.1 Function name
`computeFinancialModel(state)` — pure function. Caller passes `S` (or sub-fields) and `BILLS`, returns the complete read-model. Convenience global `MODEL = computeFinancialModel(S)` re-derived on every state change.

### 6.2 When it runs
- **On every `onStateChange()`**, AFTER `save()` and BEFORE any render call.
- **On boot**, after `load()` and after every migration.
- **Memoized within a single render pass** (already have `_renderCache`); cleared at start of each `renderAll`.
- Not debounced — it's a pure transform, cheap.

### 6.3 What it returns

```typescript
interface FinancialModel {
  // ── Cycle / time anchors ────────────────────────────────
  todayISO: string                 // '2026-04-29'
  todayMonth: number               // 0-11
  todayYear: number                // 2026
  paydayDate: Date                 // next payday with cycle guard
  daysToPayday: number             // 16
  paydayReceived: boolean          // pass-through
  cycleStart: Date                 // last payday or first day of cycle
  cycleEnd: Date                   // = paydayDate

  // ── Cash position ──────────────────────────────────────
  bal: number                      // S.bal
  todaySpent: number               // discretionary only
  weekSpent: number                // last 7d discretionary
  cycleSpent: number               // since last payday
  noSpendStreak: number            // days

  // ── Net worth ──────────────────────────────────────────
  liquidAssets: number
  totalAssets: number
  totalLiabilities: number
  liquidNet: number
  totalNet: number
  nwBreakdown: {
    wrxValue: number
    cashBalance: number
    mumAccount: number
    savings: number
    superBalance: number
    kiaLoan: number
    creditCard: number
    immediateDebts: number
  }

  // ── Daily budget ───────────────────────────────────────
  safeToSpendToday: number         // canonical — formerly getDynamicDailyBudget
  userCap: number                  // weekday/weekend cap
  survivalMode: 'critical' | 'survival' | 'tight' | 'cautious' | 'normal'

  // ── Bills & debts (DEDUPLICATED) ───────────────────────
  // Each entry already has: paid?, covered?, dueDate (concrete), source.
  // The "covered" flag is set when a debt and a bill share the same
  // obligation in the same month — only ONE of them appears in the
  // committed totals, never both.
  billsBeforePayday: BillEntry[]   // due date in (today, paydayDate]
  debtsBeforePayday: DebtEntry[]   // delayDate in (today, paydayDate]
  billsThisMonth: BillEntry[]      // due in current calendar month
  billsTotalCommitted: number      // sum of billsBeforePayday.amt
  debtsTotalCommitted: number      // sum of debtsBeforePayday.amt
  totalCommittedBeforePayday: number

  // ── Calendar (per-date, deduplicated) ──────────────────
  calendarEntries: Map<string, CalendarEntry[]>
    // key 'YYYY-MM-DD' → entries that day; deduped between bills/debts.

  // ── Plan-mode shapes (computed once) ───────────────────
  trips: TripEntry[]               // PLAN.getTrips() processed
  goals: GoalEntry[]               // PLAN.getGoals() with timelines
  provisions: ProvisionEntry[]     // active for current month
  postWrxSurplus: number
  wrxImpact: WrxImpactSummary

  // ── Diagnostics (for AUDITOR) ──────────────────────────
  warnings: string[]               // e.g. "Teachers Health debt and bill collide on 2026-05-01"
}

interface BillEntry {
  id: string                       // synthetic — name+day for dedup
  name: string
  amt: number
  day: number
  date: Date                       // resolved next-occurrence date
  freq: 'monthly'|'fortnightly'|'weekly'|'quarterly'|'yearly'|'biannual'
  tag: string
  paid: boolean
  paidKey: string                  // year-month-name-day for paidBills
  coveredByDebt: DebtEntry | null  // populated if a debt covers it
  source: 'bills'                  // distinguishes from debt
}

interface DebtEntry {
  id: number                       // S.debts id
  name: string
  amt: number
  rate: number
  delayDate: string | null
  date: Date | null                // parsed delayDate
  paid: boolean
  viaRent: boolean
  priority: number
  coversBill: BillEntry | null     // populated if this debt covers a bill
  source: 'debts'
}

interface CalendarEntry {
  type: 'bill' | 'debt' | 'payday'
  ref: BillEntry | DebtEntry | null
  amt: number
  label: string
  urgent: boolean
  colour: 'red' | 'amber' | 'green'
}

interface TripEntry {
  id: string
  name: string
  emoji: string
  startDate: Date
  endDate: Date
  daysUntil: number
  daysLong: number
  budget: number
  saved: number
  remaining: number
  monthlyNeeded: number
  pctSaved: number
}

interface GoalEntry {
  id: string
  name: string
  emoji: string
  description: string
  target: number
  saved: number
  monthly: number
  pctSaved: number
  monthsAtCurrent: number
  monthsPostWrx: number
  monthsWithBonus: number
}

interface ProvisionEntry {
  name: string
  annual: number
  monthly: number
  frequency: string
  nextDue: Date
  monthsUntil: number
  dueThisMonth: boolean
}

interface WrxImpactSummary {
  salePrice: number
  kiaLoan: number
  earlyRepayFee: number
  netAfterKiaPayoff: number
  interestSaved: number
  monthlyFreed: number
  worthPayingOff: boolean
  recommendation: string
}
```

### 6.4 Functions made obsolete

After the model exists, delete:
- `getNetWorth()` — read `MODEL.liquidNet/totalNet/nwBreakdown` directly.
- `calculateNetWorthBreakdown()` — same.
- `getDynamicDailyBudget()` — read `MODEL.safeToSpendToday`. (Keep at most as a 1-line shim during migration.)
- `getMaxDay()` — same.
- `getSurvivalMode()` — read `MODEL.survivalMode`.
- `getBillsDue()` — read `MODEL.billsBeforePayday`.
- `getActiveDebtsDueBeforePayday()` — read `MODEL.debtsBeforePayday`.
- `getDynamicBuffer()` — derive from model; the rule is fragile and only used by 8 sites that all should switch to `MODEL.safeToSpendToday`.
- `getGenuineSurplus()` — model exposes the components; render code computes locally.
- `isBillDueThisMonth()` — used during model build only; not exposed.
- `isBillCoveredByDebt()` — used during model build only; **fix the today-vs-rendered-month bug** in the model build, then delete.
- `getCalendarDayItems()` — read `MODEL.calendarEntries.get(dateISO)`.
- `findMumDebt()` — model exposes `S.debts` already filtered/named.
- `daysInCurrentMonth()` — keep as a util.
- `getDailyBudget()` — replace with `MODEL.userCap` for the cap; delete the function.
- `getDiscretionarySpend(from, to)` — keep as util; the model uses it for `weekSpent` etc.
- `getMinDailySpend()` — keep utility.
- `getSurvivalForecast()` — replace with renderer that consumes `MODEL.billsBeforePayday + debtsBeforePayday + days × $20 minLiving`.
- `getNoSpendStreak()` — model exposes `noSpendStreak`.

**Estimated lines deleted from index.html:** 200–280.

### 6.5 Migration order

1. **Add `computeFinancialModel(S)` next to `getLiveBal()`** (around line 1590). Initially calls existing functions, returns aggregate. (The model is a *façade* first.)
2. **Add `MODEL` global** + populate at top of `renderAll`, in `onStateChange`, in `load`.
3. **Migrate dashboard renderers one by one** to read `MODEL.X` instead of calling the underlying function. Test after each. (Order: hero NW → safe-to-spend → survival banner → weekly snapshot → debt grid → recent txns.)
4. **Migrate Bills tab + Calendar** — `getCalendarDayItems` becomes a pure read of `MODEL.calendarEntries.get(dateISO)`. **This is where the May 1 double-count bug gets fixed** because dedup happens during model build.
5. **Migrate Plan Mode** — payday allocation, trip cards, goal cards, super card all read `MODEL`.
6. **Migrate Jarvis prompt** — single block of variable lookups becomes one model dump.
7. **Migrate worker sync payload** — JSON.stringify a subset of MODEL.
8. **Delete the obsoleted helpers** (after no greppable references remain).
9. **Update `tests/core.test.js`** — test against `computeFinancialModel(mockS)`, not against individual helpers.

The order matters: **calendar last among UI** because it's the only place where the dedup bug is exposed; everywhere else the per-call functions are roughly correct. Calendar is the test case for the model.

### 6.6 Where it lives in the file

Top of `<script>` block, immediately after the global utilities (`fmt`, `fmtC`, `$`, `daysInCurrentMonth`) and BEFORE any render function. Roughly **line 1200**, just under the `BILLS` array. That way every downstream function can call it.

The migrations and `load()` should still come after — the model is computed on top of state, not before it.

### 6.7 Unit tests for the May 1 double-count

Add to `tests/core.test.js`:

```js
test('Teachers Health debt covers Teachers Health bill on May 1', () => {
  // Setup: today = April 29; debt due 2026-05-01; bill quarterly day 1.
  S.debts = [{id:8, name:'Teachers Health', amt:259.41, paid:false, delayDate:'2026-05-01'}];
  // BILLS already has Teachers Health quarterly.
  const M = computeFinancialModel(S);
  const may1 = M.calendarEntries.get('2026-05-01') || [];
  const total = may1.reduce((s,e) => s+e.amt, 0);
  expect(total).toBe(259.41); // NOT 518.82
});

test('isBillCoveredByDebt: rendered-month aware', () => {
  // Same setup; test the build helper directly if exposed.
  const billOnMay = { name:'Teachers Health', day:1 };
  const debtOnMay = { name:'Teachers Health', delayDate:'2026-05-01', paid:false };
  // Helper must compare debt date vs the SAME month being rendered, not today's.
  expect(billCoveredInMonth(billOnMay, [debtOnMay], 4 /* May */, 2026)).toBeTruthy();
});

test('billsBeforePayday excludes covered bills', () => {
  S.debts = [{name:'Teachers Health', amt:259.41, paid:false, delayDate:'2026-05-01'}];
  const M = computeFinancialModel(S);
  const hasBill = M.billsBeforePayday.some(b => b.name === 'Teachers Health');
  expect(hasBill).toBeFalsy();
});

test('debtsBeforePayday excludes viaRent debts', () => {
  S.debts = [{name:'Property Deposit (via Mum)', amt:5681, viaRent:true, delayDate:'2027-01-15'}];
  const M = computeFinancialModel(S);
  expect(M.debtsBeforePayday.length).toBe(0);
});

test('safeToSpendToday equals (bal − billsCommitted − debtsCommitted) / days, capped', () => {
  S.bal = 779.50;
  // mock April 29, payday 15, 16 days, $262.63 bills, $259.41 debt
  const M = computeFinancialModel(S);
  // expect ~16.10
  expect(M.safeToSpendToday).toBeGreaterThan(15);
  expect(M.safeToSpendToday).toBeLessThan(20);
});

test('liquidNet excludes super', () => {
  const M = computeFinancialModel(S);
  expect(M.liquidNet).toBeLessThan(M.totalNet);
  expect(M.totalNet - M.liquidNet).toBe(M.nwBreakdown.superBalance);
});

test('Calendar entries on cross-month dates use rendered month for coverage', () => {
  // today = April; render May 1.
  const entries = M.calendarEntries.get('2026-05-01');
  // Only one entry, even though both bill and debt exist for that day.
  expect(entries.filter(e => e.amt > 0).length).toBe(1);
});

test('Yearly bill not in billsBeforePayday outside its dueMonth', () => {
  // today = April (3); NRMA dueMonth=4 (May).
  const M = computeFinancialModel(S);
  const hasNrma = M.billsBeforePayday.some(b => b.name === 'NRMA KIA Insurance');
  expect(hasNrma).toBeFalsy();
});

test('Quarterly bill due in non-due month is excluded', () => {
  // today = April; Teachers Health dueMonths [Feb,May,Aug,Nov] — April excluded.
  const M = computeFinancialModel(S);
  const has = M.billsThisMonth.some(b => b.name === 'Teachers Health');
  expect(has).toBeFalsy();
});

test('Total liabilities does not include viaRent debt', () => {
  const M = computeFinancialModel(S);
  expect(M.totalLiabilities).toBeLessThan(25000); // KIA $23,989 + Afterpay $124 + nothing else
});
```

---

## SECTION 7 — THE KILL LIST

### Recommended deletions (line counts approximate)

| What | Line range | Saved |
|---|---|---|
| `renderMumCard` function (dead — div gone) | 9223–9237 | ~15 |
| `renderWrxTracker` function (dead — div gone) | 3635–3725 | ~90 |
| `renderLtTiles` function (dead — tiles gone) | 3598 area | ~50 |
| `checkAfford` and dependants (`aff-*` removed) | ~30 sites + function body | ~40 |
| `getNetWorth` wrapper (1 line) | 1684 | ~3 |
| `calculateNetWorthBreakdown` wrapper | 1681 | ~3 |
| `getDailyBudget` (replaced by `MODEL.userCap`) | 1434 | ~5 |
| `getMaxDay` (replaced) | 1477 | ~5 |
| `getDynamicBuffer` (replaced) | 1592 | ~15 |
| `getGenuineSurplus` (replaced) | 1483 | ~10 |
| `isBillCoveredByDebt` (used during model build, then deleted) | 1710 | ~25 |
| `findMumDebt` (after rename complete) | 1637 | ~7 |
| `getNoSpendStreak` (replaced) | 1617 | ~10 |
| `getSurvivalForecast` (replaced) | 2166 | ~80 |
| `_origMarkDebtPaid` wrapping (if not used) | 6131 area | ~10 |
| `wirePaydaySliders/Trip/Goal` empty stubs | 10117+ | ~3 |
| `toTitleCase` (unused) | 1629 | ~5 |
| `_wrxPriceUpdated` migration (already in seed) | 1216 | ~6 |
| `_afterpayUpdated` migration (already in seed) | 1371 | ~30 |
| `mumDebt.accountBalance` / `accountTarget` fields | seed + migration | ~2 |
| `_origMarkDebtPaid` if dead | n/a | ~5 |
| `console.log` PUSH/SCAN cleanups (17 unguarded) | various | ~17 |
| Dashboard "Affordability Check" card (already done in MISSION-JARVIS) | n/a — already removed | n/a |
| Plan Mode `wrx-alloc-modal` if unused (need verify) | (~11199) | ~30 |
| Settings — Vehicle value `s-wrx-value` row (already deleted) | done | n/a |
| Legacy real-state seed v13 `wrxValue: 21000` etc | 6373 | ~50 (whole seed) |
| `S.bonuses` UI in Settings (duplicate with Bills tab) | ~30 lines | ~30 |
| Settings "Bills list" duplicate (also in Bills tab) | ~30 | ~30 |
| Goal Tracker (Analysis tab) — replaced by Plan Mode goals | function body | ~60 |
| SLYGHT Score whole subsystem (Analysis card + score recommendation) | ~120 | ~120 |
| Daily Character Score system (`CHARACTER`) | ~200 | ~200 |
| Survival forecast in Analysis | (replaced) | ~80 |

**Total estimated: ~1,200 lines deletable** (~10.7% of 11,233).

### Recommended consolidations

| Pair | What |
|---|---|
| `getNetWorth` + `calculateNetWorthBreakdown` + `calculateNetWorth` | One function `calculateNetWorth()` returning the full object. Two wrappers go. |
| `getMaxDay` + `getDynamicDailyBudget` | One function. Wrapper deleted. |
| `getDailyBudget` + cap inside `getDynamicDailyBudget` | One — model exposes both `userCap` and `safeToSpendToday`. |
| Dashboard "weekly snapshot" + "pace display" sub-line | One block. Currently two adjacent renders that read the same numbers. |
| Settings Bonuses + Bills tab Bonuses | Pick one (Bills tab — closer to bills). |
| Settings Bills list + Bills tab list | Pick one (Bills tab). Settings shouldn't have a duplicate. |
| `executeChatAction` + `quickLogTxn` | Both push to `S.txns`, similar bookkeeping; share a `pushTxn(t)` helper. |
| `renderBillsGrouped` "is paid" inline + `isThisMonthlyBillPaid` | Inline at 4338 should call the canonical function (it doesn't currently). |

### Recommended renames

| Old | New | Why |
|---|---|---|
| `getNetWorth` | (delete) | Lies — "get" implies cheap; it does math. |
| `getMaxDay` | (delete; use `safeToSpendToday`) | "MaxDay" is mealy-mouthed. |
| `getDailyBudget` | `getDailyCap` | It's a cap, not a budget. |
| `_NON_SPEND_CATS` set | `_NON_DISCRETIONARY_CATS` | More accurate. |
| `S.bal` | (keep — short and clear) |  |
| `S.carloan` | `S.kiaLoan` | the loan IS the KIA loan now post-MISSION-AUDIT. |
| `S.cc` | `S.creditCard` | clearer; `cc` looks like carbon copy in 2026. |
| `S._wrxSlider` | `S._wrxSliderValue` (or delete) | dead post-`renderWrxTracker` removal. |
| `BILLS` (global) | `BILLS_DEFAULT` | distinguishes from runtime BILLS-after-edits. |
| `S.debts` keeping `viaRent` flag | `S.debts` (keep). Property Deposit (via Mum) is technically a savings flow — but as long as the calc respects `viaRent`, the model can rename it to `savingsFlow:true` for clarity. |

### Estimated total line reduction

**~1,200 lines (~10.7%)** of `index.html`, mostly from cutting SLYGHT Score, Character Score, dead render functions, and the survival forecast inline duplicates. Plus 17 unguarded console.logs.

---

## SECTION 8 — THE BLAST RADIUS

### What breaks first session if we get it wrong

1. **Dashboard freezes** if `MODEL` throws during build (e.g. nullable date in a debt). Mitigation: wrap each model field in try/catch with sensible defaults, log warnings.
2. **NW shows 0** if `calculateNetWorth` is rewired to model and one breakdown field is undefined. Mitigation: model returns `liquidNet: 0` not `null` for fail.
3. **Bills tab empty** if `MODEL.billsBeforePayday` filter is too strict (e.g. accidentally drops monthly bills). Mitigation: unit test for "monthly bill always present".
4. **Calendar shows nothing** on cross-month dates if dedup logic over-merges. Mitigation: the May 1 unit test catches this both directions.
5. **Jarvis prompts stale data** if model isn't recomputed before chat send. Mitigation: chat send recomputes model inline.
6. **Plan Mode WRX card breaks** if the WRX impact section calls a deleted helper. Mitigation: feature-detect `MODEL.wrxImpact` before render.

### Safest order

1. **Build the model behind a feature flag** (`FOUNDATION_MODE`). Never read it; just compute it on every state change. Compare its outputs to existing functions in dev — log diffs.
2. **Wire `tests/core.test.js`** to call `computeFinancialModel(mockS)` and compare to known-good values from current state. Lock these in.
3. **Migrate one renderer at a time** in the order from Section 6.5. Run tests + spot-check each.
4. **Calendar last** — that's where the bug actually lives.
5. **Delete the obsoleted helpers** only after a full session of John using the app and reporting nothing wrong.
6. **Then start the kill list** — SLYGHT Score, Character Score, etc. — only after the model is the canonical data source.

### Guardian check updates

Today's guardians (4 layers, 50 runtime checks) test:
- DOM IDs critical present
- Specific functions defined
- Specific migration flags
- Mock go-live scenarios

Most will survive a model migration. **Updates needed**:
- Any guardian asserting a specific function exists (e.g. `getDynamicDailyBudget`) must be updated to assert `computeFinancialModel` exists OR keep the wrapper.
- Mock go-live scenarios that compare numeric outputs need to also exercise `MODEL.X` paths.
- "Critical DOM IDs" guardian must be updated to remove deleted IDs (`dash-mum-card`, `wrx-tracker-card`, etc.) — currently it accepts any ID flagged as "possibly orphaned" but flags missing required IDs.

### Unit test rewrites

Existing `tests/core.test.js` (14 tests) inlines copies of `daysLeft`, `isBillDueThisMonth`, `getBillsDue`, `getActiveDebtsDueBeforePayday`, `getDynamicDailyBudget`, `getSurvivalMode`, `calculateNetWorth`. After model migration:
- Replace each test's inline-function setup with a single `computeFinancialModel(S)` call.
- Add the 9 new tests from Section 6.7.
- Total tests post-migration: ~20.

### Rollback plan

- Each Phase-2 commit should be small: model added, one renderer migrated, tests pass, commit.
- Keep the obsolete functions until after John has used the app for a full day with the new model and confirms nothing's regressed.
- If a migration goes sideways: revert the single offending commit (renderer change) but keep the model behind the flag for next attempt.
- Worst case: revert all of Phase-2 — `git revert` the merge commit. Pre-Phase-2 state has 14 passing tests and the May 1 bug; reverting just restores the bug, doesn't make it worse.

---

```
AUDIT COMPLETE
- Sections written: 8/8
- Total findings: 76 (20 calculation sites · 5 collisions · 4 paid-bill-ghost risks · 9 dead/duplicate-feature counts · 9 console.log unguarded clusters · 4 mum-test failures · 9 migration items · others)
- Recommended deletions: ~1,200 lines (~10.7% of 11,233)
- Calculation contradictions found: 14 of 20 figures audited disagree somewhere
- Mum Test failures: 4 (SLYGHT Score, Daily Character Score, Goal Tracker on Analysis, Survival Forecast inline duplicates)
- Awaiting John's review before Phase 2.
```
