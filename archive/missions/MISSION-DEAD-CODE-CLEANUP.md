# MISSION: DEAD CODE CLEANUP

## Why this mission exists

Layer 1 shipped (`cdbe86e`) without `dom-id-must-exist` because the
first-run probe found 112 orphan DOM references. Most are dead
renderers — code that writes to DOM IDs that no longer exist. ANALYSIS
-DEEP-PASS § 1.2 and PROJECT-EXTRACT § 5.1 both name ~250 lines of
zombie renderers that should have been deleted in earlier refactors
but weren't.

This mission walks all 112 orphans, deletes the dead renderers, fixes
the renamed-DOM cases (where the renderer is correct but the DOM ID
drifted), and produces a clean render pipeline.

After this mission ships:

1. Render pipeline is clean — every render call hits a real DOM target
2. ~250 lines of dead code removed
3. A follow-up commit re-adds `dom-id-must-exist` to Layer 1's catalog
   (15 → 16 rules)
4. Layer 2's MathInvariants ship into a codebase where renders don't
   silently throw or write to nowhere

This is the cleanup that should have been done six months ago. It's
small (1-2 hours) but load-bearing for everything that comes after.

---

## Required reading before starting

In order:

1. `C:\Users\admin\slyght\ANALYSIS-DEEP-PASS-2026-05-05.md` § 1.2
   (architectural drift / dead renderers)
2. `C:\Users\admin\slyght\PROJECT-EXTRACT-2026-05-05.md` § 5
   (render functions catalog, especially § 5.1 dead renderers)
3. `C:\Users\admin\slyght\guardian-static.js` lines covering
   the original `dom-id-must-exist` rule probe (Step 1 investigation
   output enumerated 112 orphans by name)
4. `C:\Users\admin\slyght\OPEN-BUGS.md` — verify nothing in the
   cleanup list contradicts a known-not-dead surface

---

## Desired outcome

After this mission ships, the following are true:

1. The 112 orphans from Step 1 investigation are resolved — each is
   either deleted (dead) or fixed (renamed-DOM).
2. ~250 lines deleted across these renderers per ANALYSIS-DEEP-PASS:
   - `renderPaydayPlan`
   - `renderLtTiles`
   - `renderWrxTracker` (dashboard variant only — the WRX status
     section in settings stays)
   - `renderMumCard`
   - `renderCharacterScore`
   - `renderDashboardMetrics`
3. Any callers of deleted renderers are updated — usually `renderAll`
   or `onStateChange` — to remove the call. No orphan call sites.
4. The render pipeline runs without DOM-write attempts to nonexistent
   targets. Verifiable by Layer 1 dom-id-must-exist returning 0
   violations after this commit.
5. Existing 35 unit tests still pass.
6. All 4 existing guardians + Layer 1 stay green.
7. No regressions to: 56896d8, c800400, 5c6e219, 4a8cfba, 3c9b684,
   7351f9e, a8952c9, ae2bbef, cdbe86e.
8. A follow-up commit (separate from this one) adds dom-id-must-exist
   to Layer 1's rule catalog — proving the cleanup completed.

---

## What to do

### Step 1 — Triage (30-45 min, no code)

For each of the 112 orphans, classify as:

- **DELETE** — renderer is dead per ANALYSIS-DEEP-PASS § 1.2; remove
  function definition + call sites
- **FIX** — renderer is live but DOM ID drifted; either rename DOM ID
  in HTML to match renderer, or rename renderer's DOM target to match
  HTML
- **INVESTIGATE** — unclear; surface for John's call

Produce a triage table:

```
| Orphan ID | Renderer | Classification | Action |
|-----------|----------|----------------|--------|
| m-surplus | renderDashboardMetrics | DELETE | Remove function (line ~XXXX-YYYY) + call from renderAll |
| dt-car | renderLtTiles | DELETE | Remove function + caller |
| auditor-badge | AUDITOR.showAnomaly | FIX | DOM ID exists as 'audit-badge' — rename in code |
| ... |
```

STOP after Step 1. Print triage table. Wait for John's confirmation
before any code.

If the INVESTIGATE column has more than 5 entries, also surface those
as separate questions for John before proceeding.

### Step 2 — Execute (45-60 min)

For each DELETE:
- Remove function definition
- Remove call sites in renderAll, onStateChange, or wherever
- Remove any HTML elements that reference the deleted renderer's
  outputs (if dead in both directions)

For each FIX:
- Apply the agreed-upon rename (either side)
- Verify the renderer still produces correct output

After every 3-5 deletions/fixes, run:
```
npm run guardian
npm test
```

If anything goes red, stop and surface immediately. Don't accumulate
errors.

### Step 3 — Verify (15 min)

Once all 112 orphans are resolved:

1. Run `npm run guardian-static` → should still exit 0 (Layer 1's
   active rules unaffected by this commit)
2. Run `npm test` → 35/35 passing
3. Run `npm run guardian` → all 4 existing + Layer 1 green
4. Manual sanity: open the deployed page mentally and verify no
   render call has lost a DOM target it actually needed

### Step 4 — Commit and push

Single commit message:

```
refactor: delete dead renderers, fix DOM-renamed cases

Walks 112 orphan DOM references surfaced by Layer 1 dom-id-must-exist
probe.

Deleted (~250 lines):
- renderPaydayPlan
- renderLtTiles
- renderWrxTracker (dashboard variant)
- renderMumCard
- renderCharacterScore
- renderDashboardMetrics

Fixed renamed-DOM cases: <N> renderers updated to match current HTML
IDs.

Render pipeline now clean. Layer 2 MathInvariants ship into a codebase
where every render call hits a real DOM target.

Follow-up: re-add dom-id-must-exist to Layer 1 catalog (15 → 16 rules)
in next commit.
```

Push immediately. Verification block on phone: open the app, walk
each tab, confirm nothing visible has gone missing or broken.

### Step 5 — Follow-up commit (separate, 5 min)

After Step 4 ships clean and verification passes:

1. Edit `guardian-static.js` to add `dom-id-must-exist` rule back to
   the active catalog. Logic was already designed during Layer 1's
   Step 1 investigation — it's just been deferred.
2. Run `npm run guardian-static` → should exit 0 (zero orphans now)
3. Commit:
```
chore(guardian): re-add dom-id-must-exist to Layer 1 catalog (15 → 16)

Now that all 112 orphans are resolved (commit <SHA>), the rule fires
clean. Promotes from deferred to active fail-tier.
```
4. Push.

---

## Constraints

- **No regressions** to any prior commit listed above
- **Single commit** for the cleanup (deletes + fixes)
- **Separate follow-up commit** for the rule re-addition
- **35 unit tests must still pass**
- **All 4 existing guardians + Layer 1 stay green throughout**
- **Don't refactor anything else** — this mission is deletion + DOM
  renames only. If you find a bug while reading dead code, log to
  OPEN-BUGS, don't fix in this commit.
- **Don't widen scope** — if the triage surfaces more dead code than
  the named renderers, surface it; don't auto-include.

---

## Push back if

- Triage finds dead renderers NOT in the ANALYSIS-DEEP-PASS list — surface,
  don't auto-include
- A DOM ID rename would break a CSS selector or external integration
  (CSS targeting `#m-surplus` for styling, etc.) — surface and propose
- Any orphan classification needs John's call — surface as INVESTIGATE
- The deletion exposes that another renderer depended on the deleted
  renderer's side effect — surface, propose how to preserve the
  intended behavior
- Total scope creeps past 2 hours — stop, surface what's done and
  what's left

---

## Estimate

Honest range: 1.5-2.5 hours.

- Step 1 triage: 30-45 min
- Step 2 execution: 45-60 min  
- Step 3 verify: 15 min
- Step 4 commit/push: 5 min
- Step 5 follow-up commit: 5 min

If triage finds the work is actually 3+ hours (lots of INVESTIGATE
cases), stop after triage and surface — we'd split into two missions.

---

## Run with

```
Read C:\Users\admin\slyght\MISSION-DEAD-CODE-CLEANUP.md and execute.

Start with Step 1 (triage). Walk all 112 orphans from Layer 1's
investigation output. Produce the classification table. STOP after
Step 1, print findings, wait for John's confirmation before Step 2.

This mission cleans the render pipeline before Layer 2 ships. Single
commit for cleanup, separate follow-up commit re-adds dom-id-must-exist
to Layer 1's catalog.
```
