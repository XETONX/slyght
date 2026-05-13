# Mission I Test Run Report — 2026-05-06

> **Post-generation verification + augmentation note (2026-05-06):**
> This report was spot-checked against source transcripts after
> generation. Five corrections were applied to the Super Brain output:
> (1) cost section was fabricated, replaced with real numbers;
> (2) Connor's second HARD_FAIL ("Bills marked paid label misleads")
> was dropped from the original report, restored as a manual scaffold
> below; (3) Riley crash was not surfaced, added to exec summary;
> (4) `MODEL.maxPerDay` reference removed (no such field exists);
> (5) convergence statement updated to reflect the Connor↔Pat overlap
> on `paidBills` tracking model.
>
> Four additional sections were appended via pure transcript analysis
> (no Super Brain re-prompt, no API cost): **Section X** — Sam silence
> analysis; **Section Y** — per-persona exploration map; **Section Z**
> — observations beyond findings (pre-bug signals); **Section AA** —
> information architecture observations (manual stand-in for a future
> dedicated "Iris" IA-niche persona).

## Executive Summary

**Finding counts:** 3 HARD_FAIL, 2 SOFT_FINDING, 0 UX_SUGGESTION, 0 KNOWN_ANOMALY *(corrected from 2 HARD_FAIL after Connor's dropped finding restored)*
**Convergence highlights:** Connor↔Pat — both findings target the `paidBills` tracking model. Connor on label semantics ("marked paid" promises payment but only flags status), Pat on mutation atomicity (rapid undo causes double-removal). Convergence ≥ 2 on the *paidBills surface*, not on a single finding.
**Persona completion:** 4/5 personas completed (all hit max-turns cap at 30 turns). **Riley persona crashed mid-scenario at turn 10+; transcript not written.** Final screenshot showed the Net Worth modal — surface overlapped Nora's findings. No independent finding from Riley's run.

**Critical finding:** Pat discovered a race condition in the MI-13 undo flow causing double-mutations and math reconciliation failure — first interaction-layer bug caught by Layer I that static/runtime layers cannot detect. Likely related to Connor's "marked paid" label finding via shared `paidBills` model.

## HARD_FAIL findings

### 1. Race condition in MI-13 undo buttons causes double-mutations

**Mission scaffold: Fix MI-13 undo button debouncing**

- **Title:** Add debouncing to MI-13 modal undo buttons to prevent race conditions
- **Evidence:** Pat persona, free-explore scenario, turn 8-9. Screenshots shot-002 → shot-003 show "Math reconciliation failed" banner after rapid double-click on Undo button. State mutation: `paidBills` went from 9 entries to 7 entries (KIA Loan + YouTube Premium both removed) when user intended to undo only one bill.
- **Convergence:** 1/4 personas (Pat only)
- **State context:** `S.paidBills` object keys, `undoPaidBillByKey()` handler, modal re-render cycle
- **Likely classification:** Race condition (new class) — rapid clicks bypass single-mutation intent
- **Step 1 hypothesis:** `undoPaidBillByKey()` lacks debouncing; second click processes before first click's DOM update completes
- **Step 2 likely fix path:** Add click debouncing to undo buttons (300ms cooldown) or disable button during mutation
- **Estimate:** small
- **Verification command:** `npm run test:interaction -- --persona=pat --scenario=free-explore` — re-run Pat's rapid-click pattern after fix

### 2. Label-vs-math contradiction in daily spending limits

**Mission scaffold: Clarify MAX PER DAY label semantics**

- **Title:** Resolve "MAX PER DAY $19.86" vs "$91 spent today" contradiction
- **Evidence:** Connor persona, free-explore scenario, turn 11. Screenshot shot-001 shows "MAX PER DAY $19.86" prominently displayed above "$91 spent today" — user spent 4.6x the supposed "maximum" with no violation warning. Connor interpreted "MAX PER DAY" as hard spending cap but behavior suggests sustainable average rate.
- **Convergence:** 1/4 personas (Connor only)
- **State context:** "MAX PER DAY" label rendered at `index.html:448` and referenced at `index.html:4096`; no centralized `MODEL.maxPerDay` field exists — value computed inline. Dashboard card rendering, survival mode thresholds.
- **Likely classification:** Label-vs-math mismatch (Mission E class) — label promises maximum but delivers sustainable rate
- **Step 1 hypothesis:** Label should read "SUSTAINABLE RATE" or "TARGET PER DAY" instead of "MAX PER DAY"
- **Step 2 likely fix path:** Update card label to match mathematical meaning; consider adding explanation tooltip
- **Estimate:** small
- **Verification command:** `npm run test:interaction -- --persona=connor --scenario=free-explore` — verify label clarity after fix

### 3. "Bills marked paid" label misleads — flags status, not payment

> *Restored from Connor's transcript during post-generation verification — the original report dropped this finding even though it was reported as `hard_fail`.*

**Mission scaffold: Disambiguate `paidBills` flag vs. actual payment**

- **Title:** Clarify "marked paid" semantics — distinguish tracking flag from actual money movement
- **Evidence:** Connor persona, free-explore scenario, action sequence around shot-003. Modal title "Bills marked paid before due date" lists 6 bills (KIA Loan, YouTube Premium, Adobe, etc.). Connor read `bal=$381.35` from state both before and after observing the "paid" bills — balance is unchanged despite hundreds of dollars supposedly paid. The modal subtext clarifies these are "marked paid but their due date is in the future" with Undo buttons, revealing the truth: `paidBills[key]=true` is a tracking state, not a payment record. The label "marked paid" promises money movement; the model only stores status.
- **Convergence:** 2/4 personas hit the `paidBills` surface — Connor on label semantics, Pat on mutation atomicity (race condition, HARD_FAIL #1). Different complaint classes, same underlying model.
- **State context:** `S.paidBills` keyed object (per-bill flags); `bal` (account balance, untouched by paidBills mutations); MI-13 invariant fires on this exact mismatch (paid-key without corresponding txn). Banner copy at `index.html:813` ("MI-13 paid-early bills detail modal").
- **Likely classification:** Label-vs-math mismatch (Mission E class) — same family as MAX PER DAY but on a different surface. Sibling of Pat's HARD_FAIL #1 — both surfaces would benefit from a unified "paidBills means flag, not payment" treatment.
- **Step 1 hypothesis:** Banner/modal copy needs to distinguish "marked as paid (tracking)" from "paid (money moved)". The current "marked paid" wording is ambiguous; users naturally read it as the latter.
- **Step 2 likely fix path:** Rewrite banner copy + modal title to surface the *flag* nature explicitly (e.g., "Bills you've flagged as paid early — these don't move money"). Consider whether this surface should also be where the actual transaction-creation flow lives, so users have a non-ambiguous path.
- **Estimate:** small (copy) — could grow to medium if a transaction-creation flow is added.
- **Verification command:** `npm run test:interaction -- --persona=connor --scenario=free-explore` — re-run after copy change; Connor's "marked paid" confusion should not recur.

## SOFT_FINDING findings

### 1. Net Worth modal balance truncation loses cents precision

**Evidence:** Nora persona, free-explore scenario, turn 18. Screenshot shot-006 shows Net Worth Breakdown modal displaying "Virgin Money Balance $381" while `read_state("bal")` returns 381.35. Dashboard correctly shows $381.35 but modal truncates to whole dollars.

**Pattern:** Inconsistent number formatting across UI surfaces. Low priority — cents precision lost but core functionality intact.

### 2. Net Worth modal persists across tab navigation

**Evidence:** Pat persona, free-explore scenario, turn 22. Screenshot shot-007 shows modal opened on Dashboard, shot-008 shows same modal still open after `navigate_tab('spend')`. Modal should close on navigation to prevent stale UI state.

**Pattern:** Modal lifecycle not tied to tab navigation. Moderate UX concern — creates visual confusion but no data corruption.

## UX_SUGGESTION findings

None reported by any persona.

## KNOWN_ANOMALY findings

None — no findings matched existing OPEN-BUGS entries. Note: MI-13 banner firing on 6 future-dated bills is expected behavior per orchestration context.

## Per-persona behavior summary

**Connor (confused user):** Completed 30 turns focusing on label interpretation. Reported **two HARD_FAILs** (both restored to the HARD_FAIL section): (a) "MAX PER DAY $19.86" contradicts "$91 spent today" (Mission I-LABEL), and (b) "Bills marked paid" misleads — flags status only, balance unchanged (Mission I-PAID-SEMANTICS). Strong signal on copy clarity. Note: original report only scaffolded (a); (b) was dropped and has been restored manually.

**Nora (normal user):** Completed 30 turns with systematic exploration. Successfully used MI-13 undo functionality (confirming #39 fix works). Found precision inconsistency in Net Worth modal. Covered Dashboard → Plan Mode → Net Worth breakdown flow cleanly.

**Pat (impatient user):** Completed 30 turns with rapid interaction patterns. Discovered critical race condition in undo buttons through double-clicking behavior. Also found modal persistence issue during fast tab switching. High-value adversarial testing.

**Sam (super user):** Completed 30 turns with deep state inspection. No findings reported but covered Plan Mode, Analysis tab, and Calendar extensively. Provided good coverage of advanced features without surfacing issues. Treat the zero-findings result as data, not a prompt bug — Sam's pattern of `read_state` heavy + `report_finding` zero is consistent across the run.

**Riley (chaos tester):** **Crashed mid-scenario, transcript not written.** 10 screenshots retained (shot-001..shot-010); final shot showed the Net Worth Breakdown modal — the same surface Nora flagged for cents-truncation. Cost implied ~$1.06 from sweep total. No independent finding can be attributed to Riley. Skipping rerun this session per salvage decision; surface overlapped Nora's already.

## Cost summary

> *Original report's cost block was fabricated (claimed $47.23, ~$11.81/persona, 89K input tokens). Replaced with verified numbers from each persona's `transcript.json` cost field.*

**Total persona spend (4 completed):** $2.8464
**Total tokens (4 completed):** 895,231 input / 10,712 output
**Riley (crashed):** ~$1.06 implied from sweep total $3.91 minus completed personas; no transcript to confirm input/output split.
**Super Brain (this report):** $0.1234 (31,523 in / 1,920 out, 1 turn)
**Sweep grand total:** ≈ $4.04 ($3.91 personas + $0.12 meta-review)

**Per-persona breakdown (verified):**

| Persona | Turns | End reason | Findings | Cost (USD) | Input tokens | Output tokens |
|---|---|---|---|---|---|---|
| nora | 30 | max-turns | 1 (soft) | $0.6981 | 219,298 | 2,680 |
| connor | 30 | max-turns | 2 (hard×2) | $0.7458 | 233,483 | 3,023 |
| pat | 30 | max-turns | 2 (hard×1, soft×1) | $0.7170 | 225,452 | 2,707 |
| sam | 30 | max-turns | 0 | $0.6855 | 216,998 | 2,302 |
| riley | (crashed mid-run, 10 screenshots) | — | — | ~$1.06 implied | unknown | unknown |

## Next-mission queue

1. **Mission I-RACE** — Fix MI-13 undo button debouncing (HARD_FAIL, race condition class)
2. **Mission I-PAID-SEMANTICS** — Disambiguate "marked paid" copy + paidBills model (HARD_FAIL, restored from drop). Sibling of #1 — consider bundling so the paidBills surface is treated holistically.
3. **Mission I-LABEL** — Clarify MAX PER DAY semantics (HARD_FAIL, label-vs-math class)
4. **Mission I-MODAL** — Fix Net Worth modal persistence + precision (2 SOFT_FINDINGs, modal lifecycle)

## Coverage gaps section

**Plan Mode:** Sam touched it briefly but no structured scenario coverage. Savings bucket editing (OPEN-BUGS #1) remains untested — no persona attempted to edit bucket goals or saved amounts.

**Settings deep-paths:** No persona explored Math Health panel, Import textarea, or scanner modal beyond export functionality.

**Bill modal actions:** No persona tested "Already paid" or "Pay now" buttons (OPEN-BUGS #40, #41) — these remain unverified by Layer I.

**Calendar bill interactions:** Sam attempted to click calendar day 15 but element-not-found. Calendar → bill modal flow uncovered.

## MI-13 fix regression confirmation

**Confirmed working.** Nora successfully opened MI-13 details modal (turn 3), used Undo functionality (turn 5), and observed correct state mutation (KIA Loan removed from paidBills). Pat also used the modal successfully before hitting the race condition. The #39 fix is functional.

## Layer feedback — prevention candidates

**HARD_FAIL #1 (race condition):** Candidate Layer 2 invariant: `undo-operations-atomic` — would catch double-mutations in any undo flow at runtime.

**HARD_FAIL #2 (label contradiction):** Candidate Layer 2 invariant: `daily-limit-labels-match-math` — would verify rendered "MAX" labels don't contradict actual spending vs limits.

**HARD_FAIL #3 ("marked paid" misleads):** Candidate Layer 1 rule: `paidbills-copy-distinguishes-flag-from-payment` — could AST-scan banner/modal copy strings on `paidBills`-touching surfaces for the word "paid" without a qualifier. Or Layer 2: `paid-flag-balance-consistency` — flag visible "paid" copy when no corresponding `S.bal` decrement exists. Both are speculative — pattern note only.

**SOFT_FINDING #1 (precision loss):** Not a layer-prevention candidate — pure formatting issue.

**SOFT_FINDING #2 (modal persistence):** Candidate Layer 1 rule: `modals-close-on-navigation` — could scan for tab navigation handlers that don't close open modals.

---

## Section X — Sam's silence analysis

> *Added during post-generation augmentation. Pure transcript analysis, no re-prompt.*

Sam visited: Dashboard → MI-13 paid-early modal (observed, did **not** click Undo) → Plan/Future Plan → Net Worth modal (accidental, via "See Breakdown") → Dashboard → Spend/Analysis (Survival Forecast) → Cal/Bills (tried day-15 click twice, element-not-found both times).

Niche-relevant surfaces touched: **Plan Mode** (entered, couldn't find allocation sliders, bailed after one failed scroll); **edge-case dates** (tried payday May 15 on calendar, two failed clicks); **cross-tab numbers** (collected $381.35 / 10 days / $19.86 / "Cautious Mode" but never formally compared values across tabs). Niche **NOT** touched: `paydayReceived` edges, multi-modal stacking, savings bucket allocation editing.

Observations Sam recorded in reasoning but did **not** escalate to `report_finding`:
- **Turn 5:** "9 entries in paidBills, which is more than the 6 mentioned in the banner" — banner/state count mismatch noticed (this is by design per `extra-context.md`, but Sam didn't probe).
- **Turn 19/25:** Mentally computed "$381.35 − $89.19 = $292, which should last more than 8 days at minimum spending" against the displayed "Projected to run out in 8 days" forecast — implicit doubt, not flagged.
- **Turn 7:** Confirmed Mission #39 MI-13 modal "working perfectly" — but didn't actually exercise Undo, just observed structure.

**Conclusion: Mixed — covered some, missed others.** Sam *reached* his niche surfaces (Plan Mode, calendar edge-date, cross-tab) but couldn't *exercise* them deeply because element-finding failed and he didn't apply the 3-attempt rule before retreating. Two of his observations (banner/state count, survival math) deserved soft_finding flags but didn't get them.

**Implication for next sweep:** Sam needs a **structured scenario** — `plan-mode-allocation` and `cross-tab-consistency` — to force him into surfaces free-explore couldn't reach. His prompt may also benefit from stronger guidance on when an unflagged observation should become a `soft_finding`.

---

## Section Y — Per-persona exploration map

> *Tabs/surfaces visited in order, time spent, retry/avoidance patterns, niche match.*

**Nora (normal user — "obvious paths"):** Dashboard → MI-13 modal (open, click Undo, read state, close — turns 3-9) → PLAN/Future Plan → Net Worth Breakdown modal (turns 15-20) → Dashboard → "+" button → Net Worth modal AGAIN (unexpected, turns 24-26) → stuck trying to close (turns 27-29) → escaped via tab navigate to spend. **Niche match ✓** — exercised obvious affordances, found cents truncation. **Friction:** Net Worth modal trap consumed 4 of last 7 turns; "+" button opening Net Worth instead of Add Transaction was unexpected (not flagged).

**Connor (confused user — "label vs reality"):** Dashboard label read (8 turns of read_state to verify literal claims) → MI-13 modal → state verification → Cal/Bills calendar → Microsoft PC Game Pass bill modal → scroll-hunt for action buttons (turns 25-30, 5 scroll attempts, none successful). **Niche match ✓✓** — full alignment; reported both his hard_fails in first 18 turns. **Friction:** "Cautious Mode" label looked clickable, didn't respond (turn 12). Got stuck scrolling at end-of-run looking for bill modal buttons.

**Pat (impatient user — "race conditions"):** Dashboard → rapid double-click "details" (turns 4-5) → MI-13 modal → rapid double-click Undo → race condition triggered (turns 8-12) → Dashboard → rapid double-click "+" → Net Worth modal trap (turns 16-30, 14 of 30 turns spent stuck inside or trying to escape). **Niche match ✓✓** — found highest-value HARD_FAIL of the run. **Friction:** spent 47% of his run trapped in Net Worth modal trying to close it via 7 different strategies.

**Sam (super user — "edge cases"):** *See Section X above.* Broad tab coverage, low interaction depth. 5 read_state calls. **Niche match ⚠ partial** — niche surfaces reached, not exercised.

**Riley (chaos tester):** Cannot reconstruct from messages (transcript lost). From 10 screenshots: shot-001 dashboard, shot-002 looks like Cal tab (similar size to Connor's calendar shot-002), shot-003-006 various states (sizes match a navigation pattern), shot-007-008 identical (size 207835 — one screen captured twice, possibly stuck), shot-009-010 identical 177104 bytes — final state was Net Worth Breakdown modal (verified by reading shot-010 image). **Pattern inference:** Riley likely got trapped in the same Net Worth modal that caught Nora, Pat, and Sam — three identical-byte screenshot pairs (shot-005=shot-003, shot-007=shot-008, shot-009=shot-010) suggest she was hitting walls and re-screenshotting the same view.

---

## Section Z — Observations beyond findings — signal not bugs

> *Pre-bug signals from reasoning content. NOT classified as findings. These are surfaces where the next bug will likely emerge or where small UX improvements would compound.*

- **Net Worth modal is a UX trap (3 personas independently stuck — pre-bug convergence).** Nora turns 26-29, Pat turns 19-30, Sam turns 13-14, Riley likely (per screenshot pattern). Modal is reachable via "See Breakdown", the "+" button, and "Assets minus liabilities" tap. Once open, no obvious close affordance in viewport — Pat tried 7 different close strategies (click outside, scroll, tab navigation) before giving up. This is the dominant friction surface in the sweep. Worth a coverage scenario.

- **The "+" button confuses two personas (Nora turn 24-26, Pat turn 17-19).** Both expected "+" to be Add Transaction; both got Net Worth modal. Nora: *"as a normal user, I would expect a + button to let me add something (like a transaction), not show me a detailed breakdown of existing data."* Affordance/icon mismatch, not flagged by either.

- **MI-13 banner says "6 bill(s)" but `paidBills` state has 9 entries.** Sam turn 5, Pat turn 7, Nora turn 7 — three personas noticed the count gap, none flagged. By design per `extra-context.md` (banner = future-paid subset, state = all paid markers) — but the banner copy doesn't surface that distinction.

- **"Cautious Mode" looks tappable but isn't (Connor turn 12).** Connor: *"the click didn't seem to open a mode selector."* No flagged finding. If clickable was intended, this is a missing handler; if not, the styling needs to communicate non-interactivity.

- **"Math reconciliation failed" banner persists after modal close (Nora turn 8-9, Pat turn 13).** Nora hit it after a single (non-rapid) Undo click — suggests the banner can fire on legitimate single-bill-undo flows, not just Pat's race condition. Worth verifying whether this is a transient redraw artifact or a real reconciliation bug.

- **"PAID" badge on per-bill rows is ambiguous (Connor turn 22-24).** Connor clicked a "PAID"-badged bill and discovered "LAST PAID: 5/2026, NEXT DUE: 7/5/2026". Same `paidBills` semantic confusion as HARD_FAIL #3, but on the per-bill calendar surface. Restates the case for Mission I-PAID-SEMANTICS bundling all `paidBills`-touching copy.

- **Calendar day-tap fails silently (Sam turns 27-28).** Sam tried `15` then `#calendar-day-15` — both element-not-found, no UI hint about what the calendar's tap targets actually are. Discoverability gap; if calendar days are tap-targets, the hit area is unclear.

- **Survival forecast math feels off in spot-check (Sam turn 19/25).** Sam computed "$381.35 − $89.19 = ~$292, should last more than 8 days at minimum spending" against displayed "Projected to run out in 8 days." He concluded it wasn't the briefing's known bug, but the implicit doubt is a candidate scenario for `survival-forecast-math` cross-check.

---

## Section AA — Information architecture observations

> *This section uses the existing transcript data through an
> information-architecture lens. Future Mission I sweeps could
> include a dedicated "Iris" persona whose niche is information
> architecture — this augmentation is a manual stand-in pending that
> addition.*
>
> **These are not bugs.** They are observations about how
> information was sought, surfaced, missed, or labelled. Manual
> transcript analysis only — no Super Brain re-run, no API cost.
> Some overlap with Section Z is intentional; different lens, same
> source data.

### AA.1 — Information tried-to-find (what personas looked for, where, and whether they found it)

- **Plan Mode allocation slider — Sam turn 8-12.** Wanted to test China Holiday allocation (OPEN-BUGS #11). Entered Plan/Future Plan, tried scroll-down (no scroll happened), tried "See Breakdown" instead and got Net Worth modal. Bailed without finding sliders.
- **Calendar day-15 tap — Sam turn 27-28.** Wanted bills due on payday. Tried `click "15"` then `click "#calendar-day-15"`. Both element-not-found. No fallback affordance hint.
- **Close button on Net Worth modal — Pat turn 19-30.** Tried 7 strategies in succession: click "Assets minus liabilities" (turn 19), scroll up (21), navigate_tab spend (23), click "WHERE YOUR MONEY WENT" (26), scroll down (27), navigate_tab dash (29). None closed the modal cleanly.
- **Close button on Net Worth modal — Nora turn 26-29.** Independent of Pat. Tried click "Dashboard" (26), scroll up (27), then escaped via navigate_tab spend (29). Same trap, different escape route.
- **Action buttons in Microsoft PC Game Pass bill modal — Connor turn 24-30.** Connor saw the bill edit modal but couldn't reach action buttons; scrolled five times (300/300/400/200 px) hunting for them. Never reached "Already paid" / "Pay now" — the surfaces of OPEN-BUGS #40 and #41.
- **Mode selector via "Cautious Mode" tap — Connor turn 12.** Connor expected a mode selector. Click registered but UI didn't respond. He moved on without retrying.
- **`MODEL.maxPerDay` / `MODEL.sustainablePerDay` state paths — Connor turn 6-7.** Connor probed for the calculation behind the dashboard label. Both reads appear to have returned no useful value (he switched paths immediately after each). Suggests the "MAX PER DAY $19.86" value is computed inline, not surfaced as a named MODEL field.

### AA.2 — Information present but ignored (visible content no persona engaged with)

- **Settings tab.** Zero personas navigated to Settings in 120 turns. Math Health panel, Import textarea, scanner modal, weather/balance edit — all untouched.
- **Time-range filters on Spend/Analysis tab ("Today / 7 Days / 30 Days / All time").** Visible in Pat's shot-010 and Sam's analysis-tab shot. No persona changed the time range to test cross-range consistency.
- **Savings bucket editing (goal/saved fields).** OPEN-BUGS #1 still has no repro because no persona attempted to edit a bucket. Sam intended to (Plan Mode allocation) but couldn't reach the surface.
- **MI-13 banner dismissal.** No persona attempted to dismiss the banner directly (it's non-dismissible by design; no one verified the design).
- **Calendar bill rows on non-15 days.** Connor reached calendar (turn 21) and clicked Microsoft PC Game Pass (turn 22), but no persona walked the calendar systematically across multiple bill dates.
- **Per-bill Undo buttons beyond the first.** Nora and Pat both clicked the *first* Undo button only. The other 5 Undo buttons in the MI-13 modal were untested.
- **Net Worth modal scroll content.** Per shot-010, the modal extends below the visible viewport (TOTAL NET WORTH INCL SUPER row implies more content). No persona scrolled within the modal to verify content below the fold.
- **Header "Analysis" button on Spend tab.** Sam clicked it (turn 19) and saw no change — but no persona pursued whether "Analysis" was supposed to navigate elsewhere or expand inline.

### AA.3 — Information missing when needed (persona reasoning shows they wanted info the app didn't provide)

- **Add Transaction form on "+" tap — Nora turn 24, Pat turn 17.** Both expected the green "+" to be a transaction-add affordance. Both got the Net Worth modal. Nora explicit: *"as a normal user, I would expect a + button to let me add something (like a transaction), not show me a detailed breakdown."*
- **Confirmation/feedback after Undo — Pat turn 10-12, Nora turn 7.** After Undo, both got a "Math reconciliation failed" banner (cryptic, alarming). Neither got positive confirmation feedback. The banner reads as an error, not a success state.
- **Visible Close affordance on Net Worth modal — Nora, Pat, Sam.** Sam closed it cleanly via `click "Close"` (turn 14) — meaning the affordance exists but isn't always visible/findable. Nora and Pat both failed to find it from their entry paths.
- **Bill detail surface from calendar day-tap — Sam turn 27-28.** Sam expected tapping a calendar day to surface the bills due that day. Got nothing.
- **Mode selector / mode help on "Cautious Mode" — Connor turn 12.** Connor wanted to know what other modes exist and what "Cautious" means. Tap didn't surface anything explanatory.
- **Allocation editing surface in Plan Mode — Sam turn 8-12.** Sam expected allocation sliders for savings buckets. Plan Mode showed a "Future Plan" net-worth narrative instead. Surface gap, not just affordance gap.

### AA.4 — Label clarity observations

#### Labels personas misread or had to verify against state

- **"MAX PER DAY $19.86" — Connor turn 11.** Connor read literally as a daily cap; spent multiple `read_state` calls (`MODEL.maxPerDay`, `MODEL.sustainablePerDay`, `MODEL`) trying to confirm. Reading didn't match displayed value's behavior — escalated to HARD_FAIL #2.
- **"Bills marked paid before due date" — Connor turn 14-17.** Read as "money moved." Verified via `read_state("paidBills")` and `read_state("bal")` — balance unchanged, so the label didn't mean what it said. Escalated to HARD_FAIL #3.
- **"PAID" green badge on per-bill rows — Connor turn 22-24.** Read as "paid today." Connor opened the bill modal, saw "LAST PAID: 5/2026 / NEXT DUE: 7/5/2026," and reconstructed the actual semantic ("marked paid for this period").
- **"VIRGIN MONEY $381.35" — Nora turn 2, Connor turn 2.** Both verified against `read_state("bal")`. Matched. Clean — but the *fact* that two personas independently verified the dashboard's most prominent number is itself a signal about user trust calibration.
- **Net Worth Breakdown modal balances ($381 vs state's $381.35) — Nora turn 18.** Truncation only revealed by cross-checking against `read_state("bal")`. Soft_finding #1.

#### Labels that prompted "I think this means X" clarification reasoning

- **"Cautious Mode — Watch Your Spending — $124 buffer after bills" — Connor turn 12.** Connor reasoned: *"what other modes exist? What does 'buffer after bills' mean exactly?"* Tapped the label expecting a mode selector; nothing happened. Reasoning chain stalled.
- **"+" button on dashboard — Nora turn 24, Pat turn 17.** Both reasoned through it as add-transaction. Pat: *"I'll click it rapidly to see if it creates duplicate transactions."* Nora: *"the most obvious way to add a transaction."* Both got Net Worth modal — they had to *retrofit* their mental model after the click.
- **"Math reconciliation failed" banner — Nora turn 7, Pat turn 12.** Nora: *"there's a new banner that appeared saying 'Math reconciliation failed' with details about the remaining 5 bills."* Reasoning was descriptive, not interpretive — neither persona explained what they thought "reconciliation" referred to.
- **"Projected to run out in 8 days" (Survival Forecast) — Sam turn 19/25.** Sam reasoned: *"+$381.35 minus $89.19 = ~$292, which should last more than 8 days at minimum spending."* Performed silent reconciliation between displayed claim and his own arithmetic; concluded "reasonable numbers" without certainty.
- **"PLAN >" / "PLAN" tab vs "FUTURE PLAN" view title — Nora turn 10-13.** Nora clicked the dashboard "PLAN >" target, target failed, retried "PLAN", succeeded. The destination's title shifted from "PLAN" (button) to "FUTURE PLAN" (page heading) — a 1-step naming inconsistency.

#### Labels that worked cleanly (no friction observed)

- **Banner count "6 bill(s) marked paid before due date" + modal showing 6 rows.** Count consistent between banner and modal contents (Nora turn 5, Connor turn 14, Sam turn 7). The *meaning* of "marked paid" is confused (above) but the *count* is clean.
- **"details" link in MI-13 banner.** All four completed personas tapped it on first attempt; opened the expected modal. Clean affordance.
- **"Undo" buttons on per-bill rows (single click).** Nora's single click cleanly removed the first row (KIA Loan) from `paidBills`. The mutation is correct; the failure mode is rapid double-click only.
- **"VIRGIN MONEY $381.35" on dashboard.** Numeric match against state on first read (Nora, Connor). The cents-truncation issue is in the Net Worth modal, not the dashboard surface.
- **"10 days to payday" — Connor turn 3.** Verified against `read_state("MODEL.daysToPayday")`, matched. Clean.
- **Bill names and amounts in the calendar/bill modal — Connor turn 22-24.** Microsoft PC Game Pass row data was internally consistent; Connor's confusion was specifically about the "PAID" *badge*, not the bill data itself.
- **Top-bar tab navigation ("NOW" / "spend" / "cal" / "Dashboard").** Multiple personas used these to escape from stuck states (Nora turn 22 NOW, Pat turn 23 navigate spend, Sam turn 17 navigate spend). Tab routing works reliably even when in-page modal state doesn't.