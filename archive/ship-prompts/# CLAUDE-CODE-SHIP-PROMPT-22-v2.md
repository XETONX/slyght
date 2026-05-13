Here's the spec. I'll write it as a single document CC can paste into a ship prompt and execute against without ambiguity.

---

# CLAUDE-CODE-SHIP-PROMPT-22-v2.md

## Bundle 22 v2 — Settings IA Redesign

**HEAD:** 4f026ef (revert of attempt #1)
**Target:** Single commit, ~120 min CC work, phone-verify required

---

## Why this redesign

Attempt #1 shipped a 4-section accordion IA. John verdict: "all over the place its horrid". Failure mode: root page exposed form inputs, accordion mechanic felt cluttered, "Managed Elsewhere" card felt disconnected, no clear hierarchy beyond accordion headers.

Root cause: treating 49 settings elements (15 inputs, 14 render targets, 20 onclick handlers) as same-level peers and trying to organise them in-place.

The fix: **Samsung Settings pattern.** Root page is a navigator, not an editor. Seven category rows. Tap to slide into a sub-screen. Edit there. Slide back.

---

## Architecture

**Root page (`#pg-settings`):** Calm navigator. Only one piece of data on root — current balance. Everything else lives behind sub-screens.

**Seven sub-screens:** Each is an absolutely positioned div, default off-canvas (`transform: translateX(100%)`). Activated by adding `.settings-active` class which sets `transform: translateX(0)`. CSS transition: `transform 250ms ease-out`.

**Render targets persist:** All existing `el.innerHTML` writes (snapshots-content, health-content, etc.) work unchanged because the target divs exist in the DOM at all times — they just live inside an off-canvas sub-screen.

**Edit-on-tap pattern:** Values display read-only at rest in sub-screens. Tapping a row opens a focused single-purpose edit modal with one input + Cancel + Save. Save calls a canonical BRAIN writer.

---

## Root page layout

```
‹  Settings

CURRENT BALANCE
$84.89
Last updated 11:42am
[ Update Balance ]

──────────────────

📊  Financial Data            ›
    Income, assets, debts

🎯  Strategies                ›
    Budgets, debt payoff order

🔔  Notifications             ›
    Smart alerts, quiet mode

🤖  AI Assistant              ›
    API key, usage, costs

💾  Data & Backup             ›
    Snapshots, round-ups, export

🔧  Diagnostics               ›
    Health checks, activity log

──────────────────

ℹ️   About                    ›
    SLYGHT v0.247

⚠️   Reset All Data           ›   (red text)
```

**Notes:**
- Security/PIN row NOT on root. Code retained dormant. Row only renders if `S.pin` is set (so adding a PIN in the future via dev console auto-surfaces the row).
- No nested cards. No accordions. Just a clean list with icon + name + one-line subtitle + chevron.
- Row height min 56px. Touch target min 44×44px enforced via CSS.

---

## Sub-screens — contents

### 📊 Financial Data

```
‹  Financial Data

INCOME
─────────────────────────
Monthly salary      $7,282    ›
Payday              15th      ›

ASSETS
─────────────────────────
WRX value         $25,000     ›
Mum account        $3,000     ›
Super balance     $63,429     ›

LIABILITIES
─────────────────────────
KIA loan         -$23,214     ›
KIA original     -$37,400     ›
Credit card           $0      ›
CC limit           $6,000     ›

──────────────────
Bills, debts and goals are
managed in their own tabs.
[Bills →]  [Debts →]  [PLAN →]
```

Each row tappable → opens edit modal for that single value.

### 🎯 Strategies

```
‹  Strategies

DAILY BUDGETS
─────────────────────────
Weekday               $30    ›
Weekend              $100    ›
Max discretionary spend

DEBT PAYOFF
─────────────────────────
Strategy        Avalanche    ›
Pay highest interest first.
Saves most money long-term.
```

### 🔔 Notifications

Toggle switches, not buttons.

```
‹  Notifications

Notifications active        [●━━] ON
Stays active between sessions

Quiet mode                  [━━●] OFF
Morning alert only

──────────────────
[  Send test notification  ]

WHAT YOU'LL GET
Daily reminders tailored to your
schedule and real balance.
Morning · Breakfast · Lunch ·
Snack · Home time · Groceries
```

Reusable toggle component (CSS-only, styled checkbox). Use same component for Round-ups in Data & Backup.

### 🤖 AI Assistant

```
‹  AI Assistant

API KEY
sk-ant-•••••••••           Edit  ›

USAGE THIS MONTH
$0.43 USD
████░░░░░░░░░░░░░░░░  of $15 limit

26 calls all-time
Projected $0.68 USD/month

[ Top up credit → console.anthropic.com ]

ALERT THRESHOLD
$15.00 USD                       ›
Warn when monthly spend reaches this
```

### 💾 Data & Backup

```
‹  Data & Backup

SNAPSHOTS
─────────────────────────
Last: today 11:42am
47 snapshots stored

[ Take Snapshot Now ]
[ View all → ]

ROUND-UPS                  [●━━] ON
Adds cents from every spend
to a savings goal.

Destination:
┌─────────────────────────────┐
│ China Holiday          ▼    │
└─────────────────────────────┘

──────────────────

EXPORT
[ Copy to clipboard ]
[ Download as file ]

IMPORT
[ Paste export code ]
[ Import & apply ]

──────────────────
🔒 All data stays on this device.
Nothing is sent to any server.
```

"View all →" opens nested sub-screen with full snapshot list, tag/untag/restore actions.

### 🔧 Diagnostics

```
‹  Diagnostics

DATA HEALTH
─────────────────────────
⚠️ 1 issue detected
[ Run check now ]

MATH HEALTH
─────────────────────────
✅ All 13 invariants passing
Last check: 2:54pm
[ Run check now ]  [ Reset session counts ]

UX INTELLIGENCE
─────────────────────────
Score 80
[ View full report → ]

ACTIVITY LOG
─────────────────────────
⚠️ 16 issues
[ View log → ]
```

### ℹ️ About

```
‹  About

SLYGHT
Version 0.247
Build 12 May 2026

A personal finance accountability
coach for John.

Made with discipline ⚙️
```

---

## Reusable components

### 1. Sub-screen container

```html
<div class="settings-subscreen" id="settings-financial">
  <header class="subscreen-header">
    <button class="subscreen-back" onclick="closeSettingsCategory('settings-financial')"
            aria-label="Back to Settings">‹</button>
    <h2>Financial Data</h2>
  </header>
  <div class="subscreen-body">
    <!-- groups + rows -->
  </div>
</div>
```

```css
.settings-subscreen {
  position: absolute;
  inset: 0;
  background: var(--bg);
  transform: translateX(100%);
  transition: transform 250ms ease-out;
  overflow-y: auto;
}
.settings-subscreen.settings-active {
  transform: translateX(0);
}
```

### 2. Navigator row

```html
<button class="settings-nav-row"
        onclick="openSettingsCategory('settings-financial')"
        aria-label="Financial Data: income, assets, debts">
  <span class="row-icon">📊</span>
  <span class="row-text">
    <span class="row-title">Financial Data</span>
    <span class="row-subtitle">Income, assets, debts</span>
  </span>
  <span class="row-chevron">›</span>
</button>
```

Min height 56px. Tap target min 44×44px.

### 3. Editable row (display + tap-to-edit)

```html
<button class="settings-edit-row"
        onclick="openEditModal('income-salary')"
        aria-label="Monthly salary, currently $7,282, tap to edit"
        data-brain-key="config.monthlySalary">
  <span class="row-label">Monthly salary</span>
  <span class="row-value">$7,282</span>
  <span class="row-chevron">›</span>
</button>
```

### 4. Edit modal

```html
<div class="edit-modal" id="edit-modal-income-salary" hidden>
  <div class="edit-modal-backdrop" onclick="closeEditModal()"></div>
  <div class="edit-modal-card">
    <h3>Monthly Salary</h3>
    <p class="edit-modal-hint">Net amount that lands in your account each payday</p>
    <input id="s-income" type="number" inputmode="decimal" />
    <div class="edit-modal-actions">
      <button onclick="closeEditModal()">Cancel</button>
      <button class="primary" onclick="saveIncomeViaBrain()">Save</button>
    </div>
  </div>
</div>
```

One pattern across all edit affordances. Save handlers route through canonical BRAIN writers.

### 5. Toggle switch (CSS-only)

```html
<label class="toggle" aria-label="Round-ups enabled">
  <input type="checkbox" id="toggle-roundups"
         onchange="setRoundupsEnabledViaBrain(this.checked)" />
  <span class="toggle-track"><span class="toggle-thumb"></span></span>
</label>
```

CSS handles the on/off visual. Track + thumb transitions on `:checked`. Use same component for: Round-ups enabled, Notifications active, Quiet mode.

---

## Save handler audit (CRITICAL)

Every Settings save handler must write through canonical BRAIN writers, not direct `S.*` mutation. The redesign is the right moment to enforce this because every save site is being touched anyway.

**Audit table — verify or fix each:**

| Edit field | Current handler | Required BRAIN pathway |
|---|---|---|
| `s-income` | `saveSettings()` | Confirm writes through canonical (likely `BRAIN.config.setIncome` if exists, else create) |
| `s-payday` | `saveSettings()` + `validatePayday()` | Same — confirm canonical |
| `s-weekday-budget` | `saveBudgets()` | Confirm canonical config writer |
| `s-weekend-budget` | `saveBudgets()` | Same |
| `s-bal` | `updateBalanceFromSettings()` | Should use `BRAIN.transaction.recordCorrection` (already exists per Bundle 15.1) |
| `s-debt-strategy` | direct? | Needs `BRAIN.debts.setStrategy(value, BRAIN.SOURCES.SETTINGS_EDIT)` — create if absent |
| `set-wrx` | `saveWrxValue()` | Audit — vehicle finance bubble pending (Bundle 16.5 candidate), for now ensure no direct S.wrxValue= |
| `set-mum-account` | `saveMumAccountBalance()` | Audit |
| `set-super` | `saveSuperBalance()` | Audit |
| `s-car`, `s-car-original` | direct? | Audit — same vehicle finance domain |
| `s-cc`, `s-cc-limit` | direct? | Audit — debt domain, should route through BRAIN.debts |
| `s-pin` | localStorage direct | Acceptable — not BRAIN-managed, security domain |
| `set-apikey` | `saveApiKey()` | Acceptable — not BRAIN-managed |
| Round-ups destination | NEW | Create `BRAIN.savings.setRoundUpDestination(bucketId, source)` |
| Round-ups on/off | `toggleRoundUps()` | Audit — should write `S.roundUpsEnabled` via canonical |

**For each "Audit" entry:** surface the current code path in your handoff. If it bypasses BRAIN, propose the canonical writer and ship the fix as part of Bundle 22.

**Guardian rule:** After this bundle, no guardian-static violations for "direct S.config write" or "direct S.wrx* write" should be possible from Settings code paths.

---

## Round-ups dynamic destination (NEW behavior)

Currently round-ups hardcode `china-holiday` bucket. Bundle 22 makes destination user-configurable so it survives China trip completion.

### Schema addition

```js
// Add to state initialiser (seed):
S.roundUpDestination = S.roundUpDestination || 'china-holiday'; // default preserves current behavior
```

### Canonical writer

```js
BRAIN.savings.setRoundUpDestination = function(bucketId, source) {
  // Validate bucketId exists in savings buckets OR matches a PLAN trip/goal ID
  // Return envelope: { ok: true|false, reason }
  // Audit log entry on success
};
```

### Dropdown population

```js
function populateRoundupDestinationDropdown() {
  const sel = $('s-roundup-dest');
  sel.innerHTML = '';

  // Source 1: existing savings buckets
  const buckets = BRAIN.savings.getBuckets(); // existing reader
  buckets.forEach(b => {
    const opt = new Option(b.name, b.id);
    sel.appendChild(opt);
  });

  // Source 2: active PLAN trips
  const trips = PLAN.getTrips().filter(t => !t.completed);
  trips.forEach(t => {
    const opt = new Option(`Trip: ${t.name}`, t.id);
    sel.appendChild(opt);
  });

  // Source 3: active PLAN goals
  const goals = PLAN.getGoals().filter(g => !g.completed);
  goals.forEach(g => {
    const opt = new Option(`Goal: ${g.name}`, g.id);
    sel.appendChild(opt);
  });

  // Select current destination
  sel.value = S.roundUpDestination || '';
}
```

### Hardening: orphan destination

When round-up fires, check destination still exists:

```js
function applyRoundup(amount, txnTs) {
  const destId = S.roundUpDestination;
  if (!destId) return; // not configured, skip

  const dest = BRAIN.savings.getBucket(destId) || PLAN.getTrip(destId) || PLAN.getGoal(destId);
  if (!dest) {
    // destination orphaned — queue + notify
    S._pendingRoundups = S._pendingRoundups || [];
    S._pendingRoundups.push({ amount, txnTs, reason: 'orphan-destination' });
    notify('Round-up destination missing', 'Pick a new destination in Settings → Data & Backup');
    return;
  }

  // ... normal transfer logic through BRAIN.savings
}
```

UI surfaces pending round-ups when user re-opens Data & Backup screen.

---

## Reset All Data — three-stage flow

Replaces native `confirm()` currently used by `resetAll`. In-app modal sequence.

### Stage 1 — Type RESET to enable Continue

```
⚠️ Reset All Data

This will permanently delete all your
data: transactions, bills, debts,
snapshots, goals, everything.

There is no undo.

Type RESET in capital letters to continue:

[ _______________ ]

[ Cancel ]  [ Continue ] ← disabled until typed
```

Continue button enabled only when input value exactly equals `RESET`.

### Stage 2 — Show concrete impact

```
Last chance.

You will lose:
• Current balance: $84.89
• Transactions: 130
• Snapshots: 47
• Bills: 14
• Debts: 4
• Trips & goals: 6

Everything goes back to first-launch state.

[ Cancel ]  [ Yes, delete everything ]
```

Impact numbers pulled live from state. This makes the destruction concrete.

### Stage 3 — Countdown with cancel

```
Resetting in 3...
[ Cancel ]
```

3-second countdown (3, 2, 1). Cancel button visible and tappable throughout. If user doesn't cancel, reset executes.

### Implementation

```js
function openResetFlow() {
  showResetStage1();
}
function showResetStage1() { /* modal with type-RESET gate */ }
function showResetStage2() { /* modal with impact numbers */ }
function showResetStage3() {
  let seconds = 3;
  const interval = setInterval(() => {
    seconds--;
    if (seconds <= 0) {
      clearInterval(interval);
      resetAll(); // existing fn — but ensure it no longer uses native confirm()
    } else {
      $('reset-countdown').textContent = seconds;
    }
  }, 1000);
  // Cancel button: clearInterval(interval); closeModal();
}
```

Remove the native `confirm()` from `resetAll()` itself — it should now execute unconditionally when called, since the three-stage flow gates entry.

---

## Accessibility / AI-readback

Every tappable element needs:

1. **`aria-label`** describing element + current value + action. Format: `"<name>, currently <value>, tap to edit"` (read-edit affordances) or `"<name>: <description>"` (nav rows).

2. **`data-brain-key`** on edit affordances pointing at the canonical state path. Format: `data-brain-key="config.monthlySalary"`, `data-brain-key="savings.roundUpDestination"`, etc. Future AI agent intent routing reads these.

3. **Touch target minimum** 44×44px via CSS `min-height: 44px; min-width: 44px;` on all interactive elements.

Add a single utility:

```css
.tappable {
  min-height: 44px;
  min-width: 44px;
  display: flex;
  align-items: center;
}
```

Apply to all rows, buttons, toggles.

---

## Build order

**Phase 1 — Skeleton (15 min)**

1. Build root navigator: balance hero + 7 category rows + About + Reset All
2. NO sub-screens yet, NO animations, NO edit modals
3. Each category row tappable but currently shows alert("Coming soon") or similar placeholder
4. **STOP. Surface to John for visual confirmation before continuing.**

This is the single biggest insurance against another revert.

**Phase 2 — Sub-screen scaffolding (20 min)**

5. Add 7 sub-screen containers (off-canvas divs with headers + back buttons)
6. Wire `openSettingsCategory()` / `closeSettingsCategory()` to add/remove `.settings-active` class
7. Add CSS slide transition (`transform 250ms ease-out`)
8. Each sub-screen body is empty placeholder
9. Verify slide animation works smoothly on phone

**Phase 3 — Sub-screen contents in order (60 min)**

10. Financial Data — INCOME / ASSETS / LIABILITIES groups with edit-on-tap rows
11. Strategies — DAILY BUDGETS / DEBT PAYOFF
12. Notifications — toggle component built once, used here
13. AI Assistant — usage display + edit affordances
14. Data & Backup — snapshots + round-ups (with destination dropdown) + export/import
15. Diagnostics — health/math/UX/log render targets (existing render funcs continue to write innerHTML)
16. About — static info

**Phase 4 — Modals + save handlers (20 min)**

17. Reusable edit modal component
18. Audit + fix all save handlers per the audit table above
19. Round-ups destination dropdown population + canonical writer
20. Reset Data three-stage flow

**Phase 5 — Polish + accessibility (10 min)**

21. Add aria-labels everywhere
22. Add data-brain-key attributes
23. Enforce min touch target sizes via CSS
24. Remove all native `confirm()` / `alert()` from Settings code paths (use in-app modals instead)

**Phase 6 — Verification**

25. Run guardian-static — expect 0 new violations
26. Run brain tests — expect baseline failures unchanged
27. Phone-verify (see checklist below)

---

## Preserve list (do not break)

All 15 input IDs, 14 render-target IDs, 20 onclick handlers from constraint list must remain functional. They move into sub-screens but identifiers and behaviours preserved.

**Input IDs:** `s-bal`, `s-pin`, `s-income`, `s-payday`, `s-weekday-budget`, `s-weekend-budget`, `set-wrx`, `set-mum-account`, `set-super`, `set-apikey`, `s-car`, `s-car-original`, `s-cc`, `s-cc-limit`, `s-debt-strategy`

**Render targets:** `snapshots-content`, `health-content`, `math-health-content`, `ux-report-content`, `push-settings`, `api-costs-content`, `audit-log-content`, `emergency-fund-status` (already redirected to PLAN per Bundle 17.x — may be removed if no longer rendered into), `settings-bills` (CC note #5 — may short-circuit if no longer rendered), `import-area`, `import-msg`, `roundups-btn`, `strategy-explain`, `budget-save-msg`

**Onclick handlers (must remain callable from somewhere visible):** `updateBalanceFromSettings`, `saveBudgets`, `saveSettings`, `validatePayday`, `toggleRoundUps`, `saveApiKey`, `saveWrxValue`, `saveMumAccountBalance`, `saveSuperBalance`, `copyExport`, `doImport`, `exportAsFile`, `resetAll`, `HEALTH.render`, `renderMathHealth`, `MathInvariants.resetSession`, `UX.renderReport`, `SNAPSHOTS.take('manual')`, `SNAPSHOTS.tag(i)`, `SNAPSHOTS.untag(i)`, `SNAPSHOTS.restore(i)`

If any handler currently bypasses BRAIN (per audit table), introduce a canonical wrapper that calls the existing handler internally + audits the write. Don't break the existing handler.

---

## Phone-verify checklist

After ship + GH Pages deploy + PWA refresh:

1. Settings root: 7 category rows + balance hero + About + red Reset row visible. No form fields exposed on root. NO PIN/Security row (since `S.pin` not set).
2. Tap each of 7 category rows → smooth slide animation right. Back button slides left.
3. Financial Data → tap "Monthly salary" → edit modal opens with `s-income` field → change → Save → modal closes → row shows new value.
4. Strategies → tap "Strategy: Avalanche" → edit modal with dropdown → change to Snowball → Save → row updates → debt list elsewhere reflects new ordering.
5. Notifications → toggle "Quiet mode" → toggle animates → state persists across PWA refresh.
6. Data & Backup → Round-ups dropdown shows: China Holiday + any other active trips/goals. Change destination → next round-up txn lands in new bucket.
7. Data & Backup → "Take Snapshot Now" → snapshot appears in list. "View all" opens nested sub-screen.
8. Diagnostics → all 4 panels (Data Health, Math Health, UX, Activity Log) render correctly (existing render functions still wire up).
9. Reset All Data → tap → Stage 1 modal (type RESET) → type → Continue enables → Stage 2 (impact numbers) → confirm → Stage 3 (countdown) → cancel mid-countdown works → restart and let countdown complete → state resets.
10. All values touched via Settings now appear in BRAIN audit log with source `SETTINGS_EDIT` (or appropriate canonical source).
11. UX Intelligence "missed tap rate" should drop measurably after deploy (bigger touch targets).

---

## Deviations to surface in handoff

CC's notes-for-self items that interact with this bundle:

- **Note 4** (set-income hidden compat field): now resolved — single source via edit modal
- **Note 5** (renderSettingsBills firing invisibly): now resolved — settings-bills target removed if Bills aren't in Settings anymore. Verify no consumers expect this render target.
- **Note 10** (Allianz/Rego tag mismatch): not addressed in Bundle 22, separate bundle
- **Note 15** (synced X min ago indicator): leave space in Data & Backup → SNAPSHOTS group for future Bundle 23 cloud-sync status. No code yet.

---

## What ships in this bundle

- Settings root redesigned as Samsung-style navigator
- 7 sub-screens with slide animation
- Reusable edit modal component
- Reusable toggle component
- Round-ups dynamic destination + canonical writer + orphan handling
- Reset All Data three-stage flow (kills one native confirm)
- All save handlers audited; canonical BRAIN writers introduced where missing
- Accessibility labels + data-brain-key attributes everywhere
- 44×44px touch targets enforced

## What does NOT ship in this bundle

- PIN row in Settings (code retained dormant; row re-appears only if PIN gets set)
- Vehicle finance bubble extraction (Bundle 16.5 candidate)
- Allianz/Rego tag normalization (separate)
- Cloud sync indicator (Bundle 23)
- Native confirm/alert replacement OUTSIDE Settings (Bundle 17.x backlog)

---

## Estimated effort

~120 min CC work. Largest single Settings refactor in project history. Phone-verify ~10 min.

If Phase 1 skeleton review surfaces "still horrid" reaction from John, revert is cheap (single commit). If review passes, remaining phases execute with confidence.

---

**Send for John's green-light before executing.**

---

That's the full spec. Tell CC to read it fully, surface any clarifying questions before starting, and **stop after Phase 1 skeleton for your visual confirmation**. The Phase 1 stop is the most important discipline in the spec — it's the gate that prevents another revert.

---

## Backend Audit Augmentation (added 2026-05-12 by Claude Code)

> UX above is locked per John's review. This section documents the **backend wiring** the spec assumes vs. what actually exists in `index.html`. Read before Phase 1; some items are **prerequisites** the spec treats as already-present.

### A. Canonical writers — claimed vs. real

| Spec claim | Reality in `index.html` | Action |
|---|---|---|
| `BRAIN.config.setIncome / setPayday / setWeekdayBudget / setWeekendBudget` | **`BRAIN.config` bubble does not exist.** `saveSettings()` at L6630 writes `S.income`, `S.payday`, `S.weekdayBudget`, `S.weekendBudget` directly. | **Create `BRAIN.config` bubble** (new) — see §C below. |
| `BRAIN.debts.setStrategy(value, source)` | `BRAIN.debts` (L12037) has `add`, `markPaid`. No `setStrategy`. `saveSettings` writes `S.debtStrategy = $('s-debt-strategy').value` directly. | **Add `setStrategy` to `BRAIN.debts`** — see §C. |
| `BRAIN.savings.getBuckets()` / `getBucket(id)` | `BRAIN.savings` (L11336) has `setBucketSaved(bucketName, …)`, `addToBucket(bucketName, …)`. Both keyed by **bucket `name` (string)**, NOT `id`. No getters. | Add `getBuckets()` + `getBucket(nameOrId)` — see §C. **Spec must switch from `bucketId` to `bucketName` everywhere** (or normalize). |
| `BRAIN.savings.setRoundUpDestination(bucketId, source)` | Does not exist. | Add — see §C. |
| `BRAIN.transaction.recordCorrection(diff, reason)` (Bundle 15.1) | **✓ Exists** (L11655). Used by `applyBalanceCorrection` (L4470). | OK. Spec's `updateBalanceFromSettings` row is correct. |
| `BRAIN.assets.setWrxValue` (WRX) | **WRX field was deleted from Settings** (`saveSettings` L6647 comment: "s-wrx-value settings field deleted; WRX value editing moved to Plan Mode renderWrxCard"). | **DROP `set-wrx` row from spec's save-handler table**. WRX edit lives in Plan Mode now. |
| `BRAIN.assets.setSuperBalance` / `setMumAccountBalance` | `saveSuperBalance` (L6695) and `saveMumAccountBalance` (L6704) write directly to `S.superBalance` / `S.mumAccountBalance`. `saveMumAccountBalance` also mirrors into PLAN apartment goal via `PLAN.saveGoal`. | **Optional Bundle 22.x addition: `BRAIN.assets` bubble** with `setSuper`, `setMumAccount` (latter must keep the PLAN.saveGoal mirror). Or defer to a Bundle 16.5 vehicle-finance bubble extraction. |

### B. Round-up hardcoding — actual scope

The spec acknowledges round-ups hardcode "China Holiday" but understates the surface. `grep "China Holiday" index.html` returns **22 hits**. After excluding sample data and the initial seed (legitimate defaults), the **must-rewire** sites are:

| Line | Surface | What it does | Required change |
|---|---|---|---|
| L624 | Settings round-up subtitle | `"Add cents to China Holiday"` | Read `BRAIN.savings.getRoundUpDestinationName()` |
| L988 | Quick Log preview label (HTML default) | `"🏦 Round-up: +$0.00 → China Holiday"` | Inject name on render |
| L5938 | Goal-reached message | `"Goal reached — China Holiday funded!"` | Generic: "Goal reached — {name} funded!" |
| L5981 | Comment "China Holiday gets special treatment" | Pin-to-top logic for round-up destination | Pin whichever bucket is `roundUpDestination` |
| L6392 | Quick Log preview runtime update | Sets label text on each render | Read destination name |
| L6488 | **Quick Log round-up txn note** | `'Round-up → China Holiday'` written to txn history | Use destination name |
| L7176, L7377 | AI chat brain-context strings | Tells the LLM about the China Holiday goal | Read goal + destination dynamically |
| L7540 | **Parallel round-up txn site #2** | Same `'Round-up → China Holiday'` literal | Use destination name. **⚠ See §F — investigate why two sites exist** |
| L7545 | Bucket lookup for round-up apply | `S.savingsBuckets?.find(b => b.name === 'China Holiday')` | Lookup by `S.roundUpDestination` |
| L12473, L12531 | `BRAIN.summary` fallback values | `S.savingsBuckets?.find(b => b.name === 'China Holiday')?.saved \|\| 70.44` | Switch to destination name; revisit fallback default |
| L13226, L13409, L13458, L13521 | PLAN trip card / details / bonus dialog | Display strings | These are trip-card specific (the trip *is* China Holiday). **Likely fine to leave** — these reference the trip, not the round-up destination. Confirm during Phase 2. |

Legitimate hardcodes (do NOT touch): L1218 (initial seed bucket), L7776/L7792/L8042/L8069 (sample/demo data), L12340-41 (PLAN alias map for "china" slug → bucket name).

### C. Required new canonical writers — exact signatures

```js
// ─── NEW: BRAIN.config bubble ──────────────────────────────────────────
// Owns income / payday / budget settings. Pre-Bundle-22-v2 these wrote
// direct to S.* from saveSettings(). After this bubble lands, saveSettings
// becomes a thin orchestrator that calls these.
config: {
  setIncome(v, source) {
    if (!source || !BRAIN._SOURCE_SET.has(source)) return { ok: false, reason: 'unknown-source' };
    const n = +v; if (!isFinite(n) || n <= 0) return { ok: false, reason: 'invalid-value' };
    const old = S.income; S.income = n;
    BRAIN.audit.append({ type: 'income_change', old, new: n, source, ts: Date.now() });
    try { save(); } catch(_){}
    return { ok: true, old, new: n };
  },
  setPayday(v, source) { /* same pattern; validate 1..28 */ },
  setWeekdayBudget(v, source) { /* default 60 */ },
  setWeekendBudget(v, source) { /* default 180 */ },
},

// ─── NEW method on BRAIN.savings ───────────────────────────────────────
getBuckets() { return S.savingsBuckets || []; },
getBucket(nameOrId) {
  const list = S.savingsBuckets || [];
  return list.find(b => b.name === nameOrId) || list.find(b => b.id === nameOrId) || null;
},
getRoundUpDestinationName() {
  // Resolves S.roundUpDestination (bucket name OR PLAN goal id) → display name.
  // Falls back to first bucket if destination orphaned. Empty string if none.
  const dest = S.roundUpDestination;
  if (!dest) { const first = (S.savingsBuckets || [])[0]; return first ? first.name : ''; }
  const b = this.getBucket(dest); if (b) return b.name;
  // Could be a PLAN goal id — let caller decide; return raw dest as last resort.
  return dest;
},
setRoundUpDestination(target, source) {
  // target = bucket name (preferred — buckets are keyed by name in this codebase).
  // Validate: must exist as a bucket OR be a known PLAN goal id.
  if (!source || !BRAIN._SOURCE_SET.has(source)) return { ok: false, reason: 'unknown-source' };
  const validBucket = !!this.getBucket(target);
  const validPlanGoal = (typeof PLAN !== 'undefined') &&
    (PLAN.getGoals() || []).some(g => g.id === target);
  if (!validBucket && !validPlanGoal) return { ok: false, reason: 'unknown-destination', target };
  const old = S.roundUpDestination; S.roundUpDestination = target;
  BRAIN.audit.append({ type: 'roundup_destination_change', old, new: target, source, ts: Date.now() });
  try { save(); } catch(_){}
  return { ok: true, old, new: target };
},

// ─── NEW method on BRAIN.debts ─────────────────────────────────────────
setStrategy(value, source) {
  if (!source || !BRAIN._SOURCE_SET.has(source)) return { ok: false, reason: 'unknown-source' };
  if (value !== 'snowball' && value !== 'avalanche') return { ok: false, reason: 'invalid-strategy' };
  const old = S.debtStrategy; S.debtStrategy = value;
  BRAIN.audit.append({ type: 'debt_strategy_change', old, new: value, source, ts: Date.now() });
  try { save(); } catch(_){}
  return { ok: true, old, new: value };
},
```

### D. New source tags needed in `BRAIN.SOURCES`

The frozen source-tag enum (L11260) needs additions for the new write paths. Per the guardian philosophy (typo'd tags must fail at write time), add to `BRAIN.SOURCES`:

```
SETTINGS_INCOME_EDIT
SETTINGS_PAYDAY_EDIT
SETTINGS_BUDGET_EDIT       // shared by weekday + weekend
SETTINGS_DEBT_STRATEGY     // already may exist — verify
SETTINGS_ROUNDUP_DEST      // for setRoundUpDestination via Settings
QUICKLOG_ROUNDUP_DEST      // if destination is changeable from Quick Log
```

Verify each name doesn't collide with existing tags before adding (`grep "^\s*[A-Z_]*:\s*'" L11260-L11308`).

### E. Schema additions to `S`

```js
S.roundUpDestination = S.roundUpDestination || 'China Holiday';  // bucket name (current default)
```

Seed migration `seedV23_roundUpDestination`: idempotent set to `'China Holiday'` if absent. One-shot. Wrap in the standard `if (S.seedV23Done) return;` pattern.

### F. ⚠ Parallel round-up implementation flag

`'Round-up → China Holiday'` literal appears at **both** L6488 and L7540. Two separate Quick Log save paths apply round-ups. Need to investigate before Bundle 22 v2 wire-up — if these are duplicate code paths, one is dead and silently divergent (correctness risk). Suggested Phase 0 sub-task: diff the two surrounding functions; if duplicate, consolidate; if intentional (e.g., one is delete-undo path), document the distinction.

### G. Revised Phase 0 prerequisite (insert before Phase 1)

Before Phase 1 skeleton, ship a **prerequisite micro-bundle** (call it Bundle 22 v2 Phase 0):

1. Add `BRAIN.config` bubble (full surface above).
2. Add `BRAIN.debts.setStrategy`.
3. Add `BRAIN.savings` getters + `setRoundUpDestination` + `getRoundUpDestinationName`.
4. Add new `BRAIN.SOURCES` tags.
5. Add `S.roundUpDestination` schema + seedV23 migration.
6. Investigate L6488 vs L7540 duplicate (§F). Document or consolidate.
7. Refactor existing `saveSettings` to call the new BRAIN.config writers **without** changing UX (no Settings IA work yet). Confirm Settings still works visually identical.
8. Switch the 9 round-up display sites (§B) to read from `BRAIN.savings.getRoundUpDestinationName()` — even though the dropdown UI isn't built yet, the strings should be data-driven from `S.roundUpDestination` (which defaults to `'China Holiday'`, so visually identical).

**This phase is invisible to the user.** If anything regresses, the diff is small and revert is cheap. Phase 1 (Samsung skeleton) then has a clean backend to wire UI into — no scrambled-canonical-writer mid-flight.

### H. Updated effort estimate

- Phase 0 (backend prerequisites): **~25 min** (~6 BRAIN method additions, 1 seedV23, ~9 display-string rewires, duplicate investigation).
- Phase 1+ unchanged from original spec.
- Adjusted total: **~145 min** vs. spec's 120 min.

### I. Why this matters

The original spec said "All save handlers audited; canonical BRAIN writers introduced where missing" — which implied a small number of additions in passing. Audit shows the actual gap is **two new bubbles' worth of surface area** (`BRAIN.config` is brand new) plus a real schema field plus a duplicate-code investigation. Doing this inline with the Samsung skeleton risks repeating the Bundle 22.x render-chain crash — large IA refactor + new canonical writers in one commit is the same shape as what caused the rollback. Splitting Phase 0 out makes Phase 1's revert trivially safe.

**End of backend augmentation.**

When ready, hand this to CC.