# Claude Code Ship Prompt — Bundle 7.2 + 8 (Polish then Architecture)

> **READ FIRST.** Two commits this session, in sequence. Phone-verify
> gate BETWEEN them. If Bundle 7.2 verify fails, revert it and stop
> — do NOT proceed to Bundle 8.
>
> **Codebase reality:** the prompt author last grepped a pre-Bundle-4
> snapshot. All line numbers below are approximate. **Use content-
> search to find current locations.** Bundle 7's `_planEl` scroll
> capture/restore was reportedly added in 7 confirm handlers but
> author's snapshot doesn't show them — verify presence/absence with
> grep before doing Bundle 7.2 scroll work.
>
> **Source baseline:** HEAD `0c53954` (Bundle 7.1 — banner regression
> fixed, YouTube day:18, audit-first discipline established).
>
> **Discipline rules carried forward from Bundle 7.1's defensive prompt:**
> 1. Audit before edit — grep all reader/writer sites for any data
>    shape change BEFORE proposing the change.
> 2. Surface findings, don't auto-fix when ambiguity arises.
> 3. Architectural barriers added BEFORE data migration.
> 4. Migrations include localStorage backup.
> 5. Two commits = two phone-verify gates.

---

# COMMIT 1 — Bundle 7.2 (calendar visibility + NW removal + scroll)

Three fixes, all visible improvements, no destructive ops.

## Step 1.1 — Pre-flight

```
git status
git log --oneline -5
git pull origin main
```

HEAD `0c53954`. Working tree clean (discard regenerated artifacts
if needed: `audit/allow-list.json`, `runtime-report.json`).

## Step 1.2 — Calendar paid-cell visibility (Option A)

Apply CC's previously-drafted diff. Two changes:

**Change 1.2.a — CSS additions.** Find the existing `.cal-day.paid-only`
rule. Content-search:

```
grep -n "cal-day.paid-only\|cal-day-amt" index.html | head -5
```

Should return matches in the `<style>` block (likely around L142-154).

Find the existing line:
```css
.cal-day.paid-only{opacity:0.5}
```

**Replace with these 3 lines (one becomes multi-line replacement):**

```css
.cal-day.paid-only{opacity:0.78;background:rgba(255,255,255,0.02);border-color:rgba(255,255,255,0.08)}
.cal-day.paid-only .cal-day-num{color:var(--text2)}
.cal-day.paid-only .cal-day-paid-tick{font-size:8px;color:var(--green);margin-top:1px;line-height:1;font-family:var(--mono)}
```

The existing rule:
```css
.cal-day.paid-only .cal-day-amt{text-decoration:line-through;color:var(--text3)}
```
should already be present (from Bundle 2) — leave it as-is. It will
finally be used after the render change in 1.2.b.

**Change 1.2.b — Render logic.** Find the calendar day render code.
Content-search:

```
grep -n "cal-day-amt\|paidOnly\s*=" index.html | head -10
```

Locate the function that renders each calendar day cell (likely
`renderCalendar` around L5270-5294). Find this block:

```js
const unpaidBills = items.filter(it => it.type === 'bill' && !it.paid);
const paidOnly = items.length > 0 && items.every(it => it.paid);
const billCount = unpaidBills.length;
const itemTotal = unpaidBills.reduce((s, it) => s + (it.amt || 0), 0)
                  + items.filter(it => it.type === 'debt' && !it.paid).reduce((s, it) => s + (it.amt || 0), 0);
```

**Add after `itemTotal`:**

```js
// Bundle 7.2: paid-only cells render paid sum with strikethrough
// (CSS .cal-day.paid-only .cal-day-amt is already wired). Before
// this, paidOnly cells had empty amtStr and looked invisible.
const paidTotal = paidOnly
  ? items.filter(it => it.type === 'bill' && it.paid).reduce((s, it) => s + (it.amt || 0), 0)
  : 0;
```

Find the `dotColor` assignment lower in the same function:

```js
const dotColor = isPayday && items.length ? 'var(--amber)' :
                 isPayday ? 'var(--green)' :
                 hasDebt ? 'var(--red)' :
                 billCount > 1 ? 'var(--amber)' :
                 billCount === 1 ? 'var(--red)' :
                 'transparent';
```

**Add a paidOnly branch before transparent:**

```js
const dotColor = isPayday && items.length ? 'var(--amber)' :
                 isPayday ? 'var(--green)' :
                 hasDebt ? 'var(--red)' :
                 billCount > 1 ? 'var(--amber)' :
                 billCount === 1 ? 'var(--red)' :
                 paidOnly ? 'var(--text3)' : 'transparent';
```

Find the `amtStr` assignment:

```js
const amtStr = itemTotal > 0 ? '$' + Math.round(itemTotal) : '';
```

**Replace with:**

```js
// Bundle 7.2: show paid sum when there are no unpaid amounts so the
// user sees what auto-debited rather than an empty cell.
const amtStr = itemTotal > 0 ? '$' + Math.round(itemTotal) :
               paidTotal > 0 ? '$' + Math.round(paidTotal) : '';
```

Find the HTML assembly:

```js
html += '<div class="'+cls+'" onclick="'+clickFn+'">' +
  '<div class="cal-day-num">'+d+'</div>' +
  (items.length || isPayday ? '<div class="'+dotCls+'" style="background:'+dotColor+'"></div>' : '') +
  (amtStr ? '<div class="cal-day-amt">'+amtStr+'</div>' : '') +
  '</div>';
```

**Add the ✓ tick line before the closing `'</div>'`:**

```js
html += '<div class="'+cls+'" onclick="'+clickFn+'">' +
  '<div class="cal-day-num">'+d+'</div>' +
  (items.length || isPayday ? '<div class="'+dotCls+'" style="background:'+dotColor+'"></div>' : '') +
  (amtStr ? '<div class="cal-day-amt">'+amtStr+'</div>' : '') +
  (paidOnly ? '<div class="cal-day-paid-tick">✓</div>' : '') +
  '</div>';
```

### Verification

```
grep -n "cal-day-paid-tick" index.html
```

Should return 2 (CSS rule + render usage).

```
grep -n "paidTotal" index.html
```

Should return 2-3 (definition + usages in dotColor and amtStr).

## Step 1.3 — Remove the "Net worth up" notification

The notification compares against a hardcoded liability constant
(`28584.70`) that's stale. User has decided to remove the notification
entirely — semantics never matched expectation.

**Find** both `28584.70` references:

```
grep -n "28584.70\|28584" index.html
```

Should return 2 matches. CRITICAL — read both before editing:

**Site 1 (NW notification ~L8368):** Block looks like:

```js
    // INFO: net worth up
    const history=S.monthlyHistory||[];
    if (history.length>=1) {
      const prev=history[history.length-1]; const prevNW=(prev.bal||0)-28584.70;
      const nw=getNetWorth();
      if (nw.net>prevNW+100) add('info','Net worth up '+fmt(nw.net-prevNW)+' this month — keep going',null);
    }
```

**REMOVE this entire block.** Replace with a single comment line:

```js
    // Bundle 7.2: "Net worth up" notification removed — semantics
    // (month-over-month comparison against hardcoded liability constant)
    // never matched user expectation, and the constant was stale.
```

**Site 2 (SLYGHT Score ~L9221):** Block looks like:

```js
    let nwScore = 100;
    if (history.length>=1) {
      const prev=history[history.length-1]; const prevNW=(prev.bal||0)-28584.70;
      nwScore = nw.net>prevNW ? Math.min(200,100+Math.round(((nw.net-prevNW)/income)*200)) : Math.max(0,100-Math.round(((prevNW-nw.net)/income)*100));
    }
```

This is DIFFERENT — it's not a notification, it's a score component
used in the SLYGHT Score (visible on dashboard). Removing it would
zero out the nwScore. **Replace the hardcoded constant with computed
liabilities:**

```js
    let nwScore = 100;
    if (history.length>=1) {
      const prev=history[history.length-1];
      // Bundle 7.2: replace hardcoded liability constant with computed
      // sum of all unpaid non-viaRent debts. Previously used 28584.70
      // which was stale and would drift further as debts change.
      const computedLiabs = (S.debts||[])
        .filter(d => !d.paid && !d.viaRent)
        .reduce((s,d) => s + (d.amt||0), 0);
      const prevNW = (prev.bal||0) - computedLiabs;
      nwScore = nw.net>prevNW ? Math.min(200,100+Math.round(((nw.net-prevNW)/income)*200)) : Math.max(0,100-Math.round(((prevNW-nw.net)/income)*100));
    }
```

### Verification

```
grep -n "28584" index.html
```

Should return 0 matches.

```
grep -n "Net worth up" index.html
```

Should return 0 (notification removed). Verify the kill is complete
— if any other notification fires the same string, that's a different
path needing investigation.

```
grep -n "Bundle 7.2:" index.html
```

Should return 3+ matches (calendar comments + NW removal comments).

### Audit downstream

```
grep -n "info_Net_worth_up\|info_Net_worth\|Net_worth_up\|net_worth_up" index.html
```

If there are any remaining references (dismissed-notifications list,
filter logic etc), surface to user before proceeding. Those references
become dead code after this commit but won't break anything.

## Step 1.4 — Plan mode scroll restoration

**First — verify what Bundle 7 actually shipped.** Content-search:

```
grep -n "scrollTop\b" index.html
grep -n "_planEl\|plan-scroll\|plan-mode.*scroll" index.html
grep -n "Bundle 7: preserve scroll" index.html
```

**Surface findings.** Three possible states:

- **State X:** Bundle 7's scroll code is present in 7 places using
  `requestAnimationFrame` single-pass. The bug is timing — rAF fires
  before render completes. **Fix: change all 7 to use double-rAF or
  setTimeout(0).**

- **State Y:** No scroll code is present (Bundle 7's handoff didn't
  match what shipped). **Fix: add scroll capture/restore to 7 confirm
  handlers from scratch using double-rAF.**

- **State Z:** Scroll code is present in some confirm handlers but
  not others, or uses a different pattern. **Fix: harmonize all 7 to
  the same double-rAF pattern.**

The seven confirm handlers to verify:
- `confirmTripSavings`
- `confirmGoalSavings`
- `confirmEditTrip`
- `confirmEditGoal`
- `confirmNewTrip`
- `confirmNewGoal`
- `confirmDeleteGoal`

For each handler, the pattern should be:

```js
function confirmXxxYyy(...) {
  // ... existing logic that mutates state ...

  // Bundle 7.2: double-rAF restores scroll AFTER render completes.
  // Single rAF fires before renderPlanMode's DOM rebuild finishes,
  // leading to partial scroll restoration.
  const _planEl = document.getElementById('plan-mode');
  const _scrollY = _planEl?.scrollTop || 0;
  PLAN_MODAL.close();
  renderPlanMode();
  if (_planEl) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { _planEl.scrollTop = _scrollY; });
    });
  }
}
```

**Surface the audit results before editing.** Don't proceed to edits
until State X/Y/Z is confirmed.

### Verification

```
grep -c "Bundle 7.2: double-rAF" index.html
```

Should return 7 (one per confirm handler).

## Step 1.5 — Validation + Commit 1

```
node guardian-static.js     # exit 0
node guardian-runtime.js    # 47/50 (known fixture-drift)
node tests/core.test.js     # 41/41
```

If tests reference `'Net worth up'` notifications anywhere, they may
now fail because that notification is gone. Surface — do NOT auto-
update tests. Discussion with user on whether the test was checking
"notification fires" (now wrong assertion) or "notification doesn't
spam" (still relevant via dedupe code that we KEEP).

**Commit:**

```
git add index.html
git status
git diff --cached --stat
git commit -m "fix(7.2): calendar visibility + remove NW-up notification + plan scroll

Three small wins ahead of Bundle 8's architectural work:

1. Calendar paid-cell visibility (Option A):
   - Paid bills now show amount with strikethrough + ✓ badge
   - Dot color muted (var(--text3)) instead of transparent
   - Background tint + border so cell shape reads
   - CSS-only behavioral change; renderCalendar adds paidTotal
     and ✓ glyph emission
   Before: auto-debit bills rendered as faded cells with no amount
   After: visible history of paid bills throughout the calendar

2. Removed 'Net worth up \$X this month' notification:
   - Semantics never matched user expectation (month-over-month NW
     change, not per-txn). Hardcoded liability constant 28584.70
     was stale.
   - Notification firing logic removed entirely.
   - In SLYGHT Score nwScore: hardcoded 28584.70 replaced with
     computed sum of unpaid non-viaRent debts. Score still works,
     no longer drifts as real debts change.

3. Plan mode scroll restoration upgraded to double-rAF:
   - Bundle 7's single-rAF fired before renderPlanMode finished its
     DOM rebuild, leading to partial scroll restoration.
   - Double-rAF waits for the rebuild's first paint, then restores.
   - Applied to all 7 confirm handlers consistently.

Verification: guardian-static exit 0, runtime 47/50, tests 41/41."
git push origin main
```

## Step 1.6 — Phone-verify Bundle 7.2 (GATE)

Wait 5-10 min for GH Pages. Force-refresh PWA.

| # | Test | PASS criteria | Must pass? |
|---|------|---|---|
| 7.2.A | May 18 calendar — YouTube Premium visible | Cell shows with amount + strikethrough + ✓ if auto-debit flagged paid | YES |
| 7.2.B | May 26 calendar — Spotify visible | Same as above | YES |
| 7.2.C | Past months — paid cells still visible | April calendar shows paid bills with strikethrough + ✓ | nice |
| 7.2.D | No "Net worth up" notification fires after a $100 txn | Notif bell count does NOT increase from a previously-firing path | YES |
| 7.2.E | Plan mode scroll stays put | Scroll down, tap "+ Add Savings", $5, confirm. Scroll position should be the SAME spot, not partial-drop | YES |

**A, B, D, E must pass.** If any fail:
```
git revert HEAD --no-edit && git push origin main
```
STOP. Do NOT proceed to Bundle 8.

If all pass → proceed to Bundle 8.

---

# COMMIT 2 — Bundle 8 (architectural barrier + storage consolidation)

Only run this commit if Bundle 7.2 phone-verify passed.

This is the work that prevents the next regression of the three-store
drift class. Two halves: barrier helper + data migration.

## Step 2.1 — Pre-flight

```
git status
git log --oneline -3
git pull origin main
```

HEAD should be the Bundle 7.2 commit just pushed. Working tree clean.

## Step 2.2 — Establish setBucketSaved as the canonical writer

**Audit current direct writes first:**

```
grep -n "savingsBuckets\[.*\]\.saved\s*=" index.html
grep -n "\.saved\s*=\s*parseFloat\|bucket\.saved\s*=\|chinaHol\.saved\s*=" index.html
grep -n "writeSavedToSource" index.html
```

**Surface all findings to user.** Expect ~4-6 sites:
- `writeSavedToSource` in PLAN (Bundle 4's helper)
- Round-up code (`chinaHol.saved = ...`)
- `saveBucketModal` (manual bucket edit)
- "+ Add funds" buttons (2 sites)

Confirm with user before proceeding.

**Add the new helper.** Find a good location near `writeSavedToSource`
(in PLAN object) or at top-level near `save()`. Add:

```js
// Bundle 8: Canonical writer for savings bucket totals. Direct
// `S.savingsBuckets[i].saved = X` writes are forbidden by the
// new no-direct-bucket-saved-write guardian rule. All mutations
// route through here so:
//   1. The change appends to the audit log
//   2. State-shape invariants get a chance to run
//   3. Future contributors can't introduce drift via direct mutation
//
// source: 'roundup' | 'plan-add' | 'plan-edit' | 'manual' |
//   'reconcile' | 'migration' | 'undo'
function setBucketSaved(bucketName, newValue, source) {
  if (!S.savingsBuckets) S.savingsBuckets = [];
  const bucket = S.savingsBuckets.find(b => b.name === bucketName);
  if (!bucket) {
    console.warn('[setBucketSaved] no bucket named', bucketName);
    return false;
  }
  const oldValue = bucket.saved || 0;
  const safeNew = parseFloat(Number(newValue).toFixed(2));
  if (isNaN(safeNew)) {
    console.warn('[setBucketSaved] invalid value', newValue);
    return false;
  }
  // guardian-allow: no-direct-bucket-saved-write — this IS the canonical writer; all other call sites must route through this function (permanent — barrier helper definition)
  bucket.saved = safeNew;
  // Append to audit log if helper exists
  try {
    if (typeof appendAuditLog === 'function') {
      appendAuditLog({
        type: 'bucket_saved_change',
        bucket: bucketName,
        oldValue, newValue: safeNew,
        delta: parseFloat((safeNew - oldValue).toFixed(2)),
        source: source || 'unknown',
        ts: Date.now()
      });
    }
  } catch(e) {}
  save();
  return true;
}
```

**Check if `appendAuditLog` exists:**

```
grep -n "function appendAuditLog\|appendAuditLog\s*=" index.html
```

If not, add a minimal version near `setBucketSaved`:

```js
function appendAuditLog(entry) {
  if (!S._auditLog) S._auditLog = [];
  S._auditLog.push(entry);
  // Cap at 500 entries to prevent unbounded growth
  if (S._auditLog.length > 500) S._auditLog = S._auditLog.slice(-500);
}
```

## Step 2.3 — Migrate each direct write to use setBucketSaved

From the audit in 2.2, surface each migration to user before applying.
Format:

```
Site X: <function> at L<line>
  Before: chinaHol.saved = parseFloat(((chinaHol.saved||0) + roundUp).toFixed(2));
  After:  setBucketSaved(chinaHol.name, (chinaHol.saved||0) + roundUp, 'roundup');
  Source tag: 'roundup' | 'plan-add' | 'plan-edit' | 'manual' | 'reconcile'
```

User reviews list, gives go-ahead, then apply.

**Special case — `writeSavedToSource`:** This is Bundle 4's internal
PLAN helper. It SHOULD route through `setBucketSaved` going forward.
Its caller signature `(item, savedValue)` stays the same; the body
changes from `bucket.saved = parseFloat(savedValue.toFixed(2))` to
`setBucketSaved(bucket.name, savedValue, 'plan-add')`.

## Step 2.4 — Add guardian rule for no-direct-bucket-saved-write

**Find** the guardian rules section in `guardian-static.js`:

```
grep -n "no-direct-paidbills-access" guardian-static.js
```

**Add a parallel rule.** Surface proposed structure to user first
since author hasn't read current guardian-static.js shape. Approximate:

```js
{
  name: 'no-direct-bucket-saved-write',
  anchor: 'arch-barrier-bundle-8',
  tier: 'fail',
  description: 'Direct bucket.saved mutation forbidden — route through setBucketSaved()',
  pattern: /(savingsBuckets\[[^\]]+\]\.saved\s*=|(?<!function )bucket\.saved\s*=(?!\s*safeNew))/,
  // allow inline guardian-allow comments
}
```

After the rule is in place, run guardian-static:
```
node guardian-static.js
```

Expected: any unmigrated sites trip the rule (FAIL). Migrated sites
either use `setBucketSaved()` or have inline `guardian-allow:` for
specific reasons.

If migrated sites still trip the regex, surface and refine the
pattern. Don't ship a rule with false positives.

## Step 2.5 — Backup localStorage before destructive ops

Before deleting `slyght_trips` and `slyght_goals`, write a backup.
Find where the migrations live (after Bundle 7.1's
`_youtubeDayMigrationV1`):

```
grep -n "_youtubeDayMigrationV1\|_paidBillsKeyMigrationV1" index.html
```

**Add a backup block BEFORE any migration that deletes data:**

```js
// Bundle 8: backup pre-migration localStorage to single recovery key
// in case the consolidation breaks state on phone-verify. Recovery:
// `localStorage.setItem('slyght_trips', JSON.parse(localStorage.getItem('_backup_bundle8')).slyght_trips)`
// then refresh. Backup auto-cleared on next-load-after-day-7 by a
// future tidy bundle.
if (!S._bundle8BackupTs) {
  try {
    const backup = {
      slyght_trips: localStorage.getItem('slyght_trips'),
      slyght_goals: localStorage.getItem('slyght_goals'),
      slyght_v5_snapshot: localStorage.getItem('slyght_v5'),
      ts: Date.now(),
      version: 'bundle8-v1'
    };
    localStorage.setItem('_backup_bundle8', JSON.stringify(backup));
    S._bundle8BackupTs = Date.now();
    save();
  } catch(e) {
    console.error('[Bundle 8] backup failed — aborting migration', e);
    // Don't proceed without backup — set a flag the migration checks
    S._bundle8BackupFailed = true;
  }
}
```

## Step 2.6 — Migrate slyght_trips and slyght_goals into S

After the backup block, the migration:

```js
if (!S._bundle8MigrationV1 && !S._bundle8BackupFailed) {
  try {
    const trips = JSON.parse(localStorage.getItem('slyght_trips') || '[]');
    const goals = JSON.parse(localStorage.getItem('slyght_goals') || '[]');

    // Strip 'saved' field — it's now derived from S.savingsBuckets
    // via PLAN.readSavedFromSource. Storing it would just be drift waiting
    // to happen.
    S.tripDefs = trips.map(t => {
      const { saved, ...rest } = t;
      return rest;
    });
    S.goalDefs = goals.map(g => {
      const { saved, ...rest } = g;
      return rest;
    });

    // Delete old localStorage keys ONLY after S has the new data
    localStorage.removeItem('slyght_trips');
    localStorage.removeItem('slyght_goals');

    S._bundle8MigrationV1 = true;
    appendAuditLog({
      type: 'bundle8_migration',
      tripDefs: S.tripDefs.length,
      goalDefs: S.goalDefs.length,
      backup: '_backup_bundle8',
      ts: Date.now()
    });
    save();
  } catch(e) {
    console.error('[Bundle 8] migration failed', e);
    // Don't set the flag — migration will retry next load
  }
}
```

## Step 2.7 — Update PLAN.getTrips and PLAN.getGoals to read from S

Find them:

```
grep -n "getTrips()\s*{\|getGoals()\s*{" index.html
```

Each currently reads from `localStorage.getItem('slyght_trips')` /
`'slyght_goals'`. **Update to read from `S.tripDefs` / `S.goalDefs`.**

Approximate shape for `getTrips`:

```js
getTrips() {
  // Bundle 8: read from S.tripDefs (canonical) instead of slyght_trips
  // localStorage. Saved values still derive from S.savingsBuckets via
  // readSavedFromSource (Bundle 4 source-of-truth flip preserved).
  const stored = (S && S.tripDefs) || [];
  const defaults = [
    // ...existing defaults: darwin-2026, china-2026 etc...
  ];
  const merged = defaults.map(def => {
    const stored_trip = stored.find(t => t.id === def.id);
    return stored_trip ? { ...def, ...stored_trip } : def;
  }).concat(stored.filter(t => !defaults.find(d => d.id === t.id)));
  return merged.map(t => {
    const canonical = this.readSavedFromSource(t, 0);
    return { ...t, saved: canonical };
  });
},
```

**Same shape for getGoals.** Surface proposed changes before editing.

**Also update writers** — `PLAN.saveTrip`, `PLAN.saveGoal`, and the
confirm-new/edit handlers:

```
grep -n "PLAN.saveTrip\|PLAN.saveGoal\|saveTrip(\|saveGoal(" index.html
```

For each writer that currently does `localStorage.setItem('slyght_trips', ...)`,
change to `S.tripDefs = ...; save();` (and same for goals).

## Step 2.8 — Validation + Commit 2

```
node guardian-static.js
```

If new bucket-write rule trips on unmigrated sites, fix them. If
trips on sites with allow comments, refine the regex.

```
node guardian-runtime.js
node tests/core.test.js
```

If tests reference `localStorage.getItem('slyght_trips')` they'll
now fail because keys are gone. Surface — discussion needed on
whether tests should mock or migrate to S.tripDefs.

**Commit:**

```
git add index.html guardian-static.js
git status
git diff --cached --stat
git commit -m "arch(8): consolidate trips/goals into S, add bucket-write barrier

Architectural cleanup that prevents the next three-store drift bug:

setBucketSaved(name, value, source):
- New canonical writer for S.savingsBuckets[i].saved
- N existing direct writes migrated through this helper: <list>
- Source tags (roundup/plan-add/plan-edit/manual/reconcile/migration)
  let audit log explain WHERE a change came from

no-direct-bucket-saved-write guardian rule:
- Static check fails on any direct \`bucket.saved =\` outside
  setBucketSaved or guardian-allow comments
- Future regressions of the bucket-drift class are caught at
  validation time, not phone-verify time

slyght_trips and slyght_goals consolidation:
- Migrated into S.tripDefs and S.goalDefs (inside slyght_v5)
- 'saved' field stripped — derived from S.savingsBuckets
- Old localStorage keys deleted after backup to _backup_bundle8
- localStorage drops from 23 keys to 21
- Three-store drift on China holiday ($70/\$74/\$76 across stores)
  is now structurally impossible

appendAuditLog helper:
- Records bucket changes with source attribution + timestamps
- Capped at 500 entries to prevent unbounded growth

Recovery procedure if state breaks:
  console: localStorage.setItem('slyght_trips', JSON.parse(localStorage.getItem('_backup_bundle8')).slyght_trips)
  same for slyght_goals
  then refresh + git revert HEAD

Verification: guardian-static exit 0 (with new rule), runtime 47/50,
tests <count>/<count>."
git push origin main
```

## Step 2.9 — Phone-verify Bundle 8 (FINAL GATE)

Wait for GH Pages, force-refresh PWA.

| # | Test | PASS criteria | Must pass? |
|---|------|---|---|
| 8.A | Plan mode trip cards render correctly | Darwin and China visible with saved values from buckets | YES |
| 8.B | Plan mode goal cards render correctly | Property Deposit, Freedom Buffer, China goal visible | YES |
| 8.C | "+ Add savings" on a trip works | $5 → bucket updates → dashboard reflects → plan card reflects | YES |
| 8.D | "+ Add savings" on a goal works | Same as 8.C | YES |
| 8.E | localStorage check via bookmarklet | slyght_trips and slyght_goals NOT in localStorage | YES |
| 8.F | _backup_bundle8 exists | Recovery key present in localStorage | YES |
| 8.G | Round-ups still increment China bucket | Log a $3.50 expense → bucket gains $0.50, dashboard reflects | YES |
| 8.H | Settings bucket edit still works | Manual edit on a bucket persists | nice |

If any of 8.A-8.G fail, surface to user with recovery procedure. The
backup at `_backup_bundle8` lets us restore the old state. Steps:

```js
// In DevTools console on slyght page:
const b = JSON.parse(localStorage.getItem('_backup_bundle8'));
localStorage.setItem('slyght_trips', b.slyght_trips);
localStorage.setItem('slyght_goals', b.slyght_goals);
// Then refresh + git revert HEAD --no-edit && git push origin main
```

---

# FINAL HANDOFF

Generate compact handoff covering BOTH commits:

```
=== HANDOFF TO CLAUDE.AI ===

[1] COMMITS SHIPPED
    <hash1> — fix(7.2): calendar visibility + remove NW-up notification + plan scroll
    <hash2> — arch(8): consolidate trips/goals into S, add bucket-write barrier

[2] HEAD MOVEMENT
    Old HEAD: 0c53954
    Bundle 7.2 HEAD: <hash1>
    Bundle 8 HEAD: <hash2>

[3] FILES CHANGED
    Bundle 7.2: index.html <stats>
    Bundle 8: index.html <stats>, guardian-static.js <stats>

[4] VERIFICATION (after Bundle 8)
    guardian-static: <result>
    guardian-runtime: <count>/<total>
    tests: <count>/<total>

[5] AUDIT FINDINGS FROM STEP 2.2
    <list direct bucket.saved writes that were migrated>

[6] PHONE-VERIFY STATUS
    7.2.A: <PASS/FAIL>
    7.2.B: <PASS/FAIL>
    7.2.D: <PASS/FAIL>
    7.2.E: <PASS/FAIL>
    8.A through 8.G: <PASS/FAIL each>

[7] OPEN-BUGS DELTA
    #14 — NW notification: removed entirely (close as won't-fix)
    Bundle 8's barrier: new resolved-state entry

[8] BACKUP LOCATION
    localStorage._backup_bundle8 — preserved for 7 days

=== END HANDOFF ===
```

---

## End of prompt
