# MISSION: NET WORTH MODAL (Mission #43)

## Why this mission exists

The 2026-05-06 free-explore sweep surfaced the **single highest-impact
convergence pin** — the Net Worth Breakdown modal trapped 3 of 4
completed personas (Nora, Pat, Sam) and likely Riley too (her crashed
run's final screenshot showed the same modal; her screenshot byte-pair
pattern suggests she was hitting walls and re-screenshotting the same
state). 4 of 5 personas attempted to escape this modal; only Sam
managed via `click "Close"` directly. The other three exhausted 7+
strategies (clicking modal sub-text, scrolling, navigating tabs)
without finding the close affordance.

The modal also surfaced a soft finding from Nora: cents truncation —
the breakdown rows show whole-dollar values while the dashboard and
the modal's bottom Liquid Net Worth row show full $X.XX precision.
Inconsistent number formatting on the same data view.

This is bundled because both bugs live in the SAME modal and ship in
~30-40 lines combined. Splitting would mean two passes through the
same code.

## Three concerns

### Concern 1 — Modal escape (multi-persona trap)

**Evidence:**
- Nora turn 26-29: clicked "Dashboard" (modal sub-text on dashboard
  *behind* the modal), scrolled up — neither closed. Escaped only
  via tab navigation.
- Pat turn 19-30 (40% of his run!): tried 7 strategies — click
  "Assets minus liabilities" (modal subtitle, registers but doesn't
  close), scroll up, navigate_tab spend, click "WHERE YOUR MONEY
  WENT" (text behind the modal), scroll down, navigate_tab dash. Pat
  reported `Net Worth modal persists across tab navigation` as a
  soft_finding because the modal stayed open across tabs.
- Sam turn 13-14: opened modal accidentally via "See Breakdown",
  closed cleanly via direct Close button click.
- Riley (crashed): final screenshot is the modal, three identical-
  byte screenshot pairs imply she was bouncing on the same UI.

**Code surfaces (located in Step 1):**
- `index.html:998-1009` — modal HTML structure. The Close button is
  the LAST element inside the modal, *below* the dynamically-rendered
  `nw-modal-content`. With the modal's `max-height:85vh; overflow-y:auto`
  (line 228) and ~10+ asset/liability rows + section headers + total,
  the Close button sits below the visible viewport. **Users see assets
  + liabilities + Liquid Net Worth, but the Close button is below
  the fold and requires scrolling within the modal to reveal.**
- `index.html:2063` — `goPage(id)` does NOT close any modals. Tab
  navigation while a modal is open leaves the modal visually
  overlaying the new tab. This matches Pat's `Net Worth modal
  persists across tab navigation` finding.
- `index.html:998` — overlay tap-to-close is wired via
  `handleOverlayClick(event,'nw-modal')` but personas couldn't reach
  the overlay area; their click targets (modal title, sub-text,
  obscured background text) all hit elements *inside* the modal or
  failed to find elements outside it.

### Concern 2 — Cents truncation in breakdown rows

**Evidence:**
- Nora turn 18-19: dashboard shows `$381.35`, breakdown modal
  shows `$381` (no cents). Nora cross-checked via `read_state("bal")`
  and reported as `soft_finding`.

**Code surface (located in Step 1):**
- `index.html:3982-3989` — breakdown row rendering uses `fmt(r.val)`
  for individual asset/liability lines and totals.
- `index.html:1211` — `fmt(n) = '$' + Math.round(Math.abs(n)).toLocaleString('en-AU')`
  — rounds to whole dollars.
- `index.html:1213` — `fmtC(n) = (negative-prefix) + '$' + n.toLocaleString('en-AU', {minimumFractionDigits:2, maximumFractionDigits:2})`
  — full $X.XX precision. Already used at line 3991 for the bottom
  Liquid Net Worth row.

**The inconsistency:** rows use `fmt`, totals use `fmt`, but the
final big number uses `fmtC`. So a user sees:
- Dashboard hero: `$381.35` (full precision)
- Breakdown row: `+$381` (rounded — Nora's finding)
- Breakdown total liquid assets: `+$28,456` (rounded)
- Liquid Net Worth bottom-of-modal: `$4,648.57` (full precision —
  same value Nora flagged was inconsistent)

### Concern 3 — 4-persona convergence (meta)

This isn't a separate fix. It's the *signal* that this surface is
the highest-priority UX issue from the sweep. Every persona that
opened the modal struggled to escape. The fixes for Concerns 1+2
*together* address the convergence — once Close is discoverable and
tab nav clears the modal, the trap class is gone.

## Step 1 — Investigation (no code, STOP gate)

### 1A — Code surfaces

(Located above in Concerns 1 + 2.)

### 1B — Verify reproduction

- Open `nw-modal` programmatically or via "See Breakdown" link
- Confirm Close button is below the viewport at default scroll
- Confirm `goPage` doesn't close the modal
- Confirm overlay tap-to-close works (it should — `handleOverlayClick`
  is wired) but is unreachable when personas/users click on
  visually-overlaid content rather than the surrounding overlay area

### 1C — Decide fix shape

**Concern 1 — Modal escape.** Three options:

(a) **Sticky/fixed header with Close button at TOP of modal**
  - Add a top-row Close button that's always visible
  - Existing bottom Close button can stay or be removed
  - Pro: matches mobile-first convention. Always visible.
  - Con: modest CSS change, possibly affects other modals if applied broadly

(b) **Apply scroll-into-view + visual indicator** to existing Close
  - Auto-scroll the Close button into view when modal opens
  - Or add a "scroll for actions ↓" indicator
  - Pro: keeps existing layout
  - Con: still requires user to scroll — band-aid

(c) **Make goPage close all open modals**
  - Tab navigation cleanly closes any open modal
  - Pro: solves Pat's specific finding; simple ~3 lines
  - Con: doesn't help users who don't navigate tabs to escape

**My read:** (a)+(c) combined. (a) gives users a clear way out
that's always visible. (c) handles the edge case of tab nav.
(b) is a band-aid that doesn't really fix discoverability.

**Concern 2 — Cents truncation.** Two options:

(a) **Switch breakdown rows to `fmtC`** — full $X.XX everywhere in
  the modal, matching the dashboard and the modal's bottom total.
  - Pro: consistency. Smallest change. Matches what Nora flagged
    as the right behavior.
  - Con: more visual noise on the row list.

(b) **Switch the bottom Liquid Net Worth display to `fmt`** —
  rounded everywhere in the modal, sacrificing precision.
  - Pro: smaller numbers fit, less visual noise
  - Con: dashboard hero stays at full precision; modal would now
    differ from dashboard in the OPPOSITE direction. Worse for
    users who came from the dashboard expecting matching numbers.

**My read:** (a). Match the dashboard. Nora's finding had the right
direction.

### 1D — Scope decision

Bundle Concerns 1 + 2 in one commit (recommended) or split?

**My read:** bundle. Same modal, same file, same test surface. ~30
lines combined. Splitting adds a commit without separable value.

### Step 1 deliverables

- Code excerpts for each concern (above)
- Reproduction notes (above)
- Concern 1 options surfaced with concrete proposals (above —
  do NOT pre-pick; this is your call)
- Concern 2 options surfaced (above — do NOT pre-pick)
- Bundle vs split recommendation (above)
- Estimated total scope: 30-45 lines for (a)+(c)+a, 25-35 for (a)+a alone

STOP for John's review.

## Step 2 — Implement (after approval)

### Concern 1 (option a + c chosen, illustrative):

1. Modify `nw-modal` HTML structure (lines 998-1009) — add a sticky
   top header row with a small Close button (or "×") that's always
   visible above the scrollable content. Could be a position-sticky
   element inside the modal, or a flex header above the content.

2. Modify `goPage(id)` (line 2063) — at the top of the function,
   close any currently-open modal-overlay elements:
   ```javascript
   document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
   ```

### Concern 2 (option a chosen, illustrative):

3. In `openNetWorthModal()` (line 3951), replace `fmt(r.val)` with
   `fmtC(r.val)` for all rows and totals. ~5 string edits.

## Step 3 — Verify

```
npm run guardian-static  → exit 0
npm test                 → 41/41 passing
node guardian-runtime.js → 47/50 (3 deferred items unchanged)
npm run visual           → expected diff on dashboard.png IF banner
                            is showing AND breakdown affects layout;
                            otherwise visual baselines should be
                            untouched (modal isn't in any baseline)
```

Manual verification:
- Open Net Worth modal via "See Breakdown" or `+` button or
  "Liquid net worth · tap for full picture" link
- Confirm Close button is visible at default scroll
- Open modal, navigate to a different tab via bottom nav,
  confirm modal closes
- Compare row values to dashboard balance (`$381.35`) — modal
  should now show same precision

## Step 4 — Commit

Single commit:

```
fix(nw-modal): escape affordance + cents precision (Mission I 4-persona trap)

Closes Mission I 4-persona convergence on the Net Worth Breakdown
modal. Three of four completed personas (and likely Riley) got
trapped trying to close it — the existing Close button sat below
the modal's natural fold given the asset/liability row count.

Adds a sticky top Close affordance always visible regardless of
content height. goPage() now also closes any open modal-overlay on
tab navigation, addressing Pat's "modal persists across tab nav"
soft_finding directly.

Cents truncation: openNetWorthModal's row rendering switched from
fmt() (rounded whole dollars) to fmtC() (full $X.XX). Now consistent
with the dashboard hero and the modal's existing bottom Liquid Net
Worth row — the inconsistency Nora flagged.

Visual baseline: dashboard.png unchanged (modal not in baseline).
Other baselines unchanged.

Cross-references Mission I salvage report (666db5d).
```

Push immediately.

## Constraints

- No regressions to other modals — the goPage close-all should be
  scoped narrowly enough not to break legitimate modal-with-tab-nav
  flows (none currently exist; verify in Step 1)
- 41 tests must pass
- Layer 1 exit 0
- Layer 2 invariants unchanged
- Visual baselines unchanged (or surface diffs before regen)

## Push back if

- Step 1 reveals other modals would be broken by the goPage
  close-all (would need scoped close instead — surface for review)
- The sticky-top Close has bad mobile/touch ergonomics in
  testing — surface alternatives

## Estimate

Small. ~30-40 lines across HTML + 1 JS line + 5 string edits.
Wall-clock 30-45 min including verification.
