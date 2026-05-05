# MISSION: VISUAL REGRESSION FOUNDATION (Mission V)

## Why this mission exists

Three layers of validation now ship with every commit:

- **Layer 1** (static, hard-gate) — catches code drift: parallel 
  implementations, magic literals, dead DOM writes
- **Layer 2** (runtime invariants, in-browser) — catches state/math/
  temporal incoherence: NaN balances, paid-bills-key-future, 
  cycle-spend-bounded, etc.
- **(Layer 3 deferred)** — would catch semantic gaps in code review

What none of the layers catch: **bugs that only manifest when 
rendered.** A label that doesn't match what its data means. A card 
appearing where it shouldn't. Two cards contradicting each other. A 
modal opening empty. A button that does nothing on tap. Layout 
shifts when something is deleted. Copy regressions that read 
differently than intended.

The 22 OPEN-BUGS entries surfaced today (May 5) were almost 
entirely caught by John walking the phone. That's the wrong feedback 
loop. The system should catch them, surface diffs to Opus during 
verification, and let John approve or surface as bugs.

This is the missing layer. Visual regression: capture the rendered 
surface deterministically before/after each commit, diff it, surface 
differences for review.

## Scope philosophy — read carefully

This mission ships **Option A: static screenshot foundation** as the 
first commit. Once that's in place, future missions extend to 
Options B (action sequences) and C (AI-vision diffing). The full 
"capture every flow against every state shape at every time point" 
ambition is real but ships incrementally — building all of it in one 
go is the kind of scope creep this discipline guards against.

What this commit ships: capture 6 key screens against 1-3 state 
fixtures, deterministic, pixel-diff against baseline, surface 
differences on demand and via opt-in pre-push hook.

What this commit does NOT ship: action recording, time-mocking, 
AI-vision semantic diffs, full multi-fixture coverage. Those are 
follow-up missions if Option A proves valuable.

## Required reading before starting

1. PROJECT-EXTRACT-2026-05-05.md § 3 (state schema), § 5 (render 
   functions catalog) — to understand what screens exist and what 
   their dependencies are
2. OPEN-BUGS.md — to understand which bugs were visual-only and 
   would have been caught
3. existing `package.json` to see what tooling is already available 
   and what new deps would be added
4. existing `state-snapshot.json` to understand the fixture format

## Decisions DEFERRED to Opus's investigation (Step 1)

This is the part where you have latitude. **Investigate, propose, 
defend.** I want a recommendation with reasoning on each of these 
before any code is written:

### 1. Tooling choice

**Playwright vs Puppeteer vs something else.** Both are viable. 
Playwright is more modern, better Chrome control, native parallel 
execution. Puppeteer is leaner, more established, smaller 
footprint. There may be other options worth considering (Cypress 
for richer flow capture? Just headless Chrome via CLI? Some other 
tool I'm not aware of?).

Propose: which tool, why, what it costs in deps and footprint, what 
it enables for future Options B/C extensions.

### 2. Diff library

Pixel-level comparison library. **pixelmatch** is the obvious 
choice. **resemblejs** is an alternative with better anti-aliasing 
tolerance. Other options?

Propose: which library, why, what tolerance threshold to use 
(0%? 0.1%? configurable?).

### 3. Screens to capture

Mission spec says "6 key screens." That's my guess. Propose the 
actual list based on what would catch the most regression value:

- Dashboard (definitely)
- Bills tab (definitely)
- Calendar view inside Bills (probably)
- Plan Mode (probably)
- Analysis tab (probably — but it's long; multi-screenshot scrolled?)
- Settings (probably)
- Chat tab (maybe — mostly empty)
- Modals: Add Transaction, Edit Transaction, Add Savings, Mark Paid 
  confirmation (some? all? none in Option A?)

Propose: the actual list with reasoning. Justify any inclusions 
beyond the obvious 4 and any exclusions of the maybes.

### 4. Fixtures

How many state shapes to capture against. The mission's 
recommendation was "1-3 starting fixtures." Propose:

- Should it start with just current state-snapshot.json?
- Add 1-2 synthetic edge cases (post-payday flush, mid-cycle 
  survival)?
- Add John's real current export as a fixture?
- Defer all multi-fixture work to a follow-up mission?

The tradeoff: more fixtures = more regression coverage but more 
baseline images to maintain. Each fixture × each screen = N 
baseline images. 3 fixtures × 6 screens = 18 baselines. 
Manageable. 6 fixtures × 10 screens = 60. Edge of manageable.

Propose: starting fixture count, reasoning, expansion plan.

### 5. Baseline storage and updates

How are baseline images stored and updated. Options:

- Committed to git in `visual/baselines/` (durable, but bloats 
  repo with binary files)
- Stored externally (S3, GitHub Releases, somewhere else)
- Generated on-demand by running against a known-good commit SHA
- Some hybrid

When commits intentionally change visuals (e.g., Mission A's 
deletions changed the dashboard), how does the baseline update? 
Manual `npm run visual:accept` to overwrite? Auto-update on main 
merge? Something else?

Propose: storage mechanism, update workflow, repo-bloat mitigation.

### 6. Pre-push hook integration

Layer 1 has an opt-in pre-push hook installed via 
`scripts/install-hooks.sh`. Should Mission V follow the same 
pattern? Differences worth considering:

- Visual diffs take longer (~30s vs Layer 1's ~100ms) — might 
  frustrate developers, push cadence
- Failing visual diffs need a human review step that pre-push 
  hooks can't do automatically
- Maybe better as `npm run visual` invoked manually before push?

Propose: pre-push hook yes/no, or some alternative integration.

### 7. Diff surfacing

When a diff is found, what does the output look like? Options:

- HTML report with side-by-side images and highlighted differences
- Image files saved to disk with naming convention
- Console output listing changed screens, opens images in default 
  viewer on diff
- Some integration with mission verification blocks

Propose: surfacing format, what makes review fast.

### 8. CI/CD integration (or lack thereof)

Should this run on GitHub Actions for every PR? Or local only?

- Local only is simpler but easier to skip
- GitHub Actions catches commits that bypass the hook
- GitHub Actions on a private repo costs nothing for SLYGHT's 
  cadence
- Storage of baselines in CI is its own decision

Propose: CI integration scope, or defer to follow-up.

### 9. Anything else

If during investigation you spot something I haven't named — a 
better tool, a smarter approach, a flaw in this mission's framing, 
a different problem decomposition — surface it. Don't silently 
absorb. The whole point of the STOP gate is to let John review 
proposals before code happens.

## Desired outcome

After this mission ships:

1. `npm run visual` captures all decided-upon screens against all 
   decided-upon fixtures, diffs against baselines, surfaces 
   differences in chosen format
2. `npm run visual:accept` (or equivalent) updates baselines after 
   intentional visual changes
3. A clear documented workflow for what John does when a visual 
   regression appears
4. Baseline images exist for current main (commit at time of ship)
5. The system runs deterministically — same code + same fixture 
   produces identical screenshots
6. Documentation in repo explaining how to use Mission V going 
   forward
7. Future missions can rely on Mission V's diffs as part of 
   verification (commit messages can reference visual diff 
   outcomes)
8. No regressions to Layer 1, Layer 2, or any prior commit
9. 35/35 tests still passing
10. Optional: a sample diff demonstrating the system catching 
    something — could be Mission A's intentional changes if 
    baselines pre-Mission-A are recoverable, or a synthetic test

## What to do

### Step 1 — Investigate and propose (full latitude)

Investigate the 9 decision points above. For each, propose a 
recommendation with reasoning. Don't just answer the question — 
propose what should be built and why.

Surface anything else you spot during investigation that affects 
the design — better tools, scope concerns, prerequisites I missed, 
opportunities to fold in something useful that I didn't mention.

Print findings as a proposals table. STOP. Wait for John's review 
and confirmation before any code.

This step deserves real investigation time. Don't rush it. Better 
to STOP for an hour of John's review than ship the wrong tool 
choice.

### Step 2 — Build (after Step 1 approval)

Implement the agreed-upon design. Surface immediately if anything 
in execution diverges from the Step 1 plan — don't silently 
adjust.

Run guardian + tests after each significant addition.

### Step 3 — Capture initial baselines

Generate the first set of baseline images against agreed fixtures 
and screens. Commit them (or store them per Step 1's storage 
decision).

### Step 4 — Demonstrate it working

Either:
- Run a synthetic test (e.g., temporarily mutate a fixture, run 
  diff, confirm it surfaces correctly)
- Or run against a live commit transition that should produce a 
  diff
- Document what the diff output looks like in practice

### Step 5 — Documentation

Write or update:
- README.md section on visual regression
- visual/README.md with workflow details
- Note in MISSION-GUARDIAN.md (or equivalent) about the new layer

### Step 6 — Commit and push

Single commit (or 2 if natural — e.g., infrastructure commit 
followed by baseline-images commit). Push.

Verification:
- `npm run visual` succeeds with 0 differences against baseline
- Layer 1 still exits 0
- Layer 2 invariants still all passing
- 35/35 tests
- Documentation reads cleanly

## Constraints

- **No regressions** to Layer 1, Layer 2, or any prior commit
- **Tests must still pass** (35/35)
- **Layer 1 must still exit 0** with same allow-list count
- **Layer 2 invariants must still all pass** on real state
- **Don't fix bugs** Mission V surfaces — those become future 
  missions. Mission V ships the gate, not the fixes.
- **Single mission scope** — Option A only. If Step 1 surfaces that 
  Option A isn't enough, push back and propose; don't silently 
  expand to Option B+.
- **No live phone screenshots** — Mission V runs deterministic 
  fixtures, not live state. Real-state regression is a different 
  kind of test.

## Push back if

- Step 1 investigation suggests Option A foundation is wrong and 
  something different should ship — surface, propose
- Tooling choice has surprising downsides not anticipated
- The 9 decision points don't cleanly resolve — one or more needs 
  more discussion before code
- Scope creeps past what Option A should reasonably ship
- A simpler approach is available that wasn't named in this spec

## Run with

```
Read C:\Users\admin\slyght\MISSION-VISUAL-REGRESSION.md and execute.

Step 1 first — investigate the 9 decision points, propose 
recommendations with reasoning. Surface anything else you spot.
Print proposals table. STOP for John's review before any code.

This is the foundation for catching bugs that Layers 1 and 2 don't 
catch — visible regressions, layout shifts, copy contradictions, 
broken modals. Option A scope only. Future missions extend to 
Options B (action recording) and C (AI-vision diffs).

Take the time to investigate properly. The Step 1 STOP is where 
the mission's quality is decided.
```
