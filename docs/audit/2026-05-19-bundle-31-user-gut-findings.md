# Bundle 31 — User Gut-Audit Findings (Phase 1A)

**Date:** 2026-05-19
**Source:** John's 60-second app pass + parallel CC code-path investigation
**Status:** Phase 1A complete. No fixes applied. Awaiting John's Phase 2 prioritization.

This is a code-path map for John's 17 reported items, not a fix list. Each entry pins file:line, surfaces root cause, estimates fix complexity, and proposes a severity revision where evidence supports one.

---

## TL;DR — cross-cutting findings

Three root causes account for most of the 17 items. Fixing the roots is higher-leverage than fixing each symptom.

### Root cause A — Category-filter scatter (affects items 1, 2, 3, 9, 14)
At least **seven** parallel "what counts as discretionary spend" filter definitions live in `index.html`:
| Location | Filter shape |
|---|---|
| `index.html:2697` | `_NON_SPEND_CATS = ['Debt repayment','Income','Savings','Bills','Transfer','Loan','Car Loan','CC Payment']` (canonical) |
| `index.html:2702` | `_DEBT_CATEGORIES_SET = ['Debt repayment','Loan','Car Loan','CC Payment']` (subset of above) |
| `index.html:3618` | `getDiscretionarySpend`: `EXCLUDED_CATS = ['Debt repayment','Savings','Loan','Income']` (missing Bills, Transfer, Car Loan, CC Payment) |
| `index.html:5433` | `getMinDailySpend`: `NON_DISC = ['Debt repayment','Savings','Loan','Income']` (same as above, separate copy) |
| `index.html:5764` | survival forecast cuts: `NON_DISC = ['Debt repayment','Savings','Loan','Income','Bills']` |
| `index.html:5817` | Analysis tab `cats`: `!_NON_SPEND_CATS.has(cat) && !_isCorrection` (uses canonical) |
| `index.html:5922` | Essential vs Discretionary: `!t.income && t.cat !== 'Debt repayment'` (excludes only ONE cat — the bug) |

OPEN-BUGS #6 already names this. OPEN-BUGS #7, #8, #17 are cousins. **Items 1, 3, 9 are this root cause manifesting in three different surfaces.**

### Root cause B — Allocation vocabulary collision (affects items 4, 5, 6)
Three "left to allocate / uncommitted / left to split" numbers across surfaces are mathematically consistent with each other but use *different concepts under similar labels*. User's reported $1,770 / $537 / ($1,133 + $637) check out arithmetically:

- $1,770 = `totalToPlan − essentialsTotal` (Canvas REMAINDER tile + PLAN dashboard tile both read `BRAIN.plan.getSnapshot()` and compute identically)
- $1,133 + $637 = $1,770 ✓ (Canvas "Allocating the remainder" subline: $1,133 = `savings.total + knownUpcoming.total`; $637 = `remainder − discretionaryTotal`)
- $537 = $637 − $100 safety buffer (Savings sub-screen uses `snap.derived.allocatableToSavings` which subtracts buffer + provisions; the $100 gap matches `bufferFloor`)

**The math is internally consistent. The bug is conceptual:** "left to allocate" (Canvas tile) and "still uncommitted" (subline) and "left to split across goals" (savings sub-screen) all sound like the same number to a tired human reading the screen on a phone at 6am. They're not.

Subtler real bug worth flagging: per item 4's "plan is fully allocated, this number is wrong" — ticking allocation rows does NOT decrement these numbers. Ticks update `ticks.savings[bucketName]` (a confirmation toggle), not the *assigned* amount. So a user can "tick everything" and still see $637 uncommitted because they never actually *assigned* the missing $637 to a savings bucket. That conflates "earmark" with "commit" in the user's mental model.

### Root cause C — autoDebit has no scheduler (affects items 7, 8, 16)
`autoDebit` is a UI flag on `paidBills[key]` entries (shape `{paid:true, _scheduledAutoDebit:true, ts}`) that suppresses the post-paid banner. **Nothing in the codebase fires on the bill's debit-day to (a) write a txn or (b) mark the bill paid.** The only writer is the manual mark-paid flow at `index.html:4197-4213` — user has to open the bill modal and check the box.

Consequence: every cycle, balance silently drifts by the sum of unmarked auto-debit bills (Claude MAX $340, plus any others). The reconciliation work this session (40 imported txns, $1,840 drift recovered) was partly cleanup of this drift.

This is an **architectural gap**, not a bug-fix candidate. Needs a scheduler bubble or end-of-cycle batch processor. Probably overlaps with ADR-E (reconciliation infra) thematically.

---

## Per-item findings

### ITEM 1 — Dashboard "$X this cycle" $5,002 ⇒ **P1** (down from P0, with caveat)
**User claim:** $5,002 too low; suspect missing reconciliation txns.

**Code path:**
- Renderer: `index.html:6140` — `cycleSpent = MODEL.cycleSpent`
- Source: `index.html:4450-4451` — `MODEL.cycleSpent = getDiscretionarySpend(cycleStart, now)`
- Filter: `getDiscretionarySpend` at `index.html:3617-3618` excludes `['Debt repayment','Savings','Loan','Income']` only — does NOT exclude `Bills`, but DOES filter via `_isCorrection`/`_isRoundup` flags.

**Root cause hypothesis:** Not a math bug — a labeling problem. The hero says "this cycle" but the number is *discretionary-this-cycle*. After last night's reconciliation, the imported 40 bank txns are likely a mix of bills/debt/savings (`Bills`, `Loan`, `Debt repayment`, `Savings` cats) — bills cats DO count in cycleSpent, but Loan/Debt/Savings don't. If the user mentally adds bills + debt + discretionary expecting $X but the hero shows only discretionary, the number reads low.

**Alternative hypothesis:** `cycleStart` anchor was set BEFORE some of the reconciled txn timestamps. If so, txns with `t.ts < cycleStart` are excluded. Can't verify without reading state.

**Severity revision:** P1 mislabeling, not P0 math bug — IF the discretionary-only framing is intentional. P0 stands if user can show me a specific txn that should count and doesn't.

**Fix complexity:** Medium. Two paths:
1. Rename "this cycle" to "discretionary this cycle" + add a separate "total outflows this cycle" line.
2. Change `MODEL.cycleSpent` to include bills (impacts RC1 invariant at `index.html:4691-4708`, AI prompt context, Bills tab pace tile, dashboard alert).

**Linked:** OPEN-BUGS #6 (filter-scatter); MathInvariants RC1 at `index.html:4691`.

---

### ITEM 2 — Analysis "Debt repayment" + "Loan" doubling ⇒ **P3** (down from P0, working-as-intended)
**User claim:** Same items showing in both categories at different totals.

**Code path:**
- Renderer: `renderSpendingPivot` at `index.html:18699-18791`
- Fragmentation detector: `index.html:18720-18744`

**Root cause:** Not a doubling bug. The Analysis spending-pivot groups txns by `t.cat`. If user has historical txns where the SAME loan (e.g. KIA Firstmac) was tagged "Loan" in some months and "Debt repayment" in others, they appear as two separate category rows. **The app already detects this** and renders an amber banner at line 18727: *"💡 Debt categories doubling up? $X total across N categories: …If these all relate to the same loan, edit older transactions to use one category (we recommend 'Debt repayment')."*

**Severity revision:** P3 working-as-intended — the app surfaces the issue AND suggests the fix. If user wants the categories auto-merged, that's a P2 redesign.

**Fix complexity:** Small (rephrase the banner so it's more action-prompt-shaped) to medium (auto-consolidate categories during view, leave underlying txns alone).

---

### ITEM 3 — Essential vs Discretionary $15k impossible ⇒ **P0 confirmed**
**User claim:** $15k essential+discretionary impossible given $4,578 cycle spend.

**Code path:** `index.html:5917-5928`. Filter at line 5922: `S.txns.filter(t => !t.income && t.cat !== 'Debt repayment')`. **No date filter.** Iterates entire transaction history.

**Root cause confirmed:** Lifetime aggregation labeled in a "this cycle" implicit context (the tile sits adjacent to other cycle-bounded tiles). Pre-existing guardian-allow comment at line 5921 explicitly names this: *"should switch to strict `_NON_SPEND_CATS` filter to align with Bundle B canonical (removable when OPEN-BUGS #6 is fixed)."*

**Severity:** P0 confirmed — math is obviously wrong by user's lifetime-vs-cycle gap test. Already filed as OPEN-BUGS #6.

**Fix complexity:** Small. Replace the filter with `getDiscretionaryByCategory(cycleStart, now)` or wrap the existing filter in a date predicate. ~10 lines, one Playwright spec to lock it.

**Linked:** OPEN-BUGS #6.

---

### ITEMS 4, 5, 6 — Three "left to allocate" numbers ⇒ **P1 UX** (down from P0; arithmetic is correct)
See **Root cause B** above for full breakdown.

**Code paths:**
- Canvas REMAINDER tile ($1,770): `index.html:10336` — `fmt(remainder)`, where `remainder = snap.totalToPlan - essentialsTotal` (line 10281)
- Canvas "Allocating the remainder" subline ($1,133 / $637): `index.html:10348-10371` — `discretionaryTotal = savings.total + knownUpcoming.total`, `stillFree = remainder - discretionaryTotal`
- PLAN dashboard tile ($1,770): `index.html:24474-24502` — same formula as Canvas REMAINDER, comment at 24450-24452 documents the Bundle 28 r47 + Bundle 29 unification work that got them in sync
- Savings sub-screen ($537): `index.html:12591-12614` — uses `snap.derived.allocatableToSavings` (surplus − buffer − provisions, NOT the same as `remainder`)

**Sub-bug worth its own item:** ticking allocation rows does not decrement these numbers. Ticks live in `S.activePlan.ticks.savings/upcoming/bills/debts` (confirmation toggles); assigned amounts live in `S.activePlan.savings`/`overrides`. User who "tick-ticks" through everything still has $637 uncommitted because they never assigned that $637 to a bucket. Item 4's "plan is fully allocated" reading is the user-mental-model side of this bug.

**Severity revision:** P1 UX redesign. The math is internally consistent — the bug is vocabulary and the tick-vs-assign conflation.

**Fix complexity:** Large. Options:
1. Vocabulary pass — rename "left to allocate" / "uncommitted" / "left to split" so they're not synonyms. (Hard: which words?)
2. Add an "Allocate the remaining $637 to..." CTA when `stillFree > 0`, so the gap is actionable not just informational.
3. Either (a) make ticks update the *assigned amount* to match the floor, or (b) gray out tick handles until a bucket has been assigned. Option (b) is cleaner — ticks are pre-disabled until the user has *committed* a dollar amount.

**My push: do option 3(b) before vocabulary cleanup.** The tick-vs-assign confusion is the substantive bug; vocabulary is downstream cosmetic.

---

### ITEM 7 — Projected runout includes Claude MAX $340 ⇒ **P2/P3** (depends on interpretation)
**User claim:** Runout includes $340 even though Claude MAX is marked auto-debit.

**Code path:**
- Runout calc: `index.html:5540-5560`
- Upcoming bills filter: `index.html:5476` — `_canonicalBills = BRAIN.bills.getThisCycle().filter(b => !b.paid)`
- Bill object `b.paid`: derived at `index.html:4359-4360` and `index.html:4390-4392` — accepts both legacy (`=== true`) and structured (`{paid:true, _scheduledAutoDebit:true}`) shapes.

**Root cause:** If Claude MAX's `paidBills` entry has `_scheduledAutoDebit:true`, `b.paid` should evaluate truthy and the bill should be excluded from upcomingBills (= excluded from runout). If the user is seeing $340 included, either:
- (a) Claude MAX is NOT actually marked as paid for this cycle (user didn't open the modal and check the box) — this is the Item 16 architecture gap.
- (b) `_scheduledAutoDebit` shape isn't being read by `BRAIN.bills.getThisCycle()`.

(a) is far more likely. The "include in runout" behavior is correct given an unmarked bill: money WILL leave the account, runout math has to account for it.

**Severity revision:** P3 working-as-intended *given current architecture*. The fix is upstream (Item 16): if auto-debit bills were automatically marked paid on debit day, this symptom disappears.

**Fix complexity:** N/A — fix is at Item 16.

---

### ITEM 8 — Claude MAX in Bills tab not registering paid ⇒ **needs repro**
**User claim:** Marking auto-debit bill paid in full would deduct another $340 (double-charge risk).

**Code path:**
- Bills tab renderer: `renderBillsGrouped` at `index.html:8214`
- Paid badge at `index.html:8276`: `const paidBadge = isPaid ? '<span...">TRACKED</span>' : ''`
- `isPaid` derives from `isThisMonthlyBillPaid(b.name, b.day, _myb.m, _myb.y)` at line 8275
- `isThisMonthlyBillPaid` accepts both legacy and structured paidBills shapes per `index.html:4359-4360`

**Root cause hypothesis:** Need to verify what user actually sees. Two scenarios:
- (a) Claude MAX has NO paidBills entry → no TRACKED badge → user marks it via modal → modal save creates txn → balance decrements correctly. Not a double-charge.
- (b) Claude MAX HAS `_scheduledAutoDebit:true` paidBills entry (from a prior cycle) but the visual TRACKED badge isn't showing for the current month because of month/year keying mismatch.

(b) is the dangerous case. Would need to inspect `S.paidBills` and the bill's day/month to confirm.

**Severity:** P0 IF (b) is real (double-charge risk on user action). P1 IF (a) is real (just discoverability). Needs phone repro before I can categorize.

**Fix complexity:** Small to medium depending on which case.

---

### ITEM 9 — Min living costs in runout uses historical ⇒ **P1 confirmed**
**User claim:** Runout uses 30-day historical, not actual weekday/weekend budget.

**Code path:** `getMinDailySpend` at `index.html:5431-5445`:
```js
const recentTxns = (S.txns || []).filter(t =>
  t.ts >= thirtyDaysAgo && !t.income && !t._isCorrection && !NON_DISC.includes(t.cat)
);
const avgDaily = totalSpend / 30;
const historicalMin = parseFloat((avgDaily * 0.6).toFixed(2));
return Math.max(20, Math.min(40, historicalMin));
```

**Confirmed:** Computes 60% of 30-day rolling avg, clamped to `[$20, $40]`. User's `S.weekdayBudget = $60` and `S.weekendBudget = $180` (defaults — visible at `index.html:2723`) are NOT consulted.

**Bug impact:** User with $60/$180 weekday/weekend budgets has runout pessimistically forecast at $20-$40/day floor. If user has been spending heavily over the last 30 days, the floor lands at $40 even though their *budget* is much lower; conversely if the last 30 days were unusually frugal, the floor lands at $20 which is below their realistic weekday spend.

**Severity:** P1 — runout date is a high-trust safety number; if it's off by 50%+ the user can't rely on it.

**Fix complexity:** Medium. Three approaches:
1. Use `getDailyBudget()` (weekday-aware) directly as the floor.
2. Sum over remaining days using *actual weekday/weekend distribution* (count remaining weekdays + weekends × respective budgets / total days).
3. Use the lower of `getDailyBudget()` and the historical 60% (current logic but with budget cap, not $40 cap).

Approach 2 is the most honest. Approach 3 is the cheapest patch.

**Linked:** OPEN-BUGS #7 (renderCutSliders also has scope problems with `getMinDailySpend`-style math).

---

### ITEM 10 — MAX PER DAY + Running-over-pace adjacent ⇒ **P2 confirmed**
**User claim:** Two modules visually adjacent → skip-reading.

**Code paths:**
- MAX PER DAY card render: `index.html:6292` + tap-handler `EDIT_MODAL.openInfo` at `index.html:3127`
- Pace text: `index.html:6355-6356` (`_paceDisp.textContent = 'Running $X over pace this week ⚠️'`); also `index.html:8806` (different surface)

**Root cause:** Two cards rendered adjacent on dashboard, with similar phrasing ("per day" / "this week"). Code at `index.html:6342-6356` notes a prior bug where two surfaces showed DIFFERENT pace numbers due to different filters (OPEN-BUGS #8) — the surfaces were merged but visually they're still side-by-side.

**Severity:** P2 — user labeled correctly.

**Fix complexity:** Small (CSS/layout — combine into one card with two stats, or insert a clearer divider).

---

### ITEM 11 — Plan-unlocked has no DELETE for upcoming items ⇒ **needs verification**
**User claim:** Body Wash $40 ticked but actually in Friday's $77 Groceries — needs to be removable.

**Code paths:**
- List render: `renderPaydayUpcoming` at `index.html:12823-12869`
- Row: `_paydayRow({...})` at line 12842-12852 — provides `onTap: openEditPaydayUpcoming(itemId)` and `onTickTap: paydayTick(...)`. **No inline delete button.**
- Edit modal: `openEditPaydayUpcoming` at `index.html:11115` — I didn't read past the function header; whether the modal exposes a delete button is unverified.

**Likely state:** Delete probably exists inside the edit modal but isn't inline on the card. User wants discoverability.

**Severity:** P1 UX — user labeled correctly.

**Fix complexity:** Small (add a delete affordance inline on the card, or surface modal-delete via long-press).

---

### ITEM 12 — Trip/Goal cards external edit/add/delete buttons ⇒ **partial — Trips OK, Goals need verification**
**User claim:** External edit/add/delete buttons should be inside the card.

**Code paths:**
- Trip card: `renderTrips` at `index.html:25257-25360`. **Inline buttons confirmed** at lines 25351-25353: `✏️ Edit`, `+ Add savings`, `🗑️` (delete). Trips already match the user's requested pattern.
- "Add a new savings target" external section: `index.html:12814-12819` — three external buttons (`🎯 Goal`, `✈️ Trip`, `💰 Bucket`) for ADDING new items. These are correctly external (they're "create new" actions).
- Goal/Bucket card edit/delete: not verified this pass. User's complaint likely targets these specifically.

**Severity:** P1 confirmed for Goals/Buckets (pending verification); not-applicable for Trips.

**Fix complexity:** Medium. Need to read `renderPaydaySavings` body more carefully to see Goal/Bucket card structure.

---

### ITEM 13 — WRX always-open clutters dashboard ⇒ **P1 confirmed**
**User claim:** Make collapsible-by-default.

**Code path:** `renderWrxCard` at `index.html:23907-end`. Returns HTML directly — large card with sale-price block, KIA payoff math, daily interest, repayment-fee editor. **No collapsible state in the render path.** Always opens fully expanded.

The card consumes significant vertical space on the PLAN mode dashboard.

**Severity:** P1 UX — user labeled correctly.

**Fix complexity:** Small. Wrap the body in a `<details>`/`<summary>` or add a state flag (`S.wrxCardCollapsed`) toggled by tap.

---

### ITEM 14 — Opportunity Cost uses rent ⇒ **P2 dead-weight**
**User claim:** Meaningless. Remove or redesign.

**Code path:** `index.html:5836-5846`. `worstCat = sortedCats[0]` — top category by spend. `sortedCats` derives from `cats` at line 5817, which uses `_NON_SPEND_CATS` to exclude Bills/Loan/Savings/etc. **However**: if user's rent payment is tagged with a category NOT in `_NON_SPEND_CATS` (e.g., 'Fixed', 'Variable', 'Subscription'), it leaks into `cats` and dominates `worstCat`.

**Root cause:** Filter only excludes by category-tag string. Rent is conceptually essential but might be tagged any way the user chose at logging time.

**Severity:** P2 — user labeled correctly. Dead-weight unless redesigned with category-classification rather than tag-string filtering.

**Fix complexity:** Medium-large (depends on whether we tag txns with essential/discretionary metadata, which is a schema change).

---

### ITEM 15 — Month-on-Month doesn't compare ⇒ **P2 confirmed (likely never compares)**
**User claim:** Doesn't actually compare months.

**Code path:** `index.html:5868-5882`.
```js
const history = S.monthlyHistory || [];
if (history.length >= 1) { ... }
const prev = (history[history.length-1]||{})[k] || 0;
const delta = prev > 0 ? Math.round(((v-prev)/prev)*100) : null;
const deltaStr = delta === null ? 'first month' : ...
```

**Root cause:**
1. Only compares to ONE prior month (`history[length-1]`) — not multi-month trend.
2. Renders for `history.length >= 1` — meaning even with zero prior months it would try to render (the `|| {}` and `|| 0` make it look like "first month" everywhere).
3. `S.monthlyHistory` is declared at `index.html:2207` as initial state `monthlyHistory: []`. Did NOT grep for the writer this pass — quick TODO.

**If S.monthlyHistory is never populated by an end-of-month snapshot writer, the tile renders all rows as "first month" forever.** That matches user's "doesn't actually compare."

**Severity:** P2 — user labeled correctly. Either remove or wire up monthly-snapshot writer.

**Fix complexity:** Small (remove tile) to large (build proper monthly aggregation with a real chart).

---

### ITEM 16 — Auto-debit bills don't write txns ⇒ **P0 architectural gap confirmed**
See **Root cause C** above.

**Code paths surveyed:**
- autoDebit checkbox in bill modal: `index.html:1824`
- autoDebit flag in `paidBills` shape: `{paid:true, _scheduledAutoDebit:true, ts}`
- Manual flag-setting handler: `index.html:4197-4213` (fires when user marks paid via modal AND auto-debit checked)
- No scheduler / no cron / no end-of-cycle batch writer found.

**Consequence:** Every auto-debit bill creates a silent drift each cycle. The drift is the entire reason last night's $1,840 reconciliation was needed.

**Severity:** P0 — affects every user action through the reconciliation pipeline. Probably thematic with ADR-E.

**Fix complexity:** Large.
- Option 1: end-of-cycle batch job at next render after `cycleEnd` — scan bills tagged auto-debit, write a txn + mark paid for each.
- Option 2: introduce an "expected debit calendar" that fires per-day and writes a txn when current date passes the bill's day.
- Option 3 (current de-facto): manual reconciliation each cycle via the import worker.

**Linked:** ADR-E candidate (reconciliation infra); INV-01 + INV-05 violations.

---

### ITEM 17 — Opal $1 placeholder vs actual fare ⇒ **P3 data-design**
**User claim:** $1 placeholder bill vs actual Opal fare creates persistent correction gap.

**Code path:** No Opal-specific code found beyond `index.html:18905-18906` (favicon registry — `'opal':'transportnsw.info'`). Opal's $1 amount is a state-data value, not a code constant.

**Root cause:** Bills assume a fixed amount. Opal is a variable-amount weekly outflow. The mismatch between estimate and actual is reconciled monthly via correction txns or manual edits.

**Severity:** P3 — user labeled correctly. Non-trivial.

**Fix complexity:** Medium-large.
- Option 1: introduce a "variable bill" type that derives its amount from txn history (mean of last N matching txns).
- Option 2: special-case transport — pull from txn history bucketed by 'Transport / Fuel' cat over the prior week.
- Option 3: don't model as a bill at all; budget it under daily living instead.

---

## Summary by revised severity

| Severity | Items | Notes |
|---|---|---|
| **P0** confirmed | 3, 16 | Lifetime aggregation + auto-debit scheduler gap |
| **P0** pending repro | 8 | Double-charge risk needs phone verification |
| **P1** confirmed | 9, 10 (wait — 10 was P1 from user, see below), 11, 13 | Min-living-historical, MAX PER DAY duplication, no-delete-upcoming, WRX always-open |
| **P1** with substantive sub-bug | 4 (tick-vs-assign conflation) | Three "left to allocate" numbers are math-consistent; the bug is ticks don't decrement |
| **P1** vocabulary cleanup | 5, 6 | Downstream of item 4 |
| **P1** revised down from P0 | 1 (labeling, not math) | Mislabeling of "discretionary this cycle" as "this cycle" |
| **P1** verification needed | 12 (Goals/Buckets — Trips already OK) | Trip cards correctly inline; Goals unverified |
| **P2** confirmed | 14, 15 | Both labeled correctly by user |
| **P3** revised UP from P2 | 2 (working-as-intended) | App already detects and warns; user reading the warning literally |
| **P3** confirmed | 7 (downstream of 16), 17 | Both labeled correctly by user |

Note item 10: user labeled P1, I default to P2 (cosmetic adjacency). Either is defensible.

---

## What I'd push back on if you prioritize wrong

Reading on 4hr sleep, the natural draw is to fix things that show specific wrong numbers (items 1, 3, 4, 9). All worthwhile — but my read of leverage:

**If only 2-3 fixes land this session, my ranking:**

1. **Item 3** — *highest leverage P0*. Smallest fix (date filter on one Analysis tile), most-visible-impact (visibly wrong number on a tile John sees every day), and breaks the "filter scatter" pattern in a contained way that lays groundwork for the broader OPEN-BUGS #6 cleanup.
2. **Item 16** — architectural P0. Even a partial fix (end-of-cycle batch handler) closes the silent-drift loop and removes the need for monthly bank-recon firefighting. Probably the actual highest-value work but it's a bundle, not a one-commit fix.
3. **Item 4 sub-bug** (tick-vs-assign) — the real bug under items 4-6. Either disable ticks until amount assigned, OR auto-update assigned amount on tick. One JS change; high-impact on PLAN mode trust.

**What I'd push back on:**
- **If you say "fix item 2" first**: pushback. The app is already telling you the answer via the doubling-up banner. The banner copy might need tightening but the underlying behavior is correct.
- **If you say "rename item 1's hero label" without item 3**: pushback. Item 3 is the same root cause class — pick one shape (cycle-bounded by date) and apply it everywhere instead of relabeling one surface.
- **If you say "redesign Opportunity Cost"** (item 14) **this session**: pushback. P2 dead-weight; not earning session time over P0/P1 work.

---

## Open questions for John

1. **Item 1:** is the hero supposed to be discretionary-only or total-spend? Different mental models, different fix.
2. **Item 8:** can you repro on phone? Mark Claude MAX paid in Bills tab and see (a) what happens to balance, (b) whether the TRACKED badge shows.
3. **Item 4 sub-bug:** which fix do you want — disable ticks until amount assigned, or auto-update assigned amount when ticking? They produce different user behaviors.
4. **Item 12:** can you confirm the complaint is about Goals/Buckets, not Trips? Trip cards already have inline edit/add/delete.

---

## What Phase 1B (visual walkthrough) might add

The visual audit was scoped to 15-20 UI-renderable FEATURE-MAP entries × Haiku verdict. Given Phase 1A surfaced 11 real items (P0+P1) and 6 working-as-intended-or-cosmetic items, the marginal value of a vision-AI pass is probably:

- The Math Health post-collapse "lenient" issue from Bundle 30.5 carry-over (worth checking even if MATCH this run)
- Visual issues NOT in user's gut-list (alignment, contrast, off-screen content at 380px)
- Confirming or denying my untested hypotheses (especially item 8 paid-badge rendering)

**My recommendation:** skip Phase 1B this session unless you specifically want me to verify one of the open questions visually. The user gut-audit is denser signal per minute. Phase 1B can be a future session when surface-level UX is the focus.
