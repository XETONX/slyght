# Claude Code Ship Prompt — Bundle 5 (Trust the Math)

> **Purpose:** Fix the foundational trust gap between what the app
> shows and what it actually computes. Three problems that compound:
>
> 1. MAX PER DAY ($19.86) doesn't react to today's spending — divides
>    total available by total days instead of "what's left for today
>    after I've already spent."
> 2. Survival forecast says "$15/day" in user-facing text, but the
>    underlying calc uses `getMinDailySpend()` which returns $20-$40.
>    Two different numbers under the same label.
> 3. Survival forecast date and day-count don't reconcile: "8 days
>    (Tue, 12 May)" — May 5 + 8 = May 13 (Wed), not Tue 12 May.
>
> **Source baseline:** Fresh zip @ HEAD 59e008b post-Bundle-2,
> Bundle 4 may or may not have shipped between this prompt being
> written and you executing it. If Bundle 4 already shipped, all
> line numbers here will have shifted. **Use content-search instead
> of line numbers anywhere there's drift.**
>
> **Discipline:** Same as prior bundles. Surface don't reframe. STOP
> at any mismatch. Phone-verify post-deploy.
>
> **Scope:** Single commit. Net diff ~25 lines. Risk: medium —
> changes the dashboard's most visible number behavior. Verify on
> phone with real txns before declaring success.

---

## What this fixes

1. **MAX PER DAY now subtracts today's spend.** When user spends $20
   today, MAX PER DAY drops by ~$20 (not ~$2). Resets at midnight
   (because today's spend resets at midnight). Mathematically: 
   `dailyAvailable - todaySpent` instead of `dailyAvailable`.
2. **Survival forecast "$15/day" replaced with the actual computed
   value.** Whatever `getMinDailySpend()` returns becomes the
   displayed text. Verifiable from screen.
3. **Survival forecast date + day-count derive from the same source.**
   Pick the date as authoritative; derive days-until-runout from it.
4. **Lunch notification body uses real remaining-today value.** Not
   a hardcoded $20. (Worker file change.)

---

## Step 1 — Pre-flight

```
git status
git log --oneline -5
git pull origin main
```

Working tree clean. Note current HEAD; that's what this commit
builds on. If a teammate (or me) shipped between Bundle 4 and now,
re-base or surface.

---

## Step 2 — Today-aware MAX PER DAY

**Find** the `getDynamicDailyBudget` function. Content-search:

```
grep -n "function getDynamicDailyBudget" index.html
```

Should return one match (~L1518 in pre-Bundle-4 source). Read the
function. Should look like:

```
function getDynamicDailyBudget() {
  const bal = getLiveBal();
  const days = Math.max(1, MODEL.daysToPayday);

  const billsCommitted = getBillsDue().reduce((s,b) => s + b.amt, 0);
  const debtsCommitted = getActiveDebtsDueBeforePayday();
  const totalCommitted = billsCommitted + debtsCommitted;

  const available = Math.max(0, bal - totalCommitted);
  const dailyAvailable = parseFloat((available / days).toFixed(2));

  const isWeekend = [0, 6].includes(new Date().getDay());
  const userCap = isWeekend
    ? (S.weekendBudget || 180)
    : (S.weekdayBudget || 60);

  return Math.min(dailyAvailable, userCap);
}
```

**Replace the function body with:**

```
function getDynamicDailyBudget() {
  const bal = getLiveBal();
  const days = Math.max(1, MODEL.daysToPayday);

  const billsCommitted = getBillsDue().reduce((s,b) => s + b.amt, 0);
  const debtsCommitted = getActiveDebtsDueBeforePayday();
  const totalCommitted = billsCommitted + debtsCommitted;

  const available = Math.max(0, bal - totalCommitted);
  const dailyAvailable = parseFloat((available / days).toFixed(2));

  const isWeekend = [0, 6].includes(new Date().getDay());
  const userCap = isWeekend
    ? (S.weekendBudget || 180)
    : (S.weekdayBudget || 60);

  // Bundle 5: subtract what's already been spent today so the
  // displayed Max Per Day answers "what's left for the rest of
  // today" not "what's the rolling daily average." Resets at
  // midnight because getTodaySpent() filters by today's date.
  const cap = Math.min(dailyAvailable, userCap);
  const todaySpent = (typeof getTodaySpent === 'function')
    ? getTodaySpent() : 0;
  return Math.max(0, parseFloat((cap - todaySpent).toFixed(2)));
}
```

Three additions: a `cap` variable to clarify the intent, a
`todaySpent` lookup with safety fallback, and a `Math.max(0, ...)`
floor so the number never goes negative on screen.

### Verification

```
grep -n "cap - todaySpent" index.html
```

Should return 1 match.

```
grep -c "getDynamicDailyBudget" index.html
```

Should return the same count as before (callers unchanged).

---

## Step 3 — Survival forecast: replace hardcoded "$15/day" with real value

**Find** the survival forecast text rendering. Content-search:

```
grep -n "minimum spending" index.html
```

Should return 2 matches in `renderSurvivalForecast`. Both have the
same hardcoded `($15/day)` substring.

**First match — the "won't survive" branch (~L3307):**

Find:
```
'At minimum spending ($15/day) your balance runs out before payday on the ' + S.payday + 'th.' +
```

Replace with:
```
'At minimum spending ($' + f.minDailyNeeded.toFixed(0) + '/day) your balance runs out before payday on the ' + S.payday + 'th.' +
```

**Second match — the "will survive" branch (~L3314):**

Find:
```
'At minimum spending you have enough to reach the ' + S.payday + 'th. Stay disciplined.' +
```

Replace with:
```
'At minimum spending ($' + f.minDailyNeeded.toFixed(0) + '/day) you have enough to reach the ' + S.payday + 'th. Stay disciplined.' +
```

The second branch never showed the $/day, but adding it makes the
two branches consistent. Both now show derivation.

The variable `f.minDailyNeeded` is already returned from
`getSurvivalForecast()` — no new computation needed, just surface
it.

### Verification

```
grep -n "f.minDailyNeeded.toFixed(0)" index.html
```

Should return 2 matches.

```
grep -n '\$15/day' index.html
```

Should return 0 matches.

---

## Step 4 — Survival forecast: date and day-count from same source

**Find** the runout block in `getSurvivalForecast`. Content-search:

```
grep -n "When does money run out" index.html
```

Should return 1 match (~L3223). The for-loop after it iterates
days, deducting from a tempBal. The first day where tempBal goes
negative becomes the runOutDate AND runOutDays.

**The loop is fine. The bug is in renderSurvivalForecast at the
display side.** Find this block:

```
const runOutStr = f.runOutDate
  ? f.runOutDate.toLocaleDateString('en-AU', {weekday:'short', day:'numeric', month:'short'})
  : 'soon';
html += '<div style="font-size:16px;font-weight:700;color:var(--red);margin-bottom:4px">' +
  '🚨 Projected to run out ' + (f.runOutDays === 1 ? 'today' : 'in ' + f.runOutDays + ' days') +
  ' (' + runOutStr + ')' +
'</div>';
```

`f.runOutDays` is `i + 1` where i is 0-indexed loop iteration.
`f.runOutDate` is `today + i` days. So days-shown should be `i + 1`
when date-shown is `today + i`. With today=May 5, i=7 means date=May
12, days=8. So "8 days (Tue 12 May)" claims 8 days but date is May 12,
which is only 7 days from May 5. **The off-by-one is in the loop:
either use `i` for days OR shift the date by `+1`.**

**Reading the loop more carefully:** `setDate(today.getDate() + i)`
with i starting at 0 means "checkDate = today on first iteration,
not today+1." So if balance goes negative on iteration i=0, that
means the user runs out TODAY. `runOutDays = i + 1` would be 1 — "in
1 day" or "today". Confusing. The loop logic is muddled.

**Fix:** Make the loop start at i=1 (tomorrow onward) so day-count
matches date.

Find the for-loop in `getSurvivalForecast`:

```
  for (let i = 0; i < days; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() + i);

    // Deduct bills due on this day
    upcomingBills.forEach(b => {
      if (b.day === checkDate.getDate()) tempBal -= b.amt;
    });
    upcomingDebts.forEach(d => {
      const due = new Date(d.delayDate.includes('T') ? d.delayDate : d.delayDate + 'T00:00');
      if (due.toDateString() === checkDate.toDateString()) tempBal -= d.amt;
    });

    // Deduct minimum daily spend
    tempBal -= minDailyNeeded;

    if (tempBal < 0 && !runOutDate) {
      runOutDate = checkDate;
      runOutDays = i + 1;
    }
  }
```

Replace with:

```
  // Bundle 5: i represents "days from today." i=1 means tomorrow.
  // Date and day-count now derive from same i without off-by-one.
  // i=0 (today) is excluded because today's bills/debts are already
  // counted in upcomingBills/upcomingDebts and today's spend is
  // tracked via getTodaySpent — including i=0 would double-count.
  for (let i = 1; i <= days; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() + i);

    // Deduct bills due on this day
    upcomingBills.forEach(b => {
      if (b.day === checkDate.getDate()) tempBal -= b.amt;
    });
    upcomingDebts.forEach(d => {
      const due = new Date(d.delayDate.includes('T') ? d.delayDate : d.delayDate + 'T00:00');
      if (due.toDateString() === checkDate.toDateString()) tempBal -= d.amt;
    });

    // Deduct minimum daily spend
    tempBal -= minDailyNeeded;

    if (tempBal < 0 && !runOutDate) {
      runOutDate = checkDate;
      runOutDays = i;  // i is days-from-today, matches the date
    }
  }
```

Three changes:
- `for (let i = 0; i < days; i++)` becomes `for (let i = 1; i <= days; i++)`
- `runOutDays = i + 1` becomes `runOutDays = i`
- Comment explaining the rationale

### Verification

```
grep -n "i represents \"days from today\"" index.html
```

Should return 1 match.

After this fix: today=May 5, runs-out-on i=8 means date=May 13 AND
days=8. Consistent. May 13 is Wednesday so display will show "8 days
(Wed, 13 May)" — date and day-of-week now derive from the same
checkDate.

---

## Step 5 — Worker: lunch notification uses real remaining-today

**Find** the worker file: `slyght-worker/src/index.js`.

Content-search:

```
grep -n "12:30pm LUNCH CHECK\|lunchBudget" slyght-worker/src/index.js
```

Should return matches around L352-380.

**Find this block:**

```
  // ── 12:30pm LUNCH CHECK ──────────────────────────────
  if ((sydHour === 12 && sydMin >= 30) || (sydHour === 13 && sydMin < 5)) {
    if (!lunchLogged) {
      let title = '🍱 Lunch time';
      let body;
      const lunchBudget = isGfDay && isWeekend ? 30 : 20;

      if (survivalMode === 'critical') {
        body = 'Balance: $' + bal.toFixed(2) + '. Skip buying lunch today. ' +
               'Payday in ' + daysLeft + ' days. Every $20 matters right now.';
      } else if (survivalMode === 'survival') {
        body = 'Keep lunch under $15 today. You have $' + maxDay.toFixed(2) +
               ' for the day. Average lunch is eating $20-25 of that.';
      } else {
        body = 'Aim for under $' + lunchBudget + ' today. ' +
               'You\'ve spent $' + todaySpent.toFixed(2) + ' so far. ' +
               '$' + Math.max(0, maxDay - todaySpent).toFixed(2) + ' remaining today.';
      }
```

**Replace with:**

```
  // ── 12:30pm LUNCH CHECK ──────────────────────────────
  if ((sydHour === 12 && sydMin >= 30) || (sydHour === 13 && sydMin < 5)) {
    if (!lunchLogged) {
      let title = '🍱 Lunch time';
      let body;
      // Bundle 5: lunch budget is the actual remaining-for-today
      // value, not a hardcoded $20/$30 cap. maxDay already reflects
      // today-aware Max Per Day from app state.
      const remainingToday = Math.max(0, maxDay - todaySpent);

      if (survivalMode === 'critical') {
        body = 'Balance: $' + bal.toFixed(2) + '. Skip buying lunch today. ' +
               'Payday in ' + daysLeft + ' days. Every $20 matters right now.';
      } else if (survivalMode === 'survival') {
        body = 'You have $' + remainingToday.toFixed(2) + ' left today. ' +
               'A $15 lunch leaves $' + Math.max(0, remainingToday - 15).toFixed(2) +
               ' for the rest of the day.';
      } else {
        body = '$' + remainingToday.toFixed(2) + ' remaining today. ' +
               'You\'ve spent $' + todaySpent.toFixed(2) + ' so far.';
      }
```

Three changes:
- Removed `const lunchBudget = isGfDay && isWeekend ? 30 : 20;` (dead)
- Added `const remainingToday` computed from real values
- Bodies use `remainingToday` not the hardcoded cap; survival mode
  no longer hardcodes "$15"
- Removed reference to "$15 today" / "$20-25" hardcoded numbers

### Verification

```
grep -n "lunchBudget" slyght-worker/src/index.js
```

Should return 0 matches (was 1).

```
grep -n "remainingToday" slyght-worker/src/index.js
```

Should return 4-5 matches (definition + uses in 3 branches).

---

## Step 6 — Validation

```
node guardian-static.js     # exit 0
node guardian-runtime.js    # 47/50 (3 known fixture-drift)
node tests/core.test.js     # 41/41
```

If any test newly fails on the `runOutDays` change (because old test
expected `i + 1` semantics), STOP and surface — that's the test
catching real behavior change. Don't auto-update the test; ask user
to confirm whether new behavior is correct.

If a guardian flags hardcoded $15 or $20 strings as "no-hardcoded-
budget" violations, that's a future-proofing rule firing. Add inline
guardian-allow comments if needed, OR leave as-is if the guardian is
catching them in code we just deleted.

---

## Step 7 — Deploy worker

The worker file change requires a separate deployment. After the
index.html change is committed, deploy the worker:

```
cd slyght-worker
npx wrangler deploy
cd ..
```

Surface output. Wrangler should report successful deployment of
slyght-worker.johndounas.workers.dev.

If wrangler fails (auth, missing config, etc.), STOP and surface.
The worker change is independent — index.html commit can ship
without it, but the lunch notification fix won't take effect.

---

## Step 8 — Commit

```
git add index.html slyght-worker/src/index.js
git status
git diff --cached --stat
git commit -m "fix(numbers): today-aware MAX PER DAY + survival forecast trust

Bundle 5 closes the trust gap between what the app shows and what
it actually computes. Three coupled fixes:

1. MAX PER DAY (getDynamicDailyBudget) now subtracts today's spend.
   Was: dailyAvailable. Now: Math.max(0, dailyAvailable - todaySpent).
   When user spends \$20, MAX drops by \$20 (not \$2). Resets at
   midnight because getTodaySpent() filters by today's date. Math.max
   floors at \$0 so display doesn't go negative.

2. Survival forecast '\$15/day' string replaced with f.minDailyNeeded
   (the actual computed value). Was: hardcoded literal. Now: derived
   from getMinDailySpend() which returns 20-40 based on user's
   30-day spending history. Two display branches updated; both now
   surface the derivation visibly.

3. Survival forecast for-loop indexes from i=1 instead of i=0; this
   eliminates the off-by-one between runOutDays and runOutDate. Was:
   loop i=0..days, runOutDays=i+1. Now: i=1..days, runOutDays=i.
   Date and day-count derive from the same i. Today=May 5 → 8 days
   means May 13 (consistent), not Tue May 12.

4. Lunch notification body (slyght-worker/src/index.js) uses actual
   remainingToday (= maxDay - todaySpent) instead of hardcoded
   \$20/\$30 lunch cap. Survival-mode branch dropped hardcoded \$15
   and \$20-25 references.

Verification:
- guardian-static: exit 0
- guardian-runtime: 47/50 (3 known fixture-drift)
- tests: 41/41

Phone-verify post-deploy: log a \$20 expense → MAX PER DAY drops by
~\$20, not ~\$2. Open Analysis → survival forecast shows correct
\$/day from getMinDailySpend, date and day-count agree."
git push origin main
```

---

## Step 9 — Phone-verify

Wait 5–10 min for GH Pages. Force-refresh PWA.

**MAX PER DAY today-aware test:**
1. Note current MAX PER DAY value on dashboard.
2. Tap + → log a $20 expense (Food/Coffee).
3. After commit, MAX PER DAY should drop by ~$20 (give or take a
   few cents from the daily-spread component).
4. Wait until tomorrow OR change device clock — MAX PER DAY should
   "reset" to a higher value (because todaySpent for the new day
   starts at 0).

**Survival forecast trust test:**
5. Open Analysis tab → scroll to Survival Forecast card.
6. Read the "$X/day" value in the headline.
7. Verify the $X matches `getMinDailySpend()` output. (For John
   right now, with realistic txn history, should be in the $20-30
   range.)
8. Read the runout date and day-count. Compute today + day-count;
   confirm it equals the displayed date. (e.g., May 7 + 6 days = May
   13. If display says "6 days (Wed 13 May)" — passes.)

**Lunch notification test (end-to-end, harder):**
9. Wait until next 12:30pm window when a lunch notification fires.
10. Read the body. Should reference actual remaining-today value,
    not "$20" or "$30".

For 9-10, alternative is to log a notification trigger manually via
worker test endpoint if available.

User reports PASS or FAIL.

---

## Failure modes

| Symptom | Action |
|---|---|
| MAX PER DAY drops INTO negative range | floor logic broken; verify Math.max(0, ...) is in place |
| MAX PER DAY value is now too low for normal usage | the cap minus spend may bottom out fast for tight budgets — discuss whether to also raise the dailyAvailable component |
| Survival forecast still shows "$15/day" | one branch wasn't replaced; grep for "$15/day" again |
| Runout date now off-by-one in opposite direction | loop change went too far; verify i starts at 1 not 2 |
| Worker deploy fails | check wrangler auth, surface error |
| Lunch notification still says "$20" | worker didn't redeploy — wrangler deploy step skipped or failed |

---

## What this prompt does NOT touch

- Plan persistence (Bundle 4)
- Settings tab nav (Bundle 4)
- Visual polish (Bundle 6 — separate prompt)
- Calendar paid-bill rendering (Bundle 7 candidate)
- Information architecture (Bundle 8 candidate)
- Round-up debugging (still pending diagnostic answers)

---

## Step 10 — Handoff block

After commit + push lands AND worker deploy succeeds, generate a
compact handoff block. Print inside fenced code with literal headers
`=== HANDOFF TO CLAUDE.AI ===` and `=== END HANDOFF ===`.

Include:
1. Commit hash + message subject
2. New HEAD hash, commits ahead of session start
3. Other commits between OLD_HEAD..NEW_HEAD
4. Files changed with line counts (index.html + slyght-worker/src/index.js)
5. Current file sizes (index.html, guardian-static.js)
6. Pre-commit verification numbers
7. Edit locations (line numbers post-edit) for each fix
8. Worker deploy status (✓ deployed / ✗ failed / pending)
9. OPEN-BUGS.md delta if any
10. Phone-verify result (PASS/FAIL/pending)

Format with the grep/sed commands run to derive each value.

---

## End of prompt
