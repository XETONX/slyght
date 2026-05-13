# Claude Code Ship Prompt — Bundle 4 (Plan Backend + Settings Cleanup)

> **Purpose:** Make Plan mode actually do something. Currently every
> add/edit handler writes to `slyght_trips` or `slyght_goals` localStorage
> only — not to `S.savingsBuckets`. So Plan UI updates work in isolation
> but the rest of the app never sees them. Plus the Settings tab in
> bottom nav (duplicates the dashboard cog).
>
> **Source baseline:** Fresh zip @ HEAD 59e008b, index.html 12055 lines.
> All line numbers verified against fresh source. Where Bundle 4's own
> edits cause line shifts, content-search will still resolve.
>
> **Discipline:** Same as prior bundles. Surface don't reframe. STOP
> at any mismatch. Phone-verify post-deploy.
>
> **Scope:** Single commit. Net diff ~80 lines. Risk: medium — touches
> persistence, but every change is paired with a backward-compatible
> read so existing localStorage data isn't orphaned.

---

## What this fixes

1. **Plan trip/goal savings now write to `S.savingsBuckets`.** Adding $50
   to China trip will increment China Holiday bucket. Dashboard, Bills
   tab, Analysis tab, Chat — everywhere — sees the new balance.
2. **Plan trip/goal reads always derive `saved` from `S.savingsBuckets`.**
   Stored values for budget/notes/dates merge in; `saved` is canonical
   from buckets. No more silent divergence.
3. **User-added goals get a bucket auto-created on first save.** Was
   silently broken before (saved to slyght_goals only).
4. **Settings tab removed from bottom nav.** Reachable via dashboard
   header cog (gear icon top-right at L440-ish, untouched).

---

## Step 1 — Pre-flight

```
git status
git log --oneline -3
```

Working tree should be clean (or only runtime-report.json churn).
HEAD should be `59e008b` or later. Surface anything else.

---

## Step 2 — Add bucketForPlanItem helper

This is the single source of truth for "which bucket does this plan
item map to."

**Find** the PLAN object opener at L10004:

```
const PLAN = {
```

**Insert a helper as the FIRST method inside PLAN**, immediately after
the opening brace and any existing comments. Search for the exact
line and insert right after it:

```
const PLAN = {
```

Becomes:

```
const PLAN = {
  // Single source of truth: which bucket each plan item syncs to.
  // Returns { type: 'bucket', name: <bucket name> } for normal items,
  // { type: 'mumAccount' } for the apartment goal (special — uses
  // S.mumAccountBalance), or null if no sync (item should be excluded
  // from the source-of-truth flip).
  bucketForPlanItem(id) {
    const map = {
      'china': { type: 'bucket', name: 'China Holiday' },
      'china-2026': { type: 'bucket', name: 'China Holiday' },
      'freedom-buffer': { type: 'bucket', name: 'Rainy Day Fund' },
      'apartment': { type: 'mumAccount' },
      'darwin-2026': { type: 'bucket', name: 'Darwin Trip' },
    };
    if (map[id]) return map[id];
    // For user-added goals/trips (id starts with 'goal-' or 'trip-'),
    // bucket name derives from the item itself when available; resolved
    // by readSavedFromSource / writeSavedToSource using the item's name.
    if (id && (id.startsWith('goal-') || id.startsWith('trip-'))) {
      return { type: 'auto-bucket' };  // resolved at call site
    }
    return null;
  },

  // Read canonical saved value for a plan item from its bucket.
  // Falls back to the supplied default if no bucket exists yet.
  readSavedFromSource(item, fallback) {
    const ref = this.bucketForPlanItem(item.id);
    if (!ref) return fallback;
    if (ref.type === 'mumAccount') {
      return (typeof S !== 'undefined' && typeof S.mumAccountBalance === 'number')
        ? S.mumAccountBalance
        : fallback;
    }
    const bucketName = ref.name || item.name;
    const bucket = (S.savingsBuckets || []).find(b => b.name === bucketName);
    return bucket ? (bucket.saved || 0) : fallback;
  },

  // Write a saved value through to the bucket (or mumAccountBalance).
  // Auto-creates the bucket for user-added items if missing.
  writeSavedToSource(item, savedValue) {
    const ref = this.bucketForPlanItem(item.id);
    if (!ref) return;
    if (ref.type === 'mumAccount') {
      S.mumAccountBalance = savedValue;
      try { save(); } catch(e) {}
      return;
    }
    const bucketName = ref.name || item.name;
    if (!S.savingsBuckets) S.savingsBuckets = [];
    let bucket = S.savingsBuckets.find(b => b.name === bucketName);
    if (!bucket) {
      bucket = {
        id: (S.nextBucketId || S.savingsBuckets.length) + 1,
        name: bucketName,
        goal: item.target || item.budget || 0,
        saved: 0,
        account: 'ING'
      };
      S.savingsBuckets.push(bucket);
      S.nextBucketId = (S.nextBucketId || S.savingsBuckets.length) + 1;
    }
    bucket.saved = parseFloat(savedValue.toFixed(2));
    try { save(); } catch(e) {}
  },
```

These three methods become the API every plan handler uses. They
replace the special-case `if (goalId === 'china') { ... }` blocks
scattered across handlers.

### Verification

```
grep -n "bucketForPlanItem\b" index.html | wc -l
```

Should return 1 (just the definition; usages come next).

---

## Step 3 — Make getTrips/getGoals derive saved from source

**Find this block** (L10071-10074 approximately):

```
    return defaults.map(def => {
      const stored_trip = stored.find(t => t.id === def.id);
      return stored_trip || def;
    }).concat(stored.filter(t => !defaults.find(d => d.id === t.id)));
```

This is inside `getTrips()`. Replace with:

```
    const merged = defaults.map(def => {
      const stored_trip = stored.find(t => t.id === def.id);
      return stored_trip ? { ...def, ...stored_trip } : def;
    }).concat(stored.filter(t => !defaults.find(d => d.id === t.id)));
    // Source-of-truth flip: saved is always derived from S.savingsBuckets
    // (or S.mumAccountBalance for apartment), not from stored localStorage.
    // Stored saved values from old data still merge for non-mappable items.
    return merged.map(t => {
      const canonical = this.readSavedFromSource(t, t.saved || 0);
      return { ...t, saved: canonical };
    });
```

Two changes:
- `stored_trip || def` becomes `{ ...def, ...stored_trip }` so trips
  also get the merge behaviour goals already have (so editing notes
  preserves default startDate, etc.). This is a small bonus fix.
- Final `.map(t => ...)` overwrites `saved` with the canonical bucket
  value.

### And for getGoals (L10113-10116 approximately):

**Find:**
```
    return defaults.map(def => {
      const stored_goal = stored.find(g => g.id === def.id);
      return stored_goal ? { ...def, ...stored_goal } : def;
    }).concat(stored.filter(g => !defaults.find(d => d.id === g.id)));
```

Replace with:

```
    const merged = defaults.map(def => {
      const stored_goal = stored.find(g => g.id === def.id);
      return stored_goal ? { ...def, ...stored_goal } : def;
    }).concat(stored.filter(g => !defaults.find(d => d.id === g.id)));
    // Source-of-truth flip: saved is always derived from
    // S.savingsBuckets (or S.mumAccountBalance for apartment).
    return merged.map(g => {
      const canonical = this.readSavedFromSource(g, g.saved || 0);
      return { ...g, saved: canonical };
    });
```

Same pattern as trips.

### Verification

```
grep -n "readSavedFromSource" index.html | wc -l
```

Should return 3 — the definition + two usages.

---

## Step 4 — Make confirmTripSavings + confirmGoalSavings write through

### confirmTripSavings — find this function (~L11305):

```
function confirmTripSavings(tripId) {
  const amt = parseFloat(document.getElementById('trip-save-amt')?.value || '0');
  if (isNaN(amt) || amt <= 0) {
    showToast('Please Enter A Valid Amount');
    return;
  }
  const trips = PLAN.getTrips();
  const trip = trips.find(t => t.id === tripId);
  if (!trip) return;
  trip.saved = (trip.saved || 0) + amt;
  PLAN.saveTrip(trip);
  PLAN_MODAL.close();
  renderPlanMode();
  showToast('✅ $' + amt.toLocaleString() + ' Added To ' + trip.name + ' Fund');
}
```

Replace with:

```
function confirmTripSavings(tripId) {
  const amt = parseFloat(document.getElementById('trip-save-amt')?.value || '0');
  if (isNaN(amt) || amt <= 0) {
    showToast('Please Enter A Valid Amount');
    return;
  }
  const trips = PLAN.getTrips();
  const trip = trips.find(t => t.id === tripId);
  if (!trip) return;
  const newSaved = (trip.saved || 0) + amt;
  trip.saved = newSaved;
  PLAN.writeSavedToSource(trip, newSaved);
  // Stored trip retains everything except canonical saved (which is
  // re-derived from bucket on next read via readSavedFromSource).
  PLAN.saveTrip(trip);
  PLAN_MODAL.close();
  renderPlanMode();
  showToast('✅ $' + amt.toLocaleString() + ' Added To ' + trip.name + ' Fund');
}
```

### confirmGoalSavings — find this function (~L11487):

```
function confirmGoalSavings(goalId) {
  const amt = parseFloat(document.getElementById('goal-save-amt')?.value || '0');
  if (isNaN(amt) || amt <= 0) {
    showToast('Please Enter A Valid Amount');
    return;
  }
  const goals = PLAN.getGoals();
  const goal = goals.find(g => g.id === goalId);
  if (!goal) return;
  goal.saved = (goal.saved || 0) + amt;
  PLAN.saveGoal(goal);
  if (goalId === 'china') {
    const bucket = (S.savingsBuckets||[]).find(b => b.name === 'China Holiday');
    if (bucket) { bucket.saved = goal.saved; save(); }
  }
  if (goalId === 'apartment') {
    S.mumAccountBalance = goal.saved;
    save();
  }
  PLAN_MODAL.close();
  renderPlanMode();
  showToast('🎯 $' + amt.toLocaleString() + ' Added To ' + goal.name + '!');
}
```

Replace with:

```
function confirmGoalSavings(goalId) {
  const amt = parseFloat(document.getElementById('goal-save-amt')?.value || '0');
  if (isNaN(amt) || amt <= 0) {
    showToast('Please Enter A Valid Amount');
    return;
  }
  const goals = PLAN.getGoals();
  const goal = goals.find(g => g.id === goalId);
  if (!goal) return;
  const newSaved = (goal.saved || 0) + amt;
  goal.saved = newSaved;
  // Single source of truth — write through to bucket / mum account
  // for all goals. Replaces old special-case if (goalId === 'china')
  // and if (goalId === 'apartment') blocks.
  PLAN.writeSavedToSource(goal, newSaved);
  PLAN.saveGoal(goal);
  PLAN_MODAL.close();
  renderPlanMode();
  showToast('🎯 $' + amt.toLocaleString() + ' Added To ' + goal.name + '!');
}
```

### Verification

```
grep -n "writeSavedToSource" index.html | wc -l
```

Should return 4: definition + 3 call sites (will become 4-5 after Step 5).

```
grep -n "if (goalId === 'china')" index.html
```

Should return 0 matches. The special-case is now handled generically.

---

## Step 5 — Make new-trip / new-goal / edit handlers also write through

### confirmNewTrip — find function (~L11280):

Inside it, find:

```
  PLAN.saveTrip({
    id: 'trip-' + Date.now(),
    name, emoji, startDate: start, endDate: end,
    days, budget, saved: 0, covered: [], notes,
    gfSplitting: false
  });
  PLAN_MODAL.close();
```

Replace with:

```
  const newTrip = {
    id: 'trip-' + Date.now(),
    name, emoji, startDate: start, endDate: end,
    days, budget, saved: 0, covered: [], notes,
    gfSplitting: false
  };
  PLAN.saveTrip(newTrip);
  // Auto-create a bucket for this trip so future savings flow correctly.
  PLAN.writeSavedToSource(newTrip, 0);
  PLAN_MODAL.close();
```

### confirmNewGoal — find function (~L11540), inside it find:

```
  PLAN.saveGoal({
    id: 'goal-' + Date.now(),
    name, emoji, target, saved: 0, monthly,
    description: desc, colour: '#4ECDC4', priority: 99
  });
  PLAN_MODAL.close();
```

Replace with:

```
  const newGoal = {
    id: 'goal-' + Date.now(),
    name, emoji, target, saved: 0, monthly,
    description: desc, colour: '#4ECDC4', priority: 99
  };
  PLAN.saveGoal(newGoal);
  // Auto-create a bucket for this goal so future savings flow correctly.
  PLAN.writeSavedToSource(newGoal, 0);
  PLAN_MODAL.close();
```

### confirmEditTrip and confirmEditGoal — DO NOT modify saved

These don't change `saved` (they edit budget/notes/dates etc.), so they
don't need writeSavedToSource. Leave them alone. The next read via
getTrips/getGoals will re-derive saved from bucket automatically.

If the user edits the BUDGET/TARGET, that's the goal/target field, not
saved — no bucket sync needed for that field. Bucket only tracks saved
amount, not target.

### Verification

```
grep -n "writeSavedToSource" index.html | wc -l
```

Should return 6 now (definition + 5 call sites: confirmTripSavings,
confirmGoalSavings, confirmNewTrip, confirmNewGoal, plus one more if
I missed counting).

---

## Step 6 — Remove Settings tab from bottom nav

**Find** this exact block (L765-768):

```
    <button class="nav-btn" id="nav-settings" onclick="goPage('pg-settings')">
      <svg width="22" height="22" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="2.5" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
      <span class="nav-lbl">Settings</span>
    </button>
```

**Delete the entire block.** That's it. No replacement.

The line above it ends with `</button>` (Analysis nav button closer)
and the line below it is `</div>` (closing the nav container). After
deletion the structure should be:

```
    <button class="nav-btn" id="nav-spend" onclick="goPage('pg-spend')">
      ...
      <span class="nav-lbl">Analysis</span>
    </button>
  </div>
```

### Don't touch this:

The dashboard header cog at L440 area:

```
<div class="icon-btn" onclick="goPage('pg-settings')" title="Settings">
```

This is the surviving Settings access. Leave it.

The page mapping at L2086 (`'pg-settings':'nav-settings'`) — leave it
too. After Settings nav button is gone, this map entry is dead but
harmless. Could be cleaned up later but not in this commit.

### Verification

```
grep -c '<span class="nav-lbl">' index.html
```

Should return 4 (Dashboard, Bills, Chat, Analysis — Settings gone).
Was 5 before.

```
grep -n 'nav-settings' index.html
```

Should return 1 match (just the L2086 dead map entry, which is OK to leave).

---

## Step 7 — Validation

```
node guardian-static.js     # exit 0
node guardian-runtime.js    # 47/50 (3 known fixture-drift)
node tests/core.test.js     # 41/41
```

If any regress, STOP and surface. The persistence change might
trigger a new runtime check expecting old slyght_goals-only
behavior — surface specifically before adjusting either the test
or the code.

If guardian-static introduces a new warning about hardcoded bucket
names ('China Holiday', 'Rainy Day Fund', 'Darwin Trip'), that's a
real future-proofing issue but acceptable for this commit. Allow-list
those at the bucketForPlanItem definition with a comment about why.
If user wants to discuss, surface and pause.

---

## Step 8 — Commit

```
git add index.html
git status
git diff --cached --stat
git commit -m "fix(plan): single source of truth for trip/goal savings + remove Settings nav

Plan mode handlers now write through to S.savingsBuckets (canonical
state) instead of just slyght_trips/slyght_goals localStorage. Reads
also derive 'saved' from buckets so dashboard, bills tab, analysis,
chat all see the same number.

Three new methods on PLAN:
- bucketForPlanItem(id): explicit map of plan items to buckets,
  including special case for apartment → S.mumAccountBalance and
  auto-bucket for user-added goal-/trip- IDs.
- readSavedFromSource(item, fallback): canonical read from bucket.
- writeSavedToSource(item, savedValue): write through, auto-creating
  bucket if needed.

Handlers updated to use new API:
- confirmTripSavings, confirmGoalSavings, confirmNewTrip, confirmNewGoal
- getTrips/getGoals overlay canonical saved on top of stored values

Special-case 'if (goalId === china)' / 'if (goalId === apartment)'
blocks removed — generic mapping handles all cases.

Settings tab removed from bottom nav (was duplicating dashboard cog
header access). Nav drops 6 → 5 items: Dashboard / Bills / + / Chat /
Analysis. Settings reachable via gear icon top-right of dashboard.

Verification:
- guardian-static: exit 0
- guardian-runtime: 47/50 (3 known fixture-drift)
- tests: 41/41

Phone-verify post-deploy: add savings to China trip/goal → dashboard
hero updates → bucket savings increment → cross-tab consistency."
git push origin main
```

---

## Step 9 — Phone-verify

Wait 5–10 min for GH Pages. Force-refresh PWA.

**Plan mode persistence test:**
1. Note China Holiday bucket savings amount on Settings → Savings list
   (should be ~$70).
2. Plan mode → China trip card → tap "+ Add savings" → enter $50 → confirm
3. Toast appears.
4. Plan mode immediately reflects new amount on China trip.
5. Switch to Dashboard → liquid net worth should reflect new bucket total.
6. Switch to Settings → Savings → China Holiday should now show ~$120.
7. Switch back to Plan mode → trip card still shows the new amount.

**User-added goal test:**
1. Plan mode → "+ Add goal" → enter "Test Goal" / target $100 / monthly $0
2. Confirm. Goal appears.
3. "+ Add savings" on Test Goal → $25 → confirm
4. Settings → Savings → "Test Goal" bucket should exist with $25 saved
5. (Optional) Delete the test goal afterward via whichever path.

**Settings nav test:**
1. Bottom nav should have 5 items: Dashboard / Bills / + / Chat / Analysis.
2. No Settings tab in nav.
3. Dashboard top-right gear icon still opens Settings.

User reports PASS or FAIL.

---

## Failure modes

| Symptom | Action |
|---|---|
| Plan view shows old amount after "Add savings" | renderPlanMode fired before save() committed; check writeSavedToSource calls save() |
| Dashboard hero doesn't update | onStateChange not firing; verify save() in writeSavedToSource works |
| Test Goal doesn't get a bucket | bucketForPlanItem auto-bucket branch broke; check writeSavedToSource handles 'auto-bucket' type |
| Old goals lose their saved amount | merge order in getGoals wrong; ensure ...stored_goal comes after ...def |
| Guardian fails on hardcoded bucket names | Add inline guardian-allow comment at bucketForPlanItem definition |
| Settings page becomes unreachable | DON'T DELETE the dashboard header cog (L440 area). Only delete L765-768. |

---

## What this prompt does NOT touch

- The pace tile duplicate on bills tab (separate ship, low priority)
- All-caps visual polish (waiting on Layer V capture before committing)
- Round-up debugging (waiting on user diagnostic answers)
- Today-aware Max Per Day / lunch notification budget (Bundle 5 candidate)
- The MI-13 batch-save bug user described (needs phone repro of exact
  flow)
- ARCHITECTURE.md / BILLS_VM-REFERENCE deliverables (separate work)

---

## Step 10 — Handoff block

After commit + push lands, generate a compact handoff block the user
can paste back to Claude.ai for the next session. Print it inside a
fenced code block with the literal header `=== HANDOFF TO CLAUDE.AI ===`
and end with `=== END HANDOFF ===`.

Include exactly:

1. Commit hash + message subject of commit just shipped
2. New HEAD hash, total commits ahead of session start
3. Other commits between OLD_HEAD..NEW_HEAD (typically none)
4. Files changed with line counts (e.g., "index.html: +X -Y")
5. Current file sizes (index.html lines, guardian-static.js lines)
6. Pre-commit verification numbers (guardian-static, guardian-runtime, tests)
7. Edit locations in post-edit file (line numbers for each change)
8. Untracked files on radar
9. OPEN-BUGS.md delta if any
10. Phone-verify result (PASS / FAIL / pending)

Format with the grep/sed commands run to derive each value, so
verification can be replicated.

---

## End of prompt
