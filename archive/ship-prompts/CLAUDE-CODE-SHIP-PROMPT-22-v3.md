# CLAUDE-CODE-SHIP-PROMPT-22-v3.md

## Bundle 22 v3 — Settings IA Redesign (audit-folded)

**HEAD:** 4f026ef (revert of attempt #1)
**Target:** Single bundle shipped across two commits — Phase 0 prerequisite (invisible backend) + Phases 1–6 (Samsung Settings IA). ~145 min CC work total, phone-verify required after each commit.

**v3 changes over v2:** Backend audit (v2 §A–I) folded into the phase plan. Phase 0 added as a real first phase (was bolted-on appendix). `bucketId` normalised to `bucketName` to reflect how `BRAIN.savings` actually keys. `set-wrx` removed from save-handler audit table (WRX edit lives in Plan Mode now). Effort updated 120 → 145 min. **UX spec, preserve-list, data-brain-key convention, accessibility, 44×44 targets, and Phase 1 STOP gate are unchanged from v2.**

---

## Why this redesign

Attempt #1 shipped a 4-section accordion IA. John verdict: "all over the place its horrid". Failure mode: root page exposed form inputs, accordion mechanic felt cluttered, "Managed Elsewhere" card felt disconnected, no clear hierarchy beyond accordion headers.

Root cause: treating 49 settings elements (15 inputs, 14 render targets, 20 onclick handlers) as same-level peers and trying to organise them in-place.

The fix: **Samsung Settings pattern.** Root page is a navigator, not an editor. Seven category rows. Tap to slide into a sub-screen. Edit there. Slide back.

**Why Phase 0 exists in v3:** The v2 spec assumed `BRAIN.config`, `BRAIN.debts.setStrategy`, `BRAIN.savings` getters, and `BRAIN.savings.setRoundUpDestination` were already present. Audit found none of them exist. The v2 plan would have required inventing two new BRAIN bubbles' worth of surface area mid-IA-refactor — the same shape of work that produced the Bundle 22.x render-chain crash and rollback. Phase 0 lands the backend writers first, invisibly, then Phase 1 inherits a clean substrate.

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
Mum account        $3,000     ›
Super balance     $63,429     ›

LIABILITIES
─────────────────────────
KIA loan         -$23,214     ›
KIA original     -$37,400     ›
Credit card           $0      ›
CC limit           $6,000     ›

──────────────────
WRX, bills, debts and goals are
managed in their own tabs.
[Plan →]  [Bills →]  [Debts →]
```

Each row tappable → opens edit modal for that single value.

**Note (v3):** WRX row removed from Financial Data screen. WRX value is edited in Plan Mode via `renderWrxCard` and was already removed from `saveSettings` at L6647. Pointer added in the footer hint.

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

**Round-up destination dropdown values (v3):** Each `<option>`'s `value` is the **bucket name** (for `BRAIN.savings` buckets) or the **PLAN goal/trip id** (for PLAN entries). Display text differentiates with a prefix (`Trip: ...`, `Goal: ...`). See §G below for the canonical writer.

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

One pattern across all edit affordances. Save handlers route through canonical BRAIN writers (which now actually exist — see Phase 0).

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

## PHASE 0 — Backend prerequisites (invisible to user)

> This entire section is new in v3. It absorbs audit §A–G into a discrete shippable micro-bundle that lands **before** any IA work. Phase 0 ships as its own commit. Settings UI is visually unchanged after Phase 0 — only the wiring underneath differs.

### 0.A — Create `BRAIN.config` bubble (NEW)

Owns income / payday / budget settings. Pre-v3 these wrote directly to `S.*` from `saveSettings()` (L6630). After this bubble lands, `saveSettings` becomes a thin orchestrator that calls these.

```js
// Inserted alongside other BRAIN bubbles (BRAIN.savings, BRAIN.debts, etc.)
config: {
  setIncome(v, source) {
    if (!source || !BRAIN._SOURCE_SET.has(source)) return { ok: false, reason: 'unknown-source' };
    const n = +v;
    if (!isFinite(n) || n <= 0) return { ok: false, reason: 'invalid-value' };
    const old = S.income;
    S.income = n;
    BRAIN.audit.append({ type: 'income_change', old, new: n, source, ts: Date.now() });
    try { save(); } catch(_){}
    return { ok: true, old, new: n };
  },

  setPayday(v, source) {
    if (!source || !BRAIN._SOURCE_SET.has(source)) return { ok: false, reason: 'unknown-source' };
    const n = +v;
    if (!Number.isInteger(n) || n < 1 || n > 28) return { ok: false, reason: 'invalid-value' };
    const old = S.payday;
    S.payday = n;
    BRAIN.audit.append({ type: 'payday_change', old, new: n, source, ts: Date.now() });
    try { save(); } catch(_){}
    return { ok: true, old, new: n };
  },

  setWeekdayBudget(v, source) {
    if (!source || !BRAIN._SOURCE_SET.has(source)) return { ok: false, reason: 'unknown-source' };
    const n = +v;
    if (!isFinite(n) || n < 0) return { ok: false, reason: 'invalid-value' };
    const old = S.weekdayBudget;
    S.weekdayBudget = n;
    BRAIN.audit.append({ type: 'weekday_budget_change', old, new: n, source, ts: Date.now() });
    try { save(); } catch(_){}
    return { ok: true, old, new: n };
  },

  setWeekendBudget(v, source) {
    if (!source || !BRAIN._SOURCE_SET.has(source)) return { ok: false, reason: 'unknown-source' };
    const n = +v;
    if (!isFinite(n) || n < 0) return { ok: false, reason: 'invalid-value' };
    const old = S.weekendBudget;
    S.weekendBudget = n;
    BRAIN.audit.append({ type: 'weekend_budget_change', old, new: n, source, ts: Date.now() });
    try { save(); } catch(_){}
    return { ok: true, old, new: n };
  },
},
```

Return envelope `{ ok, old, new, reason? }` is consistent with `BRAIN.transaction.recordCorrection` and other existing bubbles. Callers MUST check `ok` before assuming the write landed.

### 0.B — Add `setStrategy` to `BRAIN.debts`

`BRAIN.debts` (L12037) currently has `add`, `markPaid` only. `saveSettings` writes `S.debtStrategy = $('s-debt-strategy').value` directly. Add:

```js
// Inserted into BRAIN.debts alongside add / markPaid
setStrategy(value, source) {
  if (!source || !BRAIN._SOURCE_SET.has(source)) return { ok: false, reason: 'unknown-source' };
  if (value !== 'snowball' && value !== 'avalanche') return { ok: false, reason: 'invalid-strategy' };
  const old = S.debtStrategy;
  S.debtStrategy = value;
  BRAIN.audit.append({ type: 'debt_strategy_change', old, new: value, source, ts: Date.now() });
  try { save(); } catch(_){}
  return { ok: true, old, new: value };
},
```

### 0.C — Add getters + round-up writer to `BRAIN.savings`

`BRAIN.savings` (L11336) currently has `setBucketSaved(bucketName, …)` and `addToBucket(bucketName, …)`. **Buckets are keyed by `name` (string), not `id`** — every v3 method below uses `bucketName`. No id key gets invented.

```js
// Inserted into BRAIN.savings alongside setBucketSaved / addToBucket

getBuckets() {
  return S.savingsBuckets || [];
},

// Accepts either name (canonical) or id (defensive, for legacy callers).
getBucket(nameOrId) {
  const list = S.savingsBuckets || [];
  return list.find(b => b.name === nameOrId)
      || list.find(b => b.id === nameOrId)
      || null;
},

// Resolves S.roundUpDestination → display name. Used by every round-up display surface.
// Falls back to first bucket if destination orphaned. Empty string if no buckets exist.
getRoundUpDestinationName() {
  const dest = S.roundUpDestination;
  if (!dest) {
    const first = (S.savingsBuckets || [])[0];
    return first ? first.name : '';
  }
  const b = this.getBucket(dest);
  if (b) return b.name;
  // Could be a PLAN goal/trip id — try resolving via PLAN.
  if (typeof PLAN !== 'undefined') {
    const goal = (PLAN.getGoals?.() || []).find(g => g.id === dest);
    if (goal) return goal.name;
    const trip = (PLAN.getTrips?.() || []).find(t => t.id === dest);
    if (trip) return trip.name;
  }
  // Last resort — return raw dest so the user can see what's broken.
  return dest;
},

// target = bucket name (preferred — buckets are keyed by name in this codebase)
//        OR PLAN goal/trip id (for routing round-ups to a PLAN entry).
setRoundUpDestination(target, source) {
  if (!source || !BRAIN._SOURCE_SET.has(source)) return { ok: false, reason: 'unknown-source' };
  if (!target) return { ok: false, reason: 'empty-destination' };

  const validBucket = !!this.getBucket(target);
  let validPlanEntry = false;
  if (!validBucket && typeof PLAN !== 'undefined') {
    validPlanEntry = (PLAN.getGoals?.() || []).some(g => g.id === target)
                  || (PLAN.getTrips?.() || []).some(t => t.id === target);
  }
  if (!validBucket && !validPlanEntry) {
    return { ok: false, reason: 'unknown-destination', target };
  }

  const old = S.roundUpDestination;
  S.roundUpDestination = target;
  BRAIN.audit.append({ type: 'roundup_destination_change', old, new: target, source, ts: Date.now() });
  try { save(); } catch(_){}
  return { ok: true, old, new: target };
},
```

### 0.D — Add new tags to `BRAIN.SOURCES` (checklist)

The frozen source-tag enum (L11260) needs additions for the new write paths. Per guardian philosophy, typo'd tags must fail at write time. **Before adding, `grep` each name against L11260–L11308 to confirm no collision:**

```
☐ SETTINGS_INCOME_EDIT
☐ SETTINGS_PAYDAY_EDIT
☐ SETTINGS_BUDGET_EDIT       // shared by weekday + weekend
☐ SETTINGS_DEBT_STRATEGY     // verify if already present — Bundle 14 may have added it
☐ SETTINGS_ROUNDUP_DEST      // for setRoundUpDestination via Settings
☐ QUICKLOG_ROUNDUP_DEST      // reserve for future — Quick Log destination override
```

For each tag: confirm no existing entry, add to `BRAIN.SOURCES` block, confirm `BRAIN._SOURCE_SET` is regenerated (or is dynamically derived from `BRAIN.SOURCES`).

### 0.E — Schema addition + `seedV23` migration

```js
// In state seed / migration block:
S.roundUpDestination = S.roundUpDestination || 'China Holiday';  // bucket NAME (current default)
```

Migration `seedV23_roundUpDestination`: idempotent set to `'China Holiday'` if absent. One-shot. Wrapped in the standard pattern:

```js
function seedV23_roundUpDestination() {
  if (S.seedV23Done) return;
  if (S.roundUpDestination === undefined || S.roundUpDestination === null) {
    S.roundUpDestination = 'China Holiday';
  }
  S.seedV23Done = true;
  try { save(); } catch(_){}
}
```

Call this from the seed-runner alongside the other `seedVN_*` migrations. Note: this uses the **bucket name**, matching how `BRAIN.savings` keys.

### 0.F — Investigate L6488 vs L7540 duplicate round-up txn

`'Round-up → China Holiday'` literal appears at **both** L6488 and L7540 — two separate Quick Log save paths apply round-ups. **Before rewiring round-up display strings, diff the two surrounding functions:**

1. Open L6488 and L7540 in context (±30 lines each).
2. Determine whether they are:
   - **(a)** Duplicate code paths (one is dead and silently divergent — correctness risk).
   - **(b)** Intentionally separate (e.g., one is the normal Quick Log path, the other is the delete-undo / replay path).
3. **Decision:**
   - If (a): consolidate into one path. The eliminated path's call site must redirect to the canonical one. Audit log entry recording the consolidation.
   - If (b): leave both in place, but add a code comment at each site explaining the distinction (`// Round-up path for normal Quick Log save (vs delete-undo replay at L7540)`).
4. Surface the diff + decision to John in the Phase 0 handoff before proceeding to 0.G.

This is the most likely place a latent bug is hiding. Do not skip.

### 0.G — Rewire round-up display sites to read from `BRAIN.savings.getRoundUpDestinationName()`

The v2 spec implied a small handful of strings needed updating. Audit confirms **9 must-rewire sites** (excluding sample data, the initial seed, and PLAN trip-card strings that legitimately reference the trip-by-name).

| Line | Surface | Current | Required change |
|---|---|---|---|
| L624 | Settings round-up subtitle | `"Add cents to China Holiday"` | `` `Adds cents from every spend to ${BRAIN.savings.getRoundUpDestinationName()}` `` (or similar — match existing tone) |
| L988 | Quick Log preview HTML default | `"🏦 Round-up: +$0.00 → China Holiday"` | Inject `getRoundUpDestinationName()` on render |
| L5938 | Goal-reached message | `"Goal reached — China Holiday funded!"` | `` `Goal reached — ${name} funded!` `` (where `name` is the goal that completed, NOT the round-up destination — verify on read) |
| L5981 | Pin-to-top comment + logic | `"China Holiday gets special treatment"` | Pin whichever bucket equals `S.roundUpDestination` |
| L6392 | Quick Log preview runtime update | Hardcoded label text | Read `getRoundUpDestinationName()` |
| L6488 | Round-up txn note (path #1) | `'Round-up → China Holiday'` | `` `Round-up → ${BRAIN.savings.getRoundUpDestinationName()}` `` |
| L7176, L7377 | AI chat brain-context strings | Hardcoded China Holiday goal description | Read goal + destination dynamically from BRAIN |
| L7540 | Round-up txn note (path #2) | `'Round-up → China Holiday'` | Same as L6488. **Only rewire after §0.F decision lands.** |
| L7545 | Bucket lookup for round-up apply | `S.savingsBuckets?.find(b => b.name === 'China Holiday')` | `BRAIN.savings.getBucket(S.roundUpDestination)` |
| L12473, L12531 | `BRAIN.summary` fallback values | `S.savingsBuckets?.find(b => b.name === 'China Holiday')?.saved \|\| 70.44` | Switch to `getBucket(S.roundUpDestination)?.saved ?? 0`. Revisit the `70.44` magic-number fallback during review — likely stale. |

**Leave untouched** (legitimate hardcodes — confirm during Phase 2 phone-verify):
- L1218 (initial seed bucket name).
- L7776, L7792, L8042, L8069 (sample/demo data).
- L12340–12341 (PLAN alias map: "china" slug → bucket name — this is the slug routing layer, not a display string).
- L13226, L13409, L13458, L13521 (PLAN trip-card / details / bonus dialog strings — these reference the trip itself, not the round-up destination. If the trip is renamed in PLAN, those update via PLAN's own data layer).

### 0.H — Refactor `saveSettings` to call `BRAIN.config` (no UX change)

After 0.A–0.G land, refactor `saveSettings()` (L6630) to call `BRAIN.config.setIncome / setPayday / setWeekdayBudget / setWeekendBudget` and `BRAIN.debts.setStrategy` instead of writing `S.*` directly. **No Settings IA work yet.** Visually identical to pre-Phase-0 state.

Each call MUST pass a valid source tag (`BRAIN.SOURCES.SETTINGS_INCOME_EDIT` etc. from 0.D) and MUST check the return envelope's `ok` flag before continuing. On `ok: false`, surface the `reason` via existing settings-save error-message channel (don't silently swallow).

### Phase 0 acceptance gate (before commit + handoff)

- [ ] 0.A — `BRAIN.config` bubble present with 4 setters; each returns `{ ok, old, new, reason? }`.
- [ ] 0.B — `BRAIN.debts.setStrategy` present, same envelope.
- [ ] 0.C — `BRAIN.savings.getBuckets / getBucket / getRoundUpDestinationName / setRoundUpDestination` present.
- [ ] 0.D — All 6 new tags added to `BRAIN.SOURCES` and present in `BRAIN._SOURCE_SET`. No collisions.
- [ ] 0.E — `S.roundUpDestination` defaults to `'China Holiday'` for fresh state. `seedV23` migration idempotent.
- [ ] 0.F — L6488/L7540 diff documented in handoff. Decision recorded (consolidate or annotate).
- [ ] 0.G — All 9 display sites read from `getRoundUpDestinationName()` (or `getBucket(S.roundUpDestination)`).
- [ ] 0.H — `saveSettings` calls canonical writers. Direct `S.income = …` etc. removed from Settings code paths.
- [ ] guardian-static: 0 new violations.
- [ ] brain tests: baseline failures unchanged.
- [ ] Phone-verify Phase 0: Settings page looks **visually identical** to pre-Phase-0. Round-up subtitle still says "Adds cents from every spend to China Holiday". Saving income / payday / budgets / debt strategy still works.

**Commit Phase 0 as its own commit before starting Phase 1.** If Phase 1 needs revert, Phase 0 stays. The Phase 0 backend is generally useful regardless of IA outcome.

---

## Save handler audit (CRITICAL — for Phase 4)

Every Settings save handler must write through canonical BRAIN writers, not direct `S.*` mutation. After Phase 0 lands, the canonical writers exist; Phase 4 connects the new edit modals to them.

**Audit table — verify or fix each (v3, `set-wrx` removed):**

| Edit field | Current handler | Required BRAIN pathway (post-Phase-0) |
|---|---|---|
| `s-income` | `saveSettings()` | `BRAIN.config.setIncome(v, BRAIN.SOURCES.SETTINGS_INCOME_EDIT)` |
| `s-payday` | `saveSettings()` + `validatePayday()` | `BRAIN.config.setPayday(v, BRAIN.SOURCES.SETTINGS_PAYDAY_EDIT)` (keep `validatePayday` as a UI pre-check) |
| `s-weekday-budget` | `saveBudgets()` | `BRAIN.config.setWeekdayBudget(v, BRAIN.SOURCES.SETTINGS_BUDGET_EDIT)` |
| `s-weekend-budget` | `saveBudgets()` | `BRAIN.config.setWeekendBudget(v, BRAIN.SOURCES.SETTINGS_BUDGET_EDIT)` |
| `s-bal` | `updateBalanceFromSettings()` | Already canonical via `BRAIN.transaction.recordCorrection` (Bundle 15.1). Confirm path unchanged. |
| `s-debt-strategy` | direct via `saveSettings` | `BRAIN.debts.setStrategy(value, BRAIN.SOURCES.SETTINGS_DEBT_STRATEGY)` |
| `set-mum-account` | `saveMumAccountBalance()` | **Audit.** Writes `S.mumAccountBalance` directly AND mirrors into PLAN apartment goal via `PLAN.saveGoal`. If keeping direct write: at minimum add `BRAIN.audit.append` entry. Optional Bundle 22.x: introduce `BRAIN.assets.setMumAccount` that preserves the PLAN.saveGoal mirror. |
| `set-super` | `saveSuperBalance()` | **Audit.** Same shape — direct `S.superBalance` write. Optional `BRAIN.assets.setSuper`. |
| `s-car`, `s-car-original` | direct? | **Audit.** Vehicle finance domain. Defer to Bundle 16.5 vehicle-finance bubble extraction. For Bundle 22: add `BRAIN.audit.append` at minimum. |
| `s-cc`, `s-cc-limit` | direct? | **Audit.** Debt domain. Should eventually route through `BRAIN.debts`. For Bundle 22: surface the path in handoff, fix if trivial, otherwise audit-log + defer. |
| `s-pin` | localStorage direct | Acceptable — security domain, not BRAIN-managed. |
| `set-apikey` | `saveApiKey()` | Acceptable — credentials domain, not BRAIN-managed. |
| Round-ups destination | NEW (built in Phase 0) | `BRAIN.savings.setRoundUpDestination(bucketNameOrPlanId, BRAIN.SOURCES.SETTINGS_ROUNDUP_DEST)` |
| Round-ups on/off | `toggleRoundUps()` | **Audit.** Should write `S.roundUpsEnabled` via canonical or at minimum audit-log. Surface current path in handoff. |

**Dropped from v2:** `set-wrx` row. WRX value editing moved to Plan Mode (`renderWrxCard`); the `s-wrx-value` Settings field was deleted (see `saveSettings` L6647 comment). No save-handler audit applies in Settings any more.

**For each "Audit" entry:** surface the current code path in Phase 4 handoff. If it bypasses BRAIN, propose the canonical writer and ship the fix as part of Bundle 22 v3 if trivial, defer with explicit audit-log fallback otherwise.

**Guardian rule (post-Bundle-22):** No guardian-static violations for "direct `S.config` write", "direct `S.income` write", "direct `S.debtStrategy` write", or "direct `S.roundUpDestination` write" should be possible from Settings code paths.

---

## Round-ups dynamic destination (Phase 4 UI wiring)

Phase 0 lands the schema, the writer, and the read paths. Phase 4 builds the dropdown UI on top.

### Dropdown population (Phase 4)

```js
function populateRoundupDestinationDropdown() {
  const sel = $('s-roundup-dest');
  sel.innerHTML = '';

  // Source 1: existing savings buckets (keyed by NAME)
  const buckets = BRAIN.savings.getBuckets();
  buckets.forEach(b => {
    const opt = new Option(b.name, b.name);   // value = bucket name (canonical key)
    sel.appendChild(opt);
  });

  // Source 2: active PLAN trips (keyed by id — they have unique ids; bucket-name collision risk minimal but worth noting)
  const trips = (PLAN.getTrips?.() || []).filter(t => !t.completed);
  trips.forEach(t => {
    const opt = new Option(`Trip: ${t.name}`, t.id);
    sel.appendChild(opt);
  });

  // Source 3: active PLAN goals
  const goals = (PLAN.getGoals?.() || []).filter(g => !g.completed);
  goals.forEach(g => {
    const opt = new Option(`Goal: ${g.name}`, g.id);
    sel.appendChild(opt);
  });

  // Select current destination (bucket name OR PLAN id)
  sel.value = S.roundUpDestination || '';
}
```

**Edge case:** if a bucket happens to be named the same string as a PLAN goal/trip id, the bucket wins (see `getBucket` resolution order). Unlikely in practice but worth a single-line code comment.

### Save handler

```js
function saveRoundupDestinationViaBrain() {
  const target = $('s-roundup-dest').value;
  const res = BRAIN.savings.setRoundUpDestination(target, BRAIN.SOURCES.SETTINGS_ROUNDUP_DEST);
  if (!res.ok) {
    showSettingsError(`Couldn't update destination: ${res.reason}`);
    return;
  }
  closeEditModal();
  renderRoundupDestinationRow();   // refresh the displayed value
}
```

### Hardening: orphan destination at round-up apply time

When round-up fires, check destination still resolves:

```js
function applyRoundup(amount, txnTs) {
  const dest = S.roundUpDestination;
  if (!dest) return; // not configured, skip

  const target = BRAIN.savings.getBucket(dest)
               || (PLAN.getTrip?.(dest))
               || (PLAN.getGoal?.(dest));
  if (!target) {
    // destination orphaned — queue + notify
    S._pendingRoundups = S._pendingRoundups || [];
    S._pendingRoundups.push({ amount, txnTs, reason: 'orphan-destination' });
    notify('Round-up destination missing', 'Pick a new destination in Settings → Data & Backup');
    return;
  }

  // ... normal transfer logic through BRAIN.savings (uses target.name as the bucket key)
}
```

UI surfaces pending round-ups when user re-opens Data & Backup screen.

---

## Reset All Data — three-stage flow (Phase 4)

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

## Build order (v3 — Phase 0 added)

**Phase 0 — Backend prerequisites (25 min) — INVISIBLE TO USER**

0a. `BRAIN.config` bubble (§0.A)
0b. `BRAIN.debts.setStrategy` (§0.B)
0c. `BRAIN.savings` getters + `setRoundUpDestination` + `getRoundUpDestinationName` (§0.C)
0d. New `BRAIN.SOURCES` tags (§0.D) — verify no collisions before adding
0e. `S.roundUpDestination` schema + `seedV23` migration (§0.E)
0f. **Investigate L6488 vs L7540 duplicate** — document or consolidate (§0.F)
0g. Rewire 9 round-up display sites to read from `getRoundUpDestinationName()` (§0.G)
0h. Refactor `saveSettings` to call new BRAIN writers — no UX change (§0.H)
0i. Phase 0 acceptance gate (checklist above)
0j. **Commit Phase 0 as its own commit.** Surface diff + L6488/L7540 decision to John.

Settings should look visually identical after Phase 0. If anything regresses, the diff is small and revert is cheap.

**Phase 1 — Skeleton (15 min)**

1. Build root navigator: balance hero + 7 category rows + About + Reset All
2. NO sub-screens yet, NO animations, NO edit modals
3. Each category row tappable but currently shows `alert("Coming soon")` or similar placeholder
4. **STOP. Surface to John for visual confirmation before continuing.**

This is the single biggest insurance against another revert. The Phase 1 STOP gate is non-negotiable — Phase 0 + Phase 1 skeleton together form the minimum-revertable checkpoint.

**Phase 2 — Sub-screen scaffolding (20 min)**

5. Add 7 sub-screen containers (off-canvas divs with headers + back buttons)
6. Wire `openSettingsCategory()` / `closeSettingsCategory()` to add/remove `.settings-active` class
7. Add CSS slide transition (`transform 250ms ease-out`)
8. Each sub-screen body is empty placeholder
9. Verify slide animation works smoothly on phone

**Phase 3 — Sub-screen contents in order (60 min)**

10. Financial Data — INCOME / ASSETS / LIABILITIES groups with edit-on-tap rows (no WRX row — pointer to Plan Mode in footer)
11. Strategies — DAILY BUDGETS / DEBT PAYOFF
12. Notifications — toggle component built once, used here
13. AI Assistant — usage display + edit affordances
14. Data & Backup — snapshots + round-ups (with destination dropdown reading from `BRAIN.savings`) + export/import
15. Diagnostics — health/math/UX/log render targets (existing render funcs continue to write innerHTML)
16. About — static info

**Phase 4 — Modals + save handlers (20 min)**

17. Reusable edit modal component
18. Wire all save handlers per the audit table — they call the Phase-0 canonical writers
19. Round-ups destination dropdown population + save handler (uses `BRAIN.savings.setRoundUpDestination`)
20. Reset Data three-stage flow

**Phase 5 — Polish + accessibility (10 min)**

21. Add aria-labels everywhere
22. Add `data-brain-key` attributes
23. Enforce min touch target sizes via CSS
24. Remove all native `confirm()` / `alert()` from Settings code paths (use in-app modals instead)

**Phase 6 — Verification**

25. Run guardian-static — expect 0 new violations
26. Run brain tests — expect baseline failures unchanged, plus new tests passing for `BRAIN.config.*`, `BRAIN.debts.setStrategy`, `BRAIN.savings.setRoundUpDestination` write paths
27. Phone-verify (see checklist below)

---

## Preserve list (do not break)

All 15 input IDs, 14 render-target IDs, 20 onclick handlers from constraint list must remain functional. They move into sub-screens but identifiers and behaviours preserved.

**Input IDs:** `s-bal`, `s-pin`, `s-income`, `s-payday`, `s-weekday-budget`, `s-weekend-budget`, `set-wrx`, `set-mum-account`, `set-super`, `set-apikey`, `s-car`, `s-car-original`, `s-cc`, `s-cc-limit`, `s-debt-strategy`

(Note: `set-wrx` is in the preserve-list because the input ID may still be referenced by other code paths; the Settings *UI row* is removed but the DOM input ID itself stays preserved. Confirm during Phase 3 that no Settings code path depends on `set-wrx` being visible/editable.)

**Render targets:** `snapshots-content`, `health-content`, `math-health-content`, `ux-report-content`, `push-settings`, `api-costs-content`, `audit-log-content`, `emergency-fund-status` (already redirected to PLAN per Bundle 17.x — may be removed if no longer rendered into), `settings-bills` (CC note #5 — may short-circuit if no longer rendered), `import-area`, `import-msg`, `roundups-btn`, `strategy-explain`, `budget-save-msg`

**Onclick handlers (must remain callable from somewhere visible):** `updateBalanceFromSettings`, `saveBudgets`, `saveSettings`, `validatePayday`, `toggleRoundUps`, `saveApiKey`, `saveWrxValue`, `saveMumAccountBalance`, `saveSuperBalance`, `copyExport`, `doImport`, `exportAsFile`, `resetAll`, `HEALTH.render`, `renderMathHealth`, `MathInvariants.resetSession`, `UX.renderReport`, `SNAPSHOTS.take('manual')`, `SNAPSHOTS.tag(i)`, `SNAPSHOTS.untag(i)`, `SNAPSHOTS.restore(i)`

If any handler currently bypasses BRAIN (per audit table), introduce a canonical wrapper that calls the existing handler internally + audits the write. Don't break the existing handler.

---

## Phone-verify checklist

### After Phase 0 commit + GH Pages deploy + PWA refresh

P0.1. Settings looks **visually identical** to pre-Phase-0. No layout change.
P0.2. Round-up subtitle reads "Adds cents from every spend to China Holiday" (data-driven from `S.roundUpDestination`, not hardcoded).
P0.3. Quick Log preview shows "🏦 Round-up: +$0.00 → China Holiday" (data-driven).
P0.4. Editing income / payday / weekday budget / weekend budget / debt strategy in Settings still works; values persist across PWA refresh.
P0.5. Each Settings save creates a new entry in BRAIN audit log with appropriate source tag (`SETTINGS_INCOME_EDIT`, etc.).
P0.6. Round-up txn from Quick Log still creates note "Round-up → China Holiday" (data-driven).
P0.7. L6488 vs L7540 decision documented and the txn note is identical from both paths (or annotated if intentionally separate).

### After Phase 6 commit + GH Pages deploy + PWA refresh

1. Settings root: 7 category rows + balance hero + About + red Reset row visible. No form fields exposed on root. NO PIN/Security row (since `S.pin` not set).
2. Tap each of 7 category rows → smooth slide animation right. Back button slides left.
3. Financial Data → tap "Monthly salary" → edit modal opens with `s-income` field → change → Save → modal closes → row shows new value. No WRX row present; pointer to Plan Mode visible in footer.
4. Strategies → tap "Strategy: Avalanche" → edit modal with dropdown → change to Snowball → Save → row updates → debt list elsewhere reflects new ordering. BRAIN.debts.setStrategy audit entry recorded.
5. Notifications → toggle "Quiet mode" → toggle animates → state persists across PWA refresh.
6. Data & Backup → Round-ups dropdown shows: China Holiday + any other active trips/goals. Change destination → next round-up txn lands in new bucket. All 9 display sites update accordingly (subtitle, Quick Log preview, txn notes, etc.).
7. Data & Backup → "Take Snapshot Now" → snapshot appears in list. "View all" opens nested sub-screen.
8. Diagnostics → all 4 panels (Data Health, Math Health, UX, Activity Log) render correctly (existing render functions still wire up).
9. Reset All Data → tap → Stage 1 modal (type RESET) → type → Continue enables → Stage 2 (impact numbers) → confirm → Stage 3 (countdown) → cancel mid-countdown works → restart and let countdown complete → state resets.
10. All values touched via Settings appear in BRAIN audit log with appropriate canonical source tag.
11. UX Intelligence "missed tap rate" should drop measurably after deploy (bigger touch targets).

---

## Deviations to surface in handoff

CC's notes-for-self items that interact with this bundle:

- **Note 4** (set-income hidden compat field): now resolved — single source via edit modal.
- **Note 5** (renderSettingsBills firing invisibly): now resolved — settings-bills target removed if Bills aren't in Settings anymore. Verify no consumers expect this render target.
- **Note 10** (Allianz/Rego tag mismatch): not addressed in Bundle 22 v3, separate bundle.
- **Note 15** (synced X min ago indicator): leave space in Data & Backup → SNAPSHOTS group for future Bundle 23 cloud-sync status. No code yet.
- **NEW (v3)** L6488/L7540 round-up duplicate: investigation outcome must be surfaced in Phase 0 handoff — either consolidated (with diff) or documented in code comments at each site.

---

## What ships in this bundle (v3)

**Phase 0 (commit 1, invisible):**
- `BRAIN.config` bubble (NEW): `setIncome`, `setPayday`, `setWeekdayBudget`, `setWeekendBudget`
- `BRAIN.debts.setStrategy` (NEW method)
- `BRAIN.savings` additions (NEW methods): `getBuckets`, `getBucket`, `getRoundUpDestinationName`, `setRoundUpDestination`
- 6 new `BRAIN.SOURCES` tags
- `S.roundUpDestination` schema field + `seedV23` migration
- L6488 vs L7540 duplicate-path decision documented or consolidated
- 9 round-up display sites switched from hardcoded "China Holiday" to data-driven reads
- `saveSettings` refactored to call canonical BRAIN writers (no UX change)

**Phases 1–6 (commit 2, the IA refactor):**
- Settings root redesigned as Samsung-style navigator
- 7 sub-screens with slide animation
- Reusable edit modal component
- Reusable toggle component
- Round-ups dynamic destination dropdown UI + canonical writer wiring + orphan handling
- Reset All Data three-stage flow (kills one native `confirm()`)
- All save handlers wired through canonical BRAIN writers
- Accessibility labels + `data-brain-key` attributes everywhere
- 44×44px touch targets enforced

## What does NOT ship in this bundle

- PIN row in Settings (code retained dormant; row re-appears only if PIN gets set)
- Vehicle finance bubble extraction / `BRAIN.assets` (Bundle 16.5 candidate)
- WRX row in Settings (already moved to Plan Mode — pre-existing, not a v3 change)
- Allianz/Rego tag normalization (separate)
- Cloud sync indicator (Bundle 23)
- Native confirm/alert replacement OUTSIDE Settings (Bundle 17.x backlog)

---

## Estimated effort

- **Phase 0:** ~25 min (6 BRAIN method additions, 1 seed migration, ~9 display-string rewires, L6488/L7540 investigation, `saveSettings` refactor).
- **Phases 1–6:** ~120 min (unchanged from v2).
- **Total:** ~145 min CC work. Phone-verify ~10 min after Phase 0 commit + ~10 min after Phase 6 commit.

Largest single Settings refactor in project history, now split across two safely-revertable commits.

If Phase 1 skeleton review surfaces "still horrid" reaction from John, revert is cheap (single commit; Phase 0 stays — the backend writers are useful regardless of IA outcome). If review passes, remaining phases execute with confidence on top of a clean canonical-writer substrate.

---

**Send for John's green-light before executing.**

---

That's the full v3 spec. Tell CC to read it fully, surface any clarifying questions before starting, **commit Phase 0 separately and surface to John before starting Phase 1**, and **stop after Phase 1 skeleton for John's visual confirmation**. The two checkpoint gates (post-Phase-0 visual-identity verify + post-Phase-1 skeleton STOP) are the discipline that prevents another revert.
