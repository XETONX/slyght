# Phase 3 — Re-evaluation passes

Three structured passes over the Phase 2 findings, looking for cross-cutting patterns.

---

## Pass A — Cross-frame consistency

Looking at how the SAME number / concept is rendered across surfaces post-paid:

| Concept | Dashboard | Bills tab | Analysis | Canvas root | Sub-screens | Consistent? |
|---|---|---|---|---|---|---|
| Balance / runway | $11.72 CRITICAL | $11.72 (BALANCE AFTER) | "run out today" projection | "Free money $268" | n/a | ❌ Three different stories |
| Bills-paid state | "tracked early" warning | ✓ on every bill, TRACKED tag | not surfaced at all | "15 of 15 · 100% · ALL PAID" | "✓ All N already paid" empty-success | ❌ Same fact, four different presentations |
| Cycle status | "1 day to payday" | "1d to payday" | "Payday 1 days away · 15th" | "Cycle 14 Apr - 14 May · Cycle ended" | n/a | ⚠️ Same fact but "ended" vs "1 day away" reads contradictory |
| Free money / surplus | not surfaced | not surfaced | not surfaced | "$268" + breakdown | "$0 left to split" | ❌ Surplus number canonicalisation missing |

**Cross-cutting insight #1:** there is NO canonical "post-paid cycle state" representation. Each surface re-derives from raw state with different framing. The BIG BRAIN cascade fires (data propagates) but the SEMANTIC LAYER is inconsistent.

**Cross-cutting insight #2:** the dashboard is the surface least aware of the lock+tick state — it speaks in pure "actual bank balance" terms. This is the most surprising mismatch because it's the FIRST thing John sees.

---

## Pass B — Copy / labels / glyphs

Looking for tone or terminology drift:

| Surface | Verb for "marked paid in plan" | Tone |
|---|---|---|
| Dashboard banner | "Bills tracked as paid early" + "Show me these bills" | warning ⚠️ |
| Bills tab pill | "TRACKED" | neutral |
| Bills tab calendar | strikethrough + ✓ | celebratory ✓ |
| Canvas tile | "ALL PAID" | celebratory ✅ |
| Sub-screen Bills | "✓ All N already paid" | celebratory |
| Sub-screen row button | "MARK AS PAID" / "✓ paid — tap to undo" | neutral → celebratory |

**Cross-cutting insight #3:** three different verbs are used for the same action: "tracked", "tracked as paid", "paid", "marked done". Pick ONE canonical verb (recommend "Tracked" because it's accurate — doesn't claim money has moved) and propagate everywhere.

**Cross-cutting insight #4:** the Dashboard banner is the ONLY surface that frames this as a warning. Every other surface uses celebratory language. The dashboard is the outlier.

---

## Pass C — Density / contrast in dark mode

Looking purely at visual quality on John's phone-default dark theme:

| Frame | Contrast issue? | Density issue? |
|---|---|---|
| 01 dashboard top | Red banner + red CRITICAL tile compete for attention | High — 6 separate components above the fold |
| 04 bills calendar | Strikethrough on small day numbers is faint | OK |
| 05 bills list | TRACKED tag amber-orange on dark — reads well | OK |
| 07 analysis top | "Debt categories doubling up" amber callout reads well | OK |
| 09 analysis bottom | "Projected to run out today" red callout is prominent (good — it's a warning) but "Within rounding noise" amber explanation right below SOFTENS the warning awkwardly | Medium — two stacked semi-contradicting warnings |
| 10 canvas root | "ALL PAID" green tag pops, "IMPOSSIBLE" red tag on Daily Living pops, "MIN PAY" + "MONTHLY" tags neutral | Mixed pill colours create chip-soup; consider semantic ramp |
| 11 sub-screen bills | full green progress bar is rewarding; italic empty-state has good restraint | Excellent |
| 13 sub-screen savings | mono-font math breakdown reads dense; many tiny secondary lines | Medium — could collapse "$0" rows to a single line |

**Cross-cutting insight #5:** dark mode is doing its job — Bundle 28 dark-baseline + colour tokens hold up. Where density bites is in stacked warning callouts (analysis frame 09 specifically).

---

## Synthesis — three pain centres + one strategic ask

1. **Pain centre #1 — Cascade is technically WORKING but the SEMANTIC LAYER is inconsistent.** Each surface invents its own framing of the same state. (Findings C-02, C-03, C-04, Cross-cutting insights #1, #2, #3, #4.)
2. **Pain centre #2 — `rolloverIfNeeded()` user-initiated-path is still wiping plans.** The c9331c7 fix only closed the boot self-test path. The openPaydayPlan-time call still wipes after 12h. **This is BLOCKING and should ship before John does any morning-lock workflow.** (Finding C-01.)
3. **Pain centre #3 — Dashboard is BIG BRAIN-illiterate.** It speaks bank-balance, not cycle-plan. Critical-red framing on a celebrated milestone. (Findings C-02, C-03, C-10.)
4. **Strategic ask — canonicalise the post-paid state representation.** One verb (recommend "Tracked"), one number set (Balance, Cycle reservedFromTicks, ProjectedRunway, FreeMoney), one tone. Surface this consistently from BRAIN to every consumer.
