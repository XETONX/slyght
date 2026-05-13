# Claude Code Ship Prompt — Bundle 7.1 + 8 (Defensive Cleanup + Architectural Barriers)

> **READ THIS FIRST. THIS PROMPT IS DIFFERENT.**
>
> Prior bundles assumed the codebase had reasonable architecture and
> prescribed surgical edits. The Bundle 7 banner regression proved
> that assumption wrong: the prompt told you to add a new value
> shape to `S.paidBills`, you did, and it tripped a separate
> invariant at L2613 (`state-shape-paidbills`) that I didn't think
> to update. The fix worked in isolation; it broke a neighbour I
> never grepped for.
>
> **The codebase is the worst codebase you have ever worked with.**
> Treat every assumption as wrong until you've grepped to confirm.
> Treat every "value shape" as having 5+ unaudited readers. Treat
> every `save()` call as potentially being one of three save() defs.
> Treat every "single source of truth" as actually being three
> stores that drift. This is empirically what's there.
>
> **This prompt's discipline:**
>
> 1. Every step that changes a data shape includes a mandatory
>    "Audit downstream" sub-step that runs grep across the whole
>    file, lists EVERY site that reads or writes the changed shape,
>    and forces you to enumerate findings before proceeding.
>
> 2. When the audit surfaces sites I didn't predict, **STOP and
>    surface to user**. Do not auto-fix. The whole point is that I
>    don't know what's there — you grep, you find, we discuss, then
>    you fix.
>
> 3. Architectural barriers (helper functions that become the ONLY
>    legal write path) are added BEFORE the data migration. The
>    migration uses the new helpers exclusively. Future contributors
>    who try to bypass hit a guardian rule.
>
> 4. Migrations include a one-time backup to a `_backup_<bundle>`
>    localStorage key. If anything catastrophic happens, the user
>    can recover. Backup is deleted after 7 days by next-load
>    cleanup (out of scope this bundle, just create the backup).
>
> 5. **Phone-verify is gated on EVERY half:** 7.1's hotfix tests
>    must pass before 8's migration runs in production. If 7.1
>    works but 8 fails, we revert only 8 and 7.1 stays.
>
> **Source baseline:** Post-Bundle-7 source @ HEAD `b28c631`,
> index.html ~12,373 lines. Bundle 7's auto-debit shape change is
> already shipped — `S.paidBills[k]` can now be `true` (legacy)
> OR `{paid: true, _scheduledAutoDebit: true, ts: number}` (new).
> Two helpers exist: `isPaidBillKeyTruthy(key)` and
> `isPaidBillAutoDebit(key)`.
>
> **Scope:** Two halves shipped as TWO commits in sequence (not
> one). 7.1 first, phone-verify, then 8. ~400 lines total diff.
>
> **YouTube date fact-check:** YouTube Premium charges on the 18th
> of the month, not the 20th. BILLS array currently has day:20.
> This needs updating in Bundle 7.1 alongside the regression fix.

---

# PART A — Bundle 7.1 (Hotfix the Bundle 7 regression)

Goal: red "Math reconciliation failed" banner gone. Calendar shows
auto-debit bills correctly. YouTube day fixed. NW notif investigated.

## Step A.1 — Pre-flight

```
git status
git log --oneline -5
git pull origin main
```

HEAD `b28c631`. Working tree clean. Surface anything unexpected.

## Step A.2 — MANDATORY: Audit ALL paidBills value-shape access

**Run these greps and PASTE THE OUTPUT in full into your reply
before doing any edits:**

```bash
echo "=== A. All paidBills[*] === true patterns (legacy strict-eq) ==="
grep -n "paidBills\[.*\] === true" index.html

echo ""
echo "=== B. All paidBills[*] !== true patterns ==="
grep -n "paidBills\[.*\] !== true" index.html

echo ""
echo "=== C. All paidBills[*] = true assignments (writes) ==="
grep -n "paidBills\[.*\]\s*=\s*true" index.html

echo ""
echo "=== D. All paidBills[*] = {...} assignments (structured writes) ==="
grep -n "paidBills\[.*\]\s*=\s*{" index.html

echo ""
echo "=== E. All delete S.paidBills[*] patterns ==="
grep -n "delete S.paidBills\[" index.html

echo ""
echo "=== F. All if (S.paidBills[*]) truthy-coerce patterns ==="
grep -n "if\s*(\s*S\.paidBills\[" index.html

echo ""
echo "=== G. Object.keys / Object.entries on paidBills ==="
grep -n "Object\.\(keys\|entries\|values\)\s*(\s*S\.paidBills\|Object\.\(keys\|entries\|values\)\s*(\s*paidBills" index.html

echo ""
echo "=== H. JSON.stringify on paidBills ==="
grep -n "JSON\.stringify.*paidBills\|paidBills.*JSON" index.html
```

**STOP HERE. Paste all output. Wait for user to confirm understanding
of the audit before moving to A.3.** Do not proceed to A.3 until
user has reviewed.

This is the discipline: I (the prompt author) cannot know without
seeing the actual current state which sites are present. The audit
output IS the foundation for the rest of A.

## Step A.3 — Update every reader to handle both shapes

Based on the audit output from A.2, for each site in groups A, B,
F that reads paidBills with strict equality:

- If the function is OUTSIDE the helper layer (i.e., not
  `isPaidBillKeyTruthy` or `isPaidBillAutoDebit`), replace
  `S.paidBills[key] === true` with `isPaidBillKeyTruthy(key)`.
- If the function is the `state-shape-paidbills` invariant
  (around L2613-2628), this is special: see A.4.

**Surface every site to user with proposed change BEFORE applying.**
Format your surface as:

```
Site 1: <function name> at L<line>
  Before: S.paidBills[key] === true
  After:  isPaidBillKeyTruthy(key)
  Reason: <why safe>

Site 2: ...
```

User reviews list, gives go/no-go on each, then you apply.

## Step A.4 — Update state-shape-paidbills invariant to accept new shape

This is the invariant currently firing the red banner. Find it via:

```
grep -n "name: 'state-shape-paidbills'" index.html
```

Read the full check function. Currently asserts `S.paidBills[k] !== true`
returns the corruption result. **Replace the strict check with a
shape-tolerant check that accepts both legacy and structured
entries.**

New check should reject ANY entry that is:
- not exactly `true`, AND
- not an object with `paid: true` (with optional
  `_scheduledAutoDebit: true` and `ts: number`)

```js
// Bundle 7.1: paidBills entries can be `true` (legacy) or
// {paid: true, _scheduledAutoDebit?: bool, ts?: number} (structured).
// Reject anything that doesn't match either shape.
const v = S.paidBills[k];
const isLegacy = v === true;
const isStructured = v && typeof v === 'object' && v.paid === true;
if (!isLegacy && !isStructured) {
  return { displayValue: 'paidBills["' + k + '"] = ' + JSON.stringify(v),
    expected: 'true OR {paid:true, _scheduledAutoDebit?, ts?}',
    details: 'paidBills entry has unexpected shape' };
}
```

Add inline `// guardian-allow:` comments as in Bundle 7 where the
invariant reads `S.paidBills[k]` directly — required because the
invariant is the shape-validator and CANNOT delegate to
`isPaidBillKeyTruthy` (which assumes the shape is already valid).

After this change, the red banner should clear because all
existing structured entries pass the new shape check.

### Verification

```
grep -n "Bundle 7.1: paidBills entries can be" index.html
```

Should return 1.

## Step A.5 — Calendar visibility for paid/auto-debit bills

The user's report: paid bills disappear from the May/June calendar
because:
1. `buildCalendarEntries` at ~L2348 uses `=== true` (Step A.3 fixed)
2. Even after fix, paid cells render with NO amount text (Bundle 2's
   "paid-only opacity" CSS strips the amount)

User wants Option A: cell shows bill name + amount with strikethrough
on amount + small ✓ badge.

**Audit:** Find how the calendar renders a paid cell. Content-search:

```
grep -n "cal-day.paid\|paid-only\|cal-day-amt" index.html | head -10
```

Surface findings. Most likely there's a CSS rule like
`.cal-day.paid-only .cal-day-amt { display: none; }` or similar.

**Fix:** Restore amount visibility on paid cells with:
- Amount text shown but with `text-decoration: line-through`
- Color shifted to muted (e.g., `var(--text3)` instead of red/amber)
- Small ✓ badge added (single emoji or SVG)

The exact CSS path depends on what you find in the audit. Surface
proposed change to user before applying.

If the existing structure makes this hard (e.g., the cell template
doesn't easily accommodate a badge), surface the constraint and
propose either (a) restructure the cell template, or (b) settle for
strikethrough + muted color without badge as a smaller fix.

## Step A.6 — YouTube Premium day correction (18, not 20)

Find the BILLS array entry. Content-search:

```
grep -n "YouTube Premium" index.html
```

The match in BILLS array (likely L1204) has `day:20`. **Change to `day:18`.**

**Audit downstream:** After changing the day, any existing
`paidBills` entries with key like `2026-5-YouTube Premium-20` are now
ORPHANED (the day part of the key no longer matches the bill's
canonical day). They will:
- Continue to satisfy MI-13 if they have the auto-debit flag (filtered out)
- Continue to satisfy MI-13 if they're in the past (key day < today)
- POTENTIALLY fire as ghost entries that don't match any current bill

**Migration:** When app loads, run a one-time cleanup that detects
keys for "YouTube Premium-20" and rewrites them as "YouTube Premium-18".

Add this migration block near the existing migration code (find
`_paidBillsKeyMigrationV1` for the pattern):

```js
// Bundle 7.1: YouTube Premium day correction migration. The bill
// was incorrectly stored as day 20 in BILLS array; actual debit
// is day 18. Existing paidBills entries with day-20 suffix get
// rewritten to day-18 to maintain continuity.
if (!S._youtubeDayMigrationV1) {
  if (S.paidBills) {
    Object.keys(S.paidBills).forEach(oldKey => {
      // guardian-allow: no-direct-paidbills-access — migration sweep over Object.keys(); each oldKey is a structurally-valid key from existing storage (permanent — one-time migration)
      const m = oldKey.match(/^(\d{4}-\d{1,2})-YouTube Premium-20$/);
      if (m) {
        const newKey = m[1] + '-YouTube Premium-18';
        // guardian-allow: no-direct-paidbills-access — see above (permanent — migration write)
        S.paidBills[newKey] = S.paidBills[oldKey];
        // guardian-allow: no-direct-paidbills-access — migration delete (permanent — one-time migration)
        delete S.paidBills[oldKey];
      }
    });
  }
  S._youtubeDayMigrationV1 = true;
  save();
}
```

### Verification

```
grep -n "_youtubeDayMigrationV1" index.html
```

Should return 2 (the if-check + the assignment).

```
grep -n "YouTube Premium.*day:18\|day:18.*YouTube" index.html
```

Should return 1 (the BILLS array).

## Step A.7 — Investigate NW notification miss on $100 txn

User logged a $100 txn and NW notification did not fire. Bundle 7's
dedupe uses 3 rules:
- Skip if last NW notif < 2h
- Skip if delta < $50
- Skip if last txn was a correction

**Audit:** Find Bundle 7's NW notif dedupe code:

```
grep -n "Bundle 7: dedupe NW notifications\|networth_up\|info_Net_worth_up" index.html | head -10
```

Read the surrounding code. Question to answer:

1. What is the "delta" actually measured against? Last-known NW vs
   current NW? Or txn amount?
2. If a $100 expense txn fires this code, what's the computed
   delta? Could be < $50 if NW changed by less than the txn amount
   (e.g., if a debt-repayment txn moves liability AND asset,
   net NW change is 0).
3. Is there a code path where NW notifications fire WITHOUT going
   through the dedupe? (Search for any other place that pushes
   `info_Net_worth_up*` notifications.)

**Surface findings to user.** Don't auto-fix. The fix depends on
what the actual cause is. Possible outcomes:
- (a) Delta calc is correct but $100 expense legitimately produces
  small NW change → dedupe is working as designed, user expectation
  was wrong, just clarify
- (b) Delta calc is buggy → fix the calc
- (c) Notification path bypasses dedupe → consolidate

## Step A.8 — Validation + Commit Part A

```
node guardian-static.js     # exit 0 (28 WARN, 0 FAIL)
node guardian-runtime.js    # 47/50 (3 known fixture-drift)
node tests/core.test.js     # 41/41
```

If any test fails because tests still assert `paidBills[key] === true`
strictly, surface first — do NOT auto-update tests. Discuss with
user whether to update test fixture or test assertion.

**Commit Part A** with message:

```
fix(7.1): hotfix Bundle 7 regression + YouTube day + audit downstream

- state-shape-paidbills invariant accepts both legacy and structured
  paidBills entries (was firing red banner on every render after
  Bundle 7's auto-debit flag).
- N additional paidBills === true sites updated to use
  isPaidBillKeyTruthy helper (audit surfaced 4 sites: <list them>).
- buildCalendarEntries paid check now uses helper.
- Calendar paid cells restored: amount visible with strikethrough +
  muted color + ✓ badge (was: invisible, breaking month-to-month
  bill tracking).
- YouTube Premium day corrected from 20 to 18. One-time migration
  rewrites existing paidBills keys.
- NW notification miss on $100 txn investigated — <findings>.
```

**Phone-verify Part A before proceeding to Part B.** See A.9.

## Step A.9 — Phone-verify Part A (gating)

Wait 5-10 min for GH Pages. Force-refresh PWA.

| # | Test | PASS criteria |
|---|------|---|
| A1 | Red "Math reconciliation failed" banner gone | Dashboard shows no red banner |
| A2 | MI-13 banner state unchanged from Bundle 7 | If user converted entries to auto-debit, banner stays gone |
| A3 | Calendar — May 18 shows YouTube Premium | Bill cell visible (after migration ran) |
| A4 | Calendar — May 26 shows Spotify | Bill cell visible |
| A5 | Calendar — paid bill cells show amount with strikethrough + ✓ | Visual confirmation per Option A |
| A6 | NW notification on $100 txn | Either fires (if fix applied) or user accepts working-as-designed |

**A1 must PASS.** If A1 still fails, surface DO NOT proceed to Part B.
Other failures are non-blocking but surface them.

If A1-A5 PASS, proceed to Part B in same session.

---

# PART B — Bundle 8 (Architectural barrier + storage consolidation)

Goal: trip and goal definitions move into S. Three competing stores
become one. Future writes go through a single helper that prevents
drift.

**Pre-Part B check:** Confirm Part A landed and phone-verified A1+.

## Step B.1 — Establish the barrier helper FIRST

Before migrating data, create the new helper that becomes the only
legal write path. Find a good location near `writeSavedToSource`
in the PLAN object (~L10067).

**Add this new top-level function (NOT inside PLAN):**

```js
// Bundle 8: Single legal write path for savings bucket totals.
// Direct `S.savingsBuckets[i].saved = X` writes are forbidden by
// guardian rule no-direct-bucket-saved-write. All bucket mutations
// go through this function so:
//   1. The change is logged to the audit trail
//   2. State-shape invariants run after the change
//   3. Future contributors can't accidentally introduce drift by
//      mutating one store and forgetting another
//
// `source` is one of: 'roundup' | 'plan-add' | 'plan-edit' |
//   'manual' | 'reconcile' | 'migration'
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
  // Append to audit log if the function exists
  try {
    if (typeof appendAuditLog === 'function') {
      appendAuditLog({
        type: 'bucket_saved_change',
        bucket: bucketName,
        oldValue, newValue: safeNew,
        delta: parseFloat((safeNew - oldValue).toFixed(2)),
        source,
        ts: Date.now()
      });
    }
  } catch(e) {}
  save();
  return true;
}
```

Also add an audit-log helper if one doesn't exist:

```
grep -n "function appendAuditLog\|appendAuditLog\|slyght_audit_log" index.html | head -5
```

Surface findings. If `appendAuditLog` doesn't exist, add a minimal
version that pushes to `S._auditLog` array (capped at 500 entries
to prevent unbounded growth):

```js
function appendAuditLog(entry) {
  if (!S._auditLog) S._auditLog = [];
  S._auditLog.push(entry);
  if (S._auditLog.length > 500) S._auditLog = S._auditLog.slice(-500);
}
```

## Step B.2 — Audit ALL direct savingsBuckets writes

Run grep to find every site that currently mutates bucket.saved
directly:

```
grep -n "savingsBuckets\[.*\]\.saved\s*=" index.html
grep -n "\.saved\s*=\s*parseFloat\|bucket\.saved\s*=\|chinaHol\.saved\s*=" index.html
grep -n "writeSavedToSource" index.html
```

**Surface findings.** Expect at least 4 sites:
- `writeSavedToSource` in PLAN at ~L10089 (currently does the write)
- Round-up code at ~L5868 (`chinaHol.saved = ...`)
- `saveBucketModal` at ~L5482 (manual bucket edit)
- Bucket "+ Add funds" at ~L5403, ~L5501

For each site, surface the proposed change to user:

```
Site X: <function name> at L<line>
  Before: S.savingsBuckets[i].saved = newVal
  After:  setBucketSaved(bucket.name, newVal, '<source-tag>')
```

User reviews list. Apply changes after go-ahead.

## Step B.3 — Add guardian rule for no-direct-bucket-saved-write

Edit `guardian-static.js` to add a new rule. Find the existing
`no-direct-paidbills-access` rule for the pattern. Add a parallel:

```js
{
  name: 'no-direct-bucket-saved-write',
  anchor: 'arch-barrier-bundle-8',
  tier: 'fail',
  // Detect direct mutation of bucket.saved, but allow:
  //   - the canonical setBucketSaved helper itself
  //   - inline guardian-allow comments
  //   - test fixtures
  pattern: /\.savingsBuckets\[[^\]]*\]\.saved\s*=|bucket\.saved\s*=(?!\s*parseFloat\(Number)/,
  // ...
}
```

(Adapt to the actual structure of guardian-static.js — surface the
proposed rule definition to user.)

After the rule is added, run guardian-static and confirm:
- It catches any unmigrated direct writes (would be a fail)
- All migrated sites either use `setBucketSaved()` or have
  `guardian-allow:` comments

If migrated sites still trip the rule, surface and reconsider the
regex. Don't ship a rule that has false positives.

## Step B.4 — Backup current localStorage before destructive ops

Before deleting `slyght_trips` and `slyght_goals`, write a backup.
Add this near the migration block:

```js
// Bundle 8: backup pre-migration localStorage in case of disaster.
// Backup is a single key holding a snapshot of the keys we're about
// to consolidate. Recovery: copy the JSON value back to original keys.
// Backup is auto-deleted after 7 days by next-load cleanup.
if (!S._bundle8MigrationBackupTs) {
  try {
    const backup = {
      slyght_trips: localStorage.getItem('slyght_trips'),
      slyght_goals: localStorage.getItem('slyght_goals'),
      ts: Date.now()
    };
    localStorage.setItem('_backup_bundle8', JSON.stringify(backup));
    S._bundle8MigrationBackupTs = Date.now();
  } catch(e) { console.error('[Bundle 8] backup failed', e); }
}
```

## Step B.5 — Migrate slyght_trips and slyght_goals into S

Add a one-time migration that:
1. Reads slyght_trips localStorage → writes to S.tripDefs
2. Reads slyght_goals localStorage → writes to S.goalDefs
3. STRIPS the `saved` field from each (it's derived, no longer
   stored)
4. Deletes the old localStorage keys
5. Sets `S._bundle8MigrationV1 = true` to make migration idempotent

```js
if (!S._bundle8MigrationV1) {
  try {
    const trips = JSON.parse(localStorage.getItem('slyght_trips') || '[]');
    const goals = JSON.parse(localStorage.getItem('slyght_goals') || '[]');
    // Strip 'saved' field — it's now derived from S.savingsBuckets
    S.tripDefs = trips.map(t => {
      const { saved, ...rest } = t;
      return rest;
    });
    S.goalDefs = goals.map(g => {
      const { saved, ...rest } = g;
      return rest;
    });
    localStorage.removeItem('slyght_trips');
    localStorage.removeItem('slyght_goals');
    S._bundle8MigrationV1 = true;
    appendAuditLog({
      type: 'bundle8_migration',
      tripDefs: S.tripDefs.length,
      goalDefs: S.goalDefs.length,
      ts: Date.now()
    });
    save();
  } catch(e) { console.error('[Bundle 8] migration failed', e); }
}
```

## Step B.6 — Update PLAN.getTrips and PLAN.getGoals to read from S

These currently read from `localStorage.getItem('slyght_trips')`. After
migration, they should read from `S.tripDefs` and `S.goalDefs`.

Find them via:
```
grep -n "PLAN.getTrips\|getTrips()\s*{\|getGoals()\s*{" index.html
```

For each, update the body:

```js
getTrips() {
  // Bundle 8: read from S.tripDefs (canonical) instead of slyght_trips
  // localStorage. Saved values still derive from S.savingsBuckets via
  // readSavedFromSource.
  const stored = (S && S.tripDefs) || [];
  const defaults = [
    // ...existing defaults...
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

(Same shape for getGoals reading from `S.goalDefs`.)

Update `PLAN.saveTrip` and `PLAN.saveGoal` similarly to write to
`S.tripDefs` and `S.goalDefs` respectively. Surface proposed changes.

## Step B.7 — Verification of migration

After all edits, run:

```
node guardian-static.js     # exit 0 (28 WARN + new bucket-write rule clean)
node guardian-runtime.js    # 47/50
node tests/core.test.js     # 41/41
```

If tests fail because they reference `slyght_trips` or `slyght_goals`
directly, surface — don't auto-update tests. Discussion with user
on whether tests should mock localStorage or migrate to S.tripDefs.

**Commit Part B** with message:

```
arch(8): consolidate trips/goals into S, add bucket-write barrier

- New canonical writer setBucketSaved(bucket, value, source) is now
  the only legal way to mutate bucket.saved values. N existing direct
  writes migrated: <list>.
- New guardian rule no-direct-bucket-saved-write fails on any direct
  bucket.saved = X mutation outside the helper.
- slyght_trips localStorage key migrated to S.tripDefs.
- slyght_goals localStorage key migrated to S.goalDefs.
- Saved field stripped from both — derived from S.savingsBuckets.
- One-time migration backup at _backup_bundle8.
- localStorage key count drops from 23 to 21.
- New audit log helper appendAuditLog records bucket changes.

After this commit, the three-store drift on China holiday
($70 / $74 / $76) is structurally impossible: there's only one
saved value, sourced from S.savingsBuckets.
```

## Step B.8 — Phone-verify Part B

Wait for GH Pages, force-refresh PWA.

| # | Test | PASS criteria |
|---|------|---|
| B1 | Plan mode trip cards still render correctly | Darwin and China cards visible with saved values |
| B2 | Plan mode goal cards still render correctly | Property Deposit, Freedom Buffer, China visible |
| B3 | "+ Add savings" on a trip works | $5 → bucket updates, dashboard reflects |
| B4 | "+ Add savings" on a goal works | $5 → bucket updates |
| B5 | localStorage keys check (DevTools) | `slyght_trips` and `slyght_goals` are GONE |
| B6 | localStorage `_backup_bundle8` exists | Recovery key present |
| B7 | Round-ups still hit the bucket | Log $3.50 → bucket gains $0.50 |
| B8 | Settings → bucket edit still works | Manual goal change persists |

If any B test fails AND impacts persistent state, **surface
recovery procedure to user**:

```
1. Open DevTools console
2. Run: localStorage.setItem('slyght_trips', JSON.parse(localStorage.getItem('_backup_bundle8')).slyght_trips)
3. Run: localStorage.setItem('slyght_goals', JSON.parse(localStorage.getItem('_backup_bundle8')).slyght_goals)
4. Force-refresh
5. Roll back commit: git revert HEAD --no-edit && git push
```

---

## Step C — Final handoff

Generate handoff for both commits with:
- Commit hashes for Part A and Part B
- Files changed counts
- All grep-audit findings from A.2, B.2 with the specific line numbers
- Verification numbers
- OPEN-BUGS delta (any new bugs discovered during audits)
- Phone-verify result for ALL tests A1-A6 and B1-B8

If audits surfaced findings I didn't anticipate (likely!), document
them clearly. Those findings inform the next prompt.

---

## What this prompt does differently

1. **Audit before edit.** Steps A.2 and B.2 force grep across the
   whole file before any change. Findings surface to user.
2. **Architectural barrier.** Step B.1 establishes setBucketSaved as
   the single legal writer. Step B.3 adds a guardian rule that
   prevents future regressions.
3. **Migration backup.** Step B.4 ensures the user can recover if
   anything goes wrong during the data migration.
4. **Two commits, two phone-verifies.** Part A's hotfix doesn't
   block on Part B's success. Independent shippable units.
5. **Surface, don't auto-fix.** Throughout, when ambiguity arises,
   stop and surface to user. The codebase is too messy for CC to
   guess correctly.
6. **Explicit downstream awareness.** Every shape change includes a
   "what else reads this" enumeration step.

The prompt is longer than usual because the discipline is heavier.
But the result should be: zero regressions from this commit, AND a
new barrier preventing the next equivalent regression.
