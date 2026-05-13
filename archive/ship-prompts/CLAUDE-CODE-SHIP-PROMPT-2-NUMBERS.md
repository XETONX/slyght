# Claude Code Ship Prompt — Bundle 2 (Trust the Numbers)

> **Purpose:** Two fixes, both about making the displayed numbers
> match user expectation. Single commit.
>
> **Context:** User reports (a) Bills tab "Balance after" shows
> ~$75 less than dashboard balance for same data; (b) May calendar
> hides Spotify/YouTube/Adobe/KIA bills that are real upcoming bills
> but pre-marked as "tracked paid early" without an actual transaction.
>
> **Discipline:** Same as Bundle 1. Search by content, surface
> mismatches, phone-verify post-deploy. Don't bundle the visual
> polish work into this commit — that's a separate ship.

---

## Fix 1 — Balance-after stops double-counting savings buckets

**The bug:** `renderCalWeekSummary` (or rather, the bills-tab section
render that contains "Balance after") subtracts `bucketTotal` from
the balance display. That sum is everything currently in user's
savings buckets — money that already left their spendable balance
when they saved it. Subtracting it again presents a falsely-lower
"available" number.

Dashboard correctly uses `getLiveBal()` without the bucket subtract
for hero display. Bills tab inherited an old "show conservative
estimate" pattern that's now misleading.

### Find the line

Search `index.html` for:

```
const runningAfter = (cls === 'today' ? liveBal - todayTotal : liveBal - weekTotal) - bucketTotal;
```

That's inside `renderGroup` inside the bills tab render function
(around L5025 in stale snapshot, may have drifted).

### Replace with

```
const runningAfter = cls === 'today' ? liveBal - todayTotal : liveBal - weekTotal;
```

That's removing only ` - bucketTotal` from the end. Nothing else
changes.

### Don't touch this other bucket use

There IS another `bucketTotal` calc in the same function (around L4983):

```
const bucketTotal = (S.savingsBuckets||[]).reduce((s,b) => s+(b.saved||0), 0);
```

After the fix above, this `bucketTotal` const may become unused. If
ESLint or any check complains about unused var, **delete the const
declaration entirely**. If nothing complains, leave it — it's
harmless and removing it makes the diff bigger than necessary.

Run after edit:
```
grep -c "bucketTotal" index.html
```

Note the count. The number should be 2 fewer than before (we removed
one usage and possibly one declaration). The other surviving uses are
in `getGenuineSurplus` (L1559) and a third place (~L6351) — those are
correct uses (genuine-surplus calc legitimately deducts buckets). Do
not touch those.

### Verify

Phone-verify after deploy: open Bills tab, scroll to today/this-week
section. "Balance after" should now equal: dashboard live balance
minus today's bills (for the today section), minus today + this-week
bills (for the week section). It should NOT be lower than that.

If user's live balance is $321 and today's bills total $0, "Balance
after" should show $321 (or close, depending on rounding). Was
showing ~$246 because of the bucket double-count.

---

## Fix 2 — Calendar shows tracked-paid-early bills (dimmed) instead of hiding them

**The bug:** `buildCalendarEntries` line 2339:
```
if (paidBills[paidKey] === true) return;
```

This hides any bill flagged in `paidBills` for that month. The flag
gets set when user marks a bill "tracked paid early" via the
MI-13 flow OR when a real transaction is auto-detected. Both states
share the same flag. Calendar treats both identically: hidden.

**User's failure mode:** Pre-marked Spotify, YouTube, Adobe, KIA as
"paid early" via the banner flow. Then accidentally refreshed before
saving real transactions for them. Now `paidBills` map has these
flagged but they're real upcoming bills. May calendar shows nothing
for those days. April/June render fine because no pre-marks there.

**The fix:** Don't return early. Build the entry, mark it `paid: true`,
let the calendar render it dimmed.

### Step 2.a — Modify buildCalendarEntries to not hide paid bills

Find this block in `index.html` (L2331-2347 in stale snapshot):

```js
    billsArr.forEach(b => {
      if (b.recurring === false) return;
      if (!_dueIn(b, m)) return;
      const billDate = new Date(y, m, b.day);
      const dateISO = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(b.day).padStart(2, '0');
      // RC11: read from injected `paidBills` (state-pure for testability) but
      // build the key via canonical paidBillKey so format stays unified.
      const paidKey = paidBillKey(b.name, b.day, m, y);
      if (paidBills[paidKey] === true) return;
      const covered = debtsForCoverage.some(d => _covers(d, b, billDate));
      if (covered) return;
      _add(dateISO, {
        type: 'bill', name: b.name, amt: b.amt,
        color: 'var(--amber)',
        bill: b, ref: b, source: 'bills'
      });
    });
```

Replace with:

```js
    billsArr.forEach(b => {
      if (b.recurring === false) return;
      if (!_dueIn(b, m)) return;
      const billDate = new Date(y, m, b.day);
      const dateISO = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(b.day).padStart(2, '0');
      // RC11: read from injected `paidBills` (state-pure for testability) but
      // build the key via canonical paidBillKey so format stays unified.
      const paidKey = paidBillKey(b.name, b.day, m, y);
      const isPaid = paidBills[paidKey] === true;
      const covered = debtsForCoverage.some(d => _covers(d, b, billDate));
      if (covered) return;
      _add(dateISO, {
        type: 'bill', name: b.name, amt: b.amt,
        color: 'var(--amber)',
        paid: isPaid,
        bill: b, ref: b, source: 'bills'
      });
    });
```

What changed:
- `if (paidBills[paidKey] === true) return;` → `const isPaid = paidBills[paidKey] === true;`
- Added `paid: isPaid,` to the entry object

The `if (covered) return;` line stays — debt-covered bills still get
hidden because they're a different concept (the debt represents the
bill).

### Step 2.b — Use the `paid` flag in calendar render

The day-cell render at `renderCalendar` builds `cls` and dot color
from items. We want paid-bill days to look distinct from
unpaid-bill days. Simplest: if all items on a day are paid, mute
the styling.

Find this section in `renderCalendar` (around L5130):

```js
    const items = isThis ? getCalendarDayItems(d, calMonth, calYear) : [];
    const hasDebt = items.some(it => it.type === 'debt');
    const billCount = items.filter(it => it.type === 'bill').length;
    const itemTotal = items.reduce((s, it) => s + (it.amt || 0), 0);
```

Replace with:

```js
    const items = isThis ? getCalendarDayItems(d, calMonth, calYear) : [];
    const hasDebt = items.some(it => it.type === 'debt' && !it.paid);
    const unpaidBills = items.filter(it => it.type === 'bill' && !it.paid);
    const paidOnly = items.length > 0 && items.every(it => it.paid);
    const billCount = unpaidBills.length;
    const itemTotal = unpaidBills.reduce((s, it) => s + (it.amt || 0), 0)
                      + items.filter(it => it.type === 'debt' && !it.paid).reduce((s, it) => s + (it.amt || 0), 0);
```

Then find the `cls` builder a few lines below:

```js
    let cls = 'cal-day';
    if (!isThis) cls += ' other-month';
    if (isPayday && items.length > 1) cls += ' payday has-multi';
    else if (isPayday && items.length === 1) cls += ' payday has-bill';
    else if (isPayday) cls += ' payday';
    else if (hasDebt) cls += ' has-bill'; // debt uses same has-bill styling
    else if (billCount > 1) cls += ' has-multi';
    else if (billCount === 1) cls += ' has-bill';
    if (isToday) cls += ' today';
```

Add a `paid-only` class branch after the existing chain:

```js
    let cls = 'cal-day';
    if (!isThis) cls += ' other-month';
    if (isPayday && items.length > 1) cls += ' payday has-multi';
    else if (isPayday && items.length === 1) cls += ' payday has-bill';
    else if (isPayday) cls += ' payday';
    else if (hasDebt) cls += ' has-bill'; // debt uses same has-bill styling
    else if (billCount > 1) cls += ' has-multi';
    else if (billCount === 1) cls += ' has-bill';
    else if (paidOnly) cls += ' paid-only';
    if (isToday) cls += ' today';
```

### Step 2.c — Add the .paid-only CSS

Find the existing cal-day styles in the CSS section. Search for:

```
.cal-day.has-bill
```

Add a new rule for `.cal-day.paid-only`. Inserted right after the
existing `.cal-day.has-bill` declaration:

```
.cal-day.paid-only{opacity:0.5}
.cal-day.paid-only .cal-day-amt{text-decoration:line-through;color:var(--text3)}
```

Subtle visual: dimmed cell, struck-through amount. User can see
the bill exists, knows it's tracked-paid, can tap to investigate.

### Step 2.d — Update calDayClick (the per-day detail modal) to show paid bills with badge

In `calDayClick`, when rendering items, find the bill row template.
Add a "✓ tracked" badge on bills with `paid: true`. Search for the
bill-row HTML inside `calDayClick`. Look for something like:

```js
items.filter(it => it.type === 'bill').forEach(it => {
```

Or similar. Inside the loop where it builds the bill row HTML, add
a badge for paid bills.

If unsure of exact structure, **surface to user**: "calDayClick has
several render branches; want me to add the paid-bill badge in all
of them or just the first?" Then proceed.

If the structure is straightforward, the badge addition pattern is:

```js
const paidBadge = it.paid ? '<span style="font-size:10px;color:var(--green);margin-left:6px;font-weight:600">✓ tracked</span>' : '';
```

And concatenate `paidBadge` into the bill name display.

### Verify Fix 2

After edits, phone test:
- Navigate to May 2026 in calendar
- Days that have Spotify, YouTube, KIA, Adobe should now show the
  bill with dimmed/struck-through styling
- Tap the day → see the bills with "✓ tracked" badges
- Confirm April/June still render bills normally (no regression)

---

## Step 3 — Validation gates

```
node guardian-static.js     # exit 0
node guardian-runtime.js    # 47/50 (3 known fixture-drift)
node tests/core.test.js     # 41/41
```

If any regress, STOP and surface. Do NOT auto-fix.

If a NEW runtime check fails because it expected paid-bill hiding,
that's actually a behavioral change we're introducing intentionally —
surface the specific failure, get user sign-off, then either update
the runtime expectation (`grep -i "calendar" guardian-runtime.js` to
find it) or roll back and discuss.

---

## Step 4 — Commit

```
git add index.html
git status   # only index.html
git diff --cached --stat   # confirm scope
git commit -m "fix(numbers): trust dashboard balance + show tracked-paid bills on calendar

Two trust-the-numbers fixes user reported on phone:

- Bills tab 'Balance after' was deducting bucketTotal (sum of money
  already in savings buckets) on top of the bills-due deduction. That
  double-counts: bucket money already left the spendable balance
  when it was saved. With Virgin balance \$321 and \$0 due today, tile
  was showing \$246 instead of \$321 (\$75 in buckets being subtracted
  again). Removed the - bucketTotal from runningAfter calc. Other
  bucketTotal usages (getGenuineSurplus, debt-strategy calc) are
  legitimate and untouched.

- Calendar was hiding any bill flagged in paidBills map. That flag
  gets set both for genuinely-paid bills (with txn) and for
  tracked-paid-early bills (no txn yet). User pre-marked
  Spotify/YouTube/Adobe/KIA as tracked-early, then refreshed before
  logging real txns; May calendar then showed nothing for those days
  even though they're upcoming bills. Calendar now shows paid bills
  with dimmed/struck-through styling so they remain visible. New
  .paid-only CSS class. Day-detail modal shows '✓ tracked' badge.

Verification:
- guardian-static: exit 0
- guardian-runtime: 47/50 (3 known fixture-drift)
- tests: 41/41

Phone-verify post-deploy: bills 'Balance after' matches dashboard
math; May calendar shows previously-hidden bills dimmed."
git push origin main
```

---

## Step 5 — Phone-verify

Wait 5–10 min for GH Pages, force-refresh PWA.

**Fix 1 verification:**
1. Open Bills tab
2. Note dashboard live balance (e.g., \$321.15)
3. Look at Bills tab today section. If today bills = \$0, "Balance
   after" should match dashboard balance (\$321.15)
4. If today bills > 0, "Balance after" should equal dashboard balance
   minus today's unpaid bills total
5. **Same logic for week section** — should be dashboard balance minus
   today + this-week unpaid bills

**Fix 2 verification:**
1. Calendar tab → navigate to May 2026
2. Bills you marked as "tracked paid early" should now be VISIBLE on
   their due-day cells (dimmed/struck-through)
3. April + June calendar should look identical to before
4. Tap a paid-tracked day → bills show "✓ tracked" badge
5. Untracked/upcoming days look normal (full color, no strikethrough)

User reports PASS or FAIL.

---

## Failure modes

| Symptom | Action |
|---|---|
| Balance-after still wrong | grep for any other `- bucketTotal` in render path |
| May calendar still empty | Verify `paidBills` map actually has the keys; test by setting `S.paidBills = {}` in console temporarily and re-rendering |
| Calendar styling not applied | Check `.cal-day.paid-only` CSS landed; check class is being added in renderCalendar |
| Day-detail modal doesn't show badge | Step 2.d may have hit unfamiliar code structure; user can surface and we revise |
| guardian-runtime new failure | If it's a calendar-related check expecting paid bills to be hidden, that's the behavior change — read the failure, decide whether to update the check or roll back |

---

## What this prompt does NOT touch

- Visual polish (caps → sentence-case, font bumps) — separate ship
- Bills tile pace duplicate — separate ship
- Settings nav button removal — separate ship
- The MI-13 batch-save bug (KIA saved, others didn't) — needs phone
  repro of the exact flow before fix can be specified
- Plan mode persistence (Class C) — needs its own mission

---

## End of prompt
