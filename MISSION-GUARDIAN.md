# MISSION: GUARDIAN

## ⚠️ Read this before reading the layer files

This is the overarching framing for the Guardian system. It owns the
*why* and the *how things fit together*. Each of the three layers has
its own mission file with the *what to build*:

- `MISSION-GUARDIAN-LAYER-1.md` — Static (AST-based, pre-commit)
- `MISSION-GUARDIAN-LAYER-2.md` — Runtime (in-browser, every render)
- `MISSION-GUARDIAN-LAYER-3.md` — Audit (Opus 4.7 reviews diffs pre-deploy)

Each layer ships as a single commit, single mission. Layers 1 and 2
ship in **either order or in parallel**. Layer 3 ships **last**.
Helper-extraction debt is **deferred** to OPEN-BUGS.md #10.

This document evolves in place. No version suffix on the filename.
When the design changes, edit this file. When a layer's spec changes,
edit that layer's file.

---

## WHY THIS EXISTS — THE FOUR-SHAPE DIAGNOSTIC

Look at every bug we've shipped recently (RC1 through RC11 from
MISSION-REALITY-CHECK; the 9 entries currently in OPEN-BUGS.md). Each
one fits one of four shapes:

**Shape 1 — Parallel implementations of one concept.**
Example: `getDiscretionarySpend` (lax filter) and `_NON_SPEND_CATS`
(strict filter) both compute "discretionary spend." Bundle B RC2 fixed
the consumer mismatch but the two filters still exist. RC11 found 13
inline reconstructions of the `paidBills` key shape. Whenever the
codebase has two names for one concept, they drift.

**Shape 2 — Wrong helper chosen for the question.**
Example: RC1 — `getTxnSpent` (all-time non-income sum) was rendered as
"this cycle." The right helper (`MODEL.cycleSpent`) existed; the
caller picked the wrong one. RC4 — the spending alert used
`getAvgDailySpend()` (long historical window) when the question was
"current pace."

**Shape 3 — Logic missing a branch.**
The case the code is in is one the author didn't anticipate. Includes
missing math components, missing case-handling, and missing UX paths.
Example: RC8 — survival forecast computes borrow recommendation but
doesn't subtract the salary that lands inside the days-window (missing
math component). RC10 — `AUDITOR.record`'s `Math.abs(...) < 0.02`
formula doesn't handle the trivial-pass case where `expected === 0`
(missing case in the formula). RC5 — `renderDashTxns` doesn't branch
on the `_isRoundup` flag, so round-up txns render as red debits
(missing variant handler). RC7 — Monday's "0 days" copy doesn't handle
the zero-elapsed-days case (missing zero-case in display logic). RC13
— `lockPaydayPlan` has no confirmation in the non-survival path
(missing UX guard). Each is logic that doesn't reach the right branch
for the case it's in.

**Shape 4 — Magic literals + UI copy mismatched to data.**
Example: RC3 — "Tight — Teachers Health hits tomorrow" was a hardcoded
string that fired for any debt commitment, regardless of which debt or
when. RC10 — `CONSISTENCY_FAIL` audit entries were marked `ok: true`
because the math `Math.abs(0 - 0) < 0.02 = true` was trivially passed.

**Existing guardians catch none of these classes.** They check
shape-of-code (function exists, no orphan ID, manifest links) — not
shape-of-truth. Guardian as a system exists to close that gap.

---

## THE THREE LAYERS — WHAT EACH ANSWERS

| Layer | Question it answers | When it runs | What blocks deploy |
|---|---|---|---|
| **1 — Static** | "Does this code violate a discipline rule?" | pre-commit / pre-push, locally | yes (hard gate from day one) |
| **2 — Runtime** | "Does the live app's math reconcile right now?" | every `renderAll()` in the user's browser | no (banner; tiered escalation) |
| **3 — Audit** | "Did this change introduce a class of bug rules can't see?" | pre-deploy in CI | yes after 2-week calibration; warn-only first |

The three layers are not redundant. Each catches a class the others
miss:

- Layer 1 misses **semantic** bugs (filter chosen wrong but both
  filters exist legitimately) → Layer 3 catches.
- Layer 2 misses **statically-shaped** bugs that haven't shipped
  numbers yet (new parallel implementation that hasn't been called) →
  Layer 1 catches.
- Layer 3 misses **runtime drift** that develops post-deploy (state
  corruption from a flow that wasn't audited) → Layer 2 catches in
  production.

The three layers also catch the same bug at three life-stages:

```
Writing the bug   →  Layer 1 sees the AST violation as you save
Committing it     →  unit test fails (existing tests/core.test.js)
Shipping it       →  Layer 2 surfaces the banner before John finds it
                  →  Layer 3 had already blocked the deploy
```

Three orthogonal cuts, three different funnel-points. Not duplication.

---

## THE TENSION THAT'S WORTH NAMING

The discipline rule **"single source of truth per concept"** lives in
**both Layer 1 and Layer 3** — because each catches a different
manifestation:

- Layer 1 catches the **inline parallel implementation** statically:
  "no `S.txns.filter(t => !t.income)` outside canonical helpers."
- Layer 3 catches the **semantic wrong-helper-chosen** through
  reasoning: "you called the lax filter where the question demands
  strict."

Neither layer alone is sufficient. Layer 1 can't reason about which of
two legitimate helpers a caller should use. Layer 3 can't enumerate
every possible inline filter pattern that hasn't been written yet.

**This is not a flaw — it is the central rule of the project being
reinforced from two angles.** Future readers should resist the urge to
"consolidate" the two checks into one. They are intentionally
overlapping.

---

## PHASING

### Phase A — Layers 1 and 2 (parallel or either order)

Each layer is its own mission, its own single commit. They have no
dependency on each other. Either can ship first or both can ship in
parallel sessions.

| Layer | Estimated time | Dependencies |
|---|---|---|
| Layer 1 | ~3–4 hours | none |
| Layer 2 | ~3–4 hours | none |

Both block-gate. Layer 1 hard-gates the commit (pre-push). Layer 2
surfaces in-browser with severity tiers (warn / fail / critical).

### Phase B — Layer 3 (last)

Layer 3 ships after both Phase A layers are in place. Reasoning: Layer
3 ingests the outputs of Layers 1 and 2 as part of its context bundle
("here's what the static analyzer flagged, here's what the in-browser
invariants caught"). Richer context → better audit. Building Layer 3
first means it has less to reason about.

| Sub-phase | Behavior | Duration |
|---|---|---|
| 3.0 — Warn-only | Findings posted as PR comments. Deploy proceeds. | 2 weeks |
| 3.1 — Hard gate | `fail` severity blocks deploy. Calibration period informs threshold. | ongoing |

### Helper extraction (deferred)

The test-source drift problem (Bundle B refactored
`isThisMonthlyBillPaid` to call `paidBillKey`; the test file's inline
copy didn't follow) is real and Layer 1 doesn't fully solve it. The
right long-term fix is extracting canonical helpers to a `lib/`
module that both `index.html` and `tests/core.test.js` import.

That's a build-system change. **Out of scope for Guardian.** Logged as
OPEN-BUGS.md #10. Defer until after Guardian is in place; revisit when
the team has bandwidth for a multi-session refactor.

---

## COST BUDGET

Layer 3 calls the Anthropic API. Layers 1 and 2 are free.

| Item | Per call | Frequency | Monthly |
|---|---|---|---|
| Layer 3 audit (Opus 4.7, $5/$25 per M tokens) | ~$0.05–$0.18 | per push (~25/month at current cadence) | $1.25–$4.50 |
| With prompt caching on context bundle (~70% of input tokens are stable) | ~$0.02–$0.06 effective | same | **~$0.50–$1.50** |
| Total Guardian operating cost | | | **< $2/month** |

Prompt caching is **enabled by default** on the context bundle (see
Layer 3 mission for implementation). The bundle is rebuilt only when
canonical helpers change — typically zero-to-one times per push.

Cost is a real line item, not free. It's small enough to be a clear
yes, but it should be explicit.

---

## DEFINITION OF DONE — PER LAYER

Each layer's mission file has its own DOD. Across the system:

- **Layer 1** is done when: every bug from RC1–RC11 + OPEN-BUGS that
  fits Shape 1 (parallel implementation) or Shape 4 (magic literal)
  would have been blocked by Layer 1's rules. Validated by running
  Layer 1 against pre-Bundle-B `git stash` of those changes —
  every one fires.
- **Layer 2** is done when: every bug that fits Shape 2 (wrong helper)
  or Shape 3 (math missing component) is detectable as an invariant
  violation in the in-browser banner system. Validated against real
  user state (`state-snapshot.json`) — invariants pass on clean state,
  fire on synthetically-corrupted state.
- **Layer 3** is done when: a 2-week warn-only calibration shows
  ≤1 false-positive per push average. Validated by John walking each
  audit comment and marking accept/dismiss.

---

## THE UPGRADE DISCIPLINE

**Every bug that ships to John after Guardian is in place must be
attributable to a named class.** When one slips through:

1. Identify which layer should have caught it.
2. If the gap is in Layer 1 or Layer 2: add the rule/invariant.
3. If the gap is in Layer 3 reasoning: improve the prompt or the
   context bundle.
4. If no layer would have caught it: that's a new class — name it and
   distribute responsibility across the right layer(s).

Guardian gets stronger via this feedback loop, not by adding
speculative checks.

---

## CROSS-CUTTING CONSTRAINTS

- **No regressions to:** 56896d8, c800400, 5c6e219, 4a8cfba, 3c9b684,
  7351f9e, a8952c9, ae2bbef. Every Guardian commit must verify these.
- **Each layer is one commit.** Reversibility is the safety mechanism.
- **The four existing guardians (`guardian.js`, `guardian-logic.js`,
  `guardian-ui.js`, `guardian-runtime.js`) keep running.** Layer 1
  augments them, doesn't replace them. They cover structural surface
  (DOM IDs, manifest, etc.) that Layer 1's discipline rules don't.
- **Override mechanism on Layer 1 is `// guardian-allow:` comments**
  with one-line justifications, logged to `audit/allow-list.json` so
  deviations are visible debt.
- **Layer 2 banner severity is tiered** (warn / fail / critical).
  See Layer 2 mission for the rule on each tier.
- **Layer 3 is dual-mode** (`push` / `ci` / `local`) so it can run
  from CI **or** from a local pre-push session. Same script, same
  context bundle.

---

## PUSH BACK IF

- During implementation a layer turns out to overlap another in a way
  that's actively harmful (not just intentional reinforcement)
- A specific rule in Layer 1 has a > 30% false-positive rate during
  implementation testing (rule needs refinement before shipping)
- The cost analysis is wrong (more pushes than estimated, larger
  diffs, etc.) — surface and re-budget before continuing
- Layer 3's calibration period reveals it's catching bugs Layers 1
  and 2 should have caught — surface and adjust the lower layers
- A new bug class emerges during construction that doesn't fit any of
  the four shapes — name it and decide where in the architecture it
  belongs

---

## HOW TO CONSUME THIS MISSION

Read this file first. Then pick a layer to ship and read its mission.
Each layer mission is self-contained — implementation steps,
constraints, verification block. None of them require reading the
others to ship.

When all three layers are in production, this file becomes a living
spec. Update it as the system learns.

---

## RELATED DOCS

- **PROJECT-EXTRACT-2026-05-05.md** — the reconnaissance document
  that this design is built on
- **MISSION-REALITY-CHECK.md** — the previous mission that surfaced
  Bundle A and B and produced the smoke test + open bugs
- **OPEN-BUGS.md** — running tracker; #10 captures the helper
  extraction debt
- **SMOKE-TEST.md** — the living checklist of every interactive
  feature; Layer 2 invariants overlap with checklist items
