# CLAUDE-CODE-SHIP-PROMPT-27.md

## Bundle 27 — Payday Plan Canvas

**HEAD:** `edfe3e2` (Bundle 26 Phase 1.5b — Allocate Payday sub-screen + BRAIN.allocation bubble)
**Target:** Two-commit bundle. Phase 0 (invisible backend) + Phases 1–8 (UI). ~6.5h CC work. Phone-verify required after Phase 1 (visual STOP gate) and after each subsequent phase.

**Architectural reuse:** This bundle copies the Settings Bundle 22 v3 Samsung-style architecture wholesale — root navigator + off-canvas sub-screens + edit-on-tap modals. The CSS, transition timing, sub-screen container, and navigator row patterns are all already shipped and proven in Settings. This bundle's UX delta is **interactive dropdowns inside each sub-screen** (quick-pick amount pills, reason selectors, category dropdowns) instead of plain text input modals.

---

## Why this design (history)

Three design attempts before this:

- **v1 — Timeline + SPLIT canvas.** John verdict: "the runway is confusing and the SPLIT is static to Darwin." Rejected. Over-built around the Darwin trip scenario, not John's actual job-to-be-done.
- **v2 — Bills-first checklist with 5 drill-downs.** John verdict: "you're so nearly there." Right priorities, right categories, right tick-to-done semantics. But sub-screens felt static.
- **v3 — Single long scrollable canvas.** John verdict: "not long scrollable... we don't need 4 tiles within this new menu, it needs to be more interactive like sub-screens and then dropdowns within the subscreen." Rejected the consolidation; reaffirmed sub-screens.

v4 (this bundle) keeps v2's information architecture and the v3 refinements he approved (per-cycle override, buffer floor in auto-allocate, AI chat re-plan, "left when Jun 15 pay hits" copy). The new content is **interactive dropdown patterns** inside every sub-screen.

---

## Architecture

**Root page (`#pg-payday-plan`):** A calm navigator. Shows the income hero, the 3 numbers, the proportion bar, and 5 category rows. Tapping a category row slides in its sub-screen. No editing happens on the root.

**Five sub-screens:** Each is an absolutely positioned div, default off-canvas (`transform: translateX(100%)`). Activated by adding `.payday-active` class which sets `transform: translateX(0)`. CSS transition: `transform 250ms ease-out`. **Use the same CSS variables and the same animation timing as Bundle 22 v3 Settings sub-screens.** Class names should follow the same convention (`payday-subscreen`, `payday-active`, `subscreen-header`, `subscreen-body`, `subscreen-back`) — just `payday-*` instead of `settings-*`.

**Edit-on-tap pattern:** Items in sub-screens display read-only at rest. Tapping an item opens a focused edit modal — but unlike Settings (single text input), Payday Plan modals are **interactive**: quick-pick amount pills, dropdown selectors for reasons/categories, inline date pickers.

**Three new reusable components:** the quick-pick amount picker, the reason/category dropdown, and the inline date picker. Each spec'd below.

---

## Root page layout

```
‹  Payday Plan       Cycle May 15 ▾   ⓘ

$8,482 to plan
$7,282 net  +  $1,200 bonus  ✏
────────
$84 now  →  $182 left when Jun 15 pay hits

──────────────────

Claimed $5,940 · Free $2,542 · /Day $40

█████████████ ████ █████████ ██ ████████████
Bills        Debt  Savings   Up  Living

──────────────────

🏠  Bills                     ›
    $1,840 · 4 of 7 paid

💳  Debts                     ›
    $658 · 0 of 1

💰  Savings plan              ›
    $2,000 · 0 of 5 transfers

🎯  Known upcoming            ›
    $200 · 0 of 4

📅  Daily living              ›
    $40/day × 31 days

──────────────────

⚙  Auto-allocate              ›
💬  Ask AI                    ›
🔒  Lock plan                 ›
```

### Notes on root

- Row height min 56px (matches Settings).
- Touch target min 44×44px (matches Settings).
- The income hero, balance line, 3-number line, and proportion bar are read-only at rest. Tap the ✏ next to bonus to open the Pay & Bonus modal (§9). Tap the 3-number line to see the math breakdown (popover).
- Tap any of the 5 category rows → sub-screen slides in.
- Tap a proportion bar segment → same as tapping its corresponding category row.
- `⚙ Auto-allocate`, `💬 Ask AI`, `🔒 Lock plan` are also nav rows in the same style — tap → action.
- If `S.activePlan.lockedAt` is set, "🔒 Lock plan" row changes to "🔓 Re-plan" with a "✓ Locked May 15" subtitle.

---

## Sub-screens — contents

All five follow the Bundle 22 v3 sub-screen skeleton: header with `‹` back button + title, body with grouped sections, rows with optional grouping headers.

### 🏠 Bills sub-screen

```
‹  Bills    $1,340 · 4 of 7 paid

PROGRESS
████░░░░░░░░░░░░░░  $400 / $1,340 paid

DEFERRED THIS CYCLE
$500 ⚠ Rent shortfall — Rego + Darwin

BEFORE PAYDAY
─────────────────────────
☑  Rent (Mum)      May 1   $700 ⚠  ›
☑  Internet        May 5    $80    ›

AFTER PAYDAY
─────────────────────────
☐  Phone           May 18   $80    ›
☐  Spotify         May 20   $12    ›
☐  Electricity     May 22  $260    ›
☐  Netflix         May 25   $24    ›
☐  Insurance       Jun 1   $184    ›

────────────────────────
Bills come from the Bills tab.
[ Go to Bills ›  ]
```

**Behaviours:**

- Tap row body (not the checkbox) → opens **Per-cycle Bill Editor modal** (§8).
- Tap checkbox → ticks (post-lock only — pre-lock the checkbox is inert with subtle hint "Lock the plan to start ticking off").
- Bills with overrides show the ⚠ icon and a sub-line: "Paying $X less — [reason]."
- "DEFERRED THIS CYCLE" section only renders if at least one bill has an underpayment override.

### 💳 Debts sub-screen

```
‹  Debts    $658 · 0 of 1

MINIMUM PAYMENTS
─────────────────────────
☐  KIA loan        May 25  $658    ›
   Balance $23,214 · 7.5% APR

EXTRA PAYMENTS
─────────────────────────
Set extra payments under Savings →
KIA extra. They're discretionary,
so they live in the savings allocation.

[ Go to Savings ›  ]
```

**Behaviours:**

- Tap row → **Per-cycle Debt Editor modal** (similar to Bills editor, with quick-pick pills for amounts).
- Tap checkbox → ticks (creates `BRAIN.debts.pay` transaction).

### 💰 Savings sub-screen

```
‹  Savings Plan    $2,000

POOL
─────────────────────────
$2,000 of $2,542 free
$542 unallocated

BUCKETS
─────────────────────────
☐  🌏  China Holiday    $400    ›
       saved $1,200 · target Aug 2026
☐  🏠  Property (Mum)   $600    ›
       saved $3,000
☐  🌧  Rainy Day        $300    ›
       saved $850
☐  🛡  Freedom Buffer   $200    ›
       saved $480

EXTRA DEBT PAYMENT
─────────────────────────
☐  🚗  KIA extra        $500    ›
       shaves ~0.4 months off payoff
       avalanche strategy

────────────────────────
[ + Add bucket ]
(opens Plan tab)
```

**Behaviours:**

- Tap any bucket / KIA-extra row → opens **Savings Allocation Editor modal** (with quick-pick pills + "Take from" dropdown — §10).
- Tap checkbox → ticks (creates `BRAIN.savings.addToBucket` or `BRAIN.debts.payExtra` transaction).
- "POOL" header shows allocated vs total free so John sees if he's under-utilising free money.

### 🎯 Known Upcoming sub-screen

```
‹  Known Upcoming   $200 · 0 of 4

ITEMS
─────────────────────────
☐  🎁  Mum's day gift   May 12  $80  ›
☐  🧴  Essentials       ~May 20  $40  ›
☐  🎂  Dad's birthday   May 28   $60  ›
☐  🏋  Gym renewal      May 30   $20  ›

[ + Add item ]

────────────────────────
Things you know you'll need to buy
this cycle. The AI will know about
these when you ask "can I afford X."
```

**Behaviours:**

- Tap row → opens **Known Upcoming Editor modal** (§11) with category dropdown, date picker, quick-pick amount.
- Tap "+ Add item" → opens same modal in create mode.
- Tap checkbox → ticks (creates `BRAIN.transaction.add` with category and note).
- Editable both pre-lock and post-lock (lenient).

### 📅 Daily Living sub-screen

```
‹  Daily Living    $1,240

CURRENT
─────────────────────────
$40/day × 31 days = $1,240

FLOOR
─────────────────────────
Minimum daily: $30                    ›
Below this triggers a warning.

CONTEXT
─────────────────────────
Status:        ✅ Healthy
Floor:         $30/day
Current:       $40/day
3-cycle avg:   $32/day

ABOUT
─────────────────────────
Daily living is what you spend on
day-to-day stuff that isn't a known
upcoming item — groceries, fuel,
coffee, transit.

It's computed:
(To plan − Bills − Debts − Savings
 − Known upcoming) ÷ days in cycle

To increase your daily, reduce one
of the categories above.
```

**Behaviours:**

- Tap "Minimum daily" row → **Floor Editor modal** with quick-pick pills ($20, $25, $30, $35, $40, $50, custom).
- No checkboxes (daily living is auto-tracked via Quick Log, not ticked here).
- Post-lock, the CURRENT section gains a "Pace" row showing actual vs planned.

---

## Reusable components

### 1. Sub-screen container (REUSED from Bundle 22 v3)

Same CSS as Settings sub-screens, just `payday-*` class prefix:

```html
<div class="payday-subscreen" id="payday-bills">
  <header class="subscreen-header">
    <button class="subscreen-back" onclick="closePaydayCategory('payday-bills')"
            aria-label="Back to Payday Plan">‹</button>
    <h2>Bills</h2>
  </header>
  <div class="subscreen-body">
    <!-- groups + rows -->
  </div>
</div>
```

```css
.payday-subscreen {
  position: absolute;
  inset: 0;
  background: var(--bg);
  transform: translateX(100%);
  transition: transform 250ms ease-out;
  overflow-y: auto;
}
.payday-subscreen.payday-active {
  transform: translateX(0);
}
```

### 2. Navigator row (REUSED from Bundle 22 v3)

```html
<button class="payday-nav-row"
        onclick="openPaydayCategory('payday-bills')"
        aria-label="Bills: 4 of 7 paid, $1,840 total">
  <span class="row-icon">🏠</span>
  <span class="row-text">
    <span class="row-title">Bills</span>
    <span class="row-subtitle">$1,840 · 4 of 7 paid</span>
  </span>
  <span class="row-chevron">›</span>
</button>
```

Same styling as Settings nav rows.

### 3. Edit row inside sub-screen (REUSED from Bundle 22 v3, extended)

```html
<button class="payday-edit-row"
        onclick="openPaydayEditor('bill', 'mum-rent')"
        aria-label="Rent Mum, May 1, $700, paying $500 less than normal, tap to edit"
        data-brain-key="plan.overrides.bill:mum-rent">
  <span class="row-check">☑</span>
  <span class="row-label">
    <span class="row-name">Rent (Mum)</span>
    <span class="row-meta">May 1</span>
  </span>
  <span class="row-value">$700 ⚠</span>
  <span class="row-chevron">›</span>
</button>
```

Differences from Settings: leading checkbox column, optional sub-line under row name for warnings/reasons.

### 4. Quick-pick amount modal (NEW — primary interactive component)

Used in every editor for amount entry. Replaces text input + slider with a grid of pre-set amount pills + custom input.

```html
<div class="payday-modal" id="modal-amount-edit" hidden>
  <div class="payday-modal-backdrop" onclick="closePaydayModal()"></div>
  <div class="payday-modal-card">
    <h3>Edit Phone bill — this cycle</h3>
    <p class="modal-hint">Normal amount: $80</p>

    <div class="quickpick-grid" id="amount-quickpicks">
      <button class="quickpick" data-value="0">$0</button>
      <button class="quickpick" data-value="20">$20</button>
      <button class="quickpick" data-value="40">$40</button>
      <button class="quickpick" data-value="60">$60</button>
      <button class="quickpick active" data-value="80">$80</button>
      <button class="quickpick" data-value="100">$100</button>
      <button class="quickpick" data-value="120">$120</button>
      <button class="quickpick custom" onclick="openCustomAmount()">Custom</button>
    </div>

    <!-- Category-specific extras inserted here -->

    <div class="payday-modal-actions">
      <button onclick="closePaydayModal()">Cancel</button>
      <button class="primary" onclick="saveAmountEdit()">Save</button>
    </div>
  </div>
</div>
```

```css
.quickpick-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin: 16px 0;
}
.quickpick {
  min-height: 44px;
  border-radius: 8px;
  background: var(--surface-alt);
  border: 2px solid transparent;
  font-family: var(--font-mono);
  font-size: 16px;
}
.quickpick.active {
  border-color: var(--accent);
  background: var(--accent-bg);
}
.quickpick.custom {
  font-style: italic;
  background: transparent;
  border: 1px dashed var(--border);
}
```

**Quick-pick value generation:**

```js
function generateQuickPicks(category, normalAmount, contextMax) {
  // category: 'bill' | 'debt' | 'savings' | 'upcoming' | 'floor'
  // Returns array of 7 sensible amounts based on context.

  if (category === 'bill' || category === 'debt') {
    // Around the normal amount: 0%, 25%, 50%, 75%, 100%, 125%, 150%
    return [0, .25, .5, .75, 1, 1.25, 1.5].map(p => roundNice(normalAmount * p));
  }
  if (category === 'savings') {
    // Round increments based on context
    return [0, 100, 200, 300, 500, 750, 1000];
  }
  if (category === 'upcoming') {
    // Common purchase amounts
    return [20, 40, 50, 80, 100, 150, 200];
  }
  if (category === 'floor') {
    return [20, 25, 30, 35, 40, 50, 75];
  }
}
```

The currently-selected value is highlighted with `.active`. Tap any pill → marks active, doesn't auto-save (user still taps Save). Tap "Custom" → opens a small inline number input below the grid.

### 5. Dropdown selector (NEW)

Used for reason, category, and "Take from" selections.

```html
<label class="payday-dropdown">
  <span class="dropdown-label">Reason</span>
  <select class="dropdown-select" id="reason-select">
    <option value="no-change">No change</option>
    <option value="tight-month">Tight month</option>
    <option value="trip-expense">Trip expense</option>
    <option value="unexpected-cost">Unexpected cost</option>
    <option value="other">Other (specify)</option>
  </select>
</label>
```

```css
.payday-dropdown {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 12px 0;
}
.dropdown-label {
  font-size: 14px;
  color: var(--text-dim);
}
.dropdown-select {
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  font-size: 16px;
}
```

When `other` is selected, a free-text input appears below the dropdown.

**Reason dropdown values:** No change / Tight month / Trip expense / Unexpected cost / Bill went up / Bill went down / Other (specify).

**Category dropdown values (Known Upcoming):** Gift / Essentials / Subscription / Event / Family / Health / One-off / Other.

**"Take from" dropdown values (Savings editor):** dynamically populated with other Savings buckets that have flexibility, plus "Take from Free pool" as the default.

### 6. Inline date picker (NEW)

Native HTML `<input type="date">` with styling to match. On mobile this opens the OS-native date picker which is the right UX (no need to build a custom calendar).

```html
<label class="payday-dropdown">
  <span class="dropdown-label">When?</span>
  <input type="date" class="dropdown-select" id="upcoming-date"
         min="2026-05-15" max="2026-06-15" />
</label>
```

`min` and `max` clamp to the current cycle. If user wants a date outside the cycle, surface a warning: "That date is in the next cycle — add it there instead."

### 7. Toggle switch (REUSED from Bundle 22 v3)

Same component as Settings. Used for: Defer-to-next-cycle toggle in Bill editor, Bonus On/Off in Pay modal.

---

## The Bonus toggle (with full v2/v3 calculation logic)

Tap the ✏ next to "+ $1,200 bonus" on the root → opens Pay & Bonus modal:

```
┌────────────────────────────────────┐
│  Pay & bonus for May 15            │
│                                    │
│  Net pay this cycle                │
│  [ $7,282                       ]  │
│                                    │
│  Include bonus?       [●━━] ON     │
│                                    │
│  Bonus amount                      │
│  ┌────┬────┬────┬────┐             │
│  │$500│$800│$1000│$1200●│           │
│  └────┴────┴────┴────┘             │
│  [Custom: $___]                    │
│                                    │
│  Status:                           │
│  [▾ Expected                    ]  │
│      Expected (not received yet)   │
│      Confirmed (in account)        │
│                                    │
│  Bonuses vary with company         │
│  performance. Adjust this anytime  │
│  as your expectation changes.      │
│                                    │
│  [ Cancel ]            [ Save ]    │
└────────────────────────────────────┘
```

### Calculation logic (reinstated from v2)

- **Include bonus toggle ON** → bonus.amount is added to total_to_plan. All numbers below (3-number line, proportion bar, daily living, recommendations) reflect the bonus-included world.
- **Include bonus toggle OFF** → bonus.amount excluded from total_to_plan. Numbers reflect the no-bonus world. If your current allocations would over-commit without the bonus, Free goes red, Lock disabled, coaching block warns.
- **Switching ON → OFF or OFF → ON** is a single state change with full recomputation. Allocations themselves don't move — only the denominator changes.
- **Bonus amount editing** while toggle is ON triggers same recomputation chain.
- **Status: Expected** → bonus is in the plan but tagged as uncertain (italic display on root, "expected" badge in subtitle).
- **Status: Confirmed** → tagged as real. Toggling OFF after confirming requires confirmation: "You marked this bonus as confirmed. Turning it off means it's no longer in the plan. Continue?"

### When bonus actually arrives

John opens modal, switches Status from Expected → Confirmed. The canvas creates a Quick Log income transaction automatically (or assumes the user did so manually first — the modal asks: "Has the bonus landed in your account? [Yes, it's there] [No, just marking confirmed]"). Real balance reflects.

### When bonus doesn't arrive

John opens modal, toggles "Include bonus" OFF. Plan tightens. Free likely goes red. Coaching:

```
💡 $1,200 bonus removed. You're now $X over plan.

Suggestions:
• Reduce Savings → Rainy Day by $400
• Defer Phone bill to next cycle ($80)
• Skip Dad's birthday gift this cycle ($60)

[ Ask AI for help ]
```

---

## Per-cycle override pattern

Bills, Debts, and Savings rows all support per-cycle override of the amount being allocated/paid this cycle, separate from the normal/recurring amount.

### Editor modal (Bills/Debts variant)

```
┌────────────────────────────────────┐
│  Edit Rent (Mum) — this cycle      │
│                                    │
│  Normal:   $1,200                  │
│                                    │
│  Paying this cycle:                │
│  ┌────┬────┬────┬────┐             │
│  │$0  │$300│$600│$900│              │
│  │$1200●│$1500│$1800│Custom│         │
│  └────┴────┴────┴────┘             │
│                                    │
│  Reason:                           │
│  [▾ No change                   ]  │
│                                    │
│  Defer the gap to next cycle?      │
│  [●━━] ON                          │
│                                    │
│  Mark as paid?                     │
│  [○ Not yet]                       │
│                                    │
│  [ Cancel ]            [ Save ]    │
└────────────────────────────────────┘
```

### Logic

- Quick-pick values are generated around the normal amount (see §6.4 quick-pick generation).
- "Reason" defaults to "No change" if the amount equals normal. If user picks a different amount, reason dropdown auto-prompts (highlighted) — they should explain.
- "Defer the gap" toggle:
  - **Default ON** if `thisCycleAmount < normalAmount` (underpaying → defer is the sensible default).
  - **Default N/A** (hidden) if `thisCycleAmount = normalAmount`.
  - **Default OFF** if `thisCycleAmount > normalAmount` (overpaying — no gap to defer).
- "Mark as paid" toggle: pre-lock, this stays OFF (you can't pre-mark before locking). Post-lock, it's the same as ticking the row checkbox.

### Saving

On Save, calls:

```js
BRAIN.plan.setOverride('bill', 'mum-rent', 700, {
  reason: 'Rego + Darwin trip',
  deferAction: 'create_known_upcoming_next_cycle'
}, 'PLAN_OVERRIDE_SET')
```

The row in the Bills sub-screen now shows:

```
☑  Rent (Mum)      May 1   $700 ⚠  ›
   Paying $500 less — Rego + Darwin
```

The Bills sub-screen header gains:

```
‹  Bills    $1,340 · 4 of 7 paid

DEFERRED THIS CYCLE
$500 ⚠ Rent shortfall
```

The root proportion bar Bills segment shrinks. Claimed drops by $500. Free goes up by $500.

### Cycle-end deferred rollover

A daily cron job (extending the existing notification cron) at `cycle.endDate + 1 day`:

1. Scan `S.activePlan.overrides` for items with `deferAction === 'create_known_upcoming_next_cycle'` and `deferred > 0`.
2. For each, create a Known Upcoming item in the next cycle's plan:

```js
{
  name: 'Mum rent shortfall (May)',
  amount: 500,
  category: 'family',  // or 'one-off' depending on category mapping
  notes: 'Carried from May cycle — reason: Rego + Darwin trip',
  source: 'CARRIED_FROM_PRIOR_CYCLE'
}
```

3. User sees these items on next cycle open with a small banner: "3 items carried over from last cycle. Review them?"

---

## Auto-allocate engine (with buffer floor)

### Logic

```
1. hard_claims = sum(bills_this_cycle) + sum(debts_this_cycle) + sum(known_upcoming_this_cycle)
2. days_in_cycle = cycle.endDate - cycle.startDate
3. daily_living_reserve = max(S.activePlan.dailyLivingFloor, avgDailySpend) × days_in_cycle × 1.1
4. buffer_floor = max(300, 0.05 × net_pay)   // S.activePlan.bufferFloor — configurable
5. allocatable = total_to_plan - hard_claims - daily_living_reserve - buffer_floor

6. if allocatable < 0:
   → engine cannot auto-allocate; return shortfall warning.
   
7. else distribute allocatable across savings buckets:
   a. First pass — top up any bucket behind its monthly target (proportional to shortfall).
   b. Second pass — distribute remainder proportional to each bucket's monthly target.
   c. KIA extra: per S.debtStrategy ('avalanche' → KIA extra last, 'snowball' → KIA extra after smallest savings goals filled).

8. Apply via BRAIN.plan.setOverride() calls per bucket, source 'CANVAS_AUTO_APPLY'.
9. Verify: free should be ≥ buffer_floor after apply. If not, log to BRAIN.audit (bug catch).
```

### Apply animation

After tap on `⚙ Auto-allocate`:

1. Briefly highlight each savings bucket row in sequence (50ms apart).
2. Each row's amount updates with a 200ms ease-out value transition.
3. The 3-number line and proportion bar refresh.
4. A toast appears at the bottom: "Auto-allocated. Free $312 — $300 minimum buffer plus $12 spare. [ Undo (10s) ]"
5. Undo button reverses all writes for 10 seconds; after that it dismisses.

### Shortfall warning state

```
🚨 Can't auto-allocate

You need:
  Bills              $1,840
  Debt minimums        $658
  Known upcoming       $200
  Daily living (min) $1,023
  Safety buffer        $364
  ─────────────
  Total               $4,085

You have:
  Net pay            $7,282
  Bonus              [+ $1,200 if expected]
  ─────────────
  Total              $8,482

You CAN cover the must-pays with $4,397
left for savings. But your manual plan
allocates $X to savings — over what's
safely available.

Options:
• Reduce a Savings bucket
• Defer a bill or Known Upcoming item
• Adjust your buffer floor in Daily Living
```

This shortfall scenario is rare for John (his income comfortably covers must-pays), but the wording must be clear when it happens.

### Manual override of buffer

If John manually allocates to Savings such that `free < buffer_floor`:

- Free number goes amber (within $100 of floor) or red (below 0).
- Coaching block: "You're below your $300 safety buffer. That's OK to do, but if a surprise bill hits, you'd be tight. Want me to suggest a fix? [ Yes ] [ No, leave it ]"

He can still lock — manual is allowed. Auto won't suggest it, but John is the boss.

---

## Lock + post-lock + tick semantics

### Lock confirm modal

Tap `🔒 Lock plan` → modal:

```
┌────────────────────────────────────┐
│  🔒 Lock this cycle's plan?        │
│                                    │
│  After locking:                    │
│  ✓ Bills, Debts, Savings amounts   │
│    committed — change requires     │
│    Re-plan or Ask AI.              │
│  ✓ Known Upcoming stays editable.  │
│  ✓ Tick boxes activate for real    │
│    transactions.                   │
│  ✓ AI can propose changes you can  │
│    accept.                         │
│                                    │
│  [⚠ Buffer is tight ($82)]         │
│                                    │
│  [ Cancel ]            [ Lock ]    │
└────────────────────────────────────┘
```

The yellow `[⚠ Buffer is tight]` row only appears if Free is below buffer_floor. Lock is still permitted (manual override).

If Free is negative: Lock is **disabled** (not just warned). User cannot proceed until Free ≥ 0.

### On confirm

```js
const snapshot = {
  cycleId: '2026-05-15',
  lockedAt: Date.now(),
  income: { ...S.activePlan.income },
  overrides: { ...S.activePlan.overrides },
  savings: { ...S.activePlan.savings },
  knownUpcoming: [ ...S.activePlan.knownUpcoming ],
  dailyLivingFloor: S.activePlan.dailyLivingFloor,
  bufferFloor: S.activePlan.bufferFloor,
};

BRAIN.allocation.lock(snapshot, 'CANVAS_LOCK');
SNAPSHOTS.take('payday-plan-locked', { cycleId: snapshot.cycleId });
```

Daily drift detection cron is scheduled. Weekly digest cron is scheduled. End-of-cycle recap cron is scheduled.

### Post-lock visual diffs

- Root: "🔒 Lock plan" row becomes "🔓 Re-plan ✓ Locked May 15" with timestamp.
- Bills / Debts / Savings sub-screens: editor modals open with all fields **disabled** except checkbox toggles. Banner at top: "Locked. Tick items as you handle them. To change amounts, tap Re-plan or ask the AI for an adjustment."
- Known Upcoming: still fully editable.
- Daily Living: floor still editable.
- Each section header gains a progress bar based on ticks.

### Tick semantics

| Category | Tick action | Balance | Networth |
|---|---|---|---|
| Bills | `BILLS.markPaid(billId, 'PLAN_BILLS_TICK')` | ↓ amount | ↓ amount |
| Debts (min) | `BRAIN.debts.pay(debtId, amt, 'PLAN_DEBT_TICK')` | ↓ amount | unchanged |
| Savings bucket | `BRAIN.savings.addToBucket(bucketName, amt, 'PLAN_SAVINGS_TICK')` | ↓ amount | unchanged |
| KIA extra | `BRAIN.debts.payExtra(debtId, amt, 'PLAN_KIA_EXTRA_TICK')` | ↓ amount | unchanged |
| Known upcoming | `BRAIN.transaction.add({...}, 'PLAN_UPCOMING_TICK')` | ↓ amount | ↓ amount |

After every tick, the root "$84 now → $182 when Jun 15 pay hits" line refreshes immediately. Real-time balance reflection, exactly as John asked.

### Untick (mistakes happen)

Long-press a ticked row → "Untick this item?" confirm → calls `BRAIN.plan.untickItem(category, itemId, 'PLAN_UNTICK')` which creates a reversing transaction.

### Re-plan unlock

`🔓 Re-plan` → confirm modal → `BRAIN.allocation.unlock('CANVAS_UNLOCK')` → editors re-enable. Ticked items stay ticked. Re-locking creates a new snapshot.

---

## AI chat integration

### From the Payday Plan canvas

Tap `💬 Ask AI` on root → navigates to AI chat tab with the current plan snapshot preloaded as context. AI sees `BRAIN.plan.getSnapshot()` output and is ready for natural-language plan queries.

If AI chat tab doesn't exist yet (it's on roadmap), this row stays inert with subtitle "Coming soon — needs AI chat feature." Build the row regardless so the architecture is ready when the chat ships.

### Tools the AI gets (BRAIN.plan surface)

```
query_affordability(amount, description?, date?)
  → { verdict: 'yes'|'tight'|'no', available, reasoning, alternatives }

propose_plan_adjustment(changes)
  → { proposalId, summary, projectedNumbers }
  Stored in S.activePlan.pendingProposals.
  Does NOT mutate plan.

apply_plan_adjustment(proposalId)
  → { ok, applied, txnIds }
  Atomically applies all changes in the proposal.

add_known_upcoming(item)
  → { ok, id }
  Single-shot for the common case.
```

### Conversation pattern: propose then apply

The AI never silently mutates the plan. It always:

1. Computes proposed changes.
2. Renders them in chat (natural language summary).
3. Waits for user confirmation.
4. Calls `apply_plan_adjustment` to commit.

Example flow — Mother's Day:

```
John: Mother's day's this weekend — need a card and flowers.

AI:   Got it. Rough estimate: card $10, flowers $60 = $70 total. 
      Sound right, or different?

John: $80 total — want to do something nicer

AI:   $80 works. Two options:
      
      Option A — absorb into daily
         Add to Known Upcoming. Daily drops $40 → $37.
         Everything else stays the same.
      
      Option B — protect daily
         Add to Known Upcoming + reduce China Holiday to $320 
         this cycle. Daily stays at $40. China target shifts: 
         Aug 2026 → Sep 2026.
      
      Both keep your $300 buffer safe.

John: B

AI:   [calls propose_plan_adjustment with changes]
      Here's what I'd change:
      • Add "Mother's Day gift $80" (May 11) to Known Upcoming
      • Reduce China Holiday from $400 → $320 this cycle
      
      Updated: Claimed unchanged · Free unchanged · Per day $40
      China target shifts to Sep 2026.
      
      Apply?

John: yes

AI:   [calls apply_plan_adjustment]
      Done. Updated on plan.
```

---

## Save handler audit

Every save handler in Payday Plan code paths writes through `BRAIN.plan.*` or relevant canonical writers (`BRAIN.savings.addToBucket`, `BRAIN.debts.pay`, `BILLS.markPaid`, `BRAIN.transaction.add`). No direct `S.activePlan.* = ...` mutation outside the BRAIN.plan bubble itself.

| Editor / action | Canonical writer | Source tag |
|---|---|---|
| Bonus modal Save | `BRAIN.plan.setBonus({amount, included, status}, source)` | `PLAN_BONUS_EDIT` |
| Bonus confirmed | `BRAIN.plan.setBonus({...status:'confirmed'}, source)` + Quick Log income txn | `PLAN_BONUS_CONFIRM` |
| Bill editor Save | `BRAIN.plan.setOverride('bill', billId, amt, opts, source)` | `PLAN_OVERRIDE_SET` |
| Debt editor Save | `BRAIN.plan.setOverride('debt', debtId, amt, opts, source)` | `PLAN_OVERRIDE_SET` |
| Savings editor Save | `BRAIN.plan.setOverride('savings', bucketName, amt, opts, source)` | `PLAN_OVERRIDE_SET` |
| Known Upcoming add | `BRAIN.plan.addKnownUpcoming(item, source)` | `PLAN_UPCOMING_ADD` |
| Known Upcoming edit | `BRAIN.plan.updateKnownUpcoming(id, patch, source)` | `PLAN_UPCOMING_UPDATE` |
| Known Upcoming delete | `BRAIN.plan.removeKnownUpcoming(id, source)` | `PLAN_UPCOMING_REMOVE` |
| Daily living floor edit | `BRAIN.plan.setDailyLivingFloor(amt, source)` | `PLAN_DAILY_FLOOR_EDIT` |
| Tick bill | `BRAIN.plan.tickItem('bill', billId, source)` → fires `BILLS.markPaid` | `PLAN_BILLS_TICK` |
| Tick debt | `BRAIN.plan.tickItem('debt', debtId, source)` → fires `BRAIN.debts.pay` | `PLAN_DEBT_TICK` |
| Tick savings | `BRAIN.plan.tickItem('savings', bucket, source)` → fires `BRAIN.savings.addToBucket` | `PLAN_SAVINGS_TICK` |
| Tick KIA extra | `BRAIN.plan.tickItem('kia-extra', debtId, source)` → fires `BRAIN.debts.payExtra` | `PLAN_KIA_EXTRA_TICK` |
| Tick upcoming | `BRAIN.plan.tickItem('upcoming', itemId, source)` → fires `BRAIN.transaction.add` | `PLAN_UPCOMING_TICK` |
| Untick (any) | `BRAIN.plan.untickItem(...)` → fires reversing transaction | `PLAN_UNTICK` |
| Auto-allocate apply | `BRAIN.plan.applyRecommendation(source)` → multiple `setOverride` calls | `CANVAS_AUTO_APPLY` |
| Lock | `BRAIN.allocation.lock(snapshot, source)` + `SNAPSHOTS.take` | `CANVAS_LOCK` |
| Re-plan unlock | `BRAIN.allocation.unlock(source)` | `CANVAS_UNLOCK` |
| AI proposal apply | `BRAIN.plan.applyProposal(proposalId, source)` | `AI_PROPOSAL_APPLY` |

**Guardian rule:** After this bundle, no direct `S.activePlan.* = ...` mutations should be possible from Payday Plan code paths outside the BRAIN.plan bubble.

---

## PHASE 0 — Backend prerequisites (invisible to user)

> Per the Bundle 22 v3 pattern, Phase 0 lands the backend before any UI work. Phase 0 ships as its own commit. If Phase 1 needs revert, Phase 0 stays — `BRAIN.plan` is useful regardless.

### 0.A — Create `BRAIN.plan` bubble

Full surface (paste this into `index.html` alongside other BRAIN bubbles):

```js
plan: {
  // ─── READ ──────────────────────────────────
  
  getSnapshot() {
    // Returns the live current plan state for AI consumption and rendering.
    // See §14 of the spec for full shape.
    const p = S.activePlan || {};
    const days = (p.cycleEndDate && p.cycleStartDate)
      ? Math.round((new Date(p.cycleEndDate) - new Date(p.cycleStartDate)) / 86400000)
      : 31;
    // ... compute claimed/free/perDay/balance/projectedEnd
    return {
      cycleId: p.cycleId,
      cycleStartDate: p.cycleStartDate,
      cycleEndDate: p.cycleEndDate,
      daysInCycle: days,
      daysRemaining: /* computed */,
      income: p.income,
      totalToPlan: /* computed with bonus toggle */,
      bills: /* from BILLS + overrides */,
      debts: /* from BRAIN.debts + overrides */,
      savings: /* from S.savingsBuckets + plan.savings */,
      knownUpcoming: p.knownUpcoming || [],
      dailyLiving: { floor, plannedTotal, spentSoFar, paceDailyAvg },
      derived: { claimedTotal, freeTotal, availableNow, currentBalance, projectedEndBalance, perDay },
      bufferFloor: p.bufferFloor,
      locked: !!p.lockedAt,
      lockedAt: p.lockedAt
    };
  },
  
  queryAffordability(amount, options = {}) {
    if (typeof amount !== 'number' || !isFinite(amount) || amount < 0) {
      return { ok: false, reason: 'invalid-amount' };
    }
    const snap = this.getSnapshot();
    const available = snap.derived.availableNow;
    let verdict, reasoning, alternatives = [];
    if (available >= amount * 1.2) {
      verdict = 'yes';
      reasoning = `After locked commitments and ${snap.dailyLiving.floor}/day floor through ${snap.cycleEndDate}, you have $${available} free. $${amount} fits with margin.`;
    } else if (available >= amount) {
      verdict = 'tight';
      reasoning = `Yes but tight. Available $${available} after all commitments. $${amount} cuts your margin.`;
      alternatives = computeReductionAlternatives(snap, amount);
    } else {
      verdict = 'no';
      reasoning = `Not without shifting. Available $${available}, asked $${amount}. Need to free $${amount - available} from somewhere.`;
      alternatives = computeReductionAlternatives(snap, amount);
    }
    return { ok: true, verdict, available, asked: amount, reasoning, alternatives };
  },
  
  // ─── KNOWN UPCOMING ────────────────────────
  
  addKnownUpcoming(item, source) {
    if (!source || !BRAIN._SOURCE_SET.has(source)) return { ok: false, reason: 'unknown-source' };
    if (!item || typeof item.name !== 'string' || !item.name.trim()) return { ok: false, reason: 'invalid-name' };
    if (typeof item.amount !== 'number' || !isFinite(item.amount) || item.amount < 0) return { ok: false, reason: 'invalid-amount' };
    
    S.activePlan = S.activePlan || _emptyActivePlan();
    S.activePlan.knownUpcoming = S.activePlan.knownUpcoming || [];
    const id = `ku-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newItem = {
      id,
      name: item.name.trim(),
      amount: item.amount,
      date: item.date || null,
      category: item.category || 'other',
      notes: item.notes || null,
      status: 'planned',
      createdAt: Date.now(),
      source
    };
    S.activePlan.knownUpcoming.push(newItem);
    BRAIN.audit.append({ type: 'known_upcoming_add', id, name: newItem.name, amount: newItem.amount, source, ts: Date.now() });
    try { save(); } catch(_){}
    return { ok: true, id };
  },
  
  removeKnownUpcoming(id, source) {
    if (!source || !BRAIN._SOURCE_SET.has(source)) return { ok: false, reason: 'unknown-source' };
    const list = S.activePlan?.knownUpcoming || [];
    const idx = list.findIndex(i => i.id === id);
    if (idx < 0) return { ok: false, reason: 'not-found' };
    const removed = list.splice(idx, 1)[0];
    BRAIN.audit.append({ type: 'known_upcoming_remove', id, name: removed.name, source, ts: Date.now() });
    try { save(); } catch(_){}
    return { ok: true, removed };
  },
  
  updateKnownUpcoming(id, patch, source) {
    if (!source || !BRAIN._SOURCE_SET.has(source)) return { ok: false, reason: 'unknown-source' };
    const item = (S.activePlan?.knownUpcoming || []).find(i => i.id === id);
    if (!item) return { ok: false, reason: 'not-found' };
    const old = { ...item };
    Object.assign(item, patch);
    BRAIN.audit.append({ type: 'known_upcoming_update', id, old, new: { ...item }, source, ts: Date.now() });
    try { save(); } catch(_){}
    return { ok: true };
  },
  
  // ─── PER-CYCLE OVERRIDES ───────────────────
  
  setOverride(category, itemId, amount, opts, source) {
    if (!source || !BRAIN._SOURCE_SET.has(source)) return { ok: false, reason: 'unknown-source' };
    if (!['bill', 'debt', 'savings', 'kia-extra'].includes(category)) return { ok: false, reason: 'invalid-category' };
    if (typeof amount !== 'number' || !isFinite(amount) || amount < 0) return { ok: false, reason: 'invalid-amount' };
    
    S.activePlan = S.activePlan || _emptyActivePlan();
    S.activePlan.overrides = S.activePlan.overrides || {};
    const key = `${category}:${itemId}`;
    const normalAmount = _resolveNormalAmount(category, itemId);
    const old = S.activePlan.overrides[key];
    
    S.activePlan.overrides[key] = {
      normalAmount,
      thisCycleAmount: amount,
      reason: opts?.reason || null,
      deferred: Math.max(0, normalAmount - amount),
      deferAction: opts?.deferAction || 'none',
      setAt: Date.now()
    };
    
    BRAIN.audit.append({ type: 'plan_override_set', key, old, new: S.activePlan.overrides[key], source, ts: Date.now() });
    try { save(); } catch(_){}
    return { ok: true, deferred: S.activePlan.overrides[key].deferred, normalAmount, newAmount: amount };
  },
  
  clearOverride(category, itemId, source) { /* removes the override key */ },
  
  // ─── TICKING ───────────────────────────────
  
  tickItem(category, itemId, source) {
    if (!source || !BRAIN._SOURCE_SET.has(source)) return { ok: false, reason: 'unknown-source' };
    // Resolve amount from plan, call the right downstream writer:
    let txnRes;
    if (category === 'bill') {
      txnRes = BILLS.markPaid(itemId, source);
    } else if (category === 'debt') {
      const amt = _resolveOverrideAmount('debt', itemId);
      txnRes = BRAIN.debts.pay(itemId, amt, source);
    } else if (category === 'savings') {
      const amt = _resolveOverrideAmount('savings', itemId);
      txnRes = BRAIN.savings.addToBucket(itemId, amt, source);
    } else if (category === 'kia-extra') {
      const amt = _resolveOverrideAmount('kia-extra', itemId);
      txnRes = BRAIN.debts.payExtra(itemId, amt, source);
    } else if (category === 'upcoming') {
      const item = (S.activePlan?.knownUpcoming || []).find(i => i.id === itemId);
      if (!item) return { ok: false, reason: 'not-found' };
      txnRes = BRAIN.transaction.add({
        amount: item.amount,
        category: _mapUpcomingCategoryToTxnCategory(item.category),
        note: `Known upcoming: ${item.name}`
      }, source);
      item.status = 'bought';
      item.boughtAt = Date.now();
      item.txnId = txnRes?.id;
    } else {
      return { ok: false, reason: 'invalid-category' };
    }
    
    // Track the tick in S.activePlan.ticks for progress rendering
    S.activePlan.ticks = S.activePlan.ticks || {};
    S.activePlan.ticks[category] = S.activePlan.ticks[category] || {};
    S.activePlan.ticks[category][itemId] = { tickedAt: Date.now(), txnId: txnRes?.id };
    
    BRAIN.audit.append({ type: 'plan_tick', category, itemId, txnId: txnRes?.id, source, ts: Date.now() });
    try { save(); } catch(_){}
    return { ok: true, txnId: txnRes?.id };
  },
  
  untickItem(category, itemId, source) { /* creates reversing transaction */ },
  
  // ─── BONUS ─────────────────────────────────
  
  setBonus(patch, source) {
    if (!source || !BRAIN._SOURCE_SET.has(source)) return { ok: false, reason: 'unknown-source' };
    S.activePlan = S.activePlan || _emptyActivePlan();
    S.activePlan.income = S.activePlan.income || { netPay: 0, bonus: { amount: 0, included: false, status: 'expected' } };
    const old = { ...S.activePlan.income.bonus };
    if (patch.amount !== undefined) S.activePlan.income.bonus.amount = patch.amount;
    if (patch.included !== undefined) S.activePlan.income.bonus.included = patch.included;
    if (patch.status !== undefined) S.activePlan.income.bonus.status = patch.status;
    BRAIN.audit.append({ type: 'plan_bonus_edit', old, new: { ...S.activePlan.income.bonus }, source, ts: Date.now() });
    try { save(); } catch(_){}
    return { ok: true, old, new: { ...S.activePlan.income.bonus } };
  },
  
  // ─── FLOORS ────────────────────────────────
  
  setDailyLivingFloor(amount, source) { /* validate, write, audit */ },
  setBufferFloor(amount, source) { /* validate, write, audit */ },
  
  // ─── AUTO-ALLOCATE ────────────────────────
  
  recommendAllocation() {
    // Returns { bucketAllocations, kiaExtra, leftAsBuffer, warnings? }
    // Pure function — does not mutate.
  },
  
  applyRecommendation(source) {
    const rec = this.recommendAllocation();
    if (!rec.ok) return rec;
    // For each bucket in rec.bucketAllocations, call setOverride
    // Return summary
  },
  
  // ─── AI PROPOSAL FLOW ─────────────────────
  
  proposeAdjustment(changes, source) {
    // changes = [{ op: 'addKnownUpcoming'|'setOverride'|..., payload: {...} }, ...]
    // Stores in S.activePlan.pendingProposals; doesn't mutate plan.
    // Returns { proposalId, summary, projectedNumbers }.
  },
  
  applyProposal(proposalId, source) {
    // Find proposal, iterate changes, call appropriate methods atomically.
    // Removes proposal from pending. Returns { ok, applied, txnIds }.
  },
  
  rejectProposal(proposalId, source) { /* discard */ }
}
```

### 0.B — `BRAIN.allocation.getLockedProgress(now)` (NEW)

Returns per-category progress vs plan for post-lock rendering:

```js
getLockedProgress(now) {
  const p = S.activePlan;
  if (!p || !p.lockedAt) return null;
  return {
    bills:    { paid: countTicked('bills'), total: countTotal('bills'), $paid: sumPaid('bills'), $total: sumTotal('bills') },
    debts:    { /* same shape */ },
    savings:  { /* same shape */ },
    upcoming: { /* same shape */ },
    living:   { spent: sumLivingSinceLock(now), planned: p.dailyLivingTotal, paceDailyAvg: spent / daysElapsed }
  };
}
```

### 0.C — `BRAIN.SOURCES` additions

Verify each doesn't collide (grep L11260–L11308), then add:

```
☐ PLAN_BILLS_TICK
☐ PLAN_DEBT_TICK
☐ PLAN_SAVINGS_TICK
☐ PLAN_KIA_EXTRA_TICK
☐ PLAN_UPCOMING_TICK
☐ PLAN_UPCOMING_ADD
☐ PLAN_UPCOMING_REMOVE
☐ PLAN_UPCOMING_UPDATE
☐ PLAN_UNTICK
☐ PLAN_OVERRIDE_SET
☐ PLAN_OVERRIDE_CLEAR
☐ PLAN_BONUS_EDIT
☐ PLAN_BONUS_CONFIRM
☐ PLAN_DAILY_FLOOR_EDIT
☐ PLAN_BUFFER_FLOOR_EDIT
☐ CANVAS_AUTO_APPLY
☐ CANVAS_LOCK
☐ CANVAS_UNLOCK
☐ AI_AFFORDABILITY_QUERY
☐ AI_PROPOSAL_APPLY
☐ AI_KNOWN_UPCOMING_ADD
☐ CARRIED_FROM_PRIOR_CYCLE
```

### 0.D — Schema additions + `seedV24` migration

```js
S.activePlan = S.activePlan || null;  // null until first canvas open
```

`seedV24_activePlan` migration:

```js
function seedV24_activePlan() {
  if (S.seedV24Done) return;
  if (S.activePlan === undefined) S.activePlan = null;
  S.seedV24Done = true;
  try { save(); } catch(_){}
}
```

Called from the seed-runner alongside existing `seedVN_*` migrations.

### 0.E — Helper: `_emptyActivePlan()`

```js
function _emptyActivePlan() {
  const now = new Date();
  const payday = _resolveNextPayday(now);  // existing utility, or derive from S.payday
  const prevPayday = _resolvePreviousPayday(now);
  return {
    cycleId: prevPayday.toISOString().slice(0, 10),
    cycleStartDate: prevPayday.toISOString().slice(0, 10),
    cycleEndDate: payday.toISOString().slice(0, 10),
    lockedAt: null,
    income: {
      netPay: S.income || 0,
      bonus: { amount: S.expectedBonus || 0, included: !!S.expectedBonus, status: 'expected' }
    },
    overrides: {},
    savings: {},
    knownUpcoming: [],
    dailyLivingFloor: 30,
    bufferFloor: Math.max(300, Math.round((S.income || 0) * 0.05)),
    ticks: { bills: {}, debts: {}, savings: {}, kiaExtra: {}, knownUpcoming: {} },
    pendingProposals: [],
    uiState: {
      sections: { bills: { collapsed: false }, debts: { collapsed: false }, savings: { collapsed: false }, knownUpcoming: { collapsed: false }, dailyLiving: { collapsed: false } }
    }
  };
}
```

### Phase 0 acceptance gate

- [ ] `BRAIN.plan` bubble exists with all methods listed in 0.A.
- [ ] `BRAIN.allocation.getLockedProgress` exists.
- [ ] All 22 new SOURCES tags present in `BRAIN.SOURCES` and `BRAIN._SOURCE_SET`. No collisions.
- [ ] `S.activePlan` migration runs idempotently. `seedV24Done` flag set.
- [ ] Unit tests for `queryAffordability` math, `setOverride` deferred-tracking, `recommendAllocation` buffer floor.
- [ ] guardian-static: 0 new violations.
- [ ] brain tests: baseline failures unchanged.
- [ ] No UI changes visible to John. Settings still works. Bills tab still works.

**Commit Phase 0 separately. Surface diff to John before starting Phase 1.**

---

## Build order (Phases 1–8)

### Phase 1 — Root navigator skeleton (~25 min)

1. Add `#pg-payday-plan` sub-screen container (off-canvas from main app, or as a section in the existing app shell — match how Settings is wired).
2. Build root layout: header, income hero (read-only for now), 3-number line, proportion bar, 5 nav rows, 3 action rows.
3. Wire `openPaydayPlan()` / `closePaydayPlan()` to add/remove `.payday-active` class.
4. All 5 category rows + 3 action rows are tappable but show `alert("Coming soon")`.
5. **STOP. Surface to John for visual confirmation before continuing.**

This is the single biggest insurance against another revert.

### Phase 2 — Sub-screen scaffolding (~20 min)

6. Add 5 sub-screen containers (off-canvas divs with headers + back buttons): `#payday-bills`, `#payday-debts`, `#payday-savings`, `#payday-upcoming`, `#payday-living`.
7. Wire `openPaydayCategory(id)` / `closePaydayCategory(id)`.
8. CSS slide transition matching Settings Bundle 22 v3 (250ms ease-out).
9. Each sub-screen body is empty placeholder.
10. Verify slide animation works smoothly on phone.

### Phase 3 — Sub-screen contents (read-only rows) (~45 min)

11. Bills sub-screen: render from `BILLS.getDueThisCycle()` grouped by before/after payday.
12. Debts sub-screen: render from `BRAIN.debts` minimum payments due this cycle.
13. Savings sub-screen: render from `BRAIN.savings.getBuckets()` + KIA extra slot.
14. Known Upcoming sub-screen: render from `S.activePlan.knownUpcoming` (will be empty initially).
15. Daily Living sub-screen: floor + computed pace + about copy.
16. Section header progress text on root nav rows updates from `BRAIN.plan.getSnapshot()`.

### Phase 4 — Interactive editors (~50 min)

17. Build reusable quick-pick amount modal component (§6.4).
18. Build dropdown selector component (§6.5).
19. Build inline date picker component (§6.6).
20. Bill editor modal: tap row → modal with normal/this-cycle/reason/defer/mark-paid.
21. Debt editor modal: similar to Bill editor.
22. Savings editor modal: quick-pick + "Take from" dropdown.
23. Known Upcoming add/edit modal: name + category dropdown + date picker + quick-pick amount + notes.
24. Daily Living floor editor modal: quick-pick.
25. All Save handlers route through `BRAIN.plan.*` per §13 audit table.
26. **STOP. Confirm the dropdown-driven interactivity feels right.**

### Phase 5 — Tick wiring + real balance reflection (~40 min)

27. Wire all 5 categories' checkboxes: tick → `BRAIN.plan.tickItem(category, itemId, source)`.
28. Long-press a ticked row → untick confirm → `BRAIN.plan.untickItem`.
29. Real balance line on root updates on every tick.
30. Section header progress counters update.
31. Pre-lock: checkboxes show hint "Lock the plan to start ticking" and don't fire (or fire with toast "Lock plan first").

### Phase 6 — Bonus modal + auto-allocate + lock flow (~60 min)

32. Pay & Bonus modal with toggle ON/OFF (full v2/v3 logic recompute on change).
33. Auto-allocate engine: `BRAIN.plan.recommendAllocation` + `applyRecommendation`.
34. Apply animation: staged update of bucket rows, then 3-number line, then coaching toast.
35. Undo bar for 10 seconds after auto-allocate.
36. Lock confirm modal with buffer warning surface.
37. Lock action: `BRAIN.allocation.lock` + `SNAPSHOTS.take('payday-plan-locked')`.
38. Post-lock visual diffs: editors disabled, progress bars active, checkboxes active.
39. Re-plan unlock flow.
40. **STOP. Confirm lock flow round-trip works.**

### Phase 7 — AI integration + notifications (~50 min)

41. `BRAIN.plan.queryAffordability` (already in Phase 0) — verify reasoning copy.
42. `BRAIN.plan.proposeAdjustment` / `applyProposal` flow.
43. Tool definitions for AI chat (if chat exists): `query_affordability`, `propose_plan_adjustment`, `apply_plan_adjustment`, `add_known_upcoming`.
44. `💬 Ask AI` row on root: if AI chat tab exists, navigates with plan context. If not, shows "Coming soon" subtitle.
45. Daily drift detection cron (extends existing notification worker): at 9am Sydney, compute drift, push if over 15%.
46. Weekly digest cron: Sundays 6pm.
47. End-of-cycle recap cron: cycle.endDate − 1 day.
48. Deferred-item rollover cron: cycle.endDate + 1 day.

### Phase 8 — Polish + accessibility + verification (~30 min)

49. All `aria-label`s on tappable elements.
50. `data-brain-key` attributes per §3 convention.
51. 44×44px touch targets enforced via `.tappable` utility class.
52. Onboarding overlay on first canvas open.
53. Empty states for: no bills due, no buckets, no upcoming items.
54. Copy pass per §16 of the design spec.
55. Run guardian-static — expect 0 new violations.
56. Run brain tests — expect baseline failures unchanged plus new tests passing.
57. Phone-verify (full checklist below).

---

## Preserve list (do not break)

Bundle 27 is a new feature; nothing existing should break. Specifically verify after each phase:

- Settings (Bundle 22 v3) still works — no regression on the sub-screen pattern, the CSS variables, or the edit modals.
- Quick Log transaction creation still works.
- BILLS / BRAIN.debts / BRAIN.savings / BRAIN.allocation existing methods all behave identically.
- Snapshots tab still functional.
- No new direct `S.*` mutations from canvas code paths (guardian-static enforcement).

---

## Phone-verify checklist

### After Phase 0 commit

P0.1. App loads. No visible change to any tab.
P0.2. `BRAIN.plan.getSnapshot()` returns a populated object in console (with empty plan if no cycle yet).
P0.3. `BRAIN.plan.queryAffordability(100)` returns `{ verdict: ..., available: ..., reasoning: ... }`.
P0.4. Settings still works. Bills tab still works. Snapshots tab still works.
P0.5. New SOURCES tags visible in `BRAIN._SOURCE_SET`.

### After Phase 1 commit (skeleton STOP gate)

P1.1. New "Payday Plan" entry point exists (wherever it lands in the app shell).
P1.2. Tapping it slides in the root navigator.
P1.3. Income hero shows current pay + bonus. 3-number line renders from `BRAIN.plan.getSnapshot()`.
P1.4. Proportion bar segments show correct widths.
P1.5. 5 category rows render with correct subtitles ("$1,840 · 4 of 7 paid" etc).
P1.6. 3 action rows render at the bottom.
P1.7. Tapping any category or action row shows `alert("Coming soon")` — no crashes.
P1.8. Back button slides root out smoothly.

### After Phase 6 commit (lock STOP gate)

P6.1. Tap Bills → sub-screen slides in. List of bills grouped before/after payday.
P6.2. Tap Phone bill row → modal opens with quick-pick pills around $80.
P6.3. Pick $40 → highlighted. Reason auto-prompts.
P6.4. Save → modal closes. Phone bill row shows "$40 ⚠ Paying $40 less".
P6.5. Bills sub-screen header shows "DEFERRED $40".
P6.6. Back to root → Claimed dropped $40, Free increased $40.
P6.7. Tap Savings → tap China Holiday → modal with quick-picks + Take From dropdown. Adjust. Save.
P6.8. Tap Known Upcoming → "+ Add item" → modal with name input, category dropdown, date picker, quick-pick amounts. Save → item appears.
P6.9. Tap bonus ✏ → modal with toggle + quick-picks + status dropdown. Toggle OFF → Free recomputes (likely red). Toggle ON → back to normal. Save.
P6.10. Tap Auto-allocate → buckets animate, undo bar appears for 10s.
P6.11. Tap Lock → confirm modal → tap Lock → screen flips to locked mode. Editors disabled.
P6.12. Tap a bill checkbox → tick → real balance line updates immediately.
P6.13. Tap Re-plan → unlock → editors re-enabled.

### After Phase 8 commit (full release verify)

Q1. All phone-verify items from P0–P6 still pass.
Q2. AI chat (if shipped): from Payday Plan root, tap Ask AI → chat opens with plan context.
Q3. Drift notification: simulate by ticking nothing for 2 days post-lock; cron fires push.
Q4. Cycle rollover: simulate cycle end with deferred items; verify next cycle's plan gets Known Upcoming items tagged `CARRIED_FROM_PRIOR_CYCLE`.
Q5. UX intelligence "missed tap rate" should not regress after deploy.
Q6. All values touched via Payday Plan code paths appear in BRAIN audit log with appropriate source tag.

---

## What ships in this bundle

**Phase 0 (commit 1, invisible):**
- `BRAIN.plan` bubble (NEW): full surface per §0.A
- `BRAIN.allocation.getLockedProgress` (NEW method)
- 22 new `BRAIN.SOURCES` tags
- `S.activePlan` schema + `seedV24` migration

**Phases 1–8 (commit 2, the UI):**
- Payday Plan root navigator (Bundle 22 v3 Samsung-style)
- 5 sub-screens (Bills, Debts, Savings, Known Upcoming, Daily Living)
- Reusable quick-pick amount modal
- Reusable dropdown selector
- Reusable inline date picker
- Bonus toggle modal with full calculation logic
- Per-cycle override pattern across Bills/Debts/Savings
- Auto-allocate engine with buffer floor
- Lock + post-lock progress tracking
- Tick semantics with real-time balance reflection
- AI integration hooks (chat tools + plan snapshot)
- Drift / weekly / cycle-end notifications via existing Cloudflare worker
- Deferred-item rollover cron
- Accessibility labels + `data-brain-key` attributes
- 44×44px touch targets

## What does NOT ship in this bundle

- AI chat itself (separate roadmap item — this bundle provides the hooks)
- Multi-cycle planning (single cycle only)
- Goal/bucket/bill/debt creation inside Payday Plan (lives in Plan/Bills/Debts tabs)
- Native confirm/alert replacement outside Payday Plan code paths
- Vehicle finance bubble extraction (Bundle 16.5 candidate)
- Drag-section-to-reorder interactions
- Custom calendar widget (using native `<input type="date">`)

---

## Estimated effort

- **Phase 0:** ~60 min (BRAIN.plan is the largest bubble shipped to date)
- **Phase 1:** ~25 min
- **Phase 2:** ~20 min
- **Phase 3:** ~45 min
- **Phase 4:** ~50 min
- **Phase 5:** ~40 min
- **Phase 6:** ~60 min
- **Phase 7:** ~50 min
- **Phase 8:** ~30 min

**Total: ~380 min CC work** (~6.5 hours). Phone-verify ~15 min after Phase 0 commit + ~10 min per subsequent phone-verify gate.

Three commits recommended: Phase 0 (backend), Phases 1–4 (skeleton + sub-screens + editors), Phases 5–8 (ticks + lock + AI + polish). Each commit independently revertable.

If Phase 1 skeleton review surfaces "still wrong" reaction from John, revert is cheap. Phase 0 stays — `BRAIN.plan` is generally useful (the AI chat will consume it regardless of IA outcome).

---

**Send for John's green-light before executing.**

---

That's the full spec. Tell CC to read it fully, surface any clarifying questions before starting, **commit Phase 0 separately and surface to John before starting Phase 1**, and **stop after Phase 1 skeleton, after Phase 4 editors, and after Phase 6 lock flow for visual confirmation.** Three checkpoint gates is the discipline that prevents another revert.
