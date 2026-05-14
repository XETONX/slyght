# Phase 4 — Proposals

For each finding: action, severity, effort, dependency.

---

## C-01 🚨 Rollover wipes lock+ticks past 12h post-cycle-end

**Action:** widen the defer window AND/OR move the rollover trigger to the new-cycle's start date instead of old-cycle's end + 12h.

**Concrete fix sketch:**
```js
// Current (problematic):
if (hasWork && ageMs < 12 * 3600 * 1000) defer;

// Option A — wider window:
if (hasWork && ageMs < 72 * 3600 * 1000) defer; // 3 days

// Option B — anchor to NEXT payday (cleaner):
const newCycleStart = new Date(S.activePlan.cycleEndDate).getTime();
if (hasWork && Date.now() < newCycleStart + 24*3600*1000) defer;

// Option C — never silently roll over work; require user confirmation:
if (hasWork) return { ok: false, reason: 'awaiting-user-confirm-rollover' };
```

**Recommendation:** Option C is safest. Surface a banner on the canvas root: "Your last cycle (14 Apr - 14 May) ended. Archive it and start a fresh cycle? [Archive & start fresh] [Keep working in this cycle]". Never silently destroy.

**Severity:** 🚨 BLOCKING. John just reported this. Ship before next morning workflow.

**Effort:** ~30 min code + 15 min phone-verify.

---

## C-02 🚨 Dashboard "tracked as paid early" warning punishes happy path

**Action:** detect "intentional mark inside lock window" and skip the warning. Specifically:
- If `tick.ts >= S.activePlan.lockedAt` AND `tick.ts < S.activePlan.cycleEndDate + 7d`, the mark is intentional and within reasonable cycle window → no warning.
- Only fire the warning when `tick.ts < lockedAt` (marked before lock = anomaly) or `tick.ts > cycleEndDate + 7d` (marked way after cycle = stale).

**Severity:** 🚨 HIGH — punishes the workflow John explicitly designed for.

**Effort:** ~20 min code + 10 min phone-verify.

---

## C-03 🚨 Dashboard hero vs canvas free-money tell contradictory stories

**Action:** add a "post-tick projection mode" to the dashboard hero. Display:
- Primary: actual bank balance ($11.72)
- Secondary line: "+$5,248 in tracked bills · projected runway $X after they land"

**Severity:** 🚨 HIGH — this is the "no misyncs" core ask.

**Effort:** ~60 min — requires plumbing BRAIN.plan tick state into the dashboard renderer.

---

## C-04 🚨 Analysis "projected to run out today" ignores tracked bills

**Action:** Analysis runway calc reads `BRAIN.plan.getSnapshot()`. When `lockedAt && Object.keys(ticks.bill).length > 0`, badge the runway with:
- "Includes $X in pre-tracked bills that will burn down balance — expected to land by Y"
- Adjust the "run out" projection if balance is expected to top up via payday before bills land.

**Severity:** 🚨 HIGH.

**Effort:** ~45 min code + 20 min cross-check that the math doesn't double-count.

---

## C-05 ⚠️ Calendar strike-through doesn't visually distinguish today-paid vs future-not-paid

**Action:** add subtle green tint to calendar tile background when `ticks.bill[name]` for that day. Reserve red dot for unpaid future, green check for paid.

**Severity:** ⚠️ MEDIUM.

**Effort:** ~20 min CSS.

---

## C-06 ⚠️ Annual Provisions tile "5 set-aside items" ambiguous post-paid

**Action:** append "auto-saved · no action" to the Annual Provisions tile when in locked state.

**Severity:** ⚠️ MEDIUM.

**Effort:** ~10 min copy.

---

## C-07 💨 Savings pool breakdown math reads "= $0" but actual is "= -$96"

**Action:** show the real arithmetic with explicit floor:
- "$566 - $298 - $364 = -$96 → $0 floor (below safety buffer)"

**Severity:** 💨 SMELL.

**Effort:** ~10 min copy.

---

## C-08 💨 Sub-screen Bills empty-success could celebrate more

**Action:** when ALL sections have 0 unpaid, render a hero card at top: "🎉 Cycle bills sorted · $5,248 tracked across 15 bills. Sit back."

**Severity:** 💨 SMELL — Bundle 29 "alive" pass.

**Effort:** ~15 min code.

---

## C-09 🎨 Sub-screen Debts header doesn't announce locked state

**Action:** when `snap.lockedAt`, append "Locked · mark off as you pay" to the sub-screen H1 area.

**Severity:** 🎨 DESIGN.

**Effort:** ~10 min copy.

---

## C-10 ⚠️ Dashboard "Maximum $0/day" vs Canvas "Free money $268" disagree

**Action:** unify into one "money clock" widget shared across surfaces. Dashboard shows pre-payday view ($0/day to survive), Canvas shows post-payday view ($268 free). Either name them differently OR show both side-by-side.

**Severity:** ⚠️ MEDIUM.

**Effort:** ~90 min — touches dashboard + canvas math.

---

## C-11 💨 Bills tab Add A Bill / BNPL action below the fold

**Action:** sticky the action row OR move it above the calendar.

**Severity:** 💨 SMELL.

**Effort:** ~15 min CSS.

---

## C-12 ✅ Cascade positives — call out in commit messages so they don't regress

**Action:** add Layer V regression checks for:
- ALL PAID tag presence in Essentials when all bills ticked
- TRACKED pill on every this-cycle bill in Bills tab
- ✓ on each tracked calendar day

**Severity:** ✅ NO-OP fix — preserve via tests.

**Effort:** ~30 min — add 3 regression assertions.

---

## Ship-now batch (recommended)

For tonight's planning session:

1. **C-01** (BLOCKING) — fix the rollover wipe NOW so John can actually use the lock+tick workflow tomorrow morning.
2. **C-02** (HIGH) — drop the "tracked early" warning when mark is intentional.

Both can ship together in one ~45-min commit. Phone-verify: morning lock + mark a few bills → reload → reopen canvas → state survives.

## Deferred batch (next session)

3. **C-03** + **C-04** — dashboard + analysis post-paid awareness. This is the "BIG BRAIN cascade semantic layer" work, takes ~2-3 hours.
4. **C-08** — celebration micro-animation.
5. **C-05, C-06, C-07, C-09, C-11** — copy/CSS polish, can batch into a single ~45min commit.

## Out of scope for this sweep

- C-10 (money clock unification) — needs a bigger design conversation about pre/post-payday framing.
- Dashboard main tab tiles bubble revamp (carry-over from earlier Bundle 29 work).
