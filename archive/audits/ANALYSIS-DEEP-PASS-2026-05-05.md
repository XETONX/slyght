# SLYGHT — Deep analysis pass

**Date:** 2026-05-05
**Author:** Opus (Claude)
**Scope:** Read-only investigation of `C:\Users\admin\slyght\` — code (`index.html` 11,594 lines; 16 modules; 280 functions), real user state (`state-snapshot.json`, `REAL_STATE_V17` seed), design docs (`PLAN-MODE.MD`, `BACKLOG.md`, `MISSION-JARVIS.md`, `MISSION-PLANUX.md`, `AUDIT.md`, `AUDIT-FOUNDATION.md`), runtime report.

This document is grounded in what's actually in the files. Every claim has a line number or a transaction ID behind it. If a claim isn't falsifiable I've removed it.

---

## 1. PATTERNS IN THE CODE

### 1.1 Hidden cleverness that should be surfaced

**Bonus interception** (`checkForBonusInterception`, line 11298) — when a transaction is logged with note containing "bonus", or amount between $1,500–3,000 with cat=Income, the app auto-sets `S._pendingBonus` and pops a confirm dialog: *"Open your plan to allocate it before it disappears into spending?"* This is the `intercept the moment` philosophy from `PLAN-MODE.MD` line 35 made real. **But the trigger is too narrow:** John's stated case is *"if I get 8K this month"* — `amt >= 1000 && (... amt <= 3000 ...)` rules out anything over $3k as bonus-like. Any windfall above $3k slips through without interception.

**Auto-detect bill payments** (`autoMatchBillsToTxns` line 5258, `autoDetectBillPayments` line 5280) — if the user logs a $780 transaction and Car Loan is $780, the app auto-marks Car Loan paid for this month, with name-overlap as a fallback match. This is genuinely smart bookkeeping. **But it's invisible** — a toast message and that's it. No persistent "we matched X to Y" record. After a week the user has no idea what got auto-matched vs manually marked.

**Location-aware suggestions** (`LOCATION` line 8012) — the app knows John's office (Sydney CBD `-33.8668, 151.2052`), home (Sutherland Shire `-34.0591, 151.0822`), GF's place (`-33.8754, 151.2139`), and *specifically* Woolworths Kirrawee (`-34.0342, 151.0729`). When near Woolies it fires a "$80 grocery budget" toast (line 8081). When at GF's after 5pm it fires "Cook together tonight" (line 8094). Office days are detected as Mon/Thu/Fri (line 8054). **None of this surfaces in the dashboard.** It runs in the background and dies as a toast.

**Round-ups feed China automatically** (line 5240) — every manual expense entry rounds up to the nearest dollar; the cents go to China Holiday bucket. The China Holiday balance ($61.82 in current code, $67.22 in snapshot) is **entirely from round-ups** — no manual deposit transactions exist for that bucket. This is the only working savings habit in the data and the user has no visible feedback that it's happening at scale.

**`renderIncomeSimulator`** (line 11208) already implements a working "what if I get a raise" slider — drag annual salary from $117,500 up to +$50k, see China and Apartment timelines update in real time. Repointing this from raise-deltas to one-off bonus events would cost ~30 lines.

**`PREDICTOR.wrxImpact`** (line 7632) computes "if WRX sells, NW becomes Y" projections 1/2/3 months out. After tile cleanup (commit `3c9b684`) this is rendered only as a thin `wrxNW` pill inside Time Machine. The most aspirational data the app produces is buried.

### 1.2 Accidental complexity

**Three dead render functions** consuming real file weight:
- `renderPaydayPlan` (line 3298) — 150 lines, called from line 3212, targets DOM `payday-plan-body` which **does not exist** (`grep` returns no matches). Dead since dashboard declutter (probably MISSION-JARVIS).
- `renderCharacterScore` (line 7920) — 30 lines, targets `character-score` which **does not exist**. Built but never wired into HTML.
- `AUDITOR.showAnomaly` (line 6806) — targets `auditor-badge` which **does not exist** (removed by MISSION-JARVIS line 30).

These don't break anything but represent ~200 lines of code that runs `if (!el) return;` on every render pass.

**The audit log marks failures as successes.** `AUDITOR.record` (line 6783) computes `ok = expected !== null ? Math.abs((after - before) - expected) < 0.02 : true`. When a `CONSISTENCY_FAIL` is recorded with `expected: 0` (as seen in snapshot lines 396, 410, 422, 434), `Math.abs(0 - 0) < 0.02` is `true`, so the failure entry has `ok: true`. Runtime guardian then reports "No consistency failures." **A bug masquerades as a feature.** This is exactly what John meant in `BACKLOG.md` #41 *"Data Health Check never records fails despite errors in Activity Log"* — they don't agree because one of them lies about its own state.

**Hardcoded food budget contradicts user's stated patterns.** `PLAN.getPostWrxSurplus` (line 9645) hardcodes `food = 400`. The chat system prompt at line 6083 says *"Food spend: ~$900/month (target $400) — biggest leak."* The post-WRX surplus calc uses the *target* not the *actual*. A user who reads "post-WRX surplus = $X" is reading a number that assumes John already cut his food in half.

**Two parallel discretionary-spend filters disagree.**
- `_NON_SPEND_CATS` (line 1423) excludes `[Debt repayment, Income, Savings, Bills, Transfer, Loan, Car Loan, CC Payment]` — used by `getTodaySpent`, `computeSpentInRange`.
- `getDiscretionarySpend.EXCLUDED_CATS` (line 1762) excludes `[Debt repayment, Savings, Loan, Income]` — does *not* exclude Bills/Transfer/Car Loan/CC Payment.

Mission `5c6e219` harmonized the today/week paths but `getDiscretionarySpend` still uses the laxer filter and is consumed by `MODEL.weekSpent`, `MODEL.cycleSpent`, line 5702 weekSpend, line 5856 mtdDiscretionary, etc. So the *cycle* number and the *today* number don't agree on what counts as discretionary even after the math fix.

**The PLAN_MODE.MD design philosophy says "Every number must be live and recalculated"** (line 20) but `PLAN.getPostWrxSurplus` baselines food at $400, fuel at $110, KIA insurance at $85, teachers health at $86.47/mo — all hardcoded. Live system + frozen estimates = drifting truth.

### 1.3 What the codebase wants to be

The codebase has been converging on **two registers in one binary** for at least 4 commits:
- `c800400` — paid-bills logic became month-aware (fixing register confusion across cycles)
- `4a8cfba` — Plan Mode got editable repayment fee + bonus preview + slider affordability (PLAN getting more interactive)
- `3c9b684` — Analysis tab lost SLYGHT Score, Spending DNA, 90-Day Forecast, Worst-5 (NOW getting cleaner)
- `7351f9e` — Time Machine, Goals, Income Received, Emergency Fund moved out of Analysis (NOW losing future-tense content)

Each commit is the codebase pulling forward-looking content out of NOW and pulling decisions/honesty into PLAN. The architecture **already wants** the two-register split. The user's prompt named this directly: *"Plan Mode = anticipation, generative, warm. NOW = present, truthful, cool. Two registers."*

The codebase doesn't fully know this yet. Visual treatment is split (NOW: black `#0a0a0a` ground, sharp mono numbers, 14px radii; PLAN: `#0a0f1a` blue-black, larger 16px radii, gradient progress bars, teal+orange palette) but it's expressed as inline rgba styles per-renderer rather than as a CSS context class. The mental separation isn't *narrated to the user* — there's no copy that says *"this is the now. that is the plan. they speak different tongues."*

### 1.4 Architectural moves easier than they look

- **Two-register theming**: introduce a `.plan-mode-context { --bg: var(--plan-bg); --r: 16px; }` class on `#plan-mode`. Plan Mode's existing inline `background: rgba(255,255,255,0.04)` becomes `background: var(--card-bg-plan)`. ~80 lines of CSS, zero logic. Already there in spirit.

- **MODEL is the right facade.** `computeFinancialModel()` at line 2117 produces a unified snapshot every render pass. NOW's renderers mostly read from it (footer strip line 9438, dashboard `m-today-spent` line 3052). Plan Mode mostly *doesn't* — `renderPaydayAllocation` recomputes income/fixed/discretionary inline. Repointing PLAN at MODEL is mechanical, not architectural.

- **Repurposing `renderIncomeSimulator` for one-off bonuses** is a 30-line edit. The slider already cascades to China/Apartment timelines.

- **Round-up visibility** is 20 lines: a "China Holiday +$X this week from round-ups" line on the dashboard reading from `(S.txns||[]).filter(t => t._isRoundup && t.ts >= weekAgo)`. The data is already there.

---

## 2. PATTERNS IN THE USER'S DATA

I have two snapshots of John's data:
- `state-snapshot.json` — captured 2026-04-15 12:53 UTC, balance $2,533.99
- `REAL_STATE_V17` (line 6612) — seed data, balance $1,500.34

Both reflect the days post-payday on 14-15 April 2026.

### 2.1 What John says vs what his data says

**John's mental model** (system prompt line 6082):
> Food spend: ~$900/month (target $400) — biggest leak
> Vaping: ~$200/month — quitting for City2Surf
> FIFA packs: $116+ when bored — always regretted
> Drinks out: $35-60 per session
> Living paycheck to paycheck despite $117k income

**John's actual logged transactions in the 3 days post-payday (Apr 13-15):**
- $7,282.33 salary in (Manhattan Associates, txn id 0)
- $100 family gift in (Yia yia, txn id 6)
- $2,500 CC repayment (txn id 1, Virgin Money — voluntary cleardown)
- $1,170 Car Loan with explicit note *"regular + missed payment + fees"* (txn id 2)
- $250.84 Afterpay cleared (txn id 3)
- $141.76 Claude Max one-off subscription (txn id 4)
- $0.90 China Holiday round-ups aggregate (txn id 5)
- $780 Car Loan regular payment, day later
- $550 Owed to Michael cleared
- $51 Car pink slip
- $33.62 Groceries
- $14.73 Weed accessories
- $552.54 WRX Green Slip cleared
- $462 WRX Rego cleared
- $140 Parking Fine cleared

**Total flow in: $7,382.33. Total flow out: $7,247.49.** 

**Of that outflow, $6,649.38 (91.7%) was debt clearance + auto-debits + bill catch-ups.** Only $14.73 was unambiguously discretionary (weed accessories). $33.62 groceries is partly discretionary, partly necessity. Everything else was non-negotiable (penalty payments, missed loan fees, rego, green slip, voluntary CC cleardown, etc).

**The narrative "I spend spend spend" is contradicted by the data.** What he actually does is **triage** — the moment money lands, it leaves to fix yesterday's problems. The 12 days that follow show almost nothing logged at all.

This means one of three things is true and we should figure out which:
1. The system prompt's $900/mo food estimate is a feeling, not a fact, and his real food spend is closer to $300/mo (10 grocery txns × $33.62 = $336/mo).
2. He pays for food via cash / tap-and-go and the app sees only the Woolies-on-card portion.
3. The seeded data is one specific period (post-bailout debt-triage) that's atypical.

Reconciliation log (snapshot lines 391-435) supports option 2:
- Apr 14 14:16: balance $3,313.99 — *"Wasnt accounting for already transferring for car loan"*
- Apr 14 22:51: balance $2,755.34 — *"Not sure where the difference is, I think it's the anthropic transaction as it was initially charged as USD"*
- Apr 15 09:11: balance $1,500.34 — *"Bank fee"*

**Three reconciliations in 19 hours, averaging $271 of unaccounted drift each.** The app misses:
- Auto-debits John forgot to log
- USD-to-AUD FX conversions (Anthropic Pro is billed in USD)
- Bank fees

**The data the app HAS is honest. The data the app DOESN'T HAVE is large and systematic.** Any forecast or projection that assumes the txn log is complete is overconfident.

### 2.2 Goal pursuit vs goal abandonment

`S.savingsBuckets` (snapshot lines 165-194):
```
China Holiday      $4,000 goal · $67.22 saved · 1.7%
Rainy Day Fund     $2,000 goal · $0 saved      · 0%
Rego & Insurance   $1,500 goal · $0 saved      · 0%
Gifts & Celebrations $500 goal · $0 saved      · 0%
```

Three of four buckets sit at zero. The one bucket with progress ($67.22) is **entirely from round-up cents** — no transactions exist with category `Savings` and a positive amount tied to manual deposit (round-ups have `_isRoundup: true` flag, see filter at line 4779).

**Manual saving is not a habit John has.** The "+ Add Savings" buttons in `renderSavingsBuckets` (line 4849) and `renderChinaHolidayTracker` (line 4801, the `[10, 50, 100]` quick-add buttons) have evidently never produced a tracked deposit. The data shows only two savings vectors that work:
1. **Round-ups** — automatic, invisible to user, cents only
2. **Mum's account** — externally managed, $3,000 saved against $50,000 goal — money flows via the $2,500/mo deposit-savings bill that auto-debits on the 15th

**Implication:** any "tap to save $50" UI in this app will be tapped zero times. Architecture should default to *automating* saves rather than *prompting* them.

### 2.3 Subscription stack

From `BILLS` (line 1150) plus seed data subscriptions:
```
Amazon Prime          $9.99
Microsoft Game Pass  $19.45
Pet Insurance Bowtie $60.20
Claude Plus          $34.00
Netflix              $28.99
Optus                $199.00  (telco, not media)
YouTube Premium      $16.99
Adobe                $23.99
Spotify              $15.99
Claude API           $32.00
─────────────────────────
                    $440.60/month
```

Three findings:

1. **Two Anthropic products simultaneously.** Claude Plus ($34) + Claude API ($32) = $66/mo across two billing relationships with the same provider. Plus the seed shows a one-off $141.76 "Claude Max" charge in April. Surface: *"You have $66/mo on Anthropic across two products — is this what you want?"*

2. **Microsoft Game Pass + FIFA pattern.** Game Pass is $19.45/mo. The system prompt warns about FIFA packs ("$116+ when bored — always regretted"). Game Pass is the gateway: it makes more games available, which leads to more in-game purchases. If he's quitting impulsive gaming spend, Game Pass is the subsidy.

3. **Pet ownership = $105/mo recurring.** Pet Insurance Bowtie $60.20 + Pet Food $45 = $105/mo / $1,260/year. Not flagged anywhere as a category. Bowtie is real Australian pet insurance; the bill data implies a dog (Darwin trip notes uncle's dog).

### 2.4 UX report: he barely uses the app

Snapshot lines 439-462:
```
sessionMins: 4
totalTaps: 3
topFeatures: [
  ["Yesterday (14/4) these were sc", 2],
  ["SLYGHT\n  Know your money. Alwa", 1]
]
tabUsage: [] (empty — never visits other tabs)
suggestions: ["Unvisited tabs: dash, cal, chat, spend, settings — content may not be discoverable"]
score: 95
```

**A 4-minute session, 3 taps total, all on the splash and a yesterday-summary toast.** He literally opens the app, doesn't navigate, closes it.

The score `95` is internal UX score (no friction detected because no engagement detected). It's not signal.

The system suggests *"Unvisited tabs: dash, cal, chat, spend, settings"* — five tabs he hasn't visited in this session. **The app does not have a daily ritual.** John's stated intent ("use it BEFORE money comes in for fun") would require him to actually open and dwell. Currently he doesn't.

### 2.5 People-debts

Active debts in the data are dominated by relationships:
- *Owed to Michael* $550 (snapshot line 102) — friend lending pattern: $300 → $50 goodwill → $200 additional. Eventually cleared (REAL_STATE_V17 line 6638).
- *CC overdue* $187.35 — *"Cleared — mum paid full CC balance 15 Apr"* (snapshot line 121). This event reshapes the next 9 months: it converts to a structured $4,658 obligation paid via rent over 9 months (snapshot line 152).
- *Owed to Mum* / *Property Deposit (via Mum)* $4,658 — `viaRent: true`, `monthlyPayment: 500` — the largest single recurring outflow vector after Rent itself.

**Mum is John's savings infrastructure** (via $3,000 in her deposit account, paying his CC, structuring the repayment via rent), AND **Mum is John's largest creditor** (the $4,658 obligation). The relationship is the most important financial node in his life. The app records all the data points but doesn't render it as a *relationship* — it renders it as scattered debts and a savings bucket.

### 2.6 Notification dismissal pattern

`S.dismissedNotifications` (REAL_STATE_V17 line 6671):
```
["urgent_Owed_to_Michael__550",
 "warning_Optus___Phone___Inte",
 "warning_Car_Loan___Firstmac_",
 "urgent_Parking_Fine__140_du"]
```

**Four dismissals across two urgent and two warning tiers.** Cross-referencing the txn log: all four were eventually paid. So dismissal didn't equal abandonment — he was on top of them. The notifications **were redundant for him**, firing reminders he didn't need.

That's exactly the failure mode of nagware: when the user is already coping, the alerts are friction. When they aren't, the alerts are anxiety. There's no middle ground.

### 2.7 Hidden context the app already knows

- **Office days are Mon/Thu/Fri** (`LOCATION` line 8054)
- **Habit merchants are mapped** (line 1169): rockdale pharmacy, florae, honahlee, stanmore station, acacia medical, cbd flowers, metroway corner, ruiqing, kirrana, sunshine plus — at least 5 of these (florae, honahlee, sunshine plus, cbd flowers, metroway corner) are Australian medicinal cannabis dispensaries. The app knows John's "weed pen" supply chain by name.
- **He has a specific coffee shop**: Batch Espresso (`BRAND_LOGOS` line 9458). Hyperlocal Sydney CBD coffee.
- **City2Surf is Aug 9, 2026** (`getDaysToCity2Surf` line 8205) — a fitness countdown is plumbed.
- **Darwin is June 7-15** (`PLAN.getTrips` line 9562) — uncle covers flights/accom/car. GF coming.
- **China is December 2026** (line 9569) — staying with GF's family. Budget $5,000 spending money.

All of this is in code. None of it is on the dashboard.

---

## 3. THE GAMIFIED-PLANNING DIRECTION

John's words: *"I want this app gamified and for me to use it BEFORE money comes in so I get excited to see where I can allocate it. The app needs to be fluid — planning should help me understand where my money should go with passion and encouragement."*

### 3.1 What "playground before payday" genuinely looks like

The app already has the temporal awareness — `daysLeft()` returns the days to payday (15 days currently). The dashboard payday bar (line 429) shows progress. What it doesn't have is **a different mode 3 days before payday**.

Imagine: today is May 12 (3 days before payday May 15). John opens the app. Instead of the usual NOW dashboard, he sees:

```
3 days to payday  · cycle 70% complete

You're $43 over budget this cycle
$237 left to spend before salary lands

REHEARSE PAYDAY
Salary: $7,282 + bonus? [tap to add]

Last cycle, your money went:
─────────────────────────────────
Locked $4,078 · 56%   ████████████░░░░░░░
Behavior $1,150 · 16% ████░░░░░░░░░░░░░░░
Goals     $670 · 9%   ██░░░░░░░░░░░░░░░░░
Slipped  $1,384 · 19% █████░░░░░░░░░░░░░░  ← unaccounted

Want to plan it out before it lands? →
```

The "Slipped" number is the reconciliation honesty — *we know we missed ~$X last cycle*. That's the truth-anchor.

Below it: a single "Rehearse" button. Tapping opens Plan Mode in a different state — "REHEARSAL FOR May 15" — where every change is provisional. He can drag sliders, try a $400 dentist, swap allocations. When done, "Save This Plan" stores it. On payday morning the app says: *"Your salary just arrived. Apply the plan you rehearsed?"* → one tap.

The point: **opening the app pre-payday now leads somewhere.** It's not a dashboard check, it's a planning game with stakes that arrive in 3 days.

### 3.2 Three distinct directions

**Direction A — "Rehearsal mode"** (described above).
- *Build cost:* Medium. Reuses Plan Mode, adds a new "rehearsal" overlay state.
- *Live-with cost:* Edge cases when payday is irregular (early/late deposit). Need a lifecycle: rehearsal → live → reconcile.
- *What proves it:* John opens the app 3+ times in the 3 days before payday.

**Direction B — "Money pots with personality"** (Monzo-flavored).
Each savings bucket becomes a vivid, growing card with personality:
- *China Holiday with Lily* (not "China Holiday $5,000")
- Big animated number that ticks up with each round-up
- "Streak: 7 days of round-ups" as gamification
- Tap to deposit: number-pad with quick presets ($10/$50/$100), but ALSO an "auto-fund this $X/week" that actually creates a recurring transfer
- The cards *grow* visibly as money goes in

The semantic shift: pots aren't accounting categories, they're *plants*.
- *Build cost:* Medium-large. New bucket data model, animation, automation infrastructure.
- *Live-with cost:* The auto-fund concept either needs real bank integration (out of scope) or is fictional (kills trust).
- *What proves it:* Rainy Day Fund and Rego buckets each get >$0.

**Direction C — "Saved scenarios"**
User saves named what-if scenarios:
- *Default*
- *$2K bonus comes in*
- *$400 dentist next month*
- *Cut food in half*

Each scenario is a delta from default. User flips between them. The active scenario controls Plan Mode's display. A "feels how" rating per scenario (excited / nervous / scared / proud) tracks emotional response.
- *Build cost:* Large. Multi-mission. New data structure + chrome for managing scenarios.
- *Live-with cost:* User accidentally lives in a scenario and forgets, sees confusing numbers.
- *What proves it:* John creates and revisits ≥3 scenarios.

### 3.3 The smallest piece that proves direction

**Hypothesis to test:** if the cascade math is honest (locked → behavioral → goals → daily) and editable, Plan Mode becomes a place John dwells.

**Smallest experiment:**
- Add ONE new card to Plan Mode: "Your behavior this cycle"
- Show 4-5 spending categories (Food, Transport, Entertainment, Shopping, Other) with current 30-day averages from `S.txns`
- Each category has a "this cycle target" inline-editable number (default = avg)
- Each shows the gap: *target $400 vs avg $900 = +$500 unlocked if you cut to target*
- Goals bucket below recomputes live
- Daily living recomputes live
- Slider affordability check (already shipped in `4a8cfba`) keeps working

**One mission. ~150 lines. New state field `S.behaviorTargets`. New helper `computeAvgByCategory(days)`.**

If John opens Plan Mode 3+ times in the week after this ships, it works.

### 3.4 Full vision if scope unlimited

Plan Mode becomes a first-class screen, not a slide-out:
- **Time slider at top**: TODAY → +1 month → +6 months → +1 year → +5 years. Drag and watch every number reshape.
- **Money pots as growing plants** along a timeline. Round-ups + planned deposits + bonus drops are visible deposits at moments.
- **WRX has a dedicated "launch" button**. Tap it, the year ahead reshuffles visibly: KIA paid off, $780/mo freed, deposit savings accelerated by N months.
- **Scenarios are tabs**, switchable, comparable side-by-side.
- **Locked Plan is a contract** signed with future-you, with a "tear up the contract" button that requires confirmation.
- **AI chat is integrated as ambient sidebar** — *"In this scenario, your November looks like X, here's why."*
- **Pre-payday rehearsal becomes the dominant entry point** — the NOW dashboard's purpose is explaining *what is*; Plan Mode's purpose is exploring *what could be*.

That's a 2-3 month build, not a single mission. Phase it.

### 3.5 Concrete data structures that unlock this

Most of what's needed already exists:
- `S.txns` with category tags ✓
- `_NON_SPEND_CATS` set ✓
- `computeSpentInRange(from, to)` ✓
- `getAvgDailySpend()` ✓
- `PLAN.INCOME_MONTHLY` getter ✓
- `PLAN.getGoals()`, `PLAN.getTrips()` ✓
- `S.savingsBuckets[].saved` with round-up flag tracking ✓
- `checkAllocationAffordability()` from `4a8cfba` ✓
- `daysLeft()` cycle-aware ✓

What needs to be built:
- `computeAvgByCategory(days = 30)` returning `{Food: $X, Transport: $Y, ...}` — ~15 lines, mirrors `computeSpentInRange` with grouping
- `S.behaviorTargets = {category: amount}` — sparse object for user overrides
- For Direction A (rehearsal): `S.rehearsedPlan = {cycleStart, cycleEnd, allocations, customSpending, savedAt, applied}` and a "rehearsal" mode flag for Plan Mode
- For Direction C (scenarios): `S.scenarios = [{id, name, deltas, sentiment, viewCount}]`, `S.activeScenarioId`

No schema migrations required. All sparse additions. Existing data unaffected.

---

## 4. THE PATTERN SURFACE / NOTICED PANEL

John's words: *"the app needs to notice things he doesn't."*

Below: 8 patterns I found in the code + data, with the evidence that proves each, and what the panel would say.

### Pattern 1 — "You triage, you don't spend"

**Evidence:** REAL_STATE_V17 txns Apr 13-15 show $7,247.49 outflow over 3 days. $6,649.38 (91.7%) was debt clearance + auto-debits + bill catch-up. Pure discretionary: $14.73 weed accessories. Groceries $33.62 plus pink slip $51 are arguable necessities.

**What the panel says (post-payday, day 1-5 of cycle):**
> Of the $7,382 that landed last week, $6,649 went to debts, bills, and catch-ups. $14.73 went to *you*. You're not overspending — you're triaging. 12 days until next payday — what's the one good thing you'll do with what's left?

**What the user can do:** acknowledge ("got it"), see the full breakdown, mark this cycle "triage cycle" (lower expectations) or "free cycle" (higher expectations).

### Pattern 2 — "Your only working savings habit is automatic"

**Evidence:** Of 4 savings buckets, 3 sit at $0 ever (Rainy Day Fund, Rego & Insurance, Gifts). China Holiday has $61.82, all from `_isRoundup: true` flag transactions. Zero transactions exist with category `Savings` matching manual quick-add buttons.

**What the panel says:**
> China Holiday has gained $61.82 — all from round-up cents you didn't see. Your Rainy Day, Rego, and Gifts buckets sit at $0. Manual deposits aren't your style. Switch on auto-fund $5/week for those buckets?

**What the user can do:** turn on round-ups for the other buckets, cap at a weekly amount, dismiss.

### Pattern 3 — "You're paying twice for the same provider"

**Evidence:** BILLS contains both *Claude Plus* ($34, day 9) and *Claude API* ($32, day 14). REAL_STATE_V17 line 6620 shows a one-off $141.76 *Claude Max* charge. All Anthropic.

**What the panel says:**
> $66/month on Anthropic across two products. Plus a $141.76 Claude Max charge last month. Same provider, different billing. Want to consolidate?

**What the user can do:** mark one as primary (suggested cancel link for the other), defer.

### Pattern 4 — "Your bank disagrees with your app every six hours"

**Evidence:** `S.reconLog` contains 3 entries in 19 hours: $560 missing transfer, $14.41 USD-AUD discrepancy, $83 bank fee. Average drift: $219/reconciliation.

**What the panel says:**
> You reconciled 3 times in 19 hours. Each time the app was over by $X. The app sees ~70% of your spending. Your projections drift. Take 2 minutes to add the merchants the app misses?

**What the user can do:** open a "what does the app miss" wizard, defer, mark as known limitation.

### Pattern 5 — "Your urgent notifications are dismissed faster than you act"

**Evidence:** `S.dismissedNotifications` shows 4 of 4 urgents dismissed (Michael $550, Parking $140, Optus, Car Loan). All 4 were eventually paid. Dismissal preceded payment, not blocked it.

**What the panel says:**
> You dismissed every urgent notification this week, then handled them anyway. The urgent tier isn't helping. Want to demote them to "warning" for the rest of this cycle?

**What the user can do:** quiet urgents for the cycle, keep firing, change threshold.

### Pattern 6 — "Mum is your savings infrastructure"

**Evidence:** `S.debts[7]` Property Deposit (via Mum) $4,658 with `viaRent: true`, `monthlyPayment: 500`. CC overdue $187.35 cleared by Mum on Apr 15. Mum holds $3,000 deposit account, target $50,000.

**What the panel says:**
> Mum is the largest financial node in your life. She holds $3,000 of your deposit, settled $187.35 of your CC, sees $2,500/mo from rent → savings + $500/mo rent. Net flow to your future via Mum: $2,500/month.

**What the user can do:** see the full Mum relationship as a card, update Mum's account balance manually, see the timeline to $50k.

### Pattern 7 — "City2Surf is in your data but invisible"

**Evidence:** `getDaysToCity2Surf()` returns 97 (snapshot date). Race date: Aug 9, 2026. Referenced in `renderWeeklySnapshot` (line 9398: *"🏁 City2Surf in 97 days"*). Vape/cigs are mentioned in patterns ("quitting for City2Surf") but no spending category links them.

**What the panel says:**
> City2Surf is in 97 days. You're spending ~$200/mo on vapes — that's $640 by race day. What if those dollars went to running shoes / training fuel?

**What the user can do:** start a "training fund" bucket auto-funded from each vape txn flagged.

### Pattern 8 — "Your spending changes by location"

**Evidence:** `LOCATION` knows office (Mon/Thu/Fri default), home, GF's, Woolies. `BRAND_LOGOS` includes batch espresso, opal/transport NSW. Office vs home vs GF's are detectable.

**What the panel says:**
> Office days: avg $X spend. Home days: avg $Y. GF days: avg $Z. Today's an office day. Your usual office-day pattern is 2 batch espressos + lunch out — that's roughly $25 by 3pm.

**What the user can do:** see the location breakdown, set a "WFH today" override, dismiss.

### When the panel appears

- **Conditionally**: each pattern fires when its trigger condition is met (post-payday for Pattern 1; reconciliation in 24h for Pattern 4; 3+ dismissals for Pattern 5; etc.)
- **Permanently**: a "You should know" tile on the dashboard rotates between currently-active patterns
- **Dismissable**: pattern is suppressed for X days after dismissal but re-evaluated nightly

This isn't "more notifications" — it's noticing things, with evidence, and a useful action attached.

---

## 5. THE TWO-REGISTER DESIGN

NOW = present, truthful, cool. PLAN = anticipation, generative, warm.

### 5.1 Concrete moves

**Color**
- NOW keeps `#0a0a0a` ground, sharp green/amber/red from `:root` (line 17). This is the "honest console" feel.
- PLAN gets a layered palette: `#0a0f1a` blue-black ground (already used, line 75 of PLAN-MODE.MD), plus a **warm secondary** — soft amber-gold (`#FFB347`) for goals, soft teal (`#4ECDC4`) for progress. Reads like sunset vs night.

**Typography**
- NOW: Space Mono for numbers, DM Sans for labels (current). Numbers feel like terminal readouts.
- PLAN: DM Sans bigger and softer for narrative text ("China Holiday — 6 months out, $4,938 to go"). Mono only for the headline net worth and dollar amounts. Reads like a magazine spread.

**Layout**
- NOW: `.pad { padding: 16px 20px }`, dense tile grids, 14px radii.
- PLAN: 24px gutters, 16px radii, more whitespace. Single-column scroll only — never tile grids.

**Motion**
- NOW: instant. Number changes snap. Renderers use `renderAll()` with no transitions.
- PLAN: tweened. Number changes use 0.4-0.6s ease-out. Sliders feel buttery (already do, via `oninput` cascade in `4a8cfba`). Progress bars animate up using existing `transition: width 0.5s ease`.

**Copy voice**
- NOW: imperative, clipped. *"Owed to Michael $550 OVERDUE — pay now."* *"$110 due this week."*
- PLAN: present-tense possibility. *"China holiday — 6 months out. $4,938 to go. $823/month would land you there."*

### 5.2 Where the line gets blurry

**Survival Forecast** (`getSurvivalForecast`, rendered into `survival-forecast` element on the dashboard) — it's a forecast (PLAN-shaped) that lives on the dashboard (NOW). My take: this is intentional and right. It's NOW telling you the future as a *warning*. Future-as-warning belongs in NOW. Future-as-aspiration belongs in PLAN.

**Net worth** appears in both. Dashboard shows `liquidNet` (line 3052: *"Liquid net worth · tap for full picture"*). Plan Mode header shows `net` including super (line 10103). Same data, two framings. Keep both. The framing is the point.

**Recent transactions** — NOW only. Trips, goals, payday allocation, super — PLAN only.

**The "Expected Extra Income" / bonus input** currently lives in Bills tab (line 503). It's about future money. It belongs in PLAN. Move it.

**Settings** — neither register. It's the basement, where you go to fix things. Should look distinct from both.

### 5.3 The rule

**NOW says "this is what is." PLAN says "this is what could be."**

Anything that's a forecast, scenario, target, aspiration, or trip → PLAN.
Anything that's a current balance, real bill, real spend, real warning → NOW.

The exception is reality-check warnings (*"you'll run out by May 14"*) which belong in NOW because they're alarms about the future *firing now*.

---

## 6. WHAT I'D BUILD FIRST IF IT WERE MY CALL

**Make Plan Mode know what John actually spends, in real time, and turn the allocation cascade into honest math.**

This is the thing John explicitly asked for: *"its there so close but like it doesnt show my avg spending factored in."*

### Why this and not something else

I considered:
- Net worth swap to liquidNet — already partly done; ships in 30 minutes; one-shot win but doesn't unlock other features
- Two-register theming — beautiful but doesn't change behavior
- Pattern-surface tiles — depends on having honest math first; building the data plumbing for "you triage, you don't spend" requires a complete view of his behavior
- Pre-payday rehearsal mode — depends on having an honest cascade to rehearse

**The cascade is the keystone.** Net worth swap is downstream cosmetics. Patterns are downstream observations. Rehearsal is a wrapper around the cascade. Theming is a coat of paint. The cascade is the foundation.

### What it looks like

A new card in Plan Mode, between Locked Non-Negotiable and Your Choice:

```
YOUR BEHAVIOR THIS CYCLE                                ▾
─────────────────────────────────────────────────────
🍱 Food / Coffee   target $400  · 30-day avg $336
🚌 Transport / Fuel target $250 · 30-day avg $198
🎮 Entertainment   target $300  · 30-day avg $112
🛍️  Shopping        target $200  · 30-day avg $87

If targets hold: $1,150 to behavioral spending
                 $2,054 left for goals after locked
                 $137/day for the 15 days remaining
```

Each target is inline-editable (same pattern as the editable repayment fee shipped in `4a8cfba`). Drag a target down, watch the goals bucket grow live. Drag income up (income field becomes editable too), watch all three react.

### What it unlocks

- Honest planning math — no more $400-food assumption baked into hardcoded surplus calculations
- The "what if I cut food in half" question becomes concrete and visible
- The bonus preview gets a real foundation — no more idealized allocations
- Pattern 1 ("you triage, you don't spend") can surface honestly because we know what *should* be discretionary vs what is
- Round-ups become contextualized ("you save $X via round-ups; cut food $200 and that becomes $Y")
- Pre-payday rehearsal becomes possible because there's something to rehearse against
- Scenarios become possible because the cascade is the canvas

### What it costs

- ~150-200 lines (a new Behavior cascade card + helper)
- A new sparse `S.behaviorTargets` field
- A new `computeAvgByCategory(days)` helper
- Migration for any user with a locked plan from before the cascade existed (the only tricky part)
- ~3-4 hours of focused work

### What's the risk

- Empty txn history → default targets to $0 looks weird. Mitigate: if no recent txns for category, hide that row.
- Locked plans break semantically (sliders divided "discretionary minus zero living"; new cascade divides "discretionary minus honest living"). Mitigate: on first encounter with new cascade, show a "review your plan" prompt that re-anchors values.
- Behavioral target > actual spend ("I expect to spend MORE this month") → goal bucket shrinks. UI should handle this naturally; goal bucket can go to $0 and the UI already shows red on negative.
- Big visual addition without a redesign. Mitigate: collapsed by default with a "tap to plan your spending" affordance until user has set targets at least once. Use the existing locked-non-negotiable visual pattern (matches Plan Mode aesthetic).

---

## 7. THINGS WRONG OR MISSING

### 7.1 Wrong (in app, shouldn't be)

1. **CHARACTER score system has dead UI but live tracking.** `renderCharacterScore` at line 7920 calls `getElementById('character-score')` — that DOM element doesn't exist (`grep` for `id="character-score"` returns nothing). The function is dead code. But `analyseTransactions` (line 7886) still tracks `NO_SPEND_EVENING` events. The worker pushes `characterScore` to push notifications (line 8540). Half-living system. Either kill it or revive it as a single "no-spend streak" indicator.

2. **`renderPaydayPlan` dead code** — 150 lines (line 3298) computing a payday plan into `payday-plan-body` which doesn't exist. Called every render pass at line 3212, returns silently. Remove.

3. **`AUDITOR.showAnomaly` dead** — references `auditor-badge` removed by MISSION-JARVIS. Function still gets called.

4. **`CONSISTENCY_FAIL` audit entries flagged `ok: true`.** AUDITOR.record sets `ok = expected !== null ? Math.abs((after - before) - expected) < 0.02 : true`. CONSISTENCY_FAIL passes `expected: 0`, so `Math.abs(0 - 0) < 0.02 = true`. Failures look like successes. This is the root of `BACKLOG.md` #41.

5. **`PLAN.getPostWrxSurplus` hardcodes food at $400** while system prompt says actual is $900. Surplus is overstated by $500/mo against the user's own stated reality.

6. **Two parallel discretionary filters** still disagree (`_NON_SPEND_CATS` vs `getDiscretionarySpend.EXCLUDED_CATS`). The cycle/week numbers in MODEL use the laxer filter; today's number uses the stricter. Documented at line 1758 as *"Single source of discretionary spend"* but it isn't.

7. **"Owed to Mum" string literals** still exist in seed code despite the `_mumReframed` migration. Per MISSION-PLANUX, 14 sites should use `findMumDebt()`. Some still don't.

8. **Settings has duplicate income input** (`set-income` at top, `s-income` lower). Identified in our prior session as deferred — saveSettings early-returns if `s-income` is null, which would break payday/budget/CC saves if removed.

9. **The bonus interception threshold is too narrow** (line 11301). `amt >= 1000 && (note has "bonus" || amt === 2000 || amt 1500-3000 with cat=Income)`. John's "$8K" example wouldn't trigger. Either widen the range or make the trigger explicit (a "this is a bonus" toggle on income txns).

### 7.2 Missing (should be in app, isn't)

1. **A "what just happened" panel for post-payday days.** The app knows the cycle started 1-5 days ago and triage occurred. It just shows "$X spent today" instead of *"you cleared $4,449 in obligations in 3 days — that's not spending, that's ground clearing."*

2. **Round-up visibility on the dashboard.** The single working savings habit is invisible. *"You saved $0.43 this week from round-ups"* tile is 20 lines.

3. **Subscription audit tile.** $440/mo in recurring software/services. He doesn't know which.

4. **A "money committed this cycle" total.** Bills + debts + planned savings transfers as a single number. Currently shown as scattered tiles.

5. **Cash vs card visibility.** No acknowledgement that the app sees ~70% of spend. The reconciliation log proves the gap exists. Should be visible.

6. **A trip/event countdown on the dashboard.** Darwin June 7-15, China December, City2Surf Aug 9. Three time anchors with financial implications, all buried.

7. **A "this is your context right now" line.** Office day, post-payday, daily budget remaining. The data is there (LOCATION + WEATHER + paydayReceived). One line.

### 7.3 Wrong design assumptions

1. **The weekday $60 / weekend $180 daily budget is a fiction.** Apr 13-15 spending was $4,549 ($1,500/day average). Apr 16-29 spending was approximately $99 ($7/day average). **Daily budgeting is the wrong frame.** Cycle-window or week-window is more truthful.

2. **The app assumes John logs every transaction.** Reconciliation log proves he doesn't. Architecture should explicitly model "we see ~X% of spend" and adjust forecasts. Currently it claims certainty it doesn't have.

3. **The app assumes saving = button-tapping.** Manual deposits never happen in his data. Architecture should default to *automating* saves (round-ups, scheduled transfers, salary-sacrifice-style) rather than *prompting* them.

4. **The app treats Plan Mode as informational.** John explicitly wants it generative. The current sliders are read-mostly with edit-occasional. Should be edit-mostly with read-occasional.

5. **The app's notification urgency tiers don't match John's response.** Urgent doesn't mean "I'll act faster." It means "I'll dismiss faster." Empirically.

---

## 8. CREATIVE WILD CARDS

### 8.1 Reverse onboarding

When John opens the app at 1pm and there's no Food/Coffee txn for today: *"Lunch?"* with a quick number-pad and category pre-selected. **Opposite of "use the app to plan" — "use the app to confess."** Lower friction logging. Could feed all the missing data the reconciliation log reveals.

### 8.2 Voice-tap log

Tap the dashboard balance, say "13.60 batch espresso." Browser speech-to-text → categorize → log. Removes 4 modal screens. Friction collapses. (Browser support: `webkitSpeechRecognition`, Chrome on Android works.)

### 8.3 GF mode

When at GF's place (LOCATION knows), default category to "Drinks out / Date." When at home alone, default to "Groceries / Cooking." When at office, "Food / Coffee." Remove the category-pick step entirely. The location-derived defaults are right >80% of the time.

### 8.4 Future-you check-ins

Every Sunday evening: *"Last Sunday you said you'd cap food at $200 this week. You're at $X. Next week: same plan or reset?"* Self-recursive feedback loop. Closes the rehearsal → live → reconcile cycle.

### 8.5 SLYGHT becomes a pair-app with Mum

Mum holds the deposit. Mum bailed out the CC. Mum has a financial role in John's life that the app records as scattered debts and savings buckets. **The relationship is the model.** A *Mum* card showing: $X settled this year, $Y in deposit account, $Z/mo via rent, target $50k by date W. Read-only on the app side; she could have a separate view-only link.

### 8.6 Two clocks

NOW shows wall clock + payday countdown. PLAN shows life-event clock — Darwin in 6 weeks, China in 7 months, City2Surf in 14 weeks. Time is the implicit currency in PLAN.

### 8.7 Cancel the daily budget

Replace with cycle budget. *"$2,800 to spend this cycle, you've used $1,200, 12 days remaining."* No more "$60 weekday cap" — that doesn't match how he lives (the data shows $99 over 12 days *or* $1,500/day post-payday, never $60).

### 8.8 The app should probably be two surfaces

NOW = phone app (always with you, mobile-first, push notifications, location-aware). PLAN = larger surface (tablet/desktop, used during dedicated planning sessions, bigger sliders, full-width scenarios). Trying to do both on a 480px-max-width phone causes the visual cramping of `BACKLOG.md` #3 ("too many tiles"). **This is bigger than a redesign.**

### 8.9 Subscription manager as its own product

A whole tile: every subscription, last charged, next charge date, cancel link if known, "haven't logged a Game Pass session in N days." Subscriptions are 40% of John's discretionary subscription stack. They deserve their own surface.

### 8.10 The 1% rule, made visceral

$117k income → industry rule says 10-20% saved. Current state: ~$3,000 in Mum's account + $61.82 China + ~$0 elsewhere = 2.6% of one year's income saved across his life. Show this once: *"Industry rule: 20% of $117k = $23.5k/year saved. You've saved $X total. Gap: $Y."*

### 8.11 The WRX moment deserves 10x weight

When `S.wrxStatus` flips to `'sold'`, `checkForWrxSaleInterception` (line 11322) auto-opens Plan Mode and shows a toast. This is the biggest financial event of his year by an order of magnitude. The current treatment is one toast. Should be:
- Confetti animation
- The full year-ahead reshuffles visibly
- "Pay off KIA: yes/no" decision card
- Allocation walkthrough for the remainder
- Ceremonial.

### 8.12 The loop

John's "I want to see what I get if I get $8K, allocate, pay off, see new state, repeat" is asking for a **loop**. Each iteration teaches something. The current Plan Mode is single-shot (set sliders → lock → done). Make it loop-able: *save scenario → revisit → tweak → save again*. Compound learning with versioning.

### 8.13 Speak his language

He says "weed pen." The app calls it `VAPE_PURCHASE` in `CHARACTER.POINTS`. Mismatch. He says "spend spend spend." The data says he triages. The app's vocabulary should track his vocabulary. The patterns in the system prompt should be data-derived, not asserted ("Food spend ~$900/month" is asserted; it should be computed).

---

## CLOSING NOTES

The most important finding from this pass:

**The user's mental model (system prompt at line 6082) and the user's data (transaction log) tell different stories.** Mental model says "I spend spend spend, food $900, vape $200." Data says "I triage post-payday, food ~$300 logged, vape never categorized." Either the user underlogs (likely, per reconciliation log) or the mental model is a cope (also possible). Either way, the app should ask the question rather than assert one side as truth.

The second most important finding:

**The codebase has been pulling toward the two-register split for at least 4 commits.** Each recent mission has been moving forward-tense content out of NOW and bringing decision-architecture into PLAN. The user's "two registers" framing names something the code already wants. Naming it explicitly — in CSS, in copy voice, in the rule "NOW says what is, PLAN says what could be" — would let the next 2-3 missions feel coherent rather than one-off cleanups.

The third most important finding:

**Plan Mode currently does math against numbers that aren't his.** Hardcoded $400 food, $110 fuel, $85 KIA insurance — these are estimates baked in 4+ months ago that no longer match his life. The cascade refactor (build first, Section 6) is the unlock. After that ships, every other improvement gets cheaper.

**Stopping. Awaiting reaction.**
