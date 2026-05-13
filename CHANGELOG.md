# CHANGELOG

> Per-bundle ship log. Format per `CC-PRINCIPAL-ENGINEER-MANUAL.md` §8.
> Newest entries at top. One section per bundle.
>
> For phase-level engineering notes during in-progress bundles, see `BUNDLE-NN-NOTES.md`.
> For superseded ship prompts and design docs, see `docs/archive/` (going forward) or `/archive/` (pre-Bundle-28 historical).
> For architecture decisions, see `docs/adr/`.
> For pre-implementation designs, see `docs/sdd/`.

---

## Bundle 28 — IN PROGRESS (started 2026-05-13 13:33 AEST)

**Theme:** PLAN-mode deep dive + canonical-writer migration of the intent layer.

### Audit A1 + cleanup foundation
Six-lens structural audit per Opus's MISSION-AUDIT-A1 spec, folder triage, scoping, and reference pilot.
- 6-lens audit doc (`AUDIT-A1-2026-05-13.md`, 5,500 words)
- Root MD files 76 → 13; 66 historical docs moved to `archive/{missions,ship-prompts,audits,misc,…}`
- 83 MB binaries gitignored
- Bundle 28 scoping doc (`MISSION-BUNDLE-28-PLAN-MODE-DEEP-DIVE.md`, 30+ pages, 11 phases)
- Bundle 28 ship prompt (`CLAUDE-CODE-SHIP-PROMPT-28.md`)
- Reference pilot at `experiments/savings-subscreen-v2.js`
- Commits: `9b6bdcd`, `1d3e327`
- Phone-verify: structural only (no code changes)

### Pre-Phase-0 stability fixes (forward-fixed during pre-flight)
Bugs surfaced while scoping Bundle 28; fixed forward to clear the runway.
- Dashboard hero balance edit silent failure — `runRecon` explicit handling for sub-$1 / unchanged / first-time
- Settings balance edit refactored, then removed entirely (John decision: dashboard hero is the single surface)
- Z-index sandwich fix — `.modal-overlay` 200→600, `.recon-overlay` 300→620, toasts/badge 500→800
- Layer V `fullPage:true` (closes OPEN-BUGS #33 screenshot truncation), captures #38–#42
- Commits: `f174d23`, `c79eeca`, `be21515`, `bdda17b`, `b7fb6ed`
- Phone-verify: PASS (rounds 1–2 per session log)

### Phase 0 — `PLAN.intents` canonical entity (ADDITIVE)
Foundational intent layer that collapses the China-as-3-records duplication and gives every future PLAN write a single owner.
- `BRAIN.plan.intent.*` namespace: `get`, `list`, `byKind`, `byBucket`, `add`, `update`, `remove`, `_archive`, `setBucket`
- 5 new `BRAIN.SOURCES` tags (intent.add / update / remove / archive / setBucket)
- `seedV25_collapseIntents` migration — gated, snapshot-before, idempotent
- 3 new boot self-test entries
- No UI changes — additive only
- Commit: `22ef496`
- Phone-verify: PASS (existing surfaces unaffected; migration ran cleanly)

### Phase 0.1 — Hygiene quick wins
Seven small fixes that didn't need their own phase.
- B28-1: stale Ask AI toast
- B28-2: KIA Extra editor (replaces `alert(…)` stub)
- B28-3: `_paydayExitToTab` helper fixes Go-to-Bills nav
- B28-12: stale Phase 6 comment removed
- B28-15: orphan `paydayUntick` deleted
- `_paydayProgressBar` component extracted
- Commit: `65289c5`
- Phone-verify: PASS (Round 3 forward fixes: `6eb7034`)

### Phase 28.0.5 — Cross-tile metric canonicalisation
Reconciling Analysis tab + Dashboard pace metrics on a single helper family.
- `buildSpendingPivot` uses `getAllOutflowsByCategory` (includes Debt + Savings + Loans)
- Dashboard pace tile uses `computeSpentInRange` (strict — excludes non-spend)
- New canonical helper `getAllOutflowsByCategory`
- Commits: `381735d`, `977e04a` (real-site fix after first migration missed the actual renderer)

### Phase 28.0.6 — Ask AI auto-fill
Pre-fills chat input with structured plan context so AI responses are grounded.
- Pulls from direct readers (`S.bal`, `MODEL.daysToPayday`, `getBillsDue`, …) not stale `BRAIN.plan.getSnapshot`
- Requests math breakdowns + dates in AI response
- Format hint for paragraphs + emojis + bold
- Commits: `381735d`, `977e04a`

### Phase 28.2 — PLAN-mode tile reorder
Payday Plan tile above WRX tile (cycle-first, long-term-second).
- Commit: `381735d`

### Canonical writers — bucket lifecycle + transaction reclassify
Migrations starting the whole-app canonical-writer pattern.
- `BRAIN.savings.addBucket(bucketLike, source)` + `updateBucket` + `removeBucket` — 4 callers migrated
- `BRAIN.transaction.reclassify(ts, patch, source)` — powers Convert-to-Loan
- MAX PER DAY card now tappable
- Dead code: `renderSavingsBuckets` removed
- Commits: `16726cd`, `1a3b80d`

### Rounds 5–9 — adaptive phone-verify fixes
Iterative round-by-round response to John's phone-verify findings.
- **Round 5** (`1268e24`): Ask-AI math + Analysis filter fix + Convert-loan flow + bucket↔intent link + delete buttons on trip/goal/bucket cards
- **Round 6** (`2d4e85f`): `PLAN_MODAL` overlay hoisted out of `#plan-mode` (stacking context isolation — child z-index 601 was bounded by parent's transform context); Analysis filter fix at real renderer `buildSpendingPivot` (previous attempt hit a renderer that's no longer in the DOM)
- **Round 7** (`977e04a`): Debt category fragmentation tip + goal-edit refreshes canvas + Ask-AI math breakdowns + MAX PER DAY explainer rebuilt
- **Round 8** (`9de16dc`): Delete-goal full cycle (intent removal + canvas refresh — previously missed) + `FEATURE-MAP.md` directory of every surface
- **Round 9** (`a1b0ce2`): Delete affordances added to canvas (trip + bucket — sibling-card audit miss from round 8); MAX PER DAY rebuilt with rich HTML cards (hero gradient, progress bar, money breakdown grid, timing-aware warning); debt-tip reformatted as hierarchy

### Artifacts shipped
- `MISSION-BUNDLE-28-PLAN-MODE-DEEP-DIVE.md` — 30+ page scope doc
- `CLAUDE-CODE-SHIP-PROMPT-28.md` — executable spec
- `AUDIT-A1-2026-05-13.md` — 6-lens audit
- `REWRITE-COMPARISON-2026-05-13.md` — pilot vs current analysis
- `BUNDLE-28-NOTES.md` — working ledger with cross-reference inspection queue
- `FEATURE-MAP.md` — atlas of every major surface → render fn → DOM → readers → writers → cross-references
- `CC-PRINCIPAL-ENGINEER-MANUAL.md` — moved into repo (was in `~/Downloads/`)
- `docs/{adr,sdd,archive,manual-amendments,ops}/` — scaffolded with READMEs
- `docs/manual-amendments/AMENDMENT-001-noticed-action-plans.md` — proposes structured Noticed format (ACTION + WHEN)

### Pre-existing guardian FAILs cleared
Closes 2 Noticed items from `315431c` surfacing.
- `no-hardcoded-bill-name` L12118 (`seedV25` Teachers Health) — added `guardian-allow-block` justifying TDZ-driven duplication of `PLAN.getAnnualProvisions` at boot phase
- `no-third-discretionary-filter-array` L14846 (`_DEBT_CATS` inline) — promoted to module-level canonical `_DEBT_CATEGORIES_SET` near `_NON_SPEND_CATS`; usage migrated to `Set.has()`
- Gates: 0 FAILs, 41 pre-existing future-proofing WARNs (magic strings for survival mode + debt strategy — out of scope for this commit)

### Round 46 — Payday Plan Canvas: "showing Mum the plan" polish
John on the BIG ask: "I need to confidently see in that screen I have this much and this is fixed and this remainder is what I can allocate. Right now I can't show or explain that to Mum so she thinks I'm spending money on something and doesn't trust the app."

The Canvas already has the right architecture (income hero → essentials → remainder → discretionary → still-free) but the visual signposting wasn't strong enough for an audience walkthrough. Round 46 polish:

- **Prominent inline `＋ Add bonus` pill** when no bonus added yet. Pre-r46 the bonus toggle was buried behind a tiny ✏️ icon — easy to miss. Now if no bonus exists, a green-bordered pill button sits inline next to the net pay so John can add the expected bonus in one tap. (Bonus IS already there once added → still has the ✏️ for edits.)
- **Mum-readable one-line summary** below the headline figure: "Of $X coming in, $Y is FIXED (bills, debts, daily living) — $Z is yours to allocate." Plain English, totals labelled, can be read out loud.
- **🔒 FIXED badge** on the Essentials section header — Mum sees what can't move.
- **✋ YOURS badge** on the Allocating-the-remainder section — Mum sees what John is deciding.

The Canvas already shows the proportion bar, essentials subtotal, headlined remainder tile, and still-free figure. Round 46 doesn't restructure anything — just makes the FIXED/YOURS split unmissable so the showing-Mum conversation works.

(Deferred for now: ability to drag debts between FIXED and YOURS based on user override, and a "recommended-to-defer" tag on long-term debts so the canvas can suggest pushing them to next cycle. These are substantial design pieces, scoped for a separate round.)

Gates: 0 FAILs, 54/54 tests, 51/51 runtime PASS.

### Round 51 — Darwin allocation surfacing + Monthly Bills compactness
Phone-verify on r49+r50: 1/2/4/5/6/7 PASS, #3 PASS-with-question (Darwin missing from auto-allocate output), and a follow-up on #4 ("now it's just this massive list, needs to be more compactable better").

**51a — Darwin trip never showed up in auto-allocate**

John: "PASS but Darwin never shows up but that trip is so soon within this monthly cycle of $900 — it needs money allocated, why it's not first on list to allocate towards I'm not sure."

Root cause from his state file: Darwin trip has `bucketHint: ''` AND no bucket with a matching name exists. The bucket allocation iterates `BRAIN.savings.getBuckets()` — nothing to allocate to → Darwin silently absent from output.

Two-part fix:
- **Name-substring fallback in `_bucketWeight`**: if `intent.byBucket` doesn't link, walk `PLAN.getTrips()` and match by trip-name substring (e.g. bucket "Darwin Holiday" matches trip "Darwin"). Catches cases where bucketHint isn't set but a name-matching bucket exists.
- **Unlinked-trips section in auto-allocate modal**: `recommendAllocation()` now returns `unlinkedTrips` (trips with no findable bucket, sorted by urgency). The modal shows them in an amber-tinted card with `[+ Bucket]` button → `_createBucketForTrip()` creates the bucket via `BRAIN.savings.addBucket` canonical writer, sets `bucketHint` on the trip via `PLAN.saveTrip`, then re-opens the modal so Darwin appears in the allocation list.

**51b — Monthly Bills row compactness**

John: "PASS but now it's just this massive list, needs to be more compactable better." After r50 merged Today/Week bills into the Monthly section, the list got long. Tightened per-row:
- Padding `14px 0` → `8px 0`
- Chip `36×36` → `32×32`, font `14px` → `13px`
- Bill name font `14px` → `13px`
- Subline font `12px` → `11px`, margin-top `3px` → `1px`
- "(same as debt above)" → "(·debt)" — shorter tag
- Amount font `15px` → `14px`

Net: row height ~56px → ~42px. About 25% denser without losing legibility.

Gates: 0 FAILs, 62/62 tests, 51/51 runtime PASS.

### Round 50 — AU date format + Monthly Bills now comprehensive
Two follow-ups while John was reviewing r49.

**50a — Monthly Bills section was excluding This-Week bills**

John (mid-review): "Just noticed monthly bills is not capturing all my bills including ones showing in This week."

Pre-r50 `renderBillsGrouped` built the Monthly section from `[...grouped.next, ...grouped.later]` — bills in the urgency-focused Today/Week sections were excluded from the comprehensive monthly schedule. Now: `[...grouped.today, ...grouped.week, ...grouped.next, ...grouped.later]` — all month's bills sorted by day in the Monthly Bills section. Duplication with the urgency cards above is intentional — Today/Week are focus highlights; Monthly Bills is the full month-at-a-glance.

**50b — AU date format helper + first-pass apply**

John #5 from r48 phone-verify: "The dates should always follow AUS time formatting so day then month then year so it makes it easier for me to read and better to put the day as number and month as description so like 14th June so it's easier for me to recognise."

- New `fmtAuDate(d, opts)` helper. Accepts Date / ISO string / millis. `opts.style: 'short'` (default — `21 May`) or `'long'` (`21st May`). `opts.year` includes trailing year; defaults to true when the date is in a different year from now.
- Ordinal handling: 1st / 2nd / 3rd / 4th–10th / 11th-13th / 21st / 22nd / 23rd / 24th-30th / 31st.
- 4 regression tests added (62/62 passing).

First-pass application of `fmtAuDate` to highest-traffic user-facing surfaces:
- **BNPL preview** — "Next payment" + "Last payment (auto-stop)" now `21st May 2026` / `2nd July 2026` instead of `2026-05-21` / `2026-07-02`.
- **Dashboard debt cards** — "Due 14/05" → "Due 14 May".
- **Canvas Debt sub-screen** — "due 14 May" via fmtAuDate (already AU but standardised through the helper now).
- **Debt Freedom Timeline "Clear by"** — uses the short-month helper directly so "Aug 2027" stays consistent.

(Calendar tiles + Bills tab month labels + other surfaces still use their existing formats — they read OK and don't have the day-as-ordinal complexity. Future date-format pass can sweep them if needed.)

Gates: 0 FAILs, 62/62 tests, 51/51 runtime PASS.

### Round 49 — Bill paid/deferred toggle + debt quick-picks + auto-allocate transparency
Phone-verify on r48: 1-7 PASS with refinement notes. Each refinement below.

**49a — Bill cycle modal: Paid/Deferred toggle (was quick-pick grid)**

John #3: "Bills shouldn't have the option to say how much to allocate this cycle unless deferring because it's a set amount so the numbers don't make sense. Should just be a Paid in full or Deferred, then deferred brings the text box with custom amount and then it recalculates how much is left or how it will be added onto the next month, and there should also be an option to add fees if it defers and like I have to pay a late fee etc."

Rewrote `openEditPaydayBill` with a two-mode toggle:
- **✅ Pay in full** (default, green) — sets amt = normal, no defer.
- **↪ Defer part** (amber, opens a deferred-fields section):
  - Amount paying this cycle (number input)
  - Optional late-fee checkbox + amount
  - Live preview: "Paying now $X · Carries to next cycle $Y · + Late fee $Z · Total next-cycle obligation $W"
- Reason dropdown stays.
- Save: if "in full" → setOverride amt=normal. If deferred → setOverride amt=entered + `lateFee` opt; shortfall creates a Known Upcoming for next cycle.

**49b — Debt cycle quick-picks: 0/25/50/75/100% (was 0/25/50/75/100/125/150%)**

John #4: "should make sense when suggesting how much to pay off, should be like 1/4 of total amount, 1/2 etc and then option for custom amount or paid in full right?" Pre-r49 the picks included 125% and 150% of normal — over-paying a fixed debt doesn't make sense. Dropped to [0, 25%, 50%, 75%, 100%]. Custom button stays for explicit values.

**49d — Auto-allocate preview: transparent "what's covered first"**

John #7: "Auto-allocate not counting all debts or all bills etc just populating like celebrations and gifts etc not using real data."

Pre-r49 the auto-allocate modal led with "Suggested allocation across your savings goals" — but bills/debts/provisions/buffer were silently subtracted BEFORE the split. From the user's POV: looked like auto-allocate was only handling gifts/celebrations. Now the modal shows:
1. **🔒 Already covered first (Essentials)** — Bills / Debts (minimums) / Daily living / Annual provisions / Safety buffer with each amount.
2. **✋ Allocatable** — the headline $X figure after essentials.
3. **Suggested split (urgency-weighted)** — buckets, each tagged with a 🔥/⏰/calendar urgency chip pulled from the linked trip's days-out.
4. Footnote: "Trip buckets with closer start dates get a bigger share (round 48). Tags show how urgent each is."

(Note: actual debt payments beyond minimums isn't currently part of auto-allocate's output — the urgent-debt-pay-down feature is a separate round. The fact that debts ARE subtracted before splitting is now visible to the user.)

(Deferred to round 50: AU date format pass — John #5: dates should be "14th June" / day-as-number + month-as-word everywhere. Audit + standardize across BNPL preview, debt timeline, calendar dates, etc.)

Gates: 0 FAILs, 58/58 tests, 51/51 runtime PASS.

### Round 48 — BNPL end-date off-by-one + pace in MAX-per-day modal + urgency-weighted auto-allocate
Three follow-ups from John's continued phone-verify of rounds 45-47.

**48a — BNPL end-date wrong by one day (compared to Afterpay's own UI)**

John caught a real bug. Afterpay's UI for "Stanmore Station Pharmacy ($149, $37.25 × 4 fortnightly starting May 21)" shows the final payment on **Thu 2 Jul**. The slyght BNPL modal displayed **Last payment (auto-stop): 2026-07-01** — one day early.

Root cause: pre-r48 used `start.getTime() + (n-1) × 14 × 86400000` and `.toISOString().slice(0, 10)`. The `toISOString()` converts the timestamp to UTC — for Sydney (UTC+10), May 21 00:00 LOCAL becomes May 20 14:00 UTC, and Jul 2 00:00 LOCAL becomes Jul 1 14:00 UTC formatted as `2026-07-01`. UTC drift hit on every cross-month boundary.

Fix: use `Date.setDate()` (calendar-aware — handles 28/30/31-day months and leap years correctly) and read back local components instead of `.toISOString()`. Also added a monthly-frequency branch using `setMonth` for proper month-clamping (e.g. May 31 + 1 month → Jun 30 not Jul 1).

4 regression tests added (58/58 passing). John's exact scenario locked in.

**48b — Pace explanation also shown in MAX-per-day tap modal**

John #2 from r45 phone-verify: "Doesn't show specifically the what is pace calculation but has the rest of max per day in big orange etc." The dashboard pace text below MAX PER DAY was tappable → opened `explainWeekProjection` with the pace card. But tapping the BIG MAX PER DAY number itself opens `explainMaxPerDay` which didn't include the pace context. Now `explainMaxPerDay` also appends a "📈 What is pace?" card with John's concrete numbers (daily target, expected-by-today, actually-spent, OVER/UNDER result) so both entry points explain pace.

**48c — Auto-allocate now includes provisions + urgency-weighted bucket split**

Two issues in `BRAIN.plan.recommendAllocation()`:

1. **Provisions ignored**: r47 added Annual Provisions to Essentials so the Canvas Remainder is now $298 lower, but `recommendAllocation`'s `hardClaims` didn't include them — auto-allocate was overstating allocatable by ~$298/mo. Now folded in.

2. **Pure proportional split by goal target**: John on r46: "auto-allocate doesn't actually take into account what needs to be paid first... trips like Darwin with urgency the key is urgency so a check against the due date." Pre-r48 a trip starting in 30 days (Darwin) and a trip starting in 200 days (China) got proportional shares — Darwin starved. Now uses urgency weight: `weight = max(1, min(20, 365 / daysOut))` for trip-linked buckets. Imminent trips get up to ~20× pull versus far ones. Non-trip buckets stay at weight=1.

Result: Darwin Jun 7 dominates over China Dec 1 within the same allocatable pool, matching John's mental model of "what needs to be paid first."

(Known limitation, not fixed in r48: bills with `freq: 'fortnightly'` still use `day: number` 1-31 schema for repeating dates. Real Afterpay schedules don't repeat by day-of-month — they slide. The end-date auto-stop now matches Afterpay's final payment, but intermediate dates may not exactly match. Schema redesign for "explicit payment dates per BNPL" deferred to a future round.)

Gates: 0 FAILs, 58/58 tests, 51/51 runtime PASS.

### Round 47 — Canvas/Dashboard sync + Annual Provisions in Essentials + collapse-paid + viaRent parity
John on r46 phone-verify: Canvas tile PASS, but several sync bugs and a gap exposed across PLAN mode that misled the math. Each below was a real user-flagged issue.

**47a — Dashboard PLAN tile $6,959 vs Canvas $2,516 mismatch**

Pre-r47 `renderAllocateTile` used `BRAIN.summary.surplus().leftOver` while the Canvas itself used `BRAIN.plan.getSnapshot()` with a different formula (`totalToPlan - bills.total - debts.total - dailyLiving.plannedTotal`). Two parallel calcs producing different headline numbers for the same concept. Now the dashboard tile reads from the SAME `BRAIN.plan.getSnapshot()` source the Canvas uses — same essentials, same remainder, same still-free. The numbers agree.

**47b — Annual Provisions missing from Essentials**

John: "I don't see annual provisions anywhere in the tab essentials this cycle so again I'm allocating money that I don't have." Annual provisions ($86 Teachers Health + $42 KIA service + $39 KIA Rego + $46 Green Slip + $85 NRMA ≈ $298/mo set-aside for lumpy yearly/quarterly bills) was invisible to the Canvas. Now:
- New 4th Essentials row "🏦 Annual provisions" showing total + count.
- Tap → new `explainAnnualProvisions()` modal listing each provision with per-month + per-year + next-due-date.
- Dashboard tile math also includes provisions so both surfaces agree.
- Remainder/still-free figures now reflect the ~$298 commitment instead of overstating it.

**47c — Bills sub-screen: paid bills now collapsed**

John: "having PAID bills again needs to be removed or collapsed because it's not important at that stage where I'm deciding what's needed to be paid and what I can allocate." Refactored `renderPaydayBills` into a `_renderBillSection` helper that splits each section (Before/After payday) into UNPAID (visible) + PAID (collapsed `<details>`). If a section is entirely paid, shows a short ✓ summary. Collapsed paid items still accessible via expander.

**47d — Debts sub-screen now matches dashboard (viaRent included)**

John: "Debts subscreen doesn't sync with debt tiles — missing two debts." Pre-r47 Canvas Debts subscreen filtered `!viaRent` while dashboard Immediate Debts (round 29) shows ALL non-paid debts including viaRent with distinct styling. Now Canvas Debts also shows viaRent — sorted to the end of the list — with subline tags `🏠 VIA RENT` + `$X/mo via salary` so they're recognisable as scheduled/routed rather than needing-payment-now. autoDebit debts get `🤖 AUTO` tag.

Gates: 0 FAILs, 54/54 tests, 51/51 runtime PASS.

(Deferred for next round: auto-allocate respecting due-date urgency, trip-allocation recommendations based on urgency vs daily-living coverage.)

### Round 45 — Two real bugs found in phone-verify of rounds 38-42 (FAIL #6)
John FAIL on #6: "Doesn't explain PACE still. Also now when I have less than $11 it's saying I'm -$334 short before payday but I only have one bill coming out before payday of $31 so I'm actually short $20."

**45a — `safe = $334 short` math bug — double-bucket-subtraction + on-payday debt:**

Reproduced exactly with John's state file. `safe = liveBal - dueTotal - immDebts + bonus - bucketSafe`:
- liveBal $11.72
- dueTotal $31.19 (Afterpay ✓)
- immDebts $217.50 (Mum-vet debt due May 15 — which IS payday)
- bucketSafe $96.62 (China Holiday bucket)
- = **-$333.59** ≈ what he saw

**Two bugs in one:**
1. **bucketSafe double-counts.** When user saves to a bucket, S.bal DECREASES + bucket.saved INCREASES. They're separate accounts. Subtracting bucketSafe in `safe` treats S.bal as INCLUDING bucket money — wrong, it doesn't. Removed bucketSafe from the formula.
2. **Mum-vet due ON payday shouldn't count as "before payday".** Salary lands the morning of payday + the bill comes out same day from new income; it doesn't compete with current balance. Used `due < paydayDate` (strict) instead of `<=` for this specific calc. (Doesn't touch `getActiveDebtsDueBeforePayday` itself — many other readers depend on the inclusive version.)

After r45: `safe = $11.72 - $31.19 - $0 + $0 = -$19.47`. Matches John's mental model.

**45b — Pace explainer concrete numbers:**

The r40 amber-tinted "what is pace?" card had a single-sentence definition. John FAIL: still not clear. Now uses his ACTUAL numbers from `getThisWeekProjection()` — Daily target / Expected by today / Actually spent / Result (over or under). The math is right there in the modal so the abstract definition becomes concrete.

Gates: 0 FAILs, 54/54 tests, 51/51 runtime PASS.

### Round 42 — Self-audit fixes (no phone-verify needed; bug-class)
After 5 consecutive feature pushes I paused per John's pre-authorisation note ("if you think you are pushing too much stop then analyse last 5 pushes and scan for errors"). Audit found three issues:

**42a — Debt Freedom within-bucket tiebreaker by daysUntil**
Round 39 sorted by urgency-bucket (overdue / ≤7d / ≤30d / longer), then strategy. But within a bucket, two debts could swap order based on strategy/priority even though one was clearly more imminent. E.g., Afterpay due May 14 and Michael due May 16 are both bucket=1, but Afterpay should still sort first. Fixed: within-bucket sub-sort now factors `daysUntil` BEFORE strategy/priority.

**42b — `_autoExpireDebts` now also runs at boot**
Round 35 added `_autoExpireDebts` to `onStateChange` — so expired endDate debts auto-flip `paid:true` on any state-change action. But if the user opens the app after a long absence with no immediate action, expired debts stay visible until they do something. Fixed: also called after `detectPaydayCycleRollover` in the post-load path (L2280-area) so first render is consistent.

**42c — Category row hidden when Type=Income/Savings**
Round 38 dropped 'Income / Refund' from `QUICK_CATS` (it's now a Type chip). But selecting type=Income syncs `ql-cat-hidden = 'Income'` while no chip in the visible row highlights — visually confusing. Fixed: `selectTxnType` now hides the entire `#ql-cat-field` when type is income/savings (the category is type-determined, no user choice needed). `openQuickLogModal` resets it visible at modal open.

Gates: 0 FAILs, 49/49 tests, 51/51 runtime PASS.

### Rounds 38–41 — Quick Log re-thought, Debt Freedom dynamic, pace explainer, BNPL polish
John phone-verify on rounds 35–37: 1 FAIL, 4 PASS-with-comments. Each round below addresses one item.

**Round 38 — Quick Log auto-focus removed + Type chips reorganised**
- (FAIL #1) Removed auto-focus on `ql-amt`. John: "the fix is just make it so nothing is auto tapped into — let me start typing when I'm ready." No focus → no keyboard → no screen bump on modal open. The focus-handler scroll-into-view still fires when the user does tap.
- (#2 follow-up) Type chips overhauled per user's mental model:
  - Removed `from-person` (now a debt tile, not a txn type) and `one-off` (it's just an expense — synonym noise).
  - Added `savings` (was being conflated with category=Savings; now first-class) and `income` (migrated from category 'Income / Refund').
  - Dropped 'Income / Refund ↑' from QUICK_CATS so it isn't a dual home.
  - `selectTxnType` now auto-syncs the category chip when type=income/savings — user doesn't have to set category separately.

**Round 39 — Debt Freedom timeline: due-date awareness + label clarity**
(#5 PASS-ish) John: "the calculation is not factoring due date — recommends to pay Michael in JAN something but that debt is due on Saturday." Plus: "explain what $126 a month is" and "financial freedom framing is wrong."
- New sort: urgency bucket first (overdue → ≤7 days → ≤30 days → longer), then user's `debtStrategy` (avalanche/snowball) within the bucket. Michael's $500 due Saturday now sorts ahead of higher-rate debts.
- Each phase shows a due-date chip: 🔥 Due today/tomorrow, ⚠️ Overdue, ⏰ Due in N days, or "Due in N days" plain.
- Labels: "$X/mo" now reads as `$X/mo surplus` (was ambiguous). Header subline: "Order = due-date urgency first, then your debt strategy. Each $/mo is your free surplus for that phase."
- Footer reframed: removed "investing $X/mo / financial freedom" language (John: not making him rich); now reads "Your monthly surplus jumps to $X/mo — no debt payments draining it. That money can finally go to savings, investing, or whatever else."

**Round 40 — Pace explainer "what does pace mean?" header**
(#3 PASS with question) Pace explainer modal now has a dedicated amber-tinted card at the top defining pace: "the daily-budget you'd need to hit by end of week. Over pace = spent more than that rate would predict. Under pace = on track or ahead."

**Round 41 — BNPL quick-add re-shaped per Afterpay reality**
(#4 PASS with changes) Reworked inputs:
- Dropped 6/8 instalment chips — Afterpay is standardised to 4. Chips now 1 / 2 / 3 / 4 (default 4).
- Label changed from "Instalments" to "Payments remaining" so John can backfill a plan he's mid-way through (his complaint: "most of my afterpays are up to 3 payments remaining but I cant track that").
- Input changed from "Total amount" to "Per-payment amount" — the user sees the per-payment figure on the Afterpay screen, not the total. App computes the rest.
- Preview now shows "Total left to pay" + "Next payment" + "Last payment (auto-stop)".

Gates: 0 FAILs, 49/49 tests, 51/51 runtime PASS.

(Scanner-routing item #4b — recognise Afterpay screenshots → auto-populate BNPL modal — deferred to a dedicated round; needs scanner pipeline changes beyond UI.)

### Rounds 35–37 — End-date support + BNPL quick-add + Debt Freedom timeline
Bigger asks from John's feedback batch after rounds 31–33. Memories from that turn (`feedback-slyght-info-density-discipline`, `feedback-slyght-text-contrast`) shaped the design choices below.

**Round 35 — End-date on bills + debts**

John: "I could add it as a recurring bill but then I need to remind myself after it's been paid for 4 weeks to delete, so there's no option to add an end date on a bill or debt."

- New optional `endDate` field on bill schema. Surfaced in bill-modal as "End date (optional — auto-stop after this)". `getExpandedBills` now filters via new `_isBillActiveAsOf` helper so expired bills disappear from all downstream consumers (calendar, week projection, monthly total) without per-renderer edits.
- New optional `endDate` field on debt schema. Surfaced in debt-modal as "Auto-clear on (optional)". Added to `BRAIN.debts.update` MUTABLE allow-set.
- New `_autoExpireDebts()` helper called from `onStateChange` (and the post-load path). Scans debts, marks `paid:true` via canonical writer when `endDate` passes. No clearance txn (cash didn't actually move today — metadata flip only). Audit emits `debt_auto_expired` summary.

**Round 36 — BNPL / Afterpay quick-add modal**

John: "nice feature for a debt logged as Afterpay for it to have a different modal when creating that bill is that the total amount and then how it gets broken down into 4."

- New `💳 BNPL` button next to `+ Add A Bill` in the Bills tab.
- New `bnpl-modal` captures: purchase name, total amount, instalment count (chip picker: 4 / 6 / 8), frequency (chip picker: fortnightly / weekly / monthly), first-payment date, auto-debit flag.
- Live preview panel shows the computed per-instalment amount + last-payment date as the user types.
- On Save: creates a recurring bill with `amt = total / instalments`, `freq` per chip, `endDate` calculated as `start + (instalments-1) × freq_days`, `tag: 'BNPL'`, `autoDebit` from checkbox.
- Result: one row to manage, auto-stops after the last instalment, John doesn't have to remember to delete it.

**Round 37 — Debt Freedom Estimate redesign**

John: "Debt freedom estimate in networth is retarded like as if I'm actually going to put away $95 a month for the rest of my life as if it's considering I'll always have these fixed bills with no growth etc."

Pre-r37 calc: `ceil(totalDebt / surplus)` — one number, "X months at $Y/mo surplus." Ignored that clearing a debt frees its monthly payment for the next debt.

Now a phased cascade:
- New `buildDebtFreedomProjection()` helper. Sorts manual-pay debts by user's `debtStrategy` (avalanche/snowball). For each debt: computes months-to-clear at the current surplus, projects clear date, captures the `monthlyPayment` it frees up.
- Each phase compounds: when debt 1 clears, its monthly payment joins the surplus for debt 2 → bigger surplus → faster clear.
- Rendered as a vertical timeline in the Net Worth modal — numbered nodes, debt name + clear date + monthly surplus + months, plus a "↑ Frees +$X/mo for next phase" note where applicable.
- Footer panel: "After all debts clear, you'd be investing $X/mo instead of paying off debt. That's $X×12/year."

Gates: 0 FAILs, 49/49 tests, 51/51 runtime PASS.

### Round 34 — Quick wins from John's feedback batch
Phone-verify on 31–33 returned 1/2/3/4/5 PASS. Item #3 PASS with question — "need to understand what this means - tappable or info tag etc". Plus a new feedback batch about Quick Log UX, bill frequency, and debt UX.

**34a — Bill frequency: quarterly / biannual / yearly added**
Pre-r34 the bill edit modal only offered Monthly / Fortnightly / Weekly even though `_monthlyEquivalent` already handles yearly / quarterly / biannual on the math side. Surface gap fixed — drop-down now has the full set with matching emojis to the QuickLog freq picker.

**34b — Quick Log "Type" field as chip bubbles**
John: "Type of transaction is confusing and just a text dropdown, would be cool to look a bit nicer." Replaced the native `<select>` with the same chip-row pattern the Category row already uses above it. Visual consistency + tappable bubbles. Hidden `ql-txn-type` input preserves the value contract for downstream save handlers. New `selectTxnType` helper mirrors `selectCat`.

**34c — Quick Log keyboard / amount-visibility fix**
John: "keyboard always opens on the transaction and bumps the screen up which is annoying and I can't see how much I'm entering."
Root cause: the existing `visualViewport` reposition translates the WHOLE overlay up by the keyboard height, but the modal's internal scroll position can be anywhere — the amount field can end up above the visible window. Fix: on `ql-amt` focus, scroll the modal to top + retry after the keyboard animation settles (~320ms).

**34d — Dashboard pace text is now tappable**
John on item #3: "need to understand what this means - tappable or info tag etc". The `Running $X over pace this week` line on the dashboard MAX-per-day card now has cursor:pointer + dotted underline hint + `onclick="explainWeekProjection()"` → opens the same math explainer modal the Bills tab "?" button uses (round 30). Same explanation either side.

Gates: 0 FAILs, 49/49 tests, 51/51 runtime PASS.

### Rounds 31–33 — Pace alignment, debt badge fix, Monthly Bills revamp
John feedback after rounds 29–30 surfaced three further issues. Two new memories saved on the same turn:
- `feedback-slyght-text-contrast` — grey-on-grey hurts; numbers always `--text`, labels `--text2`, `--text3` for decorative only
- `feedback-slyght-info-density-discipline` — before adding info to a tile, check: important? makes sense? fits 380px? conflicts with other tiles?

**Round 31 — Pace alignment between Dashboard and Bills tab**

John: "MAX per day text 'running over pace this week' is conflicting with the same message in bills tab in this week projection."

Two surfaces showed `Running $X over pace this week` with DIFFERENT $X values because they used different calcs:
- Dashboard: rolling 7-day average × daily-budget
- Bills tab: calendar-week (Mon→today) spent × expected daily × elapsed days

Now both read `getThisWeekProjection()` so they agree. Per the new info-density discipline memory, two tiles showing the same label with different numbers is worse than the info appearing once — even after the alignment, the dashboard pace line is shorter context (uses absDiff + simple direction).

**Round 32 — Debt tile badge squish fix**

John flagged screenshot: `🤖 AUTO` and `VIA RENT` badges from round 29 were squished into the 18×18 `.pri-badge` circle, wrapping internally as "AU/TO" vertical text and forcing the name into awkward two-line wraps.

Root cause: `.pri-badge` CSS was sized for single-digit priority numbers (1, 2, 3). Text labels overflow the fixed 18px width.

Fix:
- New `.dt-tag` class — pill-shaped, padded, sized to content, `white-space:nowrap`
- For viaRent / autoDebit debts, the tag renders on its OWN row above the name (full horizontal width for the 2-line name clamp)
- Priority-digit debts keep the inline 18×18 `.pri-badge` circle (round 29 behavior preserved)

**Round 33 — Monthly Bills visual revamp**

John: "Monthly Bills tile needs to be formatted better visually same revamp as you did for dynamic weekly projection."

Per the contrast feedback memory, the pre-round-33 render had `color:var(--text3)` on `var(--bg3)` everywhere — pretty but unreadable. Per the info-density discipline, `→ $7,594.23` was ambiguous (what is that number?). And visual consistency with the rest of the Bills tab was inconsistent (Due Today / This Week sections used `.bill-chip` day badges; Monthly Bills used plain text).

Fix:
- Reuse `.bill-row` + `.bill-chip` from Due-Today/This-Week sections — visual consistency across the tab
- Color-coded day chip: red if ≤3 days away, amber if ≤14, normal otherwise
- Date label: `--text2` not `--text3` (per contrast memory)
- Running balance: labelled `after this $X` (was bare `→ $X` arrow), with `$X` color-coded by runway health
- Header gets a `?` tap target → `explainMonthlyBills()` modal explaining chip color, running-balance meaning, "same as debt" tag, and monthly-total semantics
- Footer total: bold 16px monospaced + divider above

Gates: 0 FAILs, 49/49 tests, 51/51 runtime PASS.

### Rounds 29–30 — Surplus suggestion fix, dashboard/auto-sort parity, autoDebit flag, Week Projection redesign
John phone-verify on rounds 25–28: rounds 25/27/28 PASS; round 26 needed user help (added memory `feedback-phone-verify-instructiveness`). New bugs surfaced:

**Round 29 — Surplus + debt schema fixes**

*Surplus suggestion math display bug:*
- Pre-round-29 message hardcoded "after a $500 buffer" but actual buffer is dynamic ($0–$500 via `getDynamicBuffer` based on balance + committed). John's $336 balance produced buffer=$50, so "$99 spare after $500 buffer" implied $599 available when really there was ~$386 — message was lying about the math.
- Fix: read the actual `getDynamicBuffer()` value and render it in the message.

*Surplus suggestion targeting auto-debit debts:*
- Pre-round-29 the target picker included Afterpay — which auto-debits. Recommending manual action toward something that pays itself = dead advice.
- Fix: filter `!d.viaRent && !d.autoDebit`. If all remaining debts are scheduled/routed, the message changes to "Remaining debts are auto-debited or rent-routed — no manual payment needed. Consider sweeping it into a savings bucket."

*New `autoDebit` flag on debt schema:*
- Mirrors the bill-level `autoDebit` concept (BNPL / finance plans that auto-take from card).
- Add Debt modal: new checkbox "Auto-debits on due date (Afterpay, BNPL, finance plans)".
- Edit Debt modal: new checkbox "🤖 Auto-debits on due date (BNPL / finance plan)".
- `BRAIN.debts.update` MUTABLE allow-set extended.

*Dashboard / auto-sort parity:*
- Pre-round-29 dashboard filtered `!viaRent` → showed 3 debts. Auto-sort dialog showed all 4 (incl. Property Deposit). John flagged the count mismatch.
- Fix: dashboard now shows ALL non-paid debts (including viaRent). Per-debt visual mode differentiates them:
  - viaRent → amber theme, "VIA RENT" badge, "Rent-routed · $X/mo" status, no surplus-affordability warning
  - autoDebit → blue theme, "🤖 AUTO" badge, "Auto-debits dd/mm" status, no "Pay now" CTA
  - manual → standard red theme, surplus-affordability warning, "Pay now" or "Due dd/mm"
- IMMEDIATE total stays manual-only ($1,031) — viaRent debts don't inflate the headline.
- `autoSortDebts` score-adjusts: `+40` for autoDebit, `+60` for viaRent — manual-pay debts always sort first, scheduled/routed go last (matching prior behavior, now explicit).

**Round 30 — Dynamic Week Projection redesign (prettier + interactive)**

John's ask: "needs rework to be more pretty and interactive."

- Plain-text panel → card-based layout with:
  - Composition bar showing the 3 portions visually (Spent | Bills | Living) — color-coded segments
  - 3-column grid with color chips + labels + monospaced amounts
  - Large bold total + horizontal divider
  - Pace callout in its own colored sub-card (green if under pace, amber if over)
- New "?" tap target → `explainWeekProjection()` opens math explainer modal via `EDIT_MODAL.openInfo`:
  - Per-component cards (Spent / Bills / Living) with description of how each is computed
  - Equation line: `$X + $Y + $Z = $TOTAL`
  - Pace explanation with expected-pace math

Gates: 0 FAILs, 49/49 tests, 51/51 runtime PASS.

### Rounds 25–28 — Visual analysis fixes (post phone-screenshot review)
John shared 7 screenshots across Dashboard / Bills / Analysis / debts / Auto-sort dialog / Recent Spending with directive: "deep look at the photos, analyse each calculation, how info is displayed, is it pretty, interactive, does it make sense." Four concrete fixes landed in this push.

**Round 25 — Dynamic Week Projection math display**
Pre-round-25 displayed: `Projected daily: $6.11/day × 5 days = $4,004.55`. Mathematically false: $6.11 × 5 = $30.55, not $4,004.55. The right-side value silently included `billsDueThisWeek` from the row above. Now split into two lines:
- `Living (projected): $6.11/day × 5 days = $30.55` (the actual product)
- `Remaining to spend (bills + living): $4,004.55` (explicitly named, separated by a top border)

Description now matches calculation.

**Round 26 — Auto-sort native `confirm()` → custom modal**
Per manual §6 UX contract ("no native alert"). `autoSortDebts()` was using a native `confirm()` that showed "xetonx.github.io says" dialog — out of style with the rest of the app. Now uses `EDIT_MODAL.openCustom` with the same content rendered as styled rows showing rank + name + amount + due date + score. Save handler applies the priority order through `BRAIN.debts.update(d.id, {priority}, UPDATE_DEBT)` — unchanged behavior, native dialog gone.

**Round 27 — Debt card name truncation + lone-last-card layout**
Two-column `.debt-grid` with 3 debts left the lone-last card half-width with empty space to its right. Plus single-line `text-overflow:ellipsis` on `.dt-name` was clipping at ~50% viewport width — "Borrowed from Michael" and "Borrowed from Mum" both rendered as "Borrowed from ..." (indistinguishable on dashboard).
- New CSS: `.debt-tile:last-child:nth-child(odd) { grid-column: 1 / -1 }` → lone last card spans both columns
- `.dt-name` switched to 2-line clamp (`-webkit-line-clamp:2`) with `word-break:break-word` so compound names render fully

**Round 28 — "Today" filter per-day label is redundant**
Analysis "Where your money went" pivot showed `$8.65/day` next to category totals — but when the filter is "Today" (1 day), per-day rate equals the category total, so it's visual noise. Now skipped for `period === 'today'`; kept for 7-day / 30-day / all-time where the rate is meaningful context.

Gates: 0 FAILs, 49/49 tests, 51/51 runtime PASS.

### Round 24 — Dashboard hero "spent today" outflow visibility fix
Phone-flagged by John: "investigate dashboard note under balance saying amount spent today, ensuring that calculation is correct and not just mimicking recent spending but understanding the calculation based on description and updating accordingly."

**Bug:** the hero `#h-note` debt subline string-matched `t.cat === 'Debt repayment'` — only 1 of 4 debt categories. A $780 KIA Loan payment landed as `cat: 'Loan'` (Quick Log path) or `cat: 'Bills'` (mark-paid flow) — BOTH excluded from `getTodaySpent()` (strict discretionary) AND from the debt subline. Net effect: $780 outflow disappeared from the headline entirely; the dashboard said "Nothing spent today".

**Fix:**
- New canonical reader `todayOutflowsCanonical(now)` + `BRAIN.dashboard.todayOutflows()` — superset of `todayTxnsCanonical` that includes debt + bills + savings + loan + CC payment categories. Drops only income / corrections / round-ups. Registered in guardian-static's `TODAYSPEND_CANONICAL_FNS` allow-list.
- Hero note rewritten as a parts array: discretionary headline + optional debt subline (via `_DEBT_CATEGORIES_SET`) + optional bills subline. Any combination renders cleanly with `·` separators.
- Calculation now matches the description: "$X spent today" = strict discretionary (unchanged); "$Y in debt payments" = any of 4 debt cats; "$Z bills paid" = Bills cat.

**Architectural payoff:** guardian-static's `no-inline-todayspend-computation` rule caught my initial inline filter and forced the canonical-reader route — exactly what the rule exists for. Bundle 10's architectural barrier is paying for itself two bundles later.

Gates: 0 FAILs, 49/49 tests, 51/51 runtime PASS.

### Round 21 — Missed-migration cleanup + `BRAIN.config.setApiAlertThreshold`
Round 20's audit-table sweep surfaced 3 sites that should already have routed through existing canonical writers but were missed in prior bundles. Plus one inline-audited handler promoted to a proper canonical writer.

- `saveSuperBalance` → `BRAIN.assets.setSuperBalance` (existed since Bundle 24)
- `saveMumAccountBalance` → `BRAIN.assets.setMumAccount` (existed since Bundle 24). Drops the inline `PLAN.saveGoal` mirror call — the canonical writer already does that internally.
- `executeChatAction.update_super` → `BRAIN.assets.setSuperBalance` (source `CHAT` distinguishes AI-driven updates)
- New `BRAIN.config.setApiAlertThreshold(v, source)` — promotes the inline-audited Settings EDIT_MODAL save handler to the canonical pattern. `SETTINGS_API_ALERT_THRESHOLD` source.
- Gates: 0 FAILs, 51/51 runtime PASS.

### Round 20 — `BRAIN.audit.query` AI introspection helper
Closes a Noticed item surfaced after round 14 (BRAIN.chat): "natural follow-up is a `BRAIN.audit.query` reader so the AI agent can self-introspect." Now that 13 BRAIN bubbles emit consistent audit entries, this unlocks self-introspection patterns.

- `query({type?, typePrefix?, source?, sourcePrefix?, sinceTs?, untilTs?, predicate?, limit?})` — all filters optional, ANDed together
- Example use cases:
  - All chat events in last hour: `query({typePrefix:'chat_', sinceTs:Date.now()-3600000})`
  - WRX lifecycle this week: `query({typePrefix:'wrx_', sinceTs:weekAgo})`
  - User-initiated edits only: `query({sourcePrefix:'settings-', sinceTs:dayAgo})`
  - Last 10 cycle-related events: `query({typePrefix:'cycle_', limit:10})`
- Complements existing `recent(n)`, `since(ts)`, `summarizeRecent(ts)`
- Gates: 0 FAILs, 51/51 runtime PASS.

### Rounds 15–19 — Canonical-writer queue cleanout
Five-round push to close every remaining ❌ in the canonical-writer audit table (modulo the multi-flow `S.bal` partial which spans rounds 10–11 and the non-existent `S.kiaMinPayment` writer entry which was stale documentation).

**Round 15 — `BRAIN.config.setApiKey`** (`SETTINGS_API_KEY`, `CHAT_KEY_SET`)
- 4 direct-mutation sites collapsed (Settings EDIT_MODAL, `saveApiKey`, `saveChatKey`, `openChatKeyModal`)
- Centralises validation (`sk-ant` prefix) + localStorage mirror + audit
- Empty string is the canonical clear path (removes localStorage entry)
- Audit stores `<set>`/`<unset>` markers — never the raw key

**Round 16 — NOTIFY audit hooks** (`NOTIFY_ADD`, `NOTIFY_BATCH`, `NOTIFY_DISMISS`, `NOTIFY_CLEAR_ALL`)
- NOTIFY stays as its own module (not a BRAIN bubble) but `add` / `refresh` / `dismiss` / `clearAll` now emit `BRAIN.audit` entries on every state mutation
- AI agent + forensics can now see when notifications appeared, batch-generated, were dismissed, or cleared — without diffing `S.notifications`

**Round 17 — `BRAIN.cycle` bubble (13th)** (`CYCLE_PAYDAY_RECEIVED`, `CYCLE_PAYDAY_CLEARED`)
- `markPaydayReceived(source, opts)` / `clearPaydayReceived(source, reason)` / `isPaydayReceived()` / `getPaydayReceivedDate()`
- 3 sites migrated: `detectPaydayCycleRollover`, `confirmHeroBalEdit`, `monthlyResetCheck`
- Unifies the cosmetic-flag cleanup that was inconsistent across the legacy paths (`paydayBannerDismissed` was cleared by one path only, `paydayPlanAutoExpanded` by the other) — both now reset on every cycle-clear

**Round 18 — `BRAIN.audit.appendReconLog`** (`RECON_LOG_APPEND`)
- 2 sites in `confirmRecon` migrated
- Preserves the separate `S.reconLog` forensic log (capped 25, persisted across saves) AND mirrors each entry into the unified `BRAIN.audit` log so AI can see reconciliation events through one API

**Round 19 — KIA early-repay fee** (`KIA_FEE_EDIT`, `KIA_FEE_RESET`)
- `BRAIN.assets.setKiaEarlyRepayFee(v, source)` + `resetKiaEarlyRepayFee(source)`
- 2 sites in `commitKiaFee`/`resetKiaFee` migrated
- Reset preserves the `delete S.kiaEarlyRepayFee` semantics (signals "use default-derived 2-months-interest value")

Gates after each round: 0 FAILs, 41 unchanged future-proofing WARNs, 51/51 runtime PASS.

### Round 14 — `BRAIN.chat` bubble (12th BRAIN bubble)
AI integration is one of John's emphasized pathways and chat is its primary surface. Pre-round-14: 7 direct `S.chatHistory.push` sites in `sendChatMessage` (1 user + 4 error replies + 1 success + 1 catch-block error) + 1 `S.chatHistory = []` in `clearChat`. Zero audit coverage — the AI agent couldn't observe its own activity through `BRAIN.audit`.
- New `BRAIN.chat` namespace with `addUser(content, source)`, `addAssistant(content, opts, source)`, `clear(source)`, `list(predicate)`. `HISTORY_CAP=50` exposed as a constant; internal `_capAndSave` keeps push call sites trivial.
- 4 new SOURCES tags: `CHAT_USER_SEND`, `CHAT_ASSISTANT_REPLY`, `CHAT_ASSISTANT_ERROR`, `CHAT_CLEAR`. Errors get their own source + their own audit type (`chat_assistant_error` vs `chat_assistant_msg`) so forensics can spot API failures vs successful replies.
- **Privacy:** audit stores `length` not `content` — chat lives in `S.chatHistory` (capped 50, user can clear); audit log persists 500 entries and would otherwise leak private chat into other audit consumers (Settings export, AI agent's other reasoning paths).
- Migrated all 8 sites. Remaining `S.chatHistory =` is inside the canonical writer's `_capAndSave` and the load/migration path (both sanctioned).
- Gates: 0 FAILs, 51/51 runtime PASS.

### Round 13 — WRX state canonical writers
Closes a long-standing ❌ in the canonical-writer audit. Three independent direct-mutation sites for `S.wrx{Value,Status,ListedDate,SoldDate,SalePrice}`: `setWrxStatus()` global, `saveWrxValue()` Settings handler, chat actions `mark_wrx_listed` + `mark_wrx_sold`. Zero audit-log coverage pre-round-13 — WRX lifecycle events (listed → sold → KIA cleared) were invisible to forensics and the AI agent despite being one of John's highest-stakes flows.
- New `BRAIN.assets.setWrxValue(v, source)` — value-only setter (matches `setCarloan` shape, audits `wrx_value_change`)
- New `BRAIN.assets.setWrxStatus(status, opts, source)` — multi-field status flip (status / listedDate / soldDate / salePrice) with full before/after audit snapshot under `wrx_status_change`
- 2 new SOURCES tags: `WRX_VALUE_EDIT`, `WRX_STATUS_CHANGE`. Chat actions continue to use `BRAIN.SOURCES.CHAT` so chat-driven flips are distinguishable from manual UI flips in the audit log.
- `BRAIN.debts.allocateWrxProceeds` (proceeds allocation flow) left untouched — its inline `S.wrxStatus = 'sold'` is already audited via `wrx_proceeds_allocated` and is part of a multi-bubble composition.
- Gates: 0 FAILs, 51/51 runtime PASS.

### Round 12 — Txn delete idempotency (stable ts + clear-on-delete)
Closes OPEN-BUGS #43. Phone-reported by John: first delete bumped balance but didn't visibly delete; second tap deleted a different row and bumped balance again. Net: $200 over-credit on a $100 expense.

**Root cause:** the txn-edit-modal stored an array INDEX. After the first delete's splice shifted `S.txns`, `S.txns[idx]` pointed to a different row. A queued/rapid-tap second click on the still-rendered Delete button (closeModal + renderAll take a few ms on mobile) read that wrong row's ts and removed it.

**Two-layer defence:**
- Layer 1 (correctness): bind the modal to stable `txn-edit-ts` instead of fragile `txn-edit-idx`. After splice the same ts produces find-not-found instead of finding a different row. Migration touches editTransaction (writer), saveEditedTransaction (round 10 reader), deleteEditedTransaction (round 10 reader), convertEditedTransactionToLoan (reader).
- Layer 2 (robustness): clear the hidden ts field at the top of deleteEditedTransaction BEFORE confirm — a re-entry sees empty value and bails. Restored if user cancels confirm so an intentional later click still works.
- `removeByTsWithBalance` `not-found` reason now silently no-ops at the call site instead of showing the "Could not delete" alert — even if both defences are bypassed the user doesn't see an error popup.

**Drift recovery (unified):** John's live S.bal carries +$200 from this incident and any drift from #42's edit math. Path: dashboard hero balance edit → enter real bank balance → `runRecon` → `BRAIN.transaction.recordCorrection` creates an `_isCorrection:true` adjustment txn with `RECONCILE_CORRECTION` source. Audit log captures the recovery. No new code needed — the path was built for exactly this drift class.

Gates: 0 FAILs, 51/51 runtime PASS.

### Round 11 — `BRAIN.transaction.update` balance sign flip
Closes OPEN-BUGS #42. Phone-verified by John 2026-05-13: editing a $50 expense to $80 was moving balance UP $30 instead of DOWN $30. Centralisation from round 10 made this a single-site fix.
- One-line sign flip: `balDelta = (income ? -diff : diff)` → `(income ? diff : -diff)`
- Trace verified all 4 directions (expense ±, income ±)
- Drift recovery: John's accumulated drift can be reconciled via the existing dashboard hero balance edit which routes through `BRAIN.transaction.recordCorrection`
- Gates: 0 FAILs, 51/51 runtime PASS

### Round 10 — txn edit + delete canonical writers
Closes the biggest remaining ❌ in the canonical-writer audit. Pre-Bundle-28 `saveEditedTransaction` + `deleteEditedTransaction` were the last direct-mutation sites for `S.txns`; both bypassed BRAIN so the audit log missed every edit and the AI agent couldn't observe them.
- New `BRAIN.transaction.update(ts, patch, source)` — allows `amt`/`note`/`cat`/`ts` patches with balance reconciliation when amt changes. Math direction preserved from pre-Bundle-28; suspect sign on expense branch flagged in OPEN-BUGS #42 for phone-verify before flip.
- New `BRAIN.transaction.removeByTsWithBalance(ts, source)` — composes `removeByTs` (bare splice) with balance reconciliation, rolls back balance if inner removeByTs fails so half-applied state can't occur.
- 2 new SOURCES tags: `TXN_EDIT`, `TXN_DELETE`
- `saveEditedTransaction` rewritten as a thin wrapper that builds a patch object (only changed fields) and routes through the canonical writer
- `deleteEditedTransaction` rewritten as a thin wrapper around `removeByTsWithBalance`
- BRAIN.audit now captures `txn_update` (with before/after + balDelta) and `txn_remove_balance_reconciled` (with balDelta) events
- Gates: 0 FAILs, 51/51 runtime PASS

### Deferred to later bundles
- Debt tile cut-off CSS layout (design pass)
- Add Goal modal — keyboard pushes Save off-screen (mobile keyboard handling)
- Bundle 29: `BRAIN.transaction.update` for `saveEditedTransaction` + `deleteEditedTransaction`
- Bundle 29: `BRAIN.assets.setWrxState` unified writer
- Bundle 29: `BRAIN.config.setApiKey` writer + NOTIFY→`BRAIN.notifications`
- Bundle 29: KIA Loan ground-truth reconciliation (Firstmac CSV)
- Bundle 29: Net Worth Trend math fix (OPEN-BUGS #13)
- Bundle 30+: Rules-as-data refactor

---

## Bundle 27 hotfix 2 — 2026-05-13 03:02 AEST
Defensive fixes shipped after Bundle 27 ship.
- `savingsObj` ReferenceError fix
- Drift banner divide-by-zero guard
- Commit: `14ed28e`

## Bundle 27 hotfix 1 — 2026-05-13 02:56 AEST
- Defensive `openPaydayPlan`
- New guardian runtime check (wiring verification)
- Commit: `05c8980`

## Bundle 27 — Payday Plan Canvas — SHIPPED 2026-05-13 (overnight)
**Theme:** New Payday Plan canvas surface + `BRAIN.plan` bubble (11th bubble).

- **Phase 0** (`2af1c12`): `BRAIN.plan` bubble + 22 source tags + `seedV24`
- **Phases 1+2** (`2e43afc`, `7688fc1`): Canvas skeleton + sub-screen scaffolding; inline-style override fix; redundant trip nudges dropped
- **Phase 3** (`14fd35a`, `67e8fbf`): Sub-screen contents read-only; bills cycle-window fix; savings clarity; provision filter
- **Phase 3.5** (`c22ddb6`): PLAN overflow fix + canvas root breakdown
- **Phase 4** (`7c4420c`, `35fed51`): Interactive editor modals + BRAIN-wired saves; z-index fix; `BRAIN.bills` canonical reader
- **Phase 5** (`78056a2`): Tick wiring + real balance reflection
- **Phase 6** (`228f6db`): Bonus modal + auto-allocate + lock/unlock flow
- **Phase 6.1** (`ec50e0c`): Deferred-bill carry-over + canvas-wide undo
- **Phase 6.2** (`bfeba8e`): Five verify fixes (debt edit, undo persistence, trips, buffer, refresh)
- **Phases 7+8** (`0d46237`): AI plan context + drift banner + onboarding + closeout
- Phone-verify: PASS at ship (carry-over issues addressed in Bundle 28 hygiene phase)

## Bundle 26 — 2026-05-13 (early overnight)
**Theme:** Surplus waterfall + coaching + Allocate Payday sub-screen.

- **26.1** (`a65623a`): API key resilience + Diagnostics buttons fix
- **Phase 1** (`25b23a0`): Surplus waterfall + smart coaching + trip nudges
- **Phase 1.5a** (`f777149`): Plain-language coaching + info buttons everywhere
- **Phase 1.5b** (`edfe3e2`): Allocate Payday sub-screen + `BRAIN.allocation` bubble

---

## Backfill note (2026-05-13)

This CHANGELOG was created on 2026-05-13 per `CC-PRINCIPAL-ENGINEER-MANUAL.md` §8 ("CHANGELOG.md — Top-level entry per bundle"). Bundles 26 / 27 / 28 were back-filled from `git log` and `BUNDLE-NN-NOTES.md`. Older bundles (1–25) are not back-filled — their record lives in commit history and historical notes under `archive/`. New bundle entries will be added inline as part of each session's pre-ship checklist (manual §3 Step 7).
