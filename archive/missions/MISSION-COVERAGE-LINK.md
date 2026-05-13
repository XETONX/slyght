# MISSION: COVERAGE LINK — Phase 2C

## ⚠️ Read this header before any code touches the file

This session fixes a **silent suppression bug** that Phase 2A+2B introduced.
The model's `_covers` heuristic treats any two names sharing a word from the
HEALTH keyword list as the same obligation, plus any pair sharing a first
long word ≥4 chars. This caused:

- "Teachers Health" debt (health) suppresses "NRMA KIA Insurance" bill
  (insurance) — both hit the keyword bag → bill silently disappears from
  calendar.
- "Health Insurance Excess" debt suppresses "Pet Insurance" bill — same
  pattern.
- $5 debt could suppress $500 bill (no amount sanity check).

The bug is **latent** in current live state (no user-added health/insurance
debts present) but will activate the moment one is added. We fix it now.

**Reference documents:**
- `C:\Users\admin\slyght\AUDIT-FOUNDATION.md` (the original audit)
- `C:\Users\admin\slyght\PHASE-2A-2B-REPORT.md` (last session's report)
- `C:\Users\admin\slyght\probe-coverage.js` (the script that proved the bug)

**Estimated time:** 75–90 minutes. Hard stop at 2 hours.

---

## ⚠️ CRITICAL — PUSH POLICY

**You will not push the final commit. John pushes after manual browser
verification.**

You may make all the commits in this mission locally. Each commit must pass
guardian + tests. After the final commit, **STOP**. Do not run `git push`.
Print a clear `READY FOR JOHN'S MANUAL VERIFICATION` block. John will:

1. Open the app locally
2. Click through the verification checklist (in Step 9)
3. If all checks pass → he runs `git push` himself
4. If any check fails → he reports back and we fix before pushing

If you find yourself wanting to push "just to share the branch" — don't.
Local commits only. The push is John's.

---

## SUCCESS CRITERIA

You are done when ALL of these are true:

1. The `_covers` heuristic in `buildCalendarEntries` is **deleted**. No
   keyword bags, no first-long-word matching, no fuzzy logic of any kind.
2. Coverage is determined **only** by the explicit field
   `debt.coversBillName === bill.name` (case-sensitive exact match) AND
   the debt's `delayDate` falls within the rendered bill's month.
3. The existing Teachers Health debt (id: 8) has been migrated to include
   `coversBillName: 'Teachers Health'`.
4. The "Add Debt" modal includes a "Deferred bill payment?" toggle. When
   on, a dropdown shows all current bills; selection populates
   `coversBillName` on save.
5. The "Edit Debt" flow (if it exists, otherwise add it) lets the user
   set/clear/change `coversBillName` for an existing debt.
6. All adversarial unit tests from Step 5 pass — these are tests that
   would have FAILED before this fix.
7. All 23 existing unit tests still pass.
8. Guardian suite passes.
9. The probe script `probe-coverage.js`, when re-run with the new model,
   shows ZERO false positives in Scenarios B and C.
10. Final commit is made locally. Nothing is pushed.

---

## CONSTRAINTS

- **No string-similarity logic anywhere in `_covers`.** The whole point
  is to stop guessing. If you find yourself writing `name.includes(...)`
  or `.split(' ')` inside the coverage function, you've gone wrong.
- **Case-sensitive exact match.** `debt.coversBillName === bill.name`.
  No `.toLowerCase()`, no `.trim()`. The user picked it from a dropdown,
  the strings ARE the bill name. If they don't match, that's a data
  integrity bug and should fail loudly.
- **Amount is NOT used for coverage decisions.** A linked debt covers
  its bill regardless of amount mismatch. The user owns the link; we
  don't second-guess. (We may *display* a warning if amounts diverge,
  but that's a UI hint, not a coverage gate.)
- **`coversBillName: null` or undefined means NO coverage.** Period.
- **No `git push` at any point.** Local commits only.
- **Do NOT modify Plan Mode renderers, Jarvis prompt, or worker.**
  Out of scope, same as last session.

---

## WORK PLAN (in strict order)

### Step 1 — Read and confirm understanding (5 min)

Open `index.html` and locate:
- `buildCalendarEntries` (around line 2107)
- The `_covers` closure (lines 2132–2143)
- The HEALTH keyword constant (line 2109)
- The "Add Debt" modal HTML (search for `id="add-debt"` or similar)
- The `saveDebt` / debt-save handler function
- The seed for `S.debts` (around line 1141 area, contains Teachers Health
  id:8)

Print a one-line confirmation for each, with line number, BEFORE writing
any code:

```
CONFIRMED:
- _covers function at lines 2132-2143
- HEALTH constant at line 2109
- Add Debt modal at line XXXX
- saveDebt handler at line XXXX
- Teachers Health seed at line XXXX
```

If any of the above can't be found, STOP and report — the file may have
drifted from what the audit described.

---

### Step 2 — Replace `_covers` with the explicit-link version (10 min)

Replace lines 2132–2143 with:

```js
const _covers = (debt, bill, billDate) => {
  // Explicit coverage only. The user set this link via the Add/Edit Debt
  // modal. No string matching, no keyword bags, no heuristics.
  if (!debt.coversBillName) return false;
  if (debt.coversBillName !== bill.name) return false;

  // Date sanity: the debt's delayDate must fall within the rendered
  // bill's month. (Without this, a Teachers Health debt due in May
  // would wrongly cover the August quarterly bill too.)
  if (!debt.delayDate) return false;
  const debtDate = new Date(debt.delayDate.split('T')[0]);
  const sameMonth =
    debtDate.getFullYear() === billDate.getFullYear() &&
    debtDate.getMonth() === billDate.getMonth();
  return sameMonth;
};
```

Delete the `HEALTH` constant at line 2109. Verify nothing else references
it (`grep HEALTH index.html` — should return zero matches after delete).

**Commit message:** `fix(model): coverage requires explicit debt.coversBillName link — kills HEALTH-keyword false positives`

Run guardian. Run tests. The May 1 test SHOULD still pass because the
existing Teachers Health debt seed is about to be migrated in Step 3.
But: if Teachers Health debt id:8 doesn't yet have `coversBillName`
set, the May 1 test will FAIL at this commit. That's expected — Step 3
fixes it. Do NOT proceed until you've confirmed the failure mode is
exactly "May 1 test fails because no explicit link yet." Any other
failure means Step 2 broke something else.

If May 1 test is the only failure: proceed. If anything else fails:
debug before continuing.

---

### Step 3 — Migrate the existing Teachers Health debt (10 min)

Add a new migration in the migrations block (after `_debtAuditV1`, around
line 1357 area). Use a flag like `_coversBillLinks_v1`:

```js
if (!S._coversBillLinks_v1) {
  // Phase 2C: explicit debt→bill coverage links replace heuristic matching.
  // Migrate known links for existing debts.
  const linkMap = {
    'Teachers Health': 'Teachers Health',
    // Add more here as known intentional debt-covers-bill relationships emerge.
  };
  (S.debts || []).forEach(d => {
    if (d.paid) return;
    if (d.coversBillName) return;  // already explicitly set
    if (linkMap[d.name]) {
      d.coversBillName = linkMap[d.name];
    }
  });
  S._coversBillLinks_v1 = true;
}
```

Also update the seed for Teachers Health debt (id: 8) to include
`coversBillName: 'Teachers Health'` so fresh users get it correctly:

```js
{ id: 8, name: 'Teachers Health', amt: 259.41, paid: false,
  delayDate: '2026-05-01', viaRent: false,
  coversBillName: 'Teachers Health' },
```

**Commit message:** `feat(migrate): _coversBillLinks_v1 maps existing debts to their bills`

Guardian + tests. May 1 test now passes again because the migration ran
and the link is set. If it doesn't pass, debug.

---

### Step 4 — Wire the "Add Debt" modal (25 min)

Find the Add Debt modal HTML. Add inside the form, after the existing
fields:

```html
<div class="form-row">
  <label class="row-toggle">
    <input type="checkbox" id="dbt-covers-toggle"
           onchange="toggleCoversBillRow()">
    <span>This is a deferred bill payment</span>
  </label>
</div>
<div class="form-row" id="dbt-covers-row" style="display:none;">
  <label>Bill being deferred</label>
  <select id="dbt-covers-bill">
    <option value="">— select a bill —</option>
    <!-- populated by populateCoversBillDropdown() -->
  </select>
</div>
```

Add the helper functions near other modal helpers:

```js
function toggleCoversBillRow() {
  const on = document.getElementById('dbt-covers-toggle').checked;
  document.getElementById('dbt-covers-row').style.display = on ? '' : 'none';
}

function populateCoversBillDropdown() {
  const sel = document.getElementById('dbt-covers-bill');
  if (!sel) return;
  const bills = (typeof BILLS !== 'undefined' ? BILLS : []).filter(b => b.recurring !== false);
  sel.innerHTML = '<option value="">— select a bill —</option>' +
    bills.map(b => `<option value="${b.name}">${b.name} ($${b.amt})</option>`).join('');
}
```

Call `populateCoversBillDropdown()` whenever the Add Debt modal is
opened. Find the modal-open function (likely `openAddDebtModal` or
similar) and add the call.

Update `saveDebt` (or whatever the save handler is called) to read these
fields:

```js
// In saveDebt — when constructing the new debt object:
const coversToggle = document.getElementById('dbt-covers-toggle');
const coversBillSel = document.getElementById('dbt-covers-bill');
const coversBillName = (coversToggle && coversToggle.checked && coversBillSel && coversBillSel.value)
  ? coversBillSel.value
  : null;

const newDebt = {
  id: Date.now(),
  name: nameVal,
  amt: amtVal,
  // ...existing fields...
  coversBillName,    // <-- NEW
};
```

Also: when the form is reset/closed, clear the toggle and dropdown so
they don't carry state to the next open.

**Commit message:** `feat(ui): Add Debt modal links debt to a bill explicitly via dropdown`

Guardian + tests. Tests don't exercise the modal but they run the model;
nothing should regress.

---

### Step 5 — Add the Edit Debt link flow (10 min)

If an "Edit Debt" modal already exists: add the same toggle + dropdown
pair, pre-populated from the debt's existing `coversBillName`.

If it doesn't exist: add a small "Edit link" affordance on each debt
tile in the Immediate Debts grid that opens a minimal modal letting the
user set/clear `coversBillName` on that debt. Don't go overboard — a
dropdown + Save + Cancel is enough.

The minimal version:

```html
<!-- inside debt tile, only if debt is unpaid and not viaRent -->
<button class="link-btn" onclick="openEditDebtCovers(${d.id})">
  ${d.coversBillName ? '🔗 ' + d.coversBillName : '+ Link to bill'}
</button>
```

```js
function openEditDebtCovers(debtId) {
  const debt = (S.debts || []).find(d => d.id === debtId);
  if (!debt) return;
  const bills = BILLS.filter(b => b.recurring !== false).map(b => b.name);
  const current = debt.coversBillName || '';
  const choice = prompt(
    `Link "${debt.name}" to which bill?\n` +
    `(blank = no link)\n\n` +
    `Available bills:\n${bills.join('\n')}`,
    current
  );
  if (choice === null) return; // cancelled
  debt.coversBillName = choice.trim() || null;
  if (debt.coversBillName && !bills.includes(debt.coversBillName)) {
    alert(`"${debt.coversBillName}" doesn't match any current bill name. Link not saved.`);
    debt.coversBillName = null;
    return;
  }
  save();
  refreshModel();
  renderAll();
}
```

(A `prompt()` is ugly but ships in 5 minutes vs 25 for a proper modal.
Phase 2D can prettify it. The functionality is what matters tonight.)

**Commit message:** `feat(ui): edit existing debts to set/change/clear bill coverage link`

Guardian + tests.

---

### Step 6 — Adversarial test suite (15 min)

Add to `tests/core.test.js`. These tests would have FAILED before the
fix. They MUST pass now.

```js
test('Coverage: Teachers Health debt does NOT cover NRMA KIA Insurance bill', () => {
  const mockNow = new Date(2026, 3, 29);
  const stateA = JSON.parse(JSON.stringify(S));
  // Add a Teachers Health debt due May 2 (close to NRMA's date) — but NO coversBillName.
  stateA.debts = [
    { id: 100, name: 'Teachers Health', amt: 259.41, paid: false,
      delayDate: '2026-05-02', viaRent: false /* no coversBillName */ }
  ];
  const M = computeFinancialModel(stateA, mockNow);
  // Find the NRMA bill in calendar entries — it MUST still be there.
  let nrmaSeen = false;
  for (const [date, entries] of M.calendarEntries.entries()) {
    if (entries.some(e => e.label && e.label.includes('NRMA'))) nrmaSeen = true;
  }
  expect(nrmaSeen).toBe(true);
});

test('Coverage: explicit link required — Teachers Health debt without link does NOT cover Teachers Health bill', () => {
  const mockNow = new Date(2026, 3, 29);
  const stateA = JSON.parse(JSON.stringify(S));
  stateA.debts = [
    { id: 101, name: 'Teachers Health', amt: 259.41, paid: false,
      delayDate: '2026-05-01', viaRent: false /* no coversBillName */ }
  ];
  const M = computeFinancialModel(stateA, mockNow);
  const may1 = M.calendarEntries.get('2026-05-01') || [];
  // Without a link: BOTH entries (debt + bill) appear. That's preferable
  // to silent suppression. User can fix by linking via the UI.
  expect(may1.length).toBe(2);
});

test('Coverage: explicit link works — debt with coversBillName suppresses the matching bill', () => {
  const mockNow = new Date(2026, 3, 29);
  const stateA = JSON.parse(JSON.stringify(S));
  stateA.debts = [
    { id: 102, name: 'Teachers Health', amt: 259.41, paid: false,
      delayDate: '2026-05-01', viaRent: false,
      coversBillName: 'Teachers Health' }
  ];
  const M = computeFinancialModel(stateA, mockNow);
  const may1 = M.calendarEntries.get('2026-05-01') || [];
  expect(may1.length).toBe(1);
  expect(may1[0].type).toBe('debt');
});

test('Coverage: link to wrong bill name does not suppress', () => {
  const mockNow = new Date(2026, 3, 29);
  const stateA = JSON.parse(JSON.stringify(S));
  stateA.debts = [
    { id: 103, name: 'Teachers Health', amt: 259.41, paid: false,
      delayDate: '2026-05-01', viaRent: false,
      coversBillName: 'NRMA KIA Insurance' /* WRONG link */ }
  ];
  const M = computeFinancialModel(stateA, mockNow);
  // The Teachers Health bill on May 1 should still appear (debt links wrong bill).
  const may1 = M.calendarEntries.get('2026-05-01') || [];
  expect(may1.some(e => e.type === 'bill' && e.label.includes('Teachers Health'))).toBe(true);
});

test('Coverage: month-aware — May debt does NOT cover August quarterly Teachers Health', () => {
  const mockNow = new Date(2026, 3, 29);
  const stateA = JSON.parse(JSON.stringify(S));
  stateA.debts = [
    { id: 104, name: 'Teachers Health', amt: 259.41, paid: false,
      delayDate: '2026-05-01', viaRent: false,
      coversBillName: 'Teachers Health' }
  ];
  const M = computeFinancialModel(stateA, mockNow);
  const aug1 = M.calendarEntries.get('2026-08-01') || [];
  // August quarterly should still show — debt only covers MAY's instance.
  expect(aug1.some(e => e.label.includes('Teachers Health'))).toBe(true);
});

test('Coverage: pet insurance NOT suppressed by health-insurance debt', () => {
  const mockNow = new Date(2026, 3, 29);
  const stateA = JSON.parse(JSON.stringify(S));
  stateA.debts = [
    { id: 105, name: 'Health Insurance Excess', amt: 500, paid: false,
      delayDate: '2026-05-04', viaRent: false /* no coversBillName */ }
  ];
  const M = computeFinancialModel(stateA, mockNow);
  // Pet insurance bill must still appear in calendar.
  let petSeen = false;
  for (const [date, entries] of M.calendarEntries.entries()) {
    if (entries.some(e => e.label && e.label.includes('Pet'))) petSeen = true;
  }
  expect(petSeen).toBe(true);
});
```

**Commit message:** `test: 6 adversarial coverage tests against suppression false positives`

Run all tests. Should be 29/29 green (23 prior + 6 new).

---

### Step 7 — Re-run the probe script (5 min)

The probe script is already at `C:\Users\admin\slyght\probe-coverage.js`.
It walks 60 days from today's date with three scenarios.

Run: `node probe-coverage.js`

Expected new output:
- **Scenario A:** unchanged — no false positives (clean live state).
- **Scenario B (Teachers Health debt added):** ZERO coverage matches.
  Without `coversBillName`, the debt suppresses NOTHING. Calendar shows
  BOTH the debt and the Teachers Health bill on May 1 (acceptable —
  user adds the link via UI to suppress).
- **Scenario C (multiple insurance debts):** ZERO coverage matches.

If ANY false positive appears in B or C, the fix is incomplete. Debug.

The probe is read-only and not committed. Just confirm output before
proceeding.

---

### Step 8 — Update the seed for new users (5 min)

Update the BILLS array if any bill has been renamed since the seed was
last touched. Verify that `Teachers Health` is the exact spelling in
both `BILLS` and the seed Teachers Health debt. Case-sensitive equality
matters now — a mismatch means coverage silently fails to fire.

Add a guardian check: every `S.debts[i].coversBillName` (when set) must
match an existing `BILLS[j].name` exactly. If not, guardian prints a
warning. This catches data drift if a bill is later renamed and a debt
is left orphaned.

Add to `guardians/foundation-guardian.js` (or wherever the runtime
guardians live):

```js
function checkCoversBillLinksValid() {
  const billNames = new Set(BILLS.map(b => b.name));
  let bad = 0;
  (S.debts || []).forEach(d => {
    if (d.coversBillName && !billNames.has(d.coversBillName)) {
      console.warn(`[GUARDIAN] Debt "${d.name}" has coversBillName="${d.coversBillName}" but no bill matches that name exactly.`);
      bad++;
    }
  });
  return { name: 'covers-bill-links-valid', pass: bad === 0, detail: bad ? `${bad} orphan link(s)` : 'all links valid' };
}
```

Wire it into the guardian runner.

**Commit message:** `feat(guardian): check covers-bill-links integrity`

Guardian should now show 51/51 (or whatever the new count is). Tests
unchanged.

---

### Step 9 — STOP. Print verification block. Do NOT push.

Run final guardian + tests. Confirm green.

Then print exactly this block:

```
═══════════════════════════════════════════════════════════════
READY FOR JOHN'S MANUAL VERIFICATION

DO NOT PUSH. JOHN PUSHES AFTER MANUAL VERIFICATION.

Local commits made (newest first):
  <hash> feat(guardian): check covers-bill-links integrity
  <hash> test: 6 adversarial coverage tests
  <hash> feat(ui): edit existing debts to set/change/clear bill coverage link
  <hash> feat(ui): Add Debt modal links debt to a bill explicitly
  <hash> feat(migrate): _coversBillLinks_v1 maps existing debts
  <hash> fix(model): coverage requires explicit debt.coversBillName link

Tests: 29/29 passing
Guardian: 51/51 passing
Probe: zero false positives in scenarios B and C

═══════════════════════════════════════════════════════════════
JOHN'S MANUAL CHECKLIST — open the app locally:

[ ] 1. Calendar tab → May 2026 → tap May 1.
       Confirm: ONE entry, "Teachers Health $259.41", labelled as debt.
       (Was double-counted at $518.82 before Phase 2A. Should be single
        debt entry now.)

[ ] 2. Calendar tab → August 2026 → tap Aug 1.
       Confirm: ONE entry, "Teachers Health $259.41" labelled as a BILL
       (the quarterly). The May debt does NOT cover Aug.

[ ] 3. Dashboard → Add Debt button → fill in test name "Test Debt 1",
       amount $50, due date 2026-05-15. Tick "deferred bill payment"
       → dropdown should show your bills → pick any (e.g. Spotify).
       Save. Open the new debt's tile → confirm "🔗 Spotify" link visible.

[ ] 4. Calendar → May 15 → confirm Spotify bill is suppressed (only the
       Test Debt entry shows).

[ ] 5. Click the link button on Test Debt → set link to blank →
       confirm Spotify bill REAPPEARS on May 15.

[ ] 6. Delete Test Debt 1 (or mark paid) to clean up.

[ ] 7. Open snapshot → confirm balance, NW, days-to-payday match
       expected values from PHASE-2A-2B-REPORT.md state line.

[ ] 8. Refresh the app → all of the above still correct after reload
       (migration ran once, didn't re-run).

If ALL 8 pass: run `git push` to ship.
If ANY fail: report which one and the symptom. Do NOT push.

═══════════════════════════════════════════════════════════════
```

THEN STOP. Do not run `git push`. Do not run further commands.

---

## SAFETY RULES

1. **No `git push`. Ever. In this session. Period.**
2. No commits without guardian + tests passing.
3. No "while I'm here" refactors. Stay in scope.
4. If at any step you find another bug not in scope — write it under
   "Discovered, deferred" in a final note. Don't chase it.
5. Hard stop at 2 hours. If mid-step at 1:50, finish that step's commit
   then stop and print the verification block listing what was done and
   what wasn't.
6. If a test fails and you can't see why in 10 minutes: revert that
   step's commit, leave a note, move to next step or stop.

---

## Run with

```
Read C:\Users\admin\slyght\MISSION-COVERAGE-LINK.md and execute it
exactly. Reference AUDIT-FOUNDATION.md and PHASE-2A-2B-REPORT.md for
context. Stay in scope. Local commits only — DO NOT GIT PUSH. Print the
verification block at the end and stop. John pushes after manual checks.
```
