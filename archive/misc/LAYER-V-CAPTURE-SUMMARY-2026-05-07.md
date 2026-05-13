# Layer V Capture Summary — 2026-05-07

**Source:** Live deploy at https://xetonx.github.io/slyght/ (verified
commit 59e008b deployed — `.cal-day.paid-only` CSS present in served
stylesheet).
**Device profile:** Galaxy S23 Ultra emulation — viewport 412×915,
DPR 3.5, mobile UA, hasTouch:true. Viewport asserted at boot before
first capture; `window.innerWidth === 412 && window.devicePixelRatio
=== 3.5` confirmed in run log.
**Frozen clock:** 2026-05-05T22:00:00+10:00 (so "today" = Tue 5 May).
**State seed:** `state-snapshot.json` (S.bal $381.35, 14 BILLS, 9
paidBills (all keyed `2026-5-…`), 5 debts, 4 savings buckets, 104
txns).
**Harness:** `scripts/layerV-capture.js` (untracked) → output dir
`captures/`. Manifest at `captures/manifest.json`.

37 captures attempted, 37 PNG files saved. 3 step actions raised
errors during the run; in each case the screenshot still landed but
shows pre-action state — flagged below.

---

## Section 1 — Dashboard

| # | File | Notes |
|---|---|---|
| 01 | `…-01-dashboard-top.png` | MI-13 banner present at top: "⚠ Bills tracked as paid early — tap to review" with "Show me these bills" button + "×" dismiss. Notif bell shows red **3** badge. Hero `$381.35` ("$91 spent today"), liquid net worth `+$3,625.51`, payday progress at ~9-10/14, "10 days to payday". "Cautious Mode — Watch Your Spending — $124 buffer after bills" amber banner. MAX PER DAY `$19.86`, "Running $58.05 over pace this week ⚠". IMMEDIATE DEBTS `$1,617 total`, Auto-sort chip, two debt tiles visible (Afterpay — Conc… $94 and NRMA KIA Insuran… $1,023). Bottom nav: Dashboard / Bills / **+** / Chat / Analysis / Settings — **Settings is in nav**. |
| 02 | `…-02-dashboard-mid.png` | Same vertical region as 01, third debt tile "Borrowed from Mi…" peeks in at bottom. The Cautious Mode banner is the only "survival banner" rendering — no separate `#survival-banner` element fires. |
| 03 | `…-03-dashboard-immediate-debts.png` | Identical framing to 02 (the heuristic scroll-to-debts landed on the same element since IMMEDIATE DEBTS is mid-page). Debt tiles: Afterpay $94 (`6% OF DEBT`, Due 14/05), NRMA KIA $1,023 (`63% OF DEBT`, Due 02/05). Both tiles show `⚠ $X short of surplus` line. |
| 04 | `…-04-dashboard-recent-spending.png` | Recent Spending card visible with txn rows. |
| 05 | `…-05-dashboard-bottom-nav.png` | Bottom of dashboard scroll, nav bar visible — Dashboard / Bills / + / Chat / Analysis / Settings. |

**At-rest observations (Section 1):**
- The MI-13 banner stays sticky at top z-index:50; it consumes ~40px
  of header real estate and overlaps the SLYGHT logo / PLAN pill row
  visually in capture 02 (translucent stack — logo and PLAN button
  both still visible but contrast is reduced).
- Debt-tile "$94 short of surplus" copy shows on a debt that's only
  $94 (Afterpay). Implies surplus is $0 or negative — phrasing reads
  redundant when the debt total IS the shortfall.
- "Cautious Mode" amber banner has a line break mid-phrase
  ("Watch Your Spending — $124 buffer after\nbills"); cosmetic, not
  clipped.

---

## Section 2 — Bills

| # | File | Notes |
|---|---|---|
| 06 | `…-06-bills-calendar-may.png` | Header label confirmed `cal-month-label="May 2026"` in run log. Today (May 5, Tue) green-bordered. Days with markers: 2, 8, 10, 14, 15 (payday — green w/ multi), 16. Legend at bottom: ● Bill / ● Payday / ● Multiple. Below calendar: DYNAMIC WEEK PROJECTION tile (Spent so far $91.04 (1 day) / Bills remaining $89.19 / Projected daily $19.86/day × 6 days = $208.35 / Week total projection $299.39 / "Running $71.18 over pace — slow down" amber). Then "+ Add A Bill" outline-dash button. THIS WEEK group `$89` with one row visible: "Microsoft PC Game Pass [TRACKED] (Subscription, Monthly) **$19** strikethrough". |
| 07 | `…-07-bills-calendar-april.png` | Calendar nav back successful. April bill markers on days 1, 3, 7, 8, 9, 10, 15 (payday-multi $3780), 16, 20, 25, 26. Cells use `has-bill` red-dim background (no `paid-only` opacity). Legend + projection tile + bills list section unchanged below — they reflect TODAY, not the rendered month. |
| 08 | `…-08-bills-calendar-june.png` | Same monthly bill recurrence pattern as April (1, 3, 7, 8, 9, 10, 15-payday, 16, 20, 25, 26). Identical styling to April — no `paid-only` cells. |
| 09 | `…-09-bills-calendar-day-detail.png` | Step error logged: `detail.scrollIntoView is not a function` (Playwright handle vs DOM mismatch in the harness — non-fatal). The click DID open the inline day-detail card: shows "**2 May** / NRMA KIA Insurance [DEBT] / Covers overdue + current month / **$1,023.06** / TOTAL DUE $1,023.06 / Close". |
| 10 | `…-10-bills-list-due-today.png` | Bills-grouped section. THIS WEEK `$89` group, "Microsoft PC Game Pass [TRACKED] [MONTHLY]" row with `$19` strikethrough. Below: "Pet Insurance — Bowtie" (cut off in frame). |
| 11 | `…-11-bills-list-this-week.png` | Scrolled within bills-grouped — same THIS WEEK section. Subsequent rows visible. |
| 12 | `…-12-bills-list-monthly.png` | Monthly section — heuristic scroll. |
| 13 | `…-13-bills-week-projection.png` | Projection tile: Spent so far $91.04, Bills remaining $89.19, Projected daily $19.86 × 6 days = $208.35, Week total projection $299.39, plus "Running $71.18 over pace — slow down" pace warning. (Visible already in 06.) |

**At-rest observations (Section 2):**
- **Bundle 2 fix is live but visually subtle.** On the May calendar
  the days that should have been pure "tracked-paid" cells (per
  fixture: 1, 3, 7, 9, 20, 25, 26 — the YouTube/Adobe/Spotify/etc
  days with `paid:true` and no debt) render as `cal-day paid-only`
  (opacity 0.5 on the cell) but display **no amount text**, because
  `itemTotal` in renderCalendar sums `unpaidBills` only. CSS rule
  `.cal-day.paid-only .cal-day-amt{text-decoration:line-through}`
  has no `cal-day-amt` element to style on these cells. Net effect:
  paid-only days look like dim, empty day-number cells. Days with a
  debt + paid bill (e.g. May 15 — KIA Loan paid, Rent + Deposit
  Savings unpaid, payday) render as `payday has-multi` because
  `hasDebt` and `isPayday` take priority over `paidOnly` in the cls
  cascade. So the "dimmed with strikethrough" effect described in
  the commit message is not currently visible to the user — the
  visibility improvement is only the cell-opacity shift, and the
  strikethrough rule is unreachable.
- Calendar legend shows three dots: Bill / Payday / Multiple.
  No legend entry for `paid-only`/tracked. A user seeing a faded
  day with a number but no marker has no in-app explanation.
- Projection tile copy "Bills remaining: $89.19" is amber/red while
  "Spent so far: $91.04 (1 day)" is plain — visually the tile reads
  fine but "1 day" parenthetical is whisper-small (low contrast).
- "+ Add A Bill" dashed-outline button is the same width as the
  calendar card — easy to mis-tap when reaching for the calendar
  cells below.
- The DYNAMIC WEEK PROJECTION tile and the bills list both render
  on the same scroll page; switching calendar months (capture 07,
  08) does NOT update the projection tile or the bills list — those
  stay locked to "today's week". Confusing pairing if the user
  expects the tile to reflect the visible calendar month.

---

## Section 3 — Plan mode

| # | File | Notes |
|---|---|---|
| 14 | `…-14-plan-top.png` | "FUTURE PLAN" header, "‹ NOW" back chip. NET WORTH TODAY `+$67,055`, "See Breakdown ›" button. WRX section: "🚗 WRX — Listed — Waiting For Buyer", `$6.28/day KIA interest`. THE PLAN: "Sell WRX → Pay Off KIA Loan → Free $780/Month". LISTED SALE PRICE `$25,000` with Edit pencil. KIA LOAN BALANCE (FIRSTMAC) `$23,214.32` (9.87% p.a. · $191/month interest). Cash After KIA Payoff `+$1,404` (Goes To Deposit Savings). Freed Per Month `+$780` (KIA Loan Payment Stops). Early Repayment Analysis: Fee 2 months interest $382 (Default $382, "2 months interest at 9.87% p.a."), Interest Saved (~18 months) `$3437`, ✅ Net Saving `$3,055 — Pay Off Early`, "Confirm exact fee with Firstmac before paying". |
| 15 | `…-15-plan-provisions.png` | Provisions/sliders section. |
| 16 | `…-16-plan-goals.png` | Goals section — sliders for Deposit Savings (Extra), Freedom Buffer, Darwin Trip, etc. with monthly allocation chips on the right ($500, $200, $150). |
| 17 | `…-17-plan-trips.png` | Continues sliders (Deposit Savings (Extra) $500 / 6% There; Freedom Buffer $200 / 0% There; Darwin Trip $150 / 0% There). Living Costs (Food, Transport, Life) `$1796 = $180/day For 10 Days`. **"Lock This Plan For May 15 →"** big teal button. UPCOMING TRIPS section header + "+ Add trip" pill. Darwin trip card: "33 days away / 7 June – 15 June 2026 · 9 days / [✅ flights] [✅ accommodation] [✅ car hire] / SPENDING BUDGET **$900** ($100/day avg (your share)) / SAVED SO FAR **$0** ($900 to go) / Save $450/month to reach your budget by departure / Looking after uncle's dog. GF coming. / [✏️ Edit budget] [+ Add savings]" |
| 18 | `…-18-plan-add-savings-modal.png` | Add savings modal opened — captured. |
| 19 | `…-19-plan-edit-trip-modal.png` | **Mismatch:** my heuristic ("✏️ Edit budget" / "edit trip" regex) matched the WRX edit pencil first and opened the **Update WRX Sale Price** modal instead of the trip-edit modal. Capture shows: "Update WRX Sale Price / Enter the price you've listed it for on Carsales / LISTED PRICE ($) 25000 / 💡 At $25,000 listed, after paying off the KIA loan ($23,214) and early repayment fee you'll have approximately $1,404 remaining. / Update Price / Cancel". The actual trip-edit modal was not captured. Background reveals lower plan-mode content: "NEXT PAYDAY — 10 DAYS / Arriving May 15 +$7,282 / Expecting a ~$2,000 quarterly bonus? Add it → / LOCKED — NON-NEGOTIABLE -$4,078 / Rent (To Mum) -$500 / …". |
| 20 | `…-20-plan-payday-plan.png` | Payday plan section visible (Lock/Unlock copy). |

**At-rest observations (Section 3):**
- Plan-mode panel is `position:fixed; transform:translateX(0)`
  overlay — no scrim. When closed via `transform:translateX(100%)`
  the dashboard underneath becomes interactive again, no flicker.
- Trip card uses both `Edit budget` (pencil) and `+ Add savings`
  buttons in a tight row at the bottom of the card. Three trips
  (Darwin / China / WRX-as-trip?) — only Darwin visible in the
  capture; other cards may extend below.
- The WRX listing card and the trip cards both have an "Edit"
  button and similar visual treatment — easy to confuse for someone
  scanning quickly. The WRX card's edit pencil is what the harness
  hit first when looking for "edit budget" — flagged because a
  user navigating with similar mental model could trip the same
  ambiguity.
- "$2,000 quarterly bonus" prefill copy ("Expecting a ~$2,000
  quarterly bonus? Add it →") is hardcoded to $2,000 — no obvious
  way to dismiss if the user has no bonus.
- "Lock This Plan For May 15 →" button uses month-day not full date.
  After May 15 has passed (next payday is in 10 days from frozen
  clock), the button should still read accurately, but if the page
  loads after payday, copy may go stale.

---

## Section 4 — Chat

| # | File | Notes |
|---|---|---|
| 21 | `…-21-chat-fresh.png` | "SLYGHT AI / Enter your Anthropic API key to activate SLYGHT AI / [sk-ant-api03-… input field, masked-display] / [Activate SLYGHT AI green button] / Your key is stored locally on this device only. / Get your free API key at console.anthropic.com →". Header has a delete (🗑) and key (🔑) icon top-right. Bottom: a chat input "Ask SLYGHT anything…" rendered but disabled-looking (gray send button). Bottom nav unchanged. |
| 22 | `…-22-chat-empty-or-prior.png` | Identical to 21 — harness deliberately did NOT auto-send a message (cost). The fixture has no prior chat conversation. |

**At-rest observations (Section 4):**
- The "Activate SLYGHT AI" CTA and the "Ask SLYGHT anything…" input
  are both visible simultaneously, with the input non-functional
  until activation. Visually contradictory — implies user can type
  there but submission is blocked.
- "Get your free API key at console.anthropic.com →" is a link in
  green; styling matches button text colour, which could read as
  another button.
- Trash icon (🗑) top-right — purpose unclear from at-rest view
  (clears history? clears API key? scope unclear without label).

---

## Section 5 — Analysis

| # | File | Notes |
|---|---|---|
| 23 | `…-23-analysis-survival-forecast.png` | Top of Analysis tab. Heuristic landed at scroll=0; what's actually at top here is the **spending pivot** ("WHERE YOUR MONEY WENT") not a separate Survival Forecast card. The survival forecast card appears further down (visible at bottom of capture 25). |
| 24 | `…-24-analysis-character-score.png` | Heuristic scroll — landed mid-page. Specifics not directly verified. |
| 25 | `…-25-analysis-spending-pivot.png` | "WHERE YOUR MONEY WENT" / period chips: Today / **7 Days** (selected, green pill) / 30 Days / All time. Total discretionary `$510.34`. Category rows (each with avatar/icon, name, amount, transaction count + %, daily avg, ▼ chevron): Food / Coffee `$269.44` (12 txns · 52.8% · $38.49/day), Health `$149.00` (1 txn · 29.2% · $21.29/day), Entertainment `$58.90` (2 txns · 11.5% · $8.41/day), Shopping `$30.00` (1 txn · 5.9% · $4.29/day), Fixed `$3.00` (1 txn · 0.6% · $0.43/day). Below: pinkish-bordered Survival Forecast card — "📣 Projected to run out in 8 days (Tue, 12 May) / At minimum spending ($15/day) your balance runs out before payday on the 15th. / BREAKDOWN TO PAYDAY / Current balance +$381.35 / Unpaid bills (2) -$89.19 / Pet Insurance — Bowtie (due 8th) -$60.20 / Netflix (due 10th) -$28.99 / Upcoming debts (1) -$93.56 / Afterpay — Concert Tickets (due 14 May) -$93.56". |
| 26 | `…-26-analysis-spending-pivot-expanded.png` | **Step error logged: `no .txn-row found in #spending-pivot`.** Pivot category rows aren't `.txn-row` elements — the harness selector was wrong. Capture is identical to 25 (no expansion). |
| 27 | `…-27-analysis-bottom.png` | Bottom of Analysis page reached. |

**At-rest observations (Section 5):**
- **Anomaly: "Health $149.00 with 1 transactions · 29.2% · $21.29/day"** — singular "transactions" in plural context (should be "1 transaction"). Same issue: "Shopping $30.00, 1 transactions". "Fixed $3.00, 1 transactions". Two of five rows show this. Food/Coffee (12) and Entertainment (2) are correct.
- "Projected to run out in 8 days (Tue, 12 May)" but the numbered date check: today=Tue May 5, +8 days = Wed May 13, NOT Tue 12. Off-by-one OR the day-of-week label is computed independently of the date. Check at-rest copy.
- Survival forecast says runout-day=12 May but next bill (Pet Insurance) is due 8th, debt (Afterpay) is due 14th. With 8-day-runout, user runs out BEFORE Afterpay debt on 14th — but the breakdown lists Afterpay in "Upcoming debts" without flagging a conflict.
- "BREAKDOWN TO PAYDAY" subtraction order: Current balance +$381.35 minus unpaid bills $89.19 minus debts $93.56 = $198.60. But the runout estimate is "8 days at $15/day = $120". $198.60 / $15/day = ~13 days, not 8. The arithmetic doesn't reconcile in the at-rest view.
- "$15/day" minimum spend value isn't shown anywhere as an editable / configurable line — the user can't see where this comes from on this card.

---

## Section 6 — Settings

| # | File | Notes |
|---|---|---|
| 28 | `…-28-settings-top.png` | Top of Settings page. Two collapsed accordion headers: "📊 My Financial Data ▼" and "⚙️ App Controls ▼". Below them, expanded by default: BALANCE — Current balance ($) `381.35` — Update Balance dashed button. APP SECURITY — App PIN `4 digits` placeholder. INCOME — Monthly salary `7282`, Payday (day of month) `15`, Weekday daily budget ($) `30` ("Max discretionary spend Mon-Fri"), Weekend daily budget ($) `100`. |
| 29 | `…-29-settings-app-controls.png` | Heuristic scroll attempted to find App Controls — the section is collapsed accordion, so **the round-ups toggle is not visible in this at-rest capture**. The user's specific ask ("CRITICAL — note its current state: On or Off") cannot be answered from this capture; the accordion needs to be expanded first. (Round-up state IS visible in capture 33's quick-log modal — `+$0.00 → China Holiday  ☑ On` — so round-ups are enabled.) |
| 30 | `…-30-settings-income-budget.png` | Income / Budget — same fields as 28, possibly scrolled lower. |
| 31 | `…-31-settings-debt-strategy.png` | Debt Strategy section visible — "DEBT STRATEGY / Repayment order: Avalanche ▼ / Avalanche: Pay highest interest rate first. Saves the most money long-term — mathematically optimal. / Avalanche saves the most interest. Snowball builds momentum…" |
| 32 | `…-32-settings-bottom.png` | Bottom of settings reached. |

**At-rest observations (Section 6):**
- Two of the requested top sections ("My Financial Data" — monthly
  income / WRX value / deposit account / super; and "App Controls"
  — round-ups, API key, Balance update, App PIN) are **collapsed
  accordions by default**. The user's audit spec assumed these
  fields are visible at-rest. Confirm whether default-collapsed is
  intentional or a regression.
- "App PIN [4 digits placeholder]" is rendered as an input but the
  fixture has no `S.pin`. Tapping this would prompt PIN setup — the
  placeholder makes this look like an editable field rather than a
  setup CTA.
- "Weekday daily budget ($) 30" and "Weekend daily budget ($) 100" —
  delta of 3.3× between weekday and weekend caps. Plausible for the
  user, just noting the magnitude as visible at-rest data.

---

## Section 7 — Critical modals

| # | File | Notes |
|---|---|---|
| 33 | `…-33-modal-quick-log.png` | "Log a Transaction / Quick-log a spend from your Virgin Money notification / [📷 Scan a document — let AI fill this in] dashed CTA / Amount ($) 0.00 / Round-up: +$0.00 → China Holiday [☑ On] / Description e.g. Uber Eats, Coles / Category chips: **Food / Coffee** (selected green), Transport / Fuel, Shopping, Bills / Type Expense ▼ / ☐ Recurring — add to bills list / [Log It green] [Cancel]". Background dims debt-strategy settings card. |
| 34 | `…-34-modal-edit-bill.png` | Edit Bill modal opened on first bill (`openBillModal(0)`) → **Rent + Deposit Savings**. "Edit Bill / Tap Save Changes to update this bill / LAST PAID 'Not yet this month' (green chip) / NEXT DUE **15/5/2026** (amber) / Bill name 'Rent + Deposit Savings' / Amount ($) 3000 / Day of month 15 / Category Fixed ▼ / Frequency Monthly ▼ / ☑ Recurring every month / [Save Changes] [Cancel]". Below the visible frame is presumably a delete affordance. |
| 35 | `…-35-modal-mi13-details.png` | **Step error logged: "MI-13 banner not visible".** Capture is the same edit-bill modal lingering from 34 — the close-edit-bill step in the harness didn't take, and the MI-13 check ran on the Bills page (where the banner is not rendered — the banner is sticky to dashboard). MI-13 **was visible** on capture 01 as "⚠ Bills tracked as paid early — tap to review". So this is a harness path issue, not a "banner absent" signal. |
| 36 | `…-36-modal-edit-debt.png` | Edit Debt modal. `openDebtModal(0)` resolved to the FIRST debt by index, which is **"Property Deposit (via Mum)"** — NOT the one on the dashboard tile (Afterpay or NRMA KIA). Modal: Name 'Property Deposit (via Mum)' / Amount owed `5681.45` / Interest rate 0% p.a. / Due date 15/01/2027 / Notes 'Managed deposit savings account. $500/month' / Priority 4 (with ↓↑ reorder buttons) / "⚠ No surplus — list the WRX to clear debt faster" amber / [Mark Cleared green] [Covered ✓ green outline] / [Save Changes…] (cut off). |
| 37 | `…-37-modal-net-worth.png` | "Net Worth / Assets minus liabilities / LIQUID NET WORTH +$3,626 / What you could access today / LIQUID ASSETS: WRX (listed for sale) +$25,000.00, Virgin Money balance +$381.35, Deposit account (Mum) +$3,000.00, Savings buckets +$75.10, **Total liquid assets +$28,456.45** / LIABILITIES: KIA Loan (Firstmac) -$23,214.32, Credit Card -$0.00, Afterpay — Concert Tickets -$93.56, Borrowed from Michael -$500.00, NRMA KIA Insurance -$1,023.06, **Total liabilities -$24,830.94** / **Liquid Net Worth $3,625.51** / TOTAL NET WORTH (INCL SUPER)…" (cut off). |

**At-rest observations (Section 7):**
- **Net worth modal — top vs bottom mismatch.** Header reads "LIQUID
  NET WORTH **+$3,626**" (rounded up from $3,625.51). Footer reads
  "Liquid Net Worth **$3,625.51**" — same value, different rendering
  (no `+`, no rounding). Two displays of the same metric in one
  modal disagree by rounding and sign-prefix.
- **Net worth modal — "Credit Card -$0.00"** with explicit negative
  sign on a zero balance reads odd (negative zero). Cosmetic.
- **Edit Bill modal — "LAST PAID: Not yet this month"** uses green
  chip for what is effectively a neutral / negative-leaning state
  (bill not yet paid). Green typically signals "good / done" in this
  app. May be misread.
- **Edit Bill modal — "Day of month 15"** field is `<input>` with no
  visible 1-28 hint at-rest (the hint only shows in the field label
  if at all). The L4998 / paid-bills logic depends on this constraint.
- **Edit Debt modal "Mark Cleared" + "Covered ✓"** — two adjacent
  green-styled buttons. From copy alone, the difference between
  "cleared" and "covered" isn't obvious without prior knowledge.
- **Edit Debt — Priority field**: numeric input + ↓↑ buttons. Two
  controls for the same value invites desync (typing 4 in input vs.
  arrow-up to bump). At-rest, the buttons read as redundant.
- **Quick-log modal — Round-up row** says "+$0.00 → China Holiday"
  (no round-up because amount is 0). Default state is `On` toggle
  with `→ China Holiday` pre-selected — surfaces a destination the
  user may not have authorised by default for this run.

---

## Cross-cutting at-rest observations

1. **Bottom nav is consistent across all five tab captures (01-32):**
   Dashboard / Bills / `+` (center action) / Chat / Analysis /
   Settings. Active tab is highlighted in green. Settings IS still
   in the nav (answering the spec's open question).

2. **Bundle 2 fix delivers partial visibility.** Tracked-paid days
   gain `cal-day paid-only` opacity styling, but render with no
   amount text (because `itemTotal` excludes paid items), so the
   `.cal-day.paid-only .cal-day-amt{text-decoration:line-through}`
   rule has nothing to apply to. Effectively the user sees a faded
   day number with no bill marker — not the strikethrough described
   in the commit message. Captures 06 vs 07/08 show the difference
   (May has cells that look "empty + dim"; April/June have the same
   bills with full red `has-bill` background).

3. **Pluralisation drift in Analysis pivot.** "1 transactions" appears
   3× in capture 25 (Health, Shopping, Fixed). Rendered programmatically
   as `transactions · ${pct}%` with no singular/plural switch.

4. **MI-13 banner is sticky to the Dashboard tab only.** It correctly
   fires on dashboard given the fixture's 9 paidBills entries
   (capture 01), but is hidden on Bills/Chat/Analysis/Settings.
   "Tap to review" implies the banner is the entry-point, but the
   banner is invisible on 4 of 5 tabs.

5. **Accordion-collapsed-by-default on Settings hides high-frequency
   controls.** Round-ups toggle, API key, Balance update, App PIN are
   all behind "App Controls ▼". The user has to expand to see/edit.
   Same for "My Financial Data ▼" (income / WRX / deposits / super).

6. **Bills tab projection tile/list is decoupled from calendar
   month.** Switching to April/June calendar (07, 08) doesn't update
   the bills list or projection — they stay locked to "this week".

7. **Two debt-tile cards on dashboard aren't in priority order
   used by `openDebtModal(0)`.** Dashboard shows Afterpay + NRMA KIA
   first, but `openDebtModal(0)` opens "Property Deposit (via Mum)" —
   the index order in `S.debts` does not match the user-visible order
   on dashboard.

8. **Live-deploy verification.** `.cal-day.paid-only` CSS confirmed
   in served stylesheets (4 textual hits in raw HTML, 1 parsed CSS
   rule in document.styleSheets), proving commit 59e008b is the
   running version.

---

## Captures where the harness deviated from spec

- **09 (Bills calendar — day detail):** click landed and modal
  opened, but a Playwright handle method was called incorrectly
  (`detail.scrollIntoView is not a function`). Capture content is
  correct.
- **19 (Plan — edit trip modal):** harness regex hit the WRX edit
  pencil before the trip's Edit budget pencil. The modal that
  opened is the WRX Sale Price modal, not the trip-edit modal. The
  trip-edit modal was not captured.
- **26 (Analysis — pivot expanded):** harness selector `.txn-row`
  doesn't match pivot category rows (the pivot uses different
  classes). Capture is identical to 25.
- **35 (MI-13 details):** harness checked banner visibility while on
  the Bills page (#pg-cal); the banner is sticky to Dashboard
  (#pg-dash) only. Banner WAS visible on dashboard (capture 01).
  Capture 35 is the leftover edit-bill modal from step 34.

These four are harness-path issues, not app bugs — flagged so the
next pass can target them directly.

---

## Files

- `captures/manifest.json` — JSON record of every shot (idx, slug,
  status, file size, error if any).
- `captures/slyght-layerV-2026-05-07-NN-slug.png` × 37.
- `scripts/layerV-capture.js` — harness (untracked).
- This file: `LAYER-V-CAPTURE-SUMMARY-2026-05-07.md`.

Total capture run wall-clock: ~50s incl. browser launch & nav.
