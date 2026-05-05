# MISSION: DAYSLEFT MIGRATION (Mission F)

## Why this mission exists

During Mission D's Step 1 investigation (commit 03ac0b3), Opus 
surfaced that 12+ inline call sites of `daysLeft(S.payday)` exist 
across index.html. These compute "days until payday" via a 
function that handles edge cases (Feb 31 clamping, payday-morning 
paydayReceived gating) — but a parallel canonical helper 
`MODEL.daysToPayday` exists and uses different logic.

The two implementations diverge on:
- February when `S.payday=31` (clamping vs JS Date rollover)
- The morning of payday itself depending on `paydayReceived` flag

This is the same class of bug as RC11 (parallel implementations) 
and RC2 (filter divergence) — the kind Layer 1 was built to 
catch. MI-15 (Mission D) catches the divergence at runtime 
between the two paths but doesn't fix it.

After this mission ships:
- All 12+ inline `daysLeft(S.payday)` calls migrated to 
  `MODEL.daysToPayday`
- Single source of truth for "days until payday" in renderers
- New Layer 1 rule `no-inline-daysleft-outside-canonical` prevents 
  regression
- MI-15 (Layer 2) reduces from "active divergence detector" to 
  "structural impossibility check" — should never fire post-fix

## Required reading before starting

1. PROJECT-EXTRACT-2026-05-05.md § 4.1 (canonical helpers) and 
   § 4.2 (MODEL fields) — to understand what MODEL.daysToPayday 
   computes
2. The 12 inline sites surfaced by Mission D: L1482, 1507, 1518, 
   1525, 1760, 1831, 2166, 2889, 3198, 3496, 5098, 5666 — verify 
   list is current (line numbers may have shifted post-Mission B 
   and post-Mission EXPORT)
3. The canonical `daysLeft` function definition — locate via 
   search; this is the implementation that handles clamping
4. The `MODEL.daysToPayday` definition — likely in MODEL build 
   function around L2275/2378 per Mission D investigation

## What to do

### Step 1 — Investigation (no code, STOP gate)

Three parts.

#### 1A — Verify the 12 sites list

Line numbers shift across commits. The Mission D-era list (L1482, 
1507, 1518, 1525, 1760, 1831, 2166, 2889, 3198, 3496, 5098, 
5666) needs verification.

Find every current call to `daysLeft(S.payday)` in index.html. 
Print:
- Line number
- Surrounding function/context
- What's done with the result (display? math?)
- Whether the call is inside a renderer (where MODEL.daysToPayday 
  applies) or inside helper logic (where direct call is canonical)

Output: definitive current list.

#### 1B — Verify each site CAN be migrated

For each site, confirm the migration is mechanical. Concerns:
- Sites inside renderer functions where MODEL is in scope: 
  trivial replace.
- Sites where MODEL hasn't been built yet (early in render chain, 
  helper functions called before MODEL exists): can't use 
  MODEL.daysToPayday directly. Surface these — propose either 
  (a) keep inline daysLeft for those sites, with explicit 
  guardian-allow comment, or (b) restructure the call site to 
  use MODEL post-build.
- Sites where the result is used in a way that depends on 
  daysLeft's specific clamping behavior: likely none, but verify. 
  If any exist, the migration changes behavior subtly — surface 
  with reasoning.

Output: per-site migration plan, edge cases flagged.

#### 1C — Layer 1 rule design

Once sites are migrated, add a Layer 1 rule preventing regression. 
Propose rule:

`no-inline-daysleft-outside-canonical`
- Detects: `daysLeft(S.payday)` calls outside the `daysLeft` 
  function definition itself and outside a tightly-scoped 
  allow-list
- Allow-list: the function `daysLeft` itself (recursive or 
  no?), and possibly `MODEL.daysToPayday`'s implementation if 
  it calls `daysLeft` internally
- Severity: fail (consistent with other parallel-implementation 
  rules)

Surface for John's review:
- Is the rule scope correct? Should it be more permissive 
  (allow `daysLeft(otherDate)` calls — only ban the specific 
  `daysLeft(S.payday)` pattern)? Or stricter (ban all 
  `daysLeft` outside MODEL build path)?
- Should the rule's catalog catch be 16 (current 15 + this) or 
  17 (if dom-id-must-exist re-added per pending Cleanup-2 plan)?

### Step 1 deliverables

- Current list of inline sites (verified, not stale)
- Per-site migration plan with edge cases flagged
- Layer 1 rule design with scope confirmation

STOP. John reviews and confirms before any code touches the file.

### Step 2 — Migrate sites (after approval)

In a single pass:
- Replace each `daysLeft(S.payday)` with `MODEL.daysToPayday` at 
  approved sites
- For any sites where MODEL isn't in scope, apply the agreed-upon 
  alternative (keep inline + guardian-allow, or restructure)

After each batch of ~3 sites, run `npm run guardian-static` and 
`npm test` to catch any breakage early.

### Step 3 — Add Layer 1 rule

Implement `no-inline-daysleft-outside-canonical` in 
guardian-static.js. Run against current code — should produce 
0 violations after Step 2's migration.

If any allowed sites surface that need explicit allow-list 
entries, add them to `audit/allow-list.json` with dated reasons.

### Step 4 — Verify

```
npm run guardian-static    → exit 0, new rule active, 0 new violations
npm test                   → 36/36 passing
npm run visual             → 4/4 passing (no visual change expected — 
                              MODEL.daysToPayday and daysLeft 
                              currently produce same value on May 5,
                              so screenshots should be identical)
npm run guardian           → all gates green
```

If `npm run visual` produces diffs, that's a real signal — means 
the migration changed rendered output, which means the two 
implementations were producing different values somewhere. 
Investigate, surface, decide whether to regen baselines or back 
out the change.

On phone after deploy:
- Walk dashboard, calendar, plan mode, settings → confirm "days 
  to payday" displays everywhere look correct (10 days as of 
  May 5)
- Settings → Math Health: MI-15 should still pass (or skip if 
  the comparison becomes tautological post-migration)

### Step 5 — Commit and push

Single commit:

```
refactor(payday): consolidate inline daysLeft(S.payday) → MODEL.daysToPayday

Migrated [N] inline call sites of daysLeft(S.payday) to use the 
canonical MODEL.daysToPayday. Sites: [list of line numbers].

[Edge case sites: any sites where MODEL wasn't in scope, kept 
inline with guardian-allow + reason]

New Layer 1 rule: no-inline-daysleft-outside-canonical. Catalog 
[15→16 OR 16→17 depending on Cleanup-2 status]. Prevents future 
regression to parallel-implementation pattern.

MI-15 (Layer 2) now becomes a structural sanity check — should 
never fire post-fix because both paths use the same source.

Closes OPEN-BUGS #22.
```

Push immediately.

## Constraints

- **No regressions** to any prior commit
- **Single commit** for migration + Layer 1 rule
- **36 tests must still pass**
- **Layer 1 must exit 0** with new rule active and 0 violations
- **Layer V must show 0 visual diff** (or surfaced and resolved 
  if diff appears)
- **No silent behavior change** — if migration produces different 
  values anywhere, surface explicitly
- **No new helper extraction** beyond what already exists in MODEL

## Push back if

- The 12 sites list has drifted significantly (e.g., 18 sites 
  now, or 8) — surface
- Some sites genuinely can't migrate cleanly (MODEL not in scope, 
  semantic difference between implementations) — surface options
- Layer 1 rule scope is unclear — surface for design review
- Visual diffs appear after migration — investigate before 
  committing
- Mission scope creeps past migration + rule (e.g., into 
  refactoring MODEL itself)

## Estimate

Small. Investigation is mechanical. Migration is sed-like. 
Rule is ~20 lines of guardian-static logic. Should ship in 
one short cycle.

## Run with

```
Read C:\Users\admin\slyght\MISSION-DAYSLEFT-MIGRATION.md and 
execute.

Step 1 first — three sub-investigations:
  1A: verify current list of inline daysLeft(S.payday) sites
  1B: per-site migration feasibility
  1C: Layer 1 rule design
Print findings, STOP for John's review before any code.

This consolidates a parallel-implementation pattern surfaced 
during Mission D Step 1. After migration, MI-15 reduces from 
active divergence detector to structural sanity check.

Single commit. Push immediately after gates green.
```
