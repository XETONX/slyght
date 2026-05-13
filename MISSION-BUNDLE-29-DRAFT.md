# Bundle 29 — Draft Scope (post-Bundle-28 lockdown)

**Status:** scoping pass, not yet ship-ready. Drafted while John was gaming + said "step out, what about the other bundles I think UX and features are pretty damn good."

**Bundle 28 closeout:** 51 rounds shipped covering canonical-writer queue (rounds 10-23) + visual polish (24-33) + Quick Log refactor (34, 38) + endDate / BNPL / Debt Freedom (35-37) + sync bugs (45-47) + Mum-readable Payday Canvas (46) + bill paid/deferred + auto-allocate transparency (49-51).

Memory state lock per CC manual §3:
- `feedback-slyght-text-contrast` — readability discipline
- `feedback-slyght-info-density-discipline` — 4-question check before adding info
- `feedback-phone-verify-instructiveness` — what-to-open / what-to-do / PASS / FAIL
- `feedback-noticed-action-plans` — every Noticed item gets ACTION + WHEN

## What John said is "pretty damn good" (don't break)

- Payday Plan Canvas: income → essentials (incl annual provisions) → remainder → discretionary → still-free flow
- Dashboard ↔ Canvas sync: both surfaces read `BRAIN.plan.getSnapshot()` → same numbers
- Mum-readable summary line + FIXED/YOURS badges
- Debt Freedom Timeline with due-date urgency sort
- BNPL quick-add modal with per-payment + remaining-payments inputs
- Bill Paid/Deferred toggle (replaced quick-pick grid)
- Auto-allocate transparency (essentials-covered-first breakdown)
- AU date format on high-traffic surfaces

## Bundle 29 candidates — ranked by user-value

### A. Scanner routing (highest user value)
John (r36 + r48): "make sure this functionality is available in the scanner functionality so when I upload a screenshot and it recognises an Afterpay payment then it populates the BNPL window automatically instead of creating like a transaction... having that functionality with the scanner functionality to recognise what its tracking bills/debts/expenses and adjust what screen it populates with the information."

**Scope:**
- Detect intent from screenshot: bill / debt / BNPL / expense
- Route to the appropriate modal pre-filled
- Afterpay BNPL detection (schedule + per-payment + remaining)
- Receipt → Quick Log with cat + note pre-filled
- Bill notice → Add Bill with name + amount + due date

**Dependencies:** existing `openScannerModal` flow + AI-vision integration. May need a scanner-routing dispatcher.

### B. BNPL: explicit payment-date schedule (not day-of-month recurrence)
Known limitation flagged in r48. Real Afterpay/Klarna schedules slide (May 21 → Jun 4 → Jun 18 → Jul 2), they don't repeat on the same day-of-month. Current BNPL bills use `freq:fortnightly + day:21` which is approximate.

**Scope:**
- Schema: BNPL bills carry `paymentDates: ['2026-05-21','2026-06-04','2026-06-18','2026-07-02']` instead of (or alongside) day+freq
- `getExpandedBills` reads the explicit dates for BNPL-tagged bills
- BNPL modal save populates the array
- Calendar + Payday Canvas respect the explicit dates

### C. Savings type → bucket picker (deferred from r38)
John on Quick Log type=Savings: "have the option to choose what account/bucket I'm allocating to and then this sends an update back to savings goals subscreen if plan is locked for the month and then registers that it's been paid using the tick system."

**Scope:**
- When type=Savings is picked in Quick Log, surface a bucket picker
- On save: txn + BRAIN.savings.addToBucket
- If plan is locked, the matching savings entry's tick flips automatically
- Cross-surface refresh: dashboard + plan-mode + canvas all reflect

### D. Drag debts FIXED↔YOURS + "recommended to defer" tag (deferred from r46)
John on Mum-walkthrough: implicit ability to mark some debts as "this cycle, not fixed" so they fall into YOURS allocation pool.

**Scope:**
- Per-debt cycle override: include-as-essential vs. discretionary-this-cycle
- "Recommended to defer" badge on long-term debts (low rate + far due-date)
- Canvas suggests deferred items inline so John can show Mum "this could move"

### E. Auto-allocate: include urgent debt pay-downs (extension of r48)
Current `recommendAllocation` only allocates to buckets. r49 made the bills/debts/provisions "already covered" framing visible but doesn't recommend EXTRA debt payments.

**Scope:**
- For debts with `delayDate` within the cycle, recommend full pay-down from allocatable
- Show debt allocations in the modal alongside bucket allocations
- Apply via `setOverride('debt', id, amt)` so the canvas tick flow works

### F. NW Trend bug #13 + Calendar bug #20 investigations
Both from OPEN-BUGS, both probably stale state. Quick verify pass.

### G. Layer V capture refresh
~30 captures rendered with old UI. Need re-baseline post-Bundle-28.

### H. Cloud sync (GitHub Gist) — Bundle 23 spec
Locked architecture from memory `slyght_bundle_23_cloud_sync`. ~2-3 hr work. Closes dump-drift + multi-device gaps.

## Suggested Bundle 29 split

**Bundle 29 Phase 1 (Scanner + BNPL schema, high-leverage user wins):**
- A: Scanner routing
- B: BNPL explicit payment dates

**Bundle 29 Phase 2 (Auto-allocate + plan polish):**
- D: Drag debts FIXED↔YOURS
- E: Auto-allocate includes urgent debts

**Bundle 29 Phase 3 (Infrastructure cleanup):**
- F: NW Trend + Calendar bugs
- G: Layer V re-baseline
- H: Cloud sync

**Bundle 29 Phase 4 (Savings flow):**
- C: Savings-type bucket picker + tick integration

## Lower priority / not in 29

- Magic-string WARNs (44 future-proofing — not blocking)
- `getGenuineSurplus` migration (semantically distinct from getSnapshot, not a real parallel-impl)
- Contrast sweep on lower-traffic tiles

## Deferred to Bundle 30

- Rules-as-data refactor (Audit A1 §5.5)
- AI agent autonomous mode (read BRAIN.audit + propose changes)

---

## Recommended next step

Once John confirms direction:
1. Write `CLAUDE-CODE-SHIP-PROMPT-29.md` with executable phase plan
2. Start Phase 1A (Scanner routing) — biggest user-value lift
3. Phase 1B (BNPL schema) — closes the calendar-aware date bug class for real

Notes for future-me:
- Run `npm test` after every change (62 tests now)
- AMENDMENT-001 phone-verify format is the contract
- `BRAIN.audit.query()` is the AI-agent introspection entry point
- Per the AMENDMENT-001 discipline, Bundle 29 ship prompt should pre-commit to phase ordering
