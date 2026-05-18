# FIELD-REPORT-2026-05-15-payday-plan-walkthrough.md

> Field report from John's first real-use session of the locked Payday Plan canvas on payday-day (15 May 2026).
> Source data: 12 phone screenshots taken 10:45-10:48 + two rounds of in-app AI chat output corroborating findings + John's running manual annotations + his own manual reconciliation work.
>
> **This is not a sweep CC ran. This is a field report — real user data from real use.** It surfaces a financial-math integrity crisis on multiple axes that the previous mock-sweep protocol (vision-only) could not have caught alone.
>
> Format follows MOCK-SWEEP-PROMPTS v2 §2.3 with adaptations for field-report (no fixture, no controlled scenario, no before/after).

---

## 0. Executive summary

John locked the Payday Plan canvas yesterday (15 May, "Plan locked 15 May · 🔥 5 cycle streak") and used the app through normal payday-day tasks: paying off debts, marking bills paid, allocating savings, logging real transactions.

**Within ~3 minutes of normal use, the app's tracked state diverged from his real bank account by $4,166 on the cash side and $7,880 on the networth side.**

The in-app AI chat independently flagged the same issues without prompting from John. When John asked the in-app AI to correct the balance discrepancy, the AI's own `update_balance` tool overshot the correction by ~$7k, making the broken state worse.

This is no longer a UI or design problem. This is a financial-math integrity problem with multiple distinct failure modes that converge on the same symptom: **the numbers slyght shows can't be trusted.** For a finance app whose value proposition is "trustworthy numbers," this is existential.

**Recommended action:** pause all UI/design work on Bundle 28+ Phase 4 ship-now batch. Spend the next session on Class A (money-flow accounting) findings only. The other classes (cross-surface, date logic, UI semantics) compound on top of broken accounting — fix the accounting first.

---

## 1. Pre-flight notes

- **No fixture state captured.** John was using the live app on his phone, so I cannot precisely reproduce. Numbers and findings are reconstructed from screenshot pixels + in-app AI corroboration + John's annotations.
- **Confidence on root-cause hypotheses is medium-to-high** for Class A (financial accounting) because John's manual reconciliation gives ground truth and the in-app AI provides independent corroboration. Lower confidence for date logic and UI semantics where I'm reading symptoms from pixels.
- **Several findings overlap previous sweep findings (E-NN / F-NN).** Reconciled in §6.

---

## 2. The state John was operating in

Reconstructed from screenshots:

- Date: 15 May 2026, 10:45-10:48 am
- Payday: configured day-of-month = 15, paid early on 14 May
- Cycle: 14 May → 14 June (30 days remaining)
- Plan locked: 15 May, 5-cycle streak active
- Bills: 8 of 16 paid · $3,959 paid / $5,284 total
- Active debts: per canvas = 0 (CLEAR), per Debts sub-screen = $5,681 Property Deposit, per dashboard = same Property Deposit (with "VIA RENT" pill)
- Savings buckets — tracked (per app):
  - Darwin: $0
  - China Holiday: $96
  - Freedom Buffer: $0
  - Annual Provisions: $0
  - Property Deposit: ~$3,000
- Savings buckets — actual (per manual reconciliation):
  - Darwin: $800
  - China Holiday: $95.77
  - Freedom Buffer: unchanged
  - Annual Provisions: $298
  - Property Deposit: should be $5,500 after $2,500 deposit-portion of today's rent transaction
- Cash balance — app: $7,177.55 (Virgin Money)
- Cash balance — real: $3,011.65
- Networth — app: $12,159.85 (display) / $12,085 (per in-app AI)
- Networth — actual: $4,205.42

Transactions John logged in the session (visible in dashboard Recent Spending):
- Trip allocation: Darwin → -$800 (Savings)
- KIA Loan — Firstmac — paid → -$780 (Loan)
- Rent + Deposit Savings — paid → -$3,000 (Fixed)
- Debt payment: Borrowed from Vi... → -$82 (Debt repayment)
- Debt payment: Borrowed from ... → -$218 (Debt repayment)
- (Plus implicit: $550 Michael debt paid before this sequence per John's note)

---

## 3. Findings — by severity

Following the protocol's severity classes but with class labels for grouping (A: money-flow / B: cross-surface / C: date logic / D: UI semantics / E: AI agent).

### 🚨 BLOCKING

**FR-01 [Class A] — Cash balance hero does not decrement on transaction record (Bug #6A)**

App tracks $7,177.55. Actual bank: $3,011.65. Gap: **$4,165.90.**

Hypothesis 1 (higher confidence): `S.bal` is a snapshot field. The only path that mutates it is `applyBalanceCorrection` via the reconciliation flow. New transactions append to `S.txns` but don't decrement `S.bal`. Until the user manually reconciles, the balance display is stale.

Hypothesis 2 (lower confidence): The balance DOES decrement, but only for certain categories. Categories "Savings", "Fixed", "Transfer" treat the transaction as networth-neutral and skip the decrement. Pure expense categories (Bills, Debt repayment) decrement correctly.

**To verify which hypothesis is right:** check the audit log for the last 10 transactions. Each canonical transaction recording should fire `BRAIN.transaction.record`. Inspect the writer to see whether it touches `S.bal` for ALL categories or only some. If only some, it's hypothesis 2. If none, it's hypothesis 1.

**Per CC manual §7 networth tick-semantics:** the correct behaviour is:
| Category | Cash | NW |
|---|---|---|
| Bills/Debt repayment/Fixed (expense) | ↓ | ↓ |
| Savings/Transfer (allocation) | ↓ | unchanged (cash → bucket) |
| Income | ↑ | ↑ |

So Savings transactions SHOULD decrement cash (the cash moved out of the cash account into the savings account). They were probably misimplemented as "balance unchanged" because the underlying notion of "networth-neutral" was conflated with "balance-neutral." They are NOT the same.

**Effort:** depends on hypothesis. H1: 1-2h to refactor `S.bal` to a derived computed value with reconciliation as the override. H2: 30-60min to add cash-side decrement for the affected categories. Both come with 2x multiplier.

**Cross-references:** Bug #6A in observation log · in-app AI rounds 1, 2, 3 all corroborate.

---

**FR-02 [Class A] — Bucket balances don't increment when allocation transactions record (Bug #6B)**

Darwin allocation transaction shows in history as -$800. Darwin bucket balance tracks at $0. Same on Annual Provisions ($0 tracked vs $298 actual) and Property Deposit (didn't increment by $2,500 when rent + deposit transaction logged).

Per Bundle 28 architecture, savings transactions should call `BRAIN.savings.addToBucket` after `BRAIN.transaction.record`. Either the call is missing in the manual transaction log path, or it's called with the wrong bucket id, or it's called and silently failing.

**Verification path:** read `BRAIN.transaction.record` for "Savings" category specifically. Trace whether it calls `BRAIN.savings.addToBucket` after the txn append. If not, that's the bug.

**Architectural concern:** if the Apply path in auto-allocate (which DID work in earlier sweeps — F-01 was about double-counting, not zero-counting) calls `BRAIN.savings.addToBucket` correctly but the manual transaction path doesn't, there are two different writers updating the same conceptual state. That's the parallel-paths anti-pattern from CC manual §13.

**Effort:** depends on whether it's a missing call (30min) or a wider refactor to unify Apply path + manual txn path (2-3h). 2x multiplier on both.

**Cross-references:** Bug #6B · F-01 from prior sweep (different failure mode, same architectural locus).

---

**FR-03 [Class A] — AI agent `update_balance` tool overshoots corrections by ~$7k (Bug #10)**

John asked the in-app AI to correct balance from $7,177.55 → $3,011.65 (delta -$4,165.90). The AI applied a correction that took off ~$11,000 instead, leaving the balance dramatically negative.

The AI's own diagnosis: "my update_balance action is completely broken and overshooting corrections."

**Hypothesis:** The `update_balance` tool's argument schema is ambiguous — accepts a value that could mean "target balance" OR "delta to apply." The AI computed delta and called the tool expecting delta-semantics, but the tool interpreted it as target-balance (or vice versa). Resulting double-application or sign-flip.

This is BLOCKING because it makes the AI chat actively harmful as a self-help tool. A user asking the AI to fix the sync issue (per Bugs FR-01/02) gets a worse state, not a better one.

**Fix:** the tool's parameter schema should be unambiguous. Either:
- `update_balance(new_value, reason)` — value IS the target balance
- `apply_balance_delta(delta, reason)` — delta is the change to apply  
- Plus runtime validation: `if abs(delta) > $1000, require user confirmation in chat`

**Effort:** 1h to rewrite the tool schema · 30min to add the validation · 30min to verify. 2x = 4h.

---

### ⚠️ HIGH

**FR-04 [Class B] — Cross-surface "free money" inconsistency (Bug #5, extends Opus E-03)**

Same conceptual quantity ("free money this cycle") shown as different values across surfaces:
- Canvas root: $2,110 ("YOUR FREE MONEY THIS CYCLE")
- Savings sub-screen: $850 ("left to split across goals") after $800 already allocated, implying pool ~$1,650
- Dashboard: not directly displayed but inferable from differential

CC's E-03 framing was that these are three different correct answers to three different questions. The labels obscure the distinction. F-15 in CC's handoff already proposes the relabeling fix. **Carry forward F-15 from prior loop.** Field-report just confirms the pattern persists in real-use.

---

**FR-05 [Class A] — "Free money this cycle" goes UP after clearing a debt (Complaint C)**

John paid off $550 Michael debt. Expected: free money decreases by $550 (cash gone). Observed: free money increased by ~$600 ($1,200 → $1,800).

**Root cause hypothesis:** the displayed "free money" = income − essentials. When the $550 debt is marked paid, it drops from essentials. So essentials decrease by $550, and "free money" increases correspondingly. BUT the corresponding cash decrease never registers (per FR-01). So the user sees: paid $550 debt → app says you have $600 MORE free money. The inverse of correct.

This is technically a derivative of FR-01 + FR-02. Once cash decrements correctly and bucket logic works, "free money" math will be coherent. Listed separately because it's the most visceral user-facing manifestation of the broken accounting.

**Fix:** comes for free once FR-01 + FR-02 land. Verify after those fixes.

---

**FR-06 [Class B/C] — Payday countdown shows 3 different values across surfaces (Bug #7)**

- Canvas header: "30 days left"
- Dashboard footer: "31d to payday"
- In-app AI: "today is payday, 0 days"

Each surface uses a different computation:
- Canvas: `cycleEndDate (14 Jun) - today (15 May) = 30 days` ✓
- Dashboard: `next 15th from today = 15 June, 15 Jun - 15 May = 31 days` (ignores cycleEndDate)
- AI: `S.payday = 15, today's date = 15, so today is payday`

**Per CC manual §7 math invariant: cross-surface coherence is required.** All three should derive from the same canonical source. The canonical source is `cycleEndDate` (which respects early-payday handling), not `S.payday` (raw day-of-month).

**Fix:** dashboard and AI should read `S.activePlan.cycleEndDate` (or equivalent derived value), not `S.payday` directly. Add boot self-test invariant: `daysToPayday` computed across all surfaces must agree.

**Effort:** 1h identify all readers · 30min unify on cycleEndDate · 30min boot self-test. 2x = 4h.

---

**FR-07 [Class B] — Debts sub-screen disagrees with canvas + dashboard on debt total**

- Canvas Debts tile: "$0 · None active · CLEAR"
- Debts sub-screen: "$0 · 3 of 0" header + Property Deposit (via Mum) $5,681 listed under MINIMUM PAYMENTS
- Dashboard Immediate Debts: Property Deposit (via Mum) with "VIA RENT" pill, $5,681

Three different views of "what debts are active." The Property Deposit is conceptually a debt (per dashboard) but excluded from Payday Plan canvas (per CLEAR badge). The sub-screen tries to include it but the math goes wrong ("$0 · 3 of 0").

**Hypothesis:** `viaRent: true` flag filters debts OUT of `getActiveDebtsDueBeforePayday()` used by the canvas, but the Debts sub-screen renders ALL debts including viaRent. The "3 of 0" suggests the count is reading a different slice from the dollar total — possibly counting historical/cleared debts in the numerator.

**Fix:** decide the contract — does "via rent" mean (a) it's a debt but not actionable this cycle (display in sub-screen as informational, exclude from canvas totals), or (b) it's not really a debt, it's a savings target (display only in savings). Currently it's both, badly.

**Effort:** design call (CC manual §13 escalation pattern) → 1h spec → 1-2h implementation. 2x = 6h.

---

**FR-08 [Class D/A] — MAX PER DAY shows $0 despite locked plan + healthy state (Bug #8)**

Dashboard MAX PER DAY card: $0.00 "Tight — cover your essentials first" with "Running $3178.89 over pace this week ⚠"

But user has:
- $7k tracked cash (or $3k real — still positive)
- Plan locked, essentials budgeted at $6,513
- 8 of 16 bills paid
- 30 days remaining

$0/day is incorrect. The "Tight" framing is incorrect. The "over pace this week" might be true (today's $5,429 outflow is a one-off rent payment) but the framing makes it look like sustained overspending.

**Hypothesis:** `getDynamicDailyBudget()` computes essentials as `total_essentials` not `unpaid_essentials`. So even when $3,959 of bills are already paid, the function still subtracts the full $5,284 from available, resulting in zero or negative max-per-day. Combined with the broken cash hero (FR-01), the input to this function is all wrong.

**Fix:** has dependencies on FR-01 (correct cash) and bills-paid awareness (subtract only unpaid). After FR-01 lands, revisit this finding. May resolve naturally; may need targeted fix on top.

**Effort:** 1h after FR-01. Currently blocked.

---

### 🟡 MEDIUM

**FR-09 [Class D] — Debts sub-screen header "$0 · 3 of 0" (Bug #1)**

Reads as semantically broken. Count vs dollars mismatch ("3 of 0"). Likely the "3" comes from a different filter than the "0". 

**Fix:** trace the header generation in `renderPaydayDebts`. Reconcile count source with dollar source. 30min · low risk.

---

**FR-10 [Class D] — Daily Living "$154/day actual" shown out of context at cycle start (Bug #3)**

Daily Living sub-screen says "Last 30 days you actually spent $154/day — $124/day over your floor." But today is day 1 of a new cycle. The "last 30 days" includes the prior cycle, which is irrelevant context to today's planning. Reading it on day 1 produces alarm without actionable info.

**Fix:** either reframe ("Across last cycle") or hide the comparison until day 7+ of current cycle. Design call. 30min after design.

---

**FR-11 [Class D] — Status pill "Tight" wrong when floor below max-affordable (Bug #4)**

Daily Living shows Status: "Tight" but max is $57/day and floor is $30/day — comfortably under. The pill is reading a different signal than the visible math suggests.

**Fix:** trace pill logic. Either re-label (the "tight" semantically means something else like "actual spend overshoot last cycle") or fix the threshold. 30min.

---

**FR-12 [Class C] — Bills fed to AI as day-integers, not full ISO dates (Bug #9)**

Bills tab renders correct dates ("16 May", "21 May"). AI receives day-of-month integers and reports "due 4th, due 21st" without month. User can't tell if "21st" is past or future.

**Fix:** when constructing BRAIN context for the chat AI, derive `nextDueDate` (full ISO) per bill rather than passing raw `dueDay`. 30min · low risk.

---

**FR-13 [Class E] — AI context doesn't refresh per turn (Bug #11)**

Chat AI session loads S at chat-init and doesn't refresh on subsequent messages. So mid-conversation manual fixes are invisible to it. Lower severity because user can start a new chat session, but enough friction to be worth fixing.

**Fix:** in the chat send handler, refresh BRAIN context from current S before each call to the API. 30min · low risk.

---

### 🎨 DESIGN-LEVEL (defer to Opus session)

**FR-14 — Missing "allocated/paid this cycle" tracker (Complaint A + B)**

John's specific request: there's no place to see "this cycle so far you've paid X in debts, allocated Y to savings, marked Z bills paid." The Payday Plan canvas shows what's PLANNED but not what's been ACTIONED. Without a tracker, he can't see his own progress within the cycle.

**Design question:** does this live on the canvas root (sub-section "this cycle so far") or on the dashboard (a daily summary band) or in a new "Activity" view? Defer to Opus design pass after Class A bugs land.

---

## 4. Reproduction scenario for CC

To validate the Class A fixes work, CC should mock up this scenario as a controlled test:

**Fixture:**
- `S.bal = 10000`
- `S.payday = 15`, `S.paydayReceived = true`, `S.paydayReceivedDate = '2026-05-14'`
- `S.activePlan.cycleStartDate = '2026-05-14'`, `cycleEndDate = '2026-06-14'`
- All buckets at $0 (Darwin, China, Freedom buffer, Annual Provisions, Property Deposit)
- Plan locked
- No transactions

**Test sequence (each step takes a state snapshot, then asserts):**

1. **Baseline.** State snapshot. Cash should be $10,000, networth should be $10,000.

2. **Log a Bills transaction: -$200 "Optus" (category: Bills).** Expected: cash $9,800, networth $9,800. (Decrement both.)

3. **Log a Debt repayment: -$500 "Mum debt" (category: Debt repayment).** Expected: cash $9,300, networth $9,300.

4. **Log a Savings transaction: -$800 "Trip allocation: Darwin" (category: Savings, destination bucket: Darwin).** Expected: cash $8,500, networth $9,300 (unchanged), Darwin bucket $800.

5. **Log a Fixed transaction with split: -$3,000 "Rent + Deposit" (category: Fixed, split: $500 rent / $2,500 deposit).** Expected: cash $5,500, networth $7,300 ($9,300 - $500 rent loss + $0 transfer), Property Deposit bucket +$2,500.

6. **Trigger the same auto-allocate flow that's currently broken: allocate $200 to Annual Provisions via the monthly cron.** Expected: cash $5,300, networth $7,300 (unchanged), Annual Provisions bucket $200.

7. **Verify in audit log:** every step has a `transaction_recorded` entry AND, where applicable, a `bucket_credited` entry. Source tags are correct.

8. **Trigger AI `update_balance` correction: set balance to $5,000.** Expected: cash goes from $5,300 → $5,000 (delta -$300, applied once). Verify it didn't overshoot.

If any step fails its assertion, that's the bug location. Currently FR-01 means steps 2/3 fail (cash unchanged). FR-02 means steps 4/5/6 fail on the bucket side. FR-03 means step 8 fails dramatically.

CC can write this as a 100-line Puppeteer harness or as a manual checklist with state-snapshot exports between steps. Either way, the assertions are precise.

---

## 5. Prioritisation for next session

**Drop the previously-approved ship-now batch from CC's handoff.** Those findings (F-01 savings double-count, F-02 math sub-line, F-08 lock shortfall, F-11 buffer color, F-22 lock button, F-23 toast clip) are valid but lower-impact than the Class A findings here. Some (F-01) may be subsumed by FR-02. Re-evaluate after FR-01/02/03 land.

**Suggested order for next session:**

1. **FR-01 cash decrement** — fix the cash hero to track actual cash. Foundational. ~2-3h.
2. **FR-02 bucket increment** — fix the savings/transfer transactions to credit buckets. ~2-3h. Together with FR-01, restores trust in the numbers.
3. **FR-03 AI update_balance tool** — fix the AI's correction tool so users aren't compounding errors. ~3-4h.
4. **FR-05 free money goes up** — verify resolves after FR-01/02. Likely 0h additional.
5. **FR-08 MAX PER DAY** — verify resolves after FR-01. Address remaining issues. ~1h.
6. **FR-06 payday countdown** — unify on cycleEndDate. ~3-4h.

Total estimated session: 12-16 hours of CC work. This is a multi-session bundle (call it Bundle 30: "money-flow accounting integrity") not a single sit-down. Sequence the commits to ship incrementally so each layer is verifiable.

**After Class A lands and is verified on John's phone with a fresh cycle test, then return to the prior loop's ship-now batch.** The other findings still matter; they're just downstream of the accounting work.

---

## 6. Reconciliation against prior sweep findings

| Prior F-NN | Status given field report |
|---|---|
| F-01 savings double-count | Likely SUBSUMED by FR-02. Bug class is the same (transaction → bucket linkage); failure mode differs (double-count was via duplicate path, zero-count is via missing path). Unify the fix. |
| F-02 math sub-line | UNCHANGED. Display fix still ships, but verify after FR-01 to ensure the numbers being subtracted are correct. |
| F-08 lock-shortfall ignores provisions | UNCHANGED. Independent bug, ship as planned. |
| F-09 streak inflation | UNCHANGED. State integrity bug, separate from accounting bugs. |
| F-15 free-money labels | RELATED to FR-04 here. Carry forward, ship after FR-01/02 stabilise. |
| F-16 projection framing | RELATED to FR-08 here. The "$0 max per day" is partly the projection framing instability. |
| E-NN findings from Opus review | Mostly unchanged. Pixel-level findings stand. The field-report adds the state-level findings that pixel review couldn't catch — exactly the protocol gap CC and Opus flagged in the prior loop. |

---

## 7. What this means for the protocol

The mock-sweep-prompts v2 protocol caught pixel-level bugs effectively. It missed all the Class A money-flow bugs in this report because they're state-machine bugs invisible to single-frame pixel inspection.

**Confirmed limitation of the current protocol:** vision-only review cannot catch state-persistence-across-transactions bugs. Even the multi-frame state-persistence trace (Pass B in Prompt B) works only when the state IS rendered to screen in each frame. When the bug is "transaction recorded but state didn't update," and the state is only visible after navigation away+back+drill-into-sub-screen, pixel inspection misses it.

**Protocol amendment recommended for v3:**
- Add "Pass I — transaction integrity sweep" alongside Pass B (state persistence) and the proposed Pass H (math chain trace from CC's handoff).
- Pass I requires: a fixture state + a scripted sequence that LOGS transactions through the canonical writers + a final state snapshot + assertions that each transaction's expected effect on (cash, bucket, networth, audit log) all hold.
- This is closer to a behavioural test than a vision review. Needs CC tooling, not Opus vision. But the sweep protocol can call for it.

---

## 8. Open questions for John

**Q-FR-01:** Confirm bank balance $3,011.65 vs $3,081.65 from earlier in session — was one a typo? Doesn't change the diagnosis but precise number matters for the reproduction scenario.

**Q-FR-02:** When you marked the $550 Michael debt paid (which started Complaint C), did you log a corresponding Debt repayment transaction with -$550, or did the "mark paid" action handle that internally? Determines whether mark-paid is fully wired up to canonical writers.

**Q-FR-03:** The Property Deposit shows $5,681 on dashboard but you said it's "stuck at $3,000" per AI's view. Which is the source of truth right now — is the $5,681 stale (should be $3,000 after some past correction) or accurate (and the AI is wrong)?

**Q-FR-04:** The "5 cycle streak" badge — has the plan actually been locked for 5 consecutive cycles, or is this another instance of F-09 streak inflation? If real, congrats. If inflated, F-09 needs attention sooner.

**Q-FR-05:** Are you OK with Bundle 30 displacing the previously-approved ship-now batch? My recommendation is yes (accounting integrity is foundational), but you've already approved that batch and CC may have started work.

---

## 9. Loop closure — recommended next moves

For CC:
1. Read this field report end-to-end (per CC manual §3 step 1 discipline).
2. Verify FR-01 and FR-02 via code-read at the transaction record path. Confirm or refute the hypotheses.
3. Spec Bundle 30 with FR-01 → FR-02 → FR-03 as the spine. Include the reproduction scenario from §4 as the verification harness.
4. Produce an SDD before code (per CC manual §3 step 4). This is architectural — touching `S.bal` semantics and bucket reconciliation isn't a quick patch.
5. STOP for John's approval on the Bundle 30 spec.

For John:
1. Decide Q-FR-05 (does Bundle 30 displace the prior ship-now batch).
2. Answer Q-FR-01 through Q-FR-04 when you can.
3. Don't trust the in-app AI to fix balance via `update_balance` until FR-03 lands.
4. Manual reconciliation continues as the workaround until FR-01/02 ship.

For Opus (me, next session):
1. After Bundle 30 specs land, do a design-pass review of the SDD before CC writes code.
2. Loop in for FR-14 (the "this cycle so far" tracker) — that's a clean design problem worth solving once accounting is stable.
3. After Bundle 30 verification passes, run a follow-up sweep with the "Pass I transaction integrity" protocol to confirm the fix and catch any unknown side effects.

---

**End of field report.**

This represents ~3 hours of John's effort + my analysis distilled. It surfaces issues that would have eventually shown up but were latent until real-use exposed them. The mock-sweep protocol works as designed — and the field-report is the complement to it. Both have a place in the workflow.
