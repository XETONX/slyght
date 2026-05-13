# MISSION-AUDIT-A1.md — Six-perspective structural audit of slyght

> Audit, not a ship. No code is written or modified in this mission.
> Author: Opus 4.7 · Date: 2026-05-13
> Audience: Claude Code · Output: a single consolidated audit report file

---

## 0. What this mission is and isn't

**This is:** a top-to-bottom assessment of slyght as it exists today, on disk, across six independent lenses. The audit is the deliverable. No shipping. No refactoring during the audit. No "while I'm here" fixes.

**This isn't:** a Bundle 28 ship prompt. Bundle 28 work pauses pending audit findings.

**Why now:** Bundle 27 (Payday Plan canvas) shipped less than 24 hours ago. First-use morning surfaced multiple stubs, broken nav, and theme overlap (China in 3 places, Rego/Insurance/Teachers Health spanning 2-4 surfaces each). After 22+ bundles in 6 weeks, the seams are showing. Before pouring more code in, John wants a structural picture.

**Hard rule:** Do not modify any file in `C:\Users\admin\slyght` during this audit. Read-only. Findings only.

---

## 1. The six lenses

Each lens is a structured pass over the codebase + working dir + git history. You write the audit AS that persona, in their voice, with their priorities. After all six lenses run, you write a final synthesis that reconciles them.

### Lens A — Engineer
**Question:** "If a senior engineer joined the project tomorrow, what would they find and what would they say to clean up?"

**Scan tasks:**
- Read `index.html` end-to-end. Note line counts per major section.
- Identify duplicated logic (functions that do the same thing, divergent shapes for the same entity, mirrored state).
- Identify TDZ errors, dead code (functions never called), orphan handlers (the Bundle 28 doc lists `paydayUntick` at L8471 - look for similar).
- Map the BRAIN bubble surface. Which bubbles are tight? Which bubbles leak (have callers reaching past them into `S.*` directly)?
- List every canonical writer and every place that writer is bypassed.
- List every "Phase N candidate" / "coming Phase N" / "TODO" / `alert('...')` stub in source.
- Identify circular reads (function A calls function B which calls A).
- Identify implicit coupling (function X assumes function Y already ran).
- Assess test coverage: what's tested by brain tests, what isn't, what should be.
- Assess Guardian coverage: Layer 1 (static), Layer 2 (runtime), Layer 3 (boot self-test). What classes of bug slip through?

**Output sections:**
- A1. Architecture map (one paragraph + a list of BRAIN bubbles with sizes)
- A2. Duplicated entities (the Bundle 28 §2 matrix, verified + extended)
- A3. Dead code + orphan handlers (path + line + verdict: delete / wire / unclear)
- A4. Bypassed canonical writers (every direct `S.*` mutation outside its owning bubble)
- A5. Stale stubs (every `alert('Phase N')`, every "coming soon" string in source)
- A6. Test + Guardian gaps (what's not covered, what should be)
- A7. Engineer's verdict: top 5 highest-leverage cleanups, ranked by risk reduction per LOC

### Lens B — Design lead
**Question:** "Does the app tell a coherent story across surfaces? Where does the user's mental model break?"

**Scan tasks:**
- Walk every tab + sub-screen as if a first-time user. Note where you have to context-switch to understand what you're looking at.
- Identify every place the same concept has two different names (e.g. "WRX Rego" / "KIA registration" / "Rego & Insurance").
- Identify every place the same dollar amount appears differently formatted.
- List every Cross-surface entity and confirm whether a user would experience it as ONE thing or N things.
- Read all microcopy. Flag jargon, inconsistent verbs ("spent" vs "paid" vs "used"), stale phase references in user-facing strings.
- Assess Information Architecture: tile order in PLAN mode, section order in Settings, category order in Payday Plan canvas. Does the order match the user's frequency-of-need?
- Identify "static surfaces" — places where a number is shown but not tappable for explanation (the Bundle 28 P1 principle).
- Identify friction in the most-frequent flows: log a transaction, plan a cycle, mark a bill paid, take a snapshot.
- Touch target audit: any control under 44×44px?

**Output sections:**
- B1. Mental-model breaks (entity-overlap symptoms in user-facing terms)
- B2. Vocabulary inconsistencies (verbs, naming drift)
- B3. IA assessment per surface (PLAN-mode root, Settings root, Payday Plan root, Dashboard, Bills, Debts, Snapshots, Analysis)
- B4. Static surfaces that should be tappable
- B5. Highest-friction user flows (top 5)
- B6. Touch-target violations (if any)
- B7. Design lead's verdict: top 5 UX cleanups that would feel biggest to John

### Lens C — Project manager
**Question:** "What's the actual roadmap, what's been shipped vs deferred, what's drifting?"

**Scan tasks:**
- Reconstruct the bundle history from git log + filenames in working dir (`CLAUDE-CODE-SHIP-PROMPT-*.md` and similar).
- For each bundle, classify: shipped / partially shipped / reverted / deferred / abandoned.
- Identify every "Bundle N candidate" / "deferred to Bundle N+1" in source or docs. Are they actually being picked up?
- Map the deferred-work backlog. What's old enough to be stale?
- Count rollbacks/reverts. Map them to root cause (scope too large, design rejected, architecture conflict, etc.).
- Identify scope creep within bundles (bundles that grew past their original spec).
- Identify the inverse: bundle slices that shipped but the parent bundle never closed out.
- Assess the average bundle close-out hygiene: do they cleanly conclude, or do they leave trailing TODOs?
- Compare what's in the codebase to what `userMemories` claims is current. Note drift.

**Output sections:**
- C1. Bundle history table (number, name, status, commit SHA if reachable, lessons)
- C2. Deferred work backlog (age, originating bundle, current relevance)
- C3. Rollback root-cause analysis (pattern across reverts)
- C4. Scope-creep cases (bundles that grew)
- C5. Open close-out items (TODOs left in source from prior bundles)
- C6. Drift between memory and reality
- C7. PM's verdict: top 5 process improvements

### Lens D — Continuous improvement leader
**Question:** "What patterns of friction repeat across bundles? What learning loops are missing?"

**Scan tasks:**
- Pattern-match across reverts. Are we making the same class of mistake repeatedly (e.g. "ship UX before backend canonical writers exist" or "introduce new entity without back-compat shim")?
- Identify "near misses" — bugs that were caught in phone-verify but should have been caught by Guardian.
- Identify "carry-overs" — bugs/stubs that survived a bundle close-out and resurfaced in the next bundle's audit (Bundle 28 doc has `[27→]` markers for these; build the full list).
- Assess the feedback cycle latency: how long between "John tries it" and "the fix lands"?
- Assess pre-design discipline. Are ship prompts being written with full audit context (line numbers, function names verified) or with informed guesses?
- Look at the Bundle 22 v1→v2→v3 progression. What was the cost of each iteration? Could it have been compressed?
- Look at the Payday Plan v1→v4 progression in this conversation. Same question.
- Identify "context loss between sessions" — places where each new Opus instance has to re-discover something the previous instance already learned.

**Output sections:**
- D1. Repeated-mistake patterns (pattern name + frequency + cost)
- D2. Guardian misses (bugs that Guardian could have caught but didn't)
- D3. Carry-over inventory (every `[N→]` style bug across bundles)
- D4. Feedback cycle metrics (rough estimates)
- D5. Pre-design audit discipline assessment
- D6. Cross-session context-loss inventory
- D7. CI leader's verdict: top 5 process changes that would compound

### Lens E — Strategic leader
**Question:** "Is this app on track to serve its purpose? Should the direction change?"

**Scan tasks:**
- Re-read the original product vision (per `userMemories` and any product docs): finance tracking + lifestyle accountability + addiction recovery + City2Surf training integration.
- For each goal, assess: has the app shipped features that move the needle, or features that move features?
- Count features by type: tracking (passive) vs coaching (active) vs accountability (intervention).
- Identify scope drift: places the app has become more about code complexity than about helping John.
- Identify scope shrink: original goals that have quietly dropped off (City2Surf integration depth? Habit-streak coaching? AI chat?).
- Assess "the chat trap": is the app a useful tool or a thing John builds INSTEAD of doing the financial work?
- Honest assessment: 6 weeks in, is John saving more / spending less / drifting less, attributable to using the app?
- Honest assessment: is the architectural complexity now disproportionate to the problem being solved?

**Output sections:**
- E1. Original vision recap (one paragraph)
- E2. Goal-by-goal: shipped vs deferred vs drifted
- E3. Feature classification (tracking / coaching / accountability counts)
- E4. Scope drift surface
- E5. Scope shrink surface
- E6. The chat trap question (honest answer)
- E7. Complexity-to-purpose ratio assessment
- E8. Leader's verdict: should direction change? If so, how?

### Lens F — Financial advisor
**Question:** "Is the financial logic of this app sound? Would I recommend it to a client in John's situation?"

**Scan tasks:**
- Read every dollar-handling code path. Are the math operations correct?
- Verify net-worth calculation: assets - liabilities - cash drawn down accurately? Are savings transfers correctly networth-neutral, while bills/spends correctly networth-negative?
- Verify debt logic: KIA loan with extra payments — is the projected-payoff math correct? Is the avalanche vs snowball logic correct?
- Verify cycle math: pay-day to pay-day window, days-of-runway, daily-spend pace.
- Verify savings logic: is round-up math correct, does bucket allocation respect available balance, are sinking funds (rego, insurance) accumulating at the right rate?
- Verify trip/goal math: target dates achievable at current pace? Conservative or aggressive assumptions?
- Verify buffer floor and daily-living floor logic: is $30/day floor realistic for John's spending profile?
- Identify financial advice surfaced by the app: is it actually helpful? Is any of it misleading (e.g. "you can afford X" when in reality the user can't)?
- Identify missing financial guidance: emergency fund target, insurance gaps, retirement contribution ratios, debt-to-income ratios, cost-of-debt analysis on KIA loan vs savings rate.
- Honest assessment: is the app a financial tool or a budget toy?

**Output sections:**
- F1. Math correctness assessment (operation by operation)
- F2. Net-worth + balance accounting verification
- F3. Debt + savings logic verification
- F4. Cycle + pace + projection verification
- F5. Surfaced advice quality (is "can I afford X" actually trustworthy?)
- F6. Missing financial guidance inventory
- F7. Advisor's verdict: is the app financially sound? Top 5 financial-quality improvements

---

## 2. Working directory + GitHub cleanup audit

Separately from the six lenses, do a working-directory and repo sweep.

**Scan:**
- List every file in `C:\Users\admin\slyght` with last-modified date.
- Identify: stale ship prompts (superseded by later versions), rejected design drafts, abandoned migration scripts, dead snapshots, dev-only test files, generated artefacts.
- List every branch on the GitHub repo. Identify which are stale.
- List every closed/abandoned issue or PR if applicable.
- For each item, classify: keep / archive / delete. Justify each.

**Output:** a cleanup table — file/branch, last-modified, status, recommended action, reason.

---

## 3. Final synthesis section

After the six lenses + cleanup audit, write a final synthesis (~500-800 words) that:

1. **Identifies the 3 root causes** that the six lenses agree on (i.e. things that show up under multiple personas). These are the highest-leverage fixes.

2. **Proposes a revised Bundle 28** that absorbs audit findings. If Bundle 28's existing phases hold up, say so. If they should change, propose the new phase order with one-line justifications.

3. **Names the top 5 things to STOP doing** based on the audit. Process changes, not code changes.

4. **Names the top 5 things to START doing.** Same.

5. **Answers John's strategic question directly:** "is the app actually helping me?" Use evidence from the codebase + memory. Do not be diplomatic.

6. **Recommends a quarterly audit cadence** with specific trigger conditions for "audit now" outside the cadence (e.g. after every revert, after every "horrid" rejection).

---

## 4. Output format + location

**Single file:** `C:\Users\admin\slyght\AUDIT-A1-2026-05-13.md`

**Structure:**
```
# Audit A1 — 2026-05-13

## Executive summary (1 page)
[Top 5 findings + top 5 recommendations, in plain English for John to skim]

## Lens A — Engineer
[A1 through A7]

## Lens B — Design lead
[B1 through B7]

## Lens C — Project manager
[C1 through C7]

## Lens D — Continuous improvement leader
[D1 through D7]

## Lens E — Strategic leader
[E1 through E8]

## Lens F — Financial advisor
[F1 through F7]

## Working directory + repo cleanup
[Table + recommendations]

## Final synthesis
[3 root causes, revised Bundle 28 proposal, STOP/START lists, strategic answer, cadence]

## Appendix — file/line citations
[For every finding above that cites code, the file:line reference for traceability]
```

**Tone:** honest. Not diplomatic. Don't soften findings to spare feelings — John has been clear he wants the truth. But also fair: don't manufacture problems that aren't there. If a lens finds the codebase is in better shape than expected in some dimension, say so.

**Length:** as long as it needs to be. Probably 3,000-6,000 words total. Better to be thorough than brief.

---

## 5. What to do if you find something blocking

If during the audit you find an actual safety issue (e.g. data corruption risk, security exposure, math error producing wrong financial advice), STOP the audit, write only that finding to a separate file `AUDIT-A1-URGENT.md`, and surface to John before continuing. The rest of the audit can resume after the urgent item is handled.

---

## 6. Time budget

Estimated 2-3 hours of CC reading + writing. This is fine — the output is meant to last 6+ weeks. No rush.

---

## 7. What this audit informs

After the audit lands and John reads it:

1. Revise Bundle 28 plan to absorb findings.
2. Decide which Bundle 28 phases (if any) ship as-is vs need rework.
3. Establish ongoing audit cadence.
4. Update `userMemories` with the synthesis section's "STOP doing" + "START doing" lists so future sessions inherit the lessons.
5. Schedule the cleanup actions identified in §2.

This audit is not the end of work — it's the input to better work.

---

**End of mission. Do not ship code. Write the report.**
