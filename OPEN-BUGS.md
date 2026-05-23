# SLYGHT — OPEN BUGS

Tracking file for bugs surfaced between mission cycles. Each entry
stays here until it's fixed or explicitly wontfix'd. Bugs are claimed
by a fix-bundle when scoped; until then they sit unscheduled.

**Format**
- **Bug:** short description
- **Source:** John's screenshot / message timestamp
- **Repro needed:** yes / no
- **Fix bundle:** B / C / D / E / unscheduled
- **Status:** open / investigating / fixed / wontfix

---

## 1. Savings bucket goal / saved-amount edit broken
- **Bug:** Editing the goal target or saved amount on a savings bucket
  fails (does not open the editor, does not persist, or persists wrong
  — exact failure mode unclear).
- **Source:** John, 2026-05-05 evening session
- **Repro needed:** yes — which bucket, which field, what user-visible
  failure (silent no-op vs. error vs. wrong value persisted)
- **Fix bundle:** unscheduled (awaiting repro)
- **Bundle 7 investigation:** read `saveBucketModal` flow end-to-end —
  read-and-write logic looks correct (form values → `b` reference →
  `save()` → `renderAll`). Likely user-visible failure is that
  `bucket.goal` does NOT propagate to a linked plan item's `target`
  field (`PLAN.readSavedFromSource` only mirrors `saved`, not `goal`).
  If the symptom is "I edit bucket goal, Plan mode shows old target",
  fix is a parallel write to the linked trip/goal target. Awaiting
  John's specific repro before patching. Inline TODO at saveBucketModal.
- **Bundle 7.1 phone-verify:** John re-tested 2026-05-10 ("no issues probs fixed") — bucket edit appears to work. Either the original failure was transient, the Bundle 7 investigation comment surfaced something, or the issue was orthogonal to saveBucketModal proper.
- **Status:** cannot-reproduce (Bundle 7.1 — closed pending fresh repro; reopen if it surfaces again)

## 2. "Projected to run out 2 days (Tue 5 May)" — banner points at today
- **Bug:** Survival banner says "in 2 days" but the date rendered next
  to it is today (2026-05-05). Either the day-count is off-by-N or the
  rendered date is wrong. Likely lives near `getSurvivalForecast`
  runOutDate loop, index.html ~:2490-2514 — the loop sets `runOutDate`
  inside an `i` that starts at 0, so `i+1` could be reading "today"
  when balance dips negative on the very first iteration.
- **Source:** John, 2026-05-05 evening session
- **Repro needed:** no (visible on dashboard right now)
- **Fix bundle:** unscheduled (date-math investigation needed before
  scoping; suspect a small fix once confirmed)
- **Status:** fixed (Bundle 5 — commit 2ce9765, today-aware MAX PER DAY + survival forecast trust)

## 3. Round-up cents display in Recent Spending — post-Bundle A retest
- **Bug:** Round-up txns showed as `-$0` in Recent Spending. Bundle A
  (commit a8952c9) added 🏦 badge + `+$X.XX` formatting and switched
  amount color from red to muted text. Retest required after deploy.
- **Source:** John original smoke-test 🔴 + Bundle A fix
- **Repro needed:** no (post-deploy verification)
- **Fix bundle:** B (only if Bundle A's fix didn't resolve it — fold
  in as a small extra)
- **Status:** investigating

## 4. "+ Add Debt" button broken
- **Bug:** "+ Add Debt" on Immediate Debts tile reportedly doesn't open
  the creation form. Code IS wired:
  `<button onclick="openAddDebtModal()">` at index.html:459 →
  `openAddDebtModal` at :3955 sets `#add-debt-modal.open` → modal HTML
  at :797 → save handler at `saveNewDebt` :3997. Either a specific
  state regression (modal hidden by other modal? z-index?) or the form
  opens and save silently fails.
- **Source:** John original smoke-test 🔴
- **Repro needed:** yes — does the modal open at all? Does it open
  but save fail? Does it open but values not persist after reload?
- **Fix bundle:** unscheduled (awaiting repro)
- **Bundle 9 verification (2026-05-11):** John confirmed working — he
  added a new "Borrowed-from-Michael" debt within the last week and it
  persists. CC re-read `openAddDebtModal` + `saveNewDebt` end-to-end:
  validation guards correct, ID-collision guard present (Mission #42
  era), linked-liability detection (car/CC) intact, `S.debts.push` +
  `save()` + `onStateChange('debt_added')` all fire. No bug visible
  in code. Likely original failure was a modal-stack regression
  resolved organically by the Bundle 7.2.x PLAN_MODAL hardening cycle.
  Direct `S.debts.push` is expected pre-Bundle-11 (BRAIN.debts not
  yet seeded; routes through canonical writer when that bubble lands).
- **Status:** cannot-reproduce (Bundle 9 — confirmed working in John's recent use; closed pending fresh repro)

## 5. Auto-sort dialog — verify apply + persist
- **Bug:** Auto-sort dialog opens (per Image 1) but unverified whether
  tapping OK actually re-orders the Immediate Debts list AND persists
  the new order after reload.
- **Source:** John, 2026-05-05 evening session
- **Repro needed:** no — verification-only, John can confirm in one
  pass
- **Fix bundle:** unscheduled (verification first; scope to a bundle
  only if broken)
- **Status:** investigating

## 6. renderTrend / renderCatBreakdown / category-overspend flags use too-broad filter
- **Bug:** Three Analysis-tab consumers use `S.txns.filter(t => !t.income)`
  (or `!t.income && t.cat !== 'Debt repayment'`) instead of the canonical
  strict discretionary filter. Results: trend deltas, category breakdown,
  and "you spent X on Y this cycle" overspend flags include Bills, Car
  Loan, CC Payment, Transfer txns as if they were discretionary. Same
  class of bug as RC2 fixed for pivot + suggestions, just on different
  tiles.
- **Source:** Bundle B audit, 2026-05-05 — same root cause as RC2
- **Repro needed:** no (code review only — `index.html` ~:5060,
  ~:5074, ~:4960)
- **Fix bundle:** unscheduled (small, mirrors RC2 — extend
  `getDiscretionaryByCategory` consumers; bundle into a hygiene commit
  next time analysis-tab work happens)
- **Bundle 31 part-A landed:** Essential vs Discretionary tile (one of
  the three Analysis consumers) is now cycle-bounded — commit 17481ff
  added `t.ts >= MODEL.cycleStart.getTime()` to the existing filter,
  fixing the impossible $15k lifetime aggregation. Classifier itself
  unchanged (Loan/Savings still grouped as "essentials"); strict
  `_NON_SPEND_CATS` migration deferred as part-B (separate design call —
  reclassifying Loan/Savings out of essentials changes what the chart
  MEANS to John). Smoke at `tests/smoke/analysis-essentials.smoke.js`.
- **Status:** partially-fixed (Bundle 31 part-A — commit 17481ff, 2026-05-19);
  part-B (strict-classifier migration + remaining 2 consumers of the lax
  pattern) still open as Bundle 32+ candidate, ideally bundled with
  OPEN-BUGS #7 + #8 + #17 as the filter-scatter root cleanup

## 7. renderCutSliders compares all-time spend to monthly baseline
- **Bug:** `renderCutSliders` uses all-time txn history but compares to
  monthly baselines (Food $480/mo, Entertainment $750/mo etc). After
  several months of data, "all-time spent" will trivially exceed monthly
  baselines and "what to cut" will recommend cutting everything.
  Bundle B RC2 fixed the FILTER to use strict discretionary; the SCOPE
  (all-time vs monthly) is still wrong.
- **Source:** Bundle B audit, 2026-05-05 (`index.html` ~:5005)
- **Repro needed:** no (code review)
- **Fix bundle:** unscheduled — likely 1-line fix once we decide the
  right scope (monthly? cycle? last 30 days?)
- **Status:** open

## 8. Dashboard "Running over/under pace this week" uses lax filter
- **Bug:** Dashboard pace tile (~`:3174`) computes
  `_weekAvg = getDiscretionarySpend(now-7d, now) / 7` — `getDiscretionarySpend`
  uses the LAX filter (excludes only Debt/Savings/Loan/Income, includes
  Bills/Car Loan/CC Payment). After a paid-bills week the pace inflates
  and shows "over pace" when discretionary spending was actually fine.
  Should use `computeSpentInRange` (strict filter) like the dashboard
  "spent today" does.
- **Source:** Bundle B audit, 2026-05-05
- **Repro needed:** no (code review)
- **Fix bundle:** unscheduled — also relevant to the smoke-test item 11
  re-mark; that tile + this tile are likely the same surface
- **Status:** open

## 9. Smoke-test item 11 over-claim from Bundle A
- **Bug:** Bundle A marked smoke-test item at line 75 ("$X/day pace
  uses today's actual elapsed days") as ✓, but only the Bills-tab
  "Spent so far (0 days)" copy was actually fixed. The dashboard
  pace tile referenced in item 11 uses `_weekSpent/7` (no days-elapsed
  computation) — different bug surface. Re-marked 🔴 in Bundle B.
- **Source:** Bundle A verification block; corrected Bundle B
- **Repro needed:** yes — John to confirm exactly which tile shows
  the broken pace text
- **Fix bundle:** unscheduled (likely overlaps with bug #8)
- **Status:** merged-into-#8 (2026-05-06 — same dashboard pace tile
  surface; #8's strict-filter fix covers this. Trail kept per project
  precedent; no separate fix planned.)

## 17. Cross-tile "today's spend" coherence — three renderers, three different values
- **Bug:** Footer persistent strip, dashboard "Over by $X today" alert,
  and Analysis tab "today's spend" each compute their own number.
  Drifts because the three filters disagree (some strict, some lax,
  some unfiltered). Concrete repro from John's phone 2026-05-05:
  footer "$22 today", dashboard alert "Over by $44 today", Analysis
  "$74.09" — same concept, three numbers, each presents itself as
  authoritative. Same root pattern as RC2 / OPEN-BUGS #6 cousins.
- **Source:** John phone 2026-05-05 (consolidated from OPEN-BUGS
  #12 and #15 which name the same root cause)
- **Repro needed:** no (visible)
- **Fix bundle:** **Two-commit follow-up after Layer 2.** Layer 2's
  catalog of 9 invariants does NOT cover cross-tile DOM coherence —
  that's intentionally Layer 1 territory (static rule, not runtime
  banner) per the design discussion 2026-05-05. Sequence:
    1. Refactor: consolidate today-spend computation into
       `MODEL.todaySpent` (already exists in MODEL — verify all
       three renderers consume it). Update footer
       `updatePersistentStrip`, dashboard alert renderer's "Over by"
       computation, and Analysis tab's today-display to all read
       directly from `MODEL.todaySpent`. Same pattern Bundle B used
       for `MODEL.cycleSpent` repointing.
    2. Layer 1 follow-up: add new static rule
       `today-spend-renderers-consume-MODEL.todaySpent` to the
       guardian-static.js catalog. Mirrors the existing
       `nw-renderers-consume-MODEL.liquidNet` rule. After this rule
       lands, Layer 1 catalog grows from 16 → 17 rules.
- **Status:** open

## 11. Plan Mode "Add savings" buttons non-functional on China Holiday and Darwin allocation sliders
- **Bug:** "Add savings" buttons on the China Holiday and Darwin
  allocation sliders in Plan Mode. **Updated repro detail:** John typed
  21.93 in the amount field, tapped "Add savings". Modal renders,
  input accepts, submit button is wired (tappable). Handler does not:
  update the bucket's `saved` field, close the modal, show a
  confirmation, or log a transaction. **Three candidate failure
  modes need disambiguation by repro:**
    1. Click handler not wired — button exists but no listener attached
    2. Handler runs but throws silently — error in console, state never updates
    3. Handler runs and mutates state but doesn't trigger renderAll —
       change happens invisibly until modal close
  **Diagnostic question for next repro:** when you tap "Add savings"
  with 21.93 entered, does the modal close, stay open with the field
  cleared, or stay open with 21.93 still showing? That answer
  identifies which of the three failure modes is in play.
- **Source:** John, 2026-05-05 evening session (state export review +
  manual repro on phone)
- **Repro needed:** specific — modal close behavior on tap
- **Fix bundle:** unscheduled — likely fold into Allocation Playground
  v1 work (which rebuilds the slider interaction model from scratch);
  not blocking dead code cleanup or Layer 2
- **Status:** fixed (Bundle 6.5 — commit 35b425b — root cause: PLAN_MODAL.btn() nested-quote escape bug; HTML attribute parser truncated onclick at first inner `"`, leaving handlers as silent SyntaxErrors. Phone-verified A=PASS 2026-05-10.)
- **2026-05-06 sweep echo:** Sam attempted to reach Plan Mode allocation
  sliders (turn 8-12 of 2026-05-06-1231 sweep) but couldn't navigate to
  them — clicked "See Breakdown" expecting allocations, got Net Worth
  modal instead. Sweep observations AA.2.3 (savings bucket editing
  untested) and AA.3.6 (allocation editing surface in Plan Mode)
  merged into this entry as same surface gap.

## 12. Cross-tile coherence — "today's spend" disagrees across three tiles
- **Bug:** Footer persistent strip says one value for "today's spend",
  dashboard alert says another (the "Over by $X today" overspend
  number), Analysis tab says a third. Same concept, three numbers,
  each presenting itself as authoritative. Concrete repro from
  John's phone 2026-05-05: footer "$22 today", dashboard alert "Over
  by $44 today", Analysis tab "$74.09". Each renderer computes its
  own filter; values drift because the filters disagree (likely RC2
  / OPEN-BUGS #6 cousin — some use strict `_NON_SPEND_CATS`, some use
  lax `EXCLUDED_CATS`, some don't filter at all).
- **Source:** John phone 2026-05-05
- **Repro needed:** no (visible on phone)
- **Fix bundle:** **Layer 2 calibration target** — Layer 2's
  MI-08-cross-tile-coherence invariant is designed to catch exactly
  this. Building Layer 2 forces the renderers to consume
  `MODEL.todaySpent` as single source of truth; the invariant gates
  future drift. Don't fix in a separate mission — Layer 2 is the fix.
- **Status:** merged-into-#17 (2026-05-06 — consolidated entry; #17
  is the canonical record for this bug class with the two-step
  refactor + Layer 1 rule plan. Trail kept per project precedent.)

## 13. Net Worth trend "+$90,739 vs last month" — math source unclear
- **Bug:** Plan Mode (or dashboard NW tile, location TBD) shows
  "+$90,739 vs last month" but only one monthly history entry exists
  showing a $569 baseline. The +$90,739 delta math is unclear and
  almost certainly wrong — could be subtracting current NW from a
  zero-or-near-zero baseline, or pulling from a misindexed history
  array, or summing something that shouldn't be summed. Visible on
  John's phone 2026-05-05.
- **Source:** John phone 2026-05-05
- **Repro needed:** no (visible)
- **Fix bundle:** **Layer 2 calibration target** — Layer 2's
  MI-07-net-worth-component-sum should fire because the rendered NW
  delta won't match `MODEL.liquidNet - prevMonth.liquidNet`. Use this
  case to verify the invariant catches the regression.
- **Status:** mitigated (Bundle 28 round 54 investigation 2026-05-13)
- **Bundle 28 round 54 findings:**
  - John's monthlyHistory currently has ONE entry (April 2026,
    `bal: $569.50`, no `liquidNet`, no `nw`, `schemaVersion: legacy`).
  - Render logic at index.html L5462: `typeof latest.liquidNet === 'number'`
    check — legacy entry lacks the field → `prevLiquid = null` →
    falls through to "Building monthly history" hint at L5480.
  - User no longer sees `+$90,739` style nonsense — instead sees the
    correct "Building monthly history — first liquid-net snapshot lands
    at next month rollover" message.
  - Mitigated by two converging changes:
    1. Bundle 24 P1 captured FULL nw breakdown (incl `liquidNet` field)
       so future entries have the right schema.
    2. `isPlausible` sanity cap at L5471 — suppresses any delta where
       `abs(delta) >= $15k` OR `abs(delta) >= 50% of current liquidNet`.
  - Self-resolves on next month-rollover (currently 2026-06-01) when a
    fresh schemaVersion:2 entry lands with proper `liquidNet`.
  - Closing as mitigated — no code change required.

## 14. Notification spam — nine "Net worth up $96,XXX" notifications
- **Bug:** Within minutes John saw nine "Net worth up $96,XXX"
  notifications in different amounts (each different by hundreds to
  thousands of dollars). The notification renderer is consuming a
  broken NW calculation (likely the same source feeding bug #13's
  +$90,739 delta) and re-firing on every render pass without
  deduplication. Notification queue is also bypassing
  `S.dismissedNotifications` because the id varies per amount.
- **Source:** John phone 2026-05-05
- **Repro needed:** no (visible)
- **Fix bundle:** **Layer 2 calibration target** (compound) — Layer 2's
  state-shape and net-worth invariants will catch the upstream NW
  math. Notification dedup is a separate concern but this bug surfaces
  when NW math is fixed; if it persists post-Layer-2, file as #14b in
  a follow-up mission.
- **Status:** fixed (Bundle 7.2 — notification removed entirely; commit 95cdcac. Earlier Bundle 7 dedupe guards removed alongside since they only existed to gate this notification. Hardcoded `28584.70` liability constant in SLYGHT Score's nwScore replaced with computed sum of unpaid non-viaRent debts so the score doesn't drift as real debts change.)
- **Bundle 7 history (superseded):** three-rule dedupe before NW-up notification push: skip if last NW notif within 2h, skip if absolute delta < $50, skip if last txn was a manual correction. Inline guards in `NOTIFY.generate()`. Independent of #13's NW-math fix — this controlled *firing*, not the math. Bundle 7.2 closed the product question (a3 above) by removing the notification entirely — semantics never matched user expectation.
- **Bundle 7.1 follow-up — open question on semantics:** John tested by logging a $100 expense and expected an NW notification to fire; none did. Investigation surfaced that the existing `delta` is **month-over-month NW** (`getNetWorth().net - prevMonthNW`), NOT per-txn. A $100 spend can leave nwDelta < 0 or < $50 (the floor), in which case the dedupe correctly suppresses. **This is not a bug — semantics never matched the user's expectation.** Also flagged: `prevNW` uses a hardcoded liability constant `28584.70` at index.html ~L8490 that will go stale when debts change. **Open product question:** is the "Net worth up" notification still useful? Three options for a future bundle: (a1) document semantics, no code change; (a2) repurpose to per-txn-NW-change; (a3) add a separate per-txn notification class. Replacing `28584.70` with computed liabilities is tangential but recommended.

## 15. Three different daily-cost figures across forecast tiles
- **Bug:** Survival/forecast section presents three different daily
  living-cost numbers ($38.65, $41.56, $16.56), each labeled
  authoritatively. Different filter scopes / different time windows /
  different categorizations. User cannot tell which is "real". Visible
  on John's phone 2026-05-05.
- **Source:** John phone 2026-05-05
- **Repro needed:** no (visible)
- **Fix bundle:** **Layer 2 calibration target** — same MI-08
  cross-tile-coherence as bug #12. The three values must reconcile or
  the invariant fires. Likely fix is repointing all three to a single
  MODEL field (e.g. `MODEL.minDailySpend` for survival floor vs.
  `MODEL.recentPace` for current pace — naming the concepts properly
  resolves the "which is real" confusion).
- **Status:** open (calibration target for Layer 2)

## 16. Emergency fund "saved" sums travel-goal buckets too
- **Bug:** Emergency fund tile shows "saved" amount that includes
  China Holiday + other travel-goal buckets, not just
  emergency-purpose buckets (Rainy Day Fund, etc.). Misleading — the
  user reads "$X saved toward emergency" but the figure includes
  money earmarked for trips. Visible on John's phone 2026-05-05.
- **Source:** John phone 2026-05-05
- **Repro needed:** no (visible)
- **Fix bundle:** unscheduled — small filter fix; pure data
  partitioning bug, not a cross-tile drift. Could fold into Layer 2
  or ship as its own micro-fix in a hygiene commit. Not a Layer 2
  invariant target (it's a single-tile filter scope problem).
- **Status:** open

## 18. Add A Bill view — May entries appear less populated than April — RESOLVED-NO-BUG
- **Bug (reported):** Phone walk on May 5 noted that the Add-A-Bill /
  current-month bill view surfaces fewer entries in May than were
  visible in April.
- **Source:** John phone walk 2026-05-05 🔴
- **Investigation (Mission B follow-up, 2026-05-05):** Empirical probe
  against the fresh fixture's BILLS schema (14 entries) found:
  - Bills tab `#bills-grouped` (the most likely view John meant):
    May = 13 visible, April = 12 visible. **May has MORE, not fewer.**
  - Settings BILLS editor `#settings-bills`: 14 in both months.
  - Plan Mode + Add A Bill modal: not month-conditional.
  - No render-filter bug found in any view.
  Three cognitive sources for the inverted perception:
  (1) NRMA was `recurring: false` (Anomaly A in STATE-AUDIT) hiding
      a yearly bill that *should* have shown in May — fixed in same
      commit by flipping to `recurring: true, freq: 'yearly', dueMonth: 4`.
      Post-fix May count = 14 (vs April 12) — the gap widens.
  (2) May has 3 active calendar debts (Afterpay, Borrowed from Michael,
      NRMA-as-debt) vs April's 0; visual intensity may have been
      conflated with bill-count.
  (3) April's catastrophic events (Property Deposit, debt cleanup)
      created retrospective felt-intensity.
- **Resolution:** No code bug. Closing as perception inversion.
  Schema fix (NRMA recurring) shipped in same commit resolves the
  Anomaly A issue and makes May's count match the yearly-bill
  expectation.
- **Status:** closed (resolved-no-bug)

## 19. Forecast doesn't net upcoming payday salary — FIXED Mission C
- **Bug:** Survival forecast tile / borrow recommendation did not
  fold in upcoming payday salary as a positive cashflow event on its
  scheduled day. Dashboard math implied "you'll run out" by ignoring
  the next paycheque.
- **Source:** John phone walk 2026-05-05 🔴
- **Resolution (Mission C):** the bug was actually a frame mismatch
  not an income-credit gap. `getSurvivalForecast` mixed two payday
  frames: it counted Rent day-15 as outflow (Question B territory)
  but didn't credit Salary day-15 as income (Question A territory).
  Mission C committed to **Question A — end-of-current-cycle**:
  bills/debts due STRICTLY BEFORE paydayDate count as outflows;
  items on payday day are excluded entirely (they're next cycle's
  accounting). Income is correctly omitted under Question A.
  Two-character filter fix in index.html: `>` → `>=` for bills,
  `<=` → `<` for debts. On John's May 5 state: -$3,191 → -$191
  remaining; borrow recommendation $3,200 → $200.
- **Status:** fixed (Mission C — commit 4b382f6)

## 20. Calendar not showing immediate debts on their due dates
- **Bug:** Calendar view does not render markers for immediate-debt
  due dates. Bills/recurring entries appear; ad-hoc debts (Teachers
  Health, Afterpay etc.) do not.
- **Source:** John phone walk 2026-05-05 🔴
- **Coverage:** Not gated by Mission D. The temporal invariants
  validate state-temporal coherence, not calendar rendering output.
  Needs separate Mission B/C investigation of `buildCalendarEntries`
  output vs. what the calendar tile renders.
- **Repro needed:** yes — log `buildCalendarEntries(state, now)` for
  the current month and compare against rendered DOM.
- **Bundle 28 round 54 partial investigation:**
  - `buildCalendarEntries` at index.html L3477 iterates
    `debts.filter(d => !d.paid && !d.viaRent && d.delayDate)` →
    pushes entries with `{ type: 'debt', name, amt, urgent: true,
    color: 'var(--red)' }` keyed by the date ISO string.
  - John's current debts that pass the filter:
    - Borrowed from Michael $500 → delayDate 2026-05-16 ✓
    - Borrowed from Mum for Bowie vet $217.50 → delayDate 2026-05-15 ✓
  - The reported state IS yielding entries from `buildCalendarEntries`.
    The bug — if still real — is downstream in the calendar tile
    RENDERER reading those entries vs. ignoring debt-type entries.
  - **Needs phone-verify with current state**: open Bills tab → tap
    the calendar view → check whether May 15 + May 16 cells show a
    debt marker. The original May-5 report's "Teachers Health,
    Afterpay" no longer exist in S.debts as ad-hoc debts (Afterpay
    moved to BILLS via BNPL flow), so the report may be stale.
- **Status:** open (needs fresh phone-verify — investigation found
  the data pipeline correct; renderer side untested)

## 22. Parallel implementation: 12+ inline `daysLeft(S.payday)` call sites
- **Bug:** `daysLeft(S.payday)` and `MODEL.daysToPayday` are two
  separate code paths that diverge on (a) Feb-with-payday-31 clamping
  and (b) payday-morning `paydayReceived` gating. `daysLeft` clamps
  payday day to days-in-month (`Math.min(rawPd, daysInMonth)`); MODEL
  builds the date directly and lets JS roll over.
- **Sites:** L1482, 1507, 1518, 1525, 1760, 1831, 2166, 2889, 3198,
  3496, 5098, 5666 — all reading `daysLeft(S.payday)` instead of
  `MODEL.daysToPayday`.
- **Source:** Mission D Step 1 investigation 2026-05-05
- **Coverage:** MI-15 `payday-interpretation-canonical` (Mission D,
  commit pending) catches the divergence at runtime — fires whenever
  the two impls produce different values. Migration is OUT OF SCOPE
  for Mission D; the runtime gate makes the bug class visible before
  the migration ships.
- **Repro needed:** no — divergence is provable from the two function
  bodies (L1442-1455 for `daysLeft`, L2270-2275 for MODEL).
- **Fix bundle:** future migration mission. Plan: replace 12+ inline
  `daysLeft(S.payday)` calls with `MODEL.daysToPayday`, then add a
  Layer 1 static rule `no-inline-daysleft-outside-canonical` to
  prevent regression.
- **Status:** open

## 23. MI-13 fires on John's pre-marked auto-debit pattern
- **Bug:** John's real-state phone walk on 2026-05-05 surfaced 6
  future-dated paidBills entries firing MI-13 simultaneously (KIA
  Loan day 15, YouTube Premium day 20, Adobe day 25, Spotify day 26,
  + 2 more not visible in the export truncation). Session counter
  showed 5 firings. The dismiss-once-then-escalate logic triggered
  the non-dismissible card immediately.
- **Pattern:** these aren't accidents — they're scheduled auto-debits
  that John pre-marks because he knows the payment will come out.
  Legitimate workflow that the invariant cannot distinguish from
  "accidentally clicked paid early."
- **Source:** John phone walk 2026-05-05 🟡 (post-Mission-D ship)
- **Decision (Mission B):** keep MI-13 at fail-tier. The non-
  dismissible card IS the appropriate signal — user should know
  about future-dated paidBills. Mission B's gating prevents future
  paid-early actions; existing entries persist until John addresses
  them via UI (undo each via bill-modal, or accept the noise).
- **Repro needed:** no — directly observed.
- **Fix bundle:** future feature mission. Plan: distinguish
  "scheduled auto-debit" (legitimate per-user workflow) from
  "accidental paid-early" (real bug) via a state flag like
  `_scheduledAutoDebit: true` on the paidBills entry. Mission B's
  confirm dialog could optionally set this when user picks Yes for
  a future-dated bill, suppressing MI-13 for that specific entry.
  Out of scope for Mission B — consider when/if John decides the
  noise is too high.
- **Status:** fixed (Bundle 7 commit b28c631 — `_scheduledAutoDebit: true` flag on paidBills entries via the new 3-way Mark-Paid modal. MI-13 invariant filter calls `isPaidBillAutoDebit(key)` and excludes flagged keys. Legacy `paidBills[key] === true` markers stay treated as accidental paid-early until the user marks them via the new flow.)
- **Bundle 7.2.3 strengthening (commit 1f53832):** the auto-mark / auto-detect paths (autoMatchBillsToTxns, autoDetectBillPayments) that previously used OR-matching with ±$1 tolerance were tightening the YouTube/Spotify false-positive loop — small streaming bills matched any txn around \$15-\$17 OR any note containing 'youtube'. New `_txnMatchesBillStrict` requires AND (amt within \$0.50 for ≤\$20 bills + name keyword in note). New `S._billUnmarkLog` (30-day TTL) makes the user's un-mark intent stick — autoDetect skips bills the user explicitly cleared. Future-dated auto-detected bills now get `{ _scheduledAutoDebit: true }` shape automatically so MI-13 ignores them (matching the contract from b28c631). The 3-way modal's auto-debit pathway also re-wired to handle Quick Log's async timing (broken in 7.2.2 transient state, restored 7.2.3).

## 24. Settings header `📤 Export` button calls undefined `exportData()`
- **Bug:** The button at index.html:575 has `onclick="exportData()"`
  but no `exportData` function existed anywhere in the file. Tapping
  the button silently failed with a ReferenceError. Preexisting bug
  surfaced during Mission EXPORT investigation.
- **Source:** Mission EXPORT Step 1 investigation 2026-05-05
- **Fix bundle:** Mission EXPORT (this commit). `exportData` is now
  aliased to `copyExport()` so the button works as users expect.
- **Status:** fixed (Mission EXPORT — commit bb30b86)

## 25. Copy-paste of large export to Messenger (and similar apps) truncates
- **Bug:** John pasted a `copyExport()` clipboard payload into
  Messenger; the message was cut off mid-BILLS-array around "Google
  Microsoft". Messenger has historical per-message char caps
  (~20K chars); typical SLYGHT export is 30–50KB. Other paste
  destinations with similar caps: ChatGPT mobile, Notes apps, Slack
  mobile.
- **Diagnosis:** **NOT an app bug.** The app's `copyExport()` uses
  native `JSON.stringify` + `navigator.clipboard.writeText` with no
  truncation in either build or output stage (verified Mission EXPORT
  Step 1).
- **Mitigation shipped Mission EXPORT:** new `📁 Download Export (file)`
  button uses Blob download and bypasses clipboard / paste-target
  caps entirely. Users with large state should use this path; copy-
  paste remains available for small exports / quick syncs.
- **Status:** mitigated (out-of-app cause; Download path bypasses)

## 29. Feb-31 payday clamping behavior change (Mission F semantic shift)
- **Bug:** Pre-Mission-F, `daysLeft(payday)` clamped `S.payday` to
  days-in-month via `Math.min(rawPd, daysInMonth)` at L1446. For
  `S.payday=31` in February, this produced "days until Feb 28/29."
  Post-Mission-F, every renderer/helper consumes `MODEL.daysToPayday`
  which builds `new Date(Y, M, paydayDay)` directly — JS Date rolls
  31 over to March 3 in February. Different result for the same input.
- **Source:** Mission F migration consolidation 2026-05-05 (commit
  pending)
- **Diagnosis:** John's `S.payday` is **15**, not 31. No current state
  exposes this divergence. Mission F consolidates to MODEL's no-clamp
  behavior — that's the canonical choice (Date arithmetic is more
  conventional than month-day clamping for payday math).
- **Coverage:** MI-15 `payday-interpretation-canonical` is now a
  structural sanity check rather than an active divergence detector.
  Both paths produce identical values for S.payday in the 1-28 range.
  For S.payday=29-31, the structural check would fire only in
  February — and only if some renderer regression introduces a path
  that uses `daysLeft(...)` again outside the canonical sites.
- **Repro needed:** synthetic Feb-31 fixture
  (`state-snapshot-feb-31.json`) — verify forecast/dashboard math is
  sane in February with S.payday=31. Add as Mission V follow-up
  fixture; defer until/unless real-state risk surfaces.
- **Fix bundle:** out of scope for Mission F — the consolidation
  itself IS the fix. Documenting here for future-Opus and
  future-John in case payday changes or another user with S.payday=31
  uses SLYGHT.
- **Status:** documented (semantic shift, not a bug)

## 30. Gate verification reliability concern (Mission F finding)
- **Bug:** Mission EXPORT (commit bb30b86) reported "all gates green"
  but `npm run guardian-static` was actually exiting **1** because
  the `copy-export-strips-secrets` rule wasn't updated for the
  `buildFullExport` refactor. The rule scanned `function copyExport`'s
  body for `delete _.apiKey` / `delete _.chatHistory`, but those
  deletes had moved into the new `buildFullExport`. Surfaced during
  Mission F (commit b3d1105) gate run; rule fix shipped in F's same
  commit.
- **Source:** Mission F gate run 2026-05-05
- **Diagnosis:** the rule fix itself is documented in Mission F's
  commit body. **The deeper concern this entry tracks is gate-report
  trustworthiness:** post-mission verification reported false-clean,
  mechanism unknown. Working hypothesis: pipe-to-`tail` masked npm's
  actual exit code (the shell-builtin pipeline returns the LAST
  command's exit by default; `tail` always succeeds). Hypothesis
  unverified.
- **Why this matters:** the whole point of Layer 1 + Layer 2 + Layer V
  is that "gate green" means "gate green." If gate reports can be
  false-clean, that confidence erodes. Mission F's gate run did catch
  the false-clean from Mission EXPORT — the system self-corrects
  through later commits running fresh gates — but the catch is
  retrospective, not preventive.
- **Repro needed:** yes — reproduce the false-clean conditions and
  identify the exact mechanism. Then add an explicit per-gate exit
  code capture + output validation step in mission verification so
  false-clean reports become impossible.
- **Fix bundle:** dedicated future mission. Lower priority than
  current bug-fix queue (Missions C / B-followup / E). Until shipped,
  fresh gates on subsequent missions are de-facto regression checks
  for any prior mission that touched code paths a Layer 1 rule
  targeted by name.
- **Status:** open (deferred — foundation hardening, not user-visible)

## 31. paydayDate parallel implementation pattern (second instance)
- **Bug:** Mission F caught the `daysLeft(...)` parallel-impl pattern
  (33 inline call sites diverging from MODEL.daysToPayday). Mission C
  caught the same class of bug at a different surface:
  `getSurvivalForecast` recomputed `paydayDate` locally (index.html
  L3038-3040 pre-fix) with logic that omitted the
  `paydayReceived && now.getDate() <= paydayDay` branch that
  MODEL.paydayDate's L2271-2274 has. Result: a user marking pay
  received early would see the forecast pinned to the past payday
  day rather than advancing to next month.
- **Source:** Mission C Step 1 investigation 2026-05-05
- **Fix in Mission C:** aligned `getSurvivalForecast` to read
  `MODEL.paydayDate` directly. Same-night cleanup of identical
  pattern Mission F just consolidated (efficient — pattern is fresh
  in muscle memory).
- **Future work:** audit other call sites for local paydayDate
  recomputation. Add Layer 1 rule
  `no-inline-payday-date-recomputation` analogous to
  `no-inline-daysleft-outside-canonical`. Lower priority than current
  bug-fix queue. Likely a 2-3 site cleanup vs Mission F's 33.
- **Lesson for future missions:** whenever a mission consolidates
  a parallel-implementation pattern, the next 2-3 missions should
  actively look for the same pattern elsewhere — fix is fresh in
  muscle memory.
- **Status:** open (deferred — foundation hardening)

## 32. Migration auto-delete pattern lacks user-visible surfacing
- **Bug:** Schema-cleanup migrations (`_billsCleanedV1` at L1271-1272,
  `seedV16` at L7000-7008) silently remove BILLS entries via
  hardcoded "ghost" name lists, with no user-visible notification.
  John's 5 missing bills (Pet Food, Food at Work, Parking — CBD
  Secure, Afterpay instalment, Fuel) were largely the result of
  these cleanups: 4 of 5 fall in `seedV16`'s GHOST_NAMES set; the
  Afterpay instalment is double-targeted by `_billsCleanedV1`'s
  _DEFUNCT_BILLS list. Only Fuel's removal is plausibly user-driven
  (via the confirmed `deleteBill()` modal at L4514).
- **Why this matters:** these migrations run once per device, gated
  by flags + (in seedV16's case) a `txns.length ≤ 10` check.
  Intentional one-time cleanup, NOT a regression. But there's a UX
  gap: a user who actually wanted to keep one of those bills has
  no recovery path other than re-adding via Add A Bill modal — and
  may not know the bill was removed in the first place.
- **Source:** Mission B follow-up investigation 2026-05-05
- **Pattern for future migrations:** surface a toast like "Cleaned
  up N outdated bills" with an undo link (mirrors the
  `showUndoToast` pattern already used by `deleteBill`). Or, more
  conservative: log to AUDITOR.log with a `MIGRATION` action so the
  user can audit migrations via Settings → Math Health.
- **Repro needed:** no — pattern is observable in code.
- **Fix bundle:** future-only. Past migrations are sticky once flag
  is set; can't retroactively notify. Lower priority.
- **Status:** open (deferred — pattern hardening for future
  migrations)

## 33. Mission V fullPage screenshot truncation — Layer V coverage gap
- **Bug:** Playwright `fullPage: true` screenshots are capping at the
  412×915 viewport instead of capturing full document scrollHeight.
  Body's `scrollHeight` reports 915 even when content extends much
  further (Settings: Math Health panel at y=2980 invisible to capture;
  Bills tab: NRMA-as-yearly schema fix produced live DOM change at
  `MODEL.billsThisMonth.length: 13 → 14` but visual baseline showed
  zero diff because the new entry sits below the cutoff).
- **First surfaced:** STATE-AUDIT-2026-05-05.md Anomaly B (Settings tab)
- **Confirmed second instance:** Mission B follow-up commit 65ecbba
  (Bills tab — NRMA addition invisible to capture)
- **Why this matters:** the gap is now demonstrably masking
  intentional changes (false negatives). If intentional changes are
  invisible, unintentional regressions in the same areas are also
  invisible. Layer V's coverage is significantly narrower than the
  baseline file count implies.
- **Hypothesis:** some CSS height constraint on `<body>` or `.screen`
  is bounding the layout flow; Playwright's `fullPage` honors document
  scrollHeight which the constraint pins at viewport size. Possible
  fix: identify the constraint and remove for test runs only, OR
  switch capture method to programmatic scroll-and-stitch.
- **Repro needed:** no — directly observable.
- **Fix bundle:** Mission V follow-up. **Priority upgraded** vs
  initial "investigate" framing per Mission B follow-up finding —
  silent under-coverage is worse than originally scoped.
- **Status:** open (priority high — Mission V follow-up)

## 34. Mission E2: dashboard mode-classifier + threshold + filter audit
- **Bug:** Mission E (commit pending) resolved the visible card
  contradictions on the dashboard via Hierarchy A (Survival-first)
  with suppression and relabeling. Deeper questions remain that
  Mission E intentionally scoped out — they're research/audit work,
  not mechanical fix.
- **Source:** Mission E Step 1 investigation 2026-05-05; refined
  via review-deeper instinct from John's response to Step 1.
- **Open questions for Mission E2:**
  (a) **Mode-classifier calibration.** `getSurvivalMode()` at L1508
      uses thresholds `bal < 100` (critical), `bal < 300` (survival),
      `dailyAvailable < 15` (tight), `dailyAvailable < 25` (cautious).
      Are these calibrated to John's real spending patterns? What
      mode IS John actually in given $381 + 10 days + bills? Audit
      against historical state (monthlyHistory + txn cycles) to
      verify thresholds match reality.
  (b) **`shouldShowAlert` gating.** The `!(S.paydayReceived &&
      getGenuineSurplus() >= 0)` check appears in renderAlerts.
      When does it fire? Can it disagree with `MODEL.survivalMode`?
      Mission E uses mode === 'normal' as the suppression key, but
      shouldShowAlert is a separate signal — investigate any modes
      where they conflict.
  (c) **Card 3 vs Card 6 magnitude inconsistency.** Card 3 used
      `safe = liveBal − dueTotal − immDebtsForSafe + bonusTotal −
      bucketSafe` ($124 on May 5). Card 6's math implies daily ×
      days (~$198.60). Different filter granularities producing
      different "remaining buffer" numbers. Mission E suppressed
      Card 3 in non-normal modes so user no longer sees the
      inconsistency, but it persists in code. Future Layer 1 rule
      candidate: filter-divergence-detection between
      bills-filter and forecast-filter.
  (d) **Magic threshold constants.** 15, 25, 200 are hardcoded.
      Pin to constants? Tie to derived state (income, recent spend
      patterns)? Layer 1 has `no-hardcoded-survival-mode-string`
      for labels but not for thresholds.
- **Repro needed:** no — pattern is observable in code.
- **Fix bundle:** future Mission E2. Lower priority than current
  open queue (#2 runOutDays, #30 gate verification, #31 paydayDate
  rule, #32 migration UX, #33 Layer V truncation).
- **Status:** open (deferred — research/audit work, not mechanical
  fix; Mission E shipped the surface-level UX win)

## 35. Mission V2: Layer 2 render-coherence invariants
- **Bug:** Layer V (visual regression) catches pixel changes but
  not semantic correctness. Mission E exposed this — three cards
  saying contradictory things ("Cautious Mode" + "Very tight" +
  "Spending alert won't cover bills" + "you can spend $19.86")
  shipped to John's phone for hours before he caught it on a phone
  walk. Layer V's pixel diff would never have flagged it because
  the pixels were stable; the SEMANTICS were broken.
- **Source:** Mission E investigation 2026-05-05
- **Solution sketch:** add Layer 2 invariants that check rendered
  DOM coherence, not just state. Examples:
  - `mode-classifier-coherent`: `MODEL.survivalMode` + Card 4
    visibility + Card 6 ctxText must agree (Mission E encodes
    suppression in renderers; this invariant verifies it didn't
    silently regress).
  - `magnitude-coherent`: buffer math across cards reconciles
    (Card 3's `safe` vs Card 6's `dailyMax × days`).
  - `label-matches-math`: card labels match what they describe
    (Card 6's "MAX PER DAY" matches `min(sustainable, cap)`).
- **Build approach:** incrementally, one invariant per identified
  bug class. Each ~10-30 lines, low risk, high value. First
  candidate post-Mission-E: encode the Card 4 vs Card 6
  contradiction Mission E just resolved so it can never regress.
- **Repro needed:** no — pattern observable.
- **Fix bundle:** future Mission V2 (render-coherence layer).
  Lower priority than active bug-fix queue.
- **Status:** open (deferred — foundation work)

## 36. Mission V3: AI-vision review of baselines
- **Bug (proactive):** Layer V baselines capture pixels; Mission E2
  + #35 audit semantic correctness via encoded rules. Neither
  catches the broadest class of UI bugs that a human eye notices
  immediately — visual hierarchy issues, redundant copy, layout
  weirdness, color-meaning mismatches, accessibility hints. These
  require holistic visual judgement.
- **Source:** Mission E investigation 2026-05-05
- **Solution sketch:** pipeline that sends each baseline image
  to Claude Vision API with a structured review prompt
  ("review this dashboard screenshot for: contradictions between
  cards, mislabeled numbers, layout issues, copy problems, anything
  a human reviewing the UI would flag"). Output: structured report
  of findings.
- **Cost model:** ~$0.10–$0.30 per screenshot per review. Too
  expensive for a per-commit gate. Run periodically as audit:
  weekly, pre-release, or on-demand. Right complement to Layer 2's
  encoded rules — catches the broadest class.
- **Repro needed:** no — net-new capability.
- **Fix bundle:** future Mission V3 (AI-vision review). Lower
  priority than #35 and active bug-fix queue.
- **Status:** open (deferred — net-new capability)

## 37. Layer I: AI agent as test user (interaction layer)
- **Bug (proactive — missing layer):** The validation stack today
  catches code drift (Layer 1), state drift (Layer 2), pixel drift
  (Layer V), and queued semantic drift (#35 V2 invariants + #36 V3
  vision review of *static* screenshots). The missing layer is
  **interaction drift** — what happens when a user actually USES
  the app. Most of the bug walks tonight (#11 Add Savings buttons,
  Mission EXPORT's broken `📤` button, any "modal opens empty /
  button does nothing / interaction breaks state" class) are
  invisible to all current and queued layers because they only
  manifest mid-interaction.
- **Source:** Mission E retrospective + entire night's bug-walk
  pattern 2026-05-05. John has been Layer I himself — walking the
  phone after every commit. The question is whether automation
  can take some of that load.
- **Distinction from #36 (V3 AI vision review):** #36 sends static
  baseline PNGs to Claude Vision for passive critique. Layer I has
  the AI agent ACT — driving Playwright to click, fill, tap,
  navigate, observing what happens, deciding next action. V3 is
  reviewer; Layer I is user.
- **Three increasingly capable versions:**
  (a) **Scripted interaction** (Playwright only). Mission V's
      original Option B — pre-recorded action sequences. Catches
      pre-anticipated flows; brittle to UI changes.
  (b) **AI-driven exploration** (Claude Vision + Playwright,
      open-ended). Agent receives a goal ("test this finance
      app — try common flows, report anything confusing"), decides
      what to click. Catches UX/copy/flow issues a human eye
      would notice.
  (c) **Structured scenarios** (Vision + Playwright + assertions).
      Each scenario specifies pre-state, action sequence, expected
      outcomes. Agent executes, observes, compares, reports.
      Catches both UX and behavior correctness.
- **Recommended scope:** (c) structured scenarios as PERIODIC
  audit — weekly or pre-release, not per-commit. Cost ~$10-15/week
  at Claude API pricing for 5-10 scenarios. Each scenario is
  20-50 actions × Vision call per action.
- **What it would have caught (retrospective):**
  - #11 Add Savings buttons non-functional (Plan Mode)
  - Mission EXPORT's broken `📤` button (Layer I would have caught
    earlier than the Step 1 code investigation did — agent taps
    Export, nothing happens, surface)
  - Any future modal-opens-empty / dead-button / state-breaks-
    after-action class
- **Why this is the highest-leverage queued gate:** SLYGHT's
  actual bug profile (per night's missions) is heavily
  interaction-shaped. Layer 3 is theoretical defense for a
  hypothetical bug class; Layer I is concrete defense for the
  bug class John has actually been hitting most.
- **Scope sketch (Mission I, future):** `test-scenarios/` directory
  with structured specs; `scripts/test-runner.js` Playwright +
  Claude API integration; `npm run test:interaction` runs all,
  `npm run test:interaction --scenario=X` runs one;
  `test-reports/interaction-YYYY-MM-DD.md` output format with
  per-step success/fail + screenshot evidence + suggested
  investigation paths.
- **Cost model:** medium-large build (~3-5 hours of mission work),
  $5-15/week runtime, modest scenario maintenance.
- **Recommended priority order for post-tonight queue:**
  1. **Mission I (#37)** — highest leverage for current bug profile
  2. Mission V2 (#35) — encoded render-coherence invariants
  3. Mission V3 (#36) — periodic vision audit
  4. Mission E2 (#34) — dashboard deeper audit
  5. #30 gate verification hardening
  6. #2 runOutDays off-by-one
  7. Other queued items
- **Status:** closed — Layer I AI agent as test user — **shipped
  Mission I 1c20186**; validated by 2026-05-06 sweep producing 5
  confirmed findings (3 hard_fail + 2 soft_finding); 3 of those
  shipped fixes by end of same session (Missions #39 commit 3602b8d,
  #42 commit f1b8d29, #43 commit 419ca04). Operational. See salvage
  report MISSION-I-2026-05-06-SALVAGE.md (commit 666db5d) for first
  comprehensive run output.

## 38. Export-box JSON preview removed from Settings (Option A cleanup)
- **Bug (UX):** The `#export-box` div in the Settings card showed a
  full-width JSON preview of state on every renderAll. After Mission
  EXPORT removed the `max-height: 100px` clip (commit bb30b86), the
  preview rendered at full document height — ~6 phone-scrolls worth
  of monospace JSON wedged into the Export/Import card. John's phone
  walk noted he hasn't actually used the inline preview in months;
  the `📁 Download Export (file)` and `Copy Export Code` paths
  superseded it.
- **Source:** John phone walk 2026-05-05 evening
- **Resolution:** Option A — hide entirely. Removed:
  - `<div class="export-box" id="export-box">` element (L701)
  - `.export-box{...}` CSS rule (L205)
  - `function updateExport()` (was L5929-5932)
  - `updateExport()` call from renderAll (was L3798)
  Pure deletion, no behavior change to export functionality. The
  Copy Export Code button still works (clipboard path); the
  📁 Download Export (file) button still works (Blob download
  path). Settings card now reads cleaner — warning + buttons +
  Import textarea, no JSON wall.
- **Visual capture:** settings.png didn't diff because the
  export-box lived below the 412×915 viewport cutoff (Layer V
  fullPage truncation, OPEN-BUGS #33). DOM change is real; visual
  baseline limitation is orthogonal.
- **Status:** fixed (Option A cleanup — commit f59612d)

## 39. MI-13 banner "details" button does nothing
- **Bug:** When the MI-13 paidbills-key-not-future invariant fires
  (currently fires on John's real state with 6 future-dated paidBills),
  a red banner appears at the top of pg-dash with a `× Dismiss` button
  and a `details` link. Tapping the `details` link does nothing
  visible — no modal opens, no detail view is rendered, no navigation
  occurs. The button's onclick handler at index.html L403 calls
  `MathInvariants.showDetails(...)` which exists at L2945 and does
  `alert(...)` with the violation details — but the alert flow may not
  be working in the deployed context, OR Nora's Playwright environment
  somehow suppressed the alert dialog without surfacing the issue.
- **Source:** **Mission I iteration 1 — Nora persona × free-explore
  scenario, turn 5.** Before the API rate-limit cut the run short,
  Nora tapped the `details` button on the MI-13 banner, took
  before/after screenshots (shot-001 → shot-002 in
  test-reports/2026-05-05-2359/nora_free-explore/), observed no
  visible change, and reported `hard_fail` per her adversarial niche
  ("the obvious path is broken"). **First bug found by Layer I.**
- **Repro needed:** yes — open the deployed app on phone, observe
  MI-13 banner is present, tap `details`. Should an alert appear?
  Should a modal? Determine intent before fix.
- **Fix bundle:** small follow-up. Likely either (a) `showDetails`'s
  `alert(...)` is broken in current deployment context — replace with
  modal-based detail view, OR (b) add explicit modal UI for invariant
  details (more user-friendly than alert anyway).
- **Resolution:** Step 1 surfaced this was three coordinated bugs, not
  one. (1) `_lastViolations` was never written — the handler always
  read `undefined` and returned silently. (2) The invariant's `details`
  field only carried the first 3 keys joined as a comma string; no
  per-bill structure to drive an undo UX. (3) The surface was a system
  `alert()` blob — can't host actionable controls. Fix wires all three:
  invariant now exposes `keys: future` (full list); `MathInvariants.check()`
  now persists `this._lastViolations`; `showDetails` routes MI-13 to a
  new modal (`mi13-details-modal`) that renders per-bill rows with an
  Undo button each. Undo uses `undoPaidBillByKey(key)` (immediate, with
  toast — matching the existing `undoBillPaid` precedent).
- **Status:** fixed (Mission MI-13 — commit 3602b8d)

## 40. Bill modal "Already paid" button does nothing
- **Bug:** From the Bills tab, tap a bill in the calendar to open
  its modal — tap the "Already paid" button — no state mutation,
  modal stays open, calendar still shows the bill as unpaid. Same
  shape as #39 (button rendered, handler missing or wired wrong).
- **Source:** **Layer I run 2026-05-06-1132 (cycle 2 — post-#39 fix
  re-run).** Nora persona × free-explore scenario. Reproduction:
  Bills tab → tap May 15 → tap $3000 (Rent + Deposit Savings) →
  tap "Already paid". Evidence: shot-006 vs shot-007 are
  pixel-identical post-click. `read_state("paidBills")` confirms no
  mutation. **Second bug found by Layer I — surfaced after the
  regression-loop closure on #39 freed Nora to explore further.**
- **Repro needed:** no — Layer I evidence is clean
- **Fix bundle:** small follow-up. Likely shares root cause shape
  with #41 ("Pay now" — same modal, same surface) — investigate
  together; one wiring fix may close both.
- **Status:** fixed (Bundle 7 — root cause: native `confirm()` inside `withMarkPaidGate` was unreliable on mobile when invoked from inside an already-open modal. Replaced with custom 3-way `mark-paid-modal` (Paid manually / Auto-debits monthly / Cancel). Same fix closes #41.)
- **Bundle 7.2.2 follow-up (commit 6c133f2):** "Already paid" no longer just flips `S.paidBills[key] = true` silently — it routes through the Quick Log modal so the user logs an actual transaction. `_markBillPaidViaQuickLog` opens Quick Log prefilled with amt + name + 'Bills' category; on save, `_consumePendingBillPay` flips the paidBills flag atomically with the txn push. Prevents the previous drift where paidBills said "paid" but S.txns had no corresponding spend. Bundle 7.2.4 added `_txnTs` back-reference on the paidBills entry so undo reverses both the flag AND the txn (restore balance, splice from S.txns).

## 41. Bill modal "Pay now" button does nothing
- **Bug:** Same modal as #40 — tap a bill in the calendar → modal
  opens → tap "Pay now" → no payment flow initiated, modal stays
  open, no visible state change. Likely shares root cause with #40
  (handlers missing or both pointing at a broken delegate on the
  modal's action row).
- **Source:** **Layer I run 2026-05-06-1132 (cycle 2 — post-#39 fix
  re-run).** Same Nora session as #40. Reproduction: Bills tab →
  tap May 15 → tap $3000 → tap "Pay now". Evidence: shot-008.
- **Repro needed:** no — Layer I evidence is clean
- **Fix bundle:** small follow-up — bundle with #40 (same modal,
  same surface, likely same root cause).
- **Status:** merged-into-#40 (2026-05-06 — same bill modal action row
  per OPEN-BUGS' own framing; #40's wiring fix covers this. Trail kept
  per project precedent.)

## 43. Transaction delete — rapid-tap deletes wrong second txn + double-bumps balance
- **Bug:** Hit Delete in the Edit Transaction modal — first tap: balance
  bumped by +$amt but the row appeared not to delete. Second tap on the
  (still-visible) Delete button: balance bumped by +$amt AGAIN AND a
  row deleted. Net: $2×amt drift in S.bal, two different txns deleted
  (the original + whichever row shifted into the same index position
  after the first splice).
- **Source:** John phone 2026-05-13: "my balance increased to $800 and
  it didnt dfelte and then hitting delete aain got rid of it but then
  added in another $100 so balance is saying $900 right now".
- **Root cause:** Pre-round-12 the txn-edit-modal stored an array INDEX
  in its hidden `txn-edit-idx` field. After the first delete's splice
  shifted S.txns, `S.txns[idx]` pointed to a DIFFERENT row. Rapid-tap
  or queued-touch second click read that fresh-but-wrong row's `.ts`
  and removed it. The race was visible because closeModal + onStateChange
  + renderAll take a few ms on mobile — the user can tap again while
  the modal is still rendered on screen.
- **Fix bundle:** Bundle 28 round 12 — two-layer defence:
  (1) bind the modal to stable `txn-edit-ts` (timestamp), not idx; after
      splice the same ts produces find-not-found instead of finding a
      different row;
  (2) clear the hidden ts field at the top of deleteEditedTransaction
      BEFORE confirm — a re-entry sees empty value and bails. Restored
      if user cancels the confirm so an intentional later click still
      works.
  removeByTsWithBalance also now silently no-ops on `reason=not-found`
  instead of alerting, so even if both defences are bypassed the user
  doesn't see an error popup.
- **Drift recovery:** John's S.bal carried $200 over-credit (2× $100
  on the failed double-delete). Path: dashboard hero balance edit →
  enter the real bank-app balance → runRecon fires →
  applyBalanceCorrection routes through BRAIN.transaction.recordCorrection
  → adjustment txn lands in S.txns with `_isCorrection:true` and
  `RECONCILE_CORRECTION` source. Audit log captures the recovery so
  the trail is auditable.
- **Status:** fixed (Bundle 28 round 12)
- **2026-05-19 phone-verify:** PASS — Bundle 28 round 12 fix still holds under refreshed reconciled state ($1,113.61 hero, 212 txns). Confirmed sequence: delete Txn A succeeds; rapid-tap on Txn B (within ~300ms) does NOT cascade-delete — explicit re-engagement with Txn B's delete affordance is required to trigger its deletion. Safe behavior. No data-integrity risk. The two-layer defence (ts-not-idx binding + clear-ts-on-entry guard) holds.
- **Bug:** Pre-Bundle-28 `saveEditedTransaction` math (centralised in
  `BRAIN.transaction.update` round 10) adjusted `S.bal` by `+diff` when
  an EXPENSE amount edit grew (diff = newAmt - oldAmt). Walking it:
  user logs $50 expense → bal drops $200 → $150. Edits to $80. Expected
  net: bal = $200 - $80 = $120 (i.e. bal += oldAmt - newAmt = -diff).
  Buggy code did bal += diff → $150 + $30 = $180. Income branch had
  the opposite-direction same bug.
- **Source:** Round-10 migration analysis (Bundle 28). Phone-verified
  by John 2026-05-13: "confirmed bug where editing to $80 brings it
  back up instead of further down".
- **Fix bundle:** Bundle 28 round 11 — one-line sign flip in
  `BRAIN.transaction.update` from `(income ? -diff : diff)` to
  `(income ? diff : -diff)`. Centralisation from round 10 made this
  a single-site fix; all callers (saveEditedTransaction is the only
  one currently) inherit the corrected math.
- **Drift recovery (unified across #42 and #43):** John's live S.bal
  carries drift from prior edits under the buggy math (#42) AND from
  the double-delete bug (#43, +$200 confirmed 2026-05-13). Recovery
  path for BOTH is the existing dashboard hero balance edit:
  1. Open the app, tap the hero balance ($X) on the Dashboard.
  2. Enter the real balance from your bank app.
  3. Confirm — `runRecon` fires, the diff is recorded via
     `BRAIN.transaction.recordCorrection` (creates a flagged
     `_isCorrection:true` adjustment txn with `RECONCILE_CORRECTION`
     source).
  4. S.bal now matches truth; the adjustment txn shows in Recent
     Spending with a 🔧 badge; audit log captures the recovery.
  No code change needed for recovery — the path was built for exactly
  this class of drift.
- **Status:** fixed (Bundle 28 round 11)

## 10. Test-source drift — canonical helpers copy-pasted in tests
- **Bug:** `tests/core.test.js` lines 117–530 copy-paste the bodies
  of canonical helpers (`daysLeft`, `isThisMonthlyBillPaid`,
  `getBillsDue`, `calculateNetWorth`, `computeFinancialModel`,
  `buildCalendarEntries`, etc.) verbatim from `index.html`. When a
  helper is refactored in production, the test copy can silently
  drift. Concrete example created during Bundle B: I refactored
  `isThisMonthlyBillPaid` to call `paidBillKey` internally; the
  test file's inline copy (lines 173–194) does not call
  `paidBillKey`. Tests still pass because external behavior is
  identical, but if a future change updates ONLY the canonical key
  format inside `paidBillKey`, the test would silently keep using
  the old format and never catch the production drift. Layer 1's
  static analyzer doesn't read tests, so this gap is not closed
  by Guardian.
- **Source:** Bundle B refactor + PROJECT-EXTRACT-2026-05-05.md
  § 8.1 + Guardian design discussion 2026-05-05
- **Repro needed:** no (code review against tests/core.test.js)
- **Fix bundle:** unscheduled — long-term fix is extracting
  canonical helpers to a `lib/` ES module that both `index.html`
  and `tests/core.test.js` import. Multi-session refactor (touches
  the build system: index.html stops being self-contained, needs
  bundler or `<script src>` loading). **Defer.** Revisit after
  Guardian is in place when team has bandwidth.
- **Status:** open (deferred)

## 44. Multi-delete workflow friction — must re-engage delete affordance per txn
- **Bug:** After deleting one txn, deleting a second txn requires a fresh long-press/tap on its delete affordance rather than continuing in a 'delete mode'. The behavior is SAFE (no cascade-delete risk per #43's two-layer defence) but creates friction when the user wants to clean up multiple test/erroneous txns at once (e.g., post-reconciliation cleanup, removing test artifacts).
- **Source:** John phone-verify 2026-05-19 — surfaced while confirming #43's Bundle 28 fix still holds. The PASS verdict on #43 IS the same behavior that creates this friction.
- **Repro needed:** no — current behavior is by design (safety vs friction tradeoff).
- **Fix bundle:** Bundle 32 candidate — UX redesign. Options:
  1. Bulk-select mode (long-press first txn enters select-multiple mode; checkboxes appear on remaining txns; single Delete-Selected action confirms all in one prompt)
  2. Delete-and-stay mode (after first delete, modal closes but a fresh Delete affordance becomes visible on the next row without re-tap to engage edit modal)
  3. Status-quo + accept friction (defer; only painful for power-cleanup workflows)
- **Severity:** P2 UX (not data-integrity — #43's safety property is the right tradeoff)
- **Status:** open (Bundle 32 candidate)

---

## Bugs surfaced 2026-05-23 session (end of Bundle 23 scoping + apiKey leak)

### 50. URGENT — Bundle 32a push silently drops blobs >64KB on pagehide
- **Bug:** `PUSH.pushFullState` uses `keepalive: true` for the pagehide flush; browser policy caps keepalive bodies at 64KB; John's blob is ~139KB post-redaction (~292KB pre-redaction). Pagehide pushes silently fail. iOS Safari issue assumed initially — **CORRECTED 2026-05-23: confirmed on Android Chrome PWA on Samsung S23 Ultra.** When Chrome backgrounds the PWA before the 30s debounce timer fires, the only push attempt is the keepalive-pagehide one, which drops on body-size. Net: hours of localStorage activity sit unpushed until the user happens to keep the app foregrounded long enough for the regular 30s debounce path (no keepalive limit) to fire.
- **Source:** John reported KV stale state during apiKey-leak-fix verification; confirmed live by wrangler meta check showing `lastPushedAt` frozen at 2026-05-23T07:17:57Z while phone localStorage advanced by 9+ txns and ~$66 of activity to bal $714.67. Foundational bug — every architectural bundle that depends on push (Bundle 23 sync, Phase B, Bundle 33+) assumed push works.
- **Repro:** open slyght PWA on phone; log 1+ txns; background or close the app before 30s elapse; `npx wrangler kv key get device:{hash}:state-full-meta --remote` shows old `lastPushedAt`. Or: pull `/pull-full-state`, observe bal/txns lagging phone localStorage.
- **Fix bundle:** URGENT — own bundle BEFORE Bundle 33-cache / Bundle 23 sync. Design options (per session memory): (a) drop keepalive on pagehide, accept fire-and-forget risk; (b) gzip the body (may still exceed 64KB but extends headroom); (c) shorter 5s debounce so more pushes complete pre-backgrounding; (d) diff/delta push (more invasive); (e) service-worker retry queue (requires Bundle 33-cache substrate). Best-current-read: combo of (a) + (c) + (b) belt-and-suspenders. ~2-3hr scope.
- **Status:** investigating · CONFIRMED LIVE in production; foundational fix for the next bundle queue

### 51. PWA cache disease — SW serves stale code, blocking fix delivery
- **Bug:** Service worker (`sw.js`) doesn't precache anything and has no `CACHE_VERSION` discipline; updates to `index.html` deployed to GitHub Pages may not propagate to John's installed PWA until the SW happens to refresh (Chrome update-on-navigation behavior is browser-dependent; can lag by hours/days). Required workaround tonight: John deleted the PWA + reinstalled to force a fresh SW + fresh `index.html`. Drone H (Bundle 23 scoping) enumerated zero `cache.put` calls in entire codebase.
- **Source:** John 2026-05-23 — "+Add Debt button" mirage was stale-cached code rendering pre-Sub-bundle-1 markup. Verified by Drone B: button doesn't appear twice in HEAD source. Subsequent apiKey-leak-fix verification showed phone still on pre-hotfix code until manual PWA delete + reinstall.
- **Repro:** ship a code change to GitHub Pages; observe John's PWA continues serving the old version until manual SW refresh.
- **Fix bundle:** **Bundle 33-cache** — Drone H spec: `sw.js` install handler precaches `index.html` + `manifest.json` + `sw.js` + icons; `CACHE_VERSION` const bumped on every deploy; `activate` event prunes prior versions; client subscribes to `controllerchange` and shows "app updated — refresh" toast. Closes the workaround need for manual reinstall.
- **Status:** open · workaround = PWA delete + reinstall (Android: long-press app icon → uninstall; reopen `xetonx.github.io/slyght` in Chrome → install). Fix scoped, awaiting bundle execution after push-reliability fix.

### 52. Stan-7 ledger-orphan paidBills flag
- **Bug:** `S.paidBills['2026-5-Stan-7']` is bare `true` (no `_txnTs` anchor, no matching debit txn in `S.txns`). Stan subscription was cancelled; the flag is a leftover. Per the txn-anchored rule (CDB-34, ADR-H Standing Rule 2), this is a SUSPECT flag.
- **Source:** Ledger walk maiden run 2026-05-23, `scripts/recon/ledger-walk-paidbills.js`. Stan-7 is the ONLY paidBills entry in current state that's bare-true without ledger backing.
- **Repro:** `node scripts/recon/ledger-walk-paidbills.js` → 1 ORPHAN reported (Stan-7).
- **Fix bundle:** **P0-5 shipped (commit `c6b1d3c`) makes `BRAIN.bills.isPaidInCycle` treat this flag as unpaid via txn-anchored guard.** No further code fix needed; the flag can be left in state OR manually deleted via Settings/console if John wants tidy state. Magnitude impact: ~$13 (Stan amount).
- **Status:** addressed by P0-5 reader-side fix · cleanup of the stale flag is optional Settings action

### 53. YouTube Premium-18 paidBills entry matches two debit txns (test artifact)
- **Bug:** paidBills key `2026-5-YouTube Premium-18` has matching txns at both 2026-05-11T11:43 and 2026-05-18T13:26, both $16.99 "YouTube Premium — paid" [Streaming]. The ledger walk flagged this as AMBIGUOUS.
- **Source:** John 2026-05-23: "I think that was during testing or verification so double logged once removed?" — known test artifact, not a real bug. Either a double-log during slyght dev that wasn't fully cleaned up, or a true bank double-charge that John resolved separately.
- **Repro:** `node scripts/recon/ledger-walk-paidbills.js` → 1 AMBIGUOUS reported.
- **Fix bundle:** wontfix (test artifact, not money-truth bug)
- **Status:** documented · not a real failure

### 54. Bundle 32a / Sub-bundle 1 half-landed substrate (CDB-26)
- **Bug:** Sub-bundle 1 cashflow-truth substrate (BRAIN.bills.isPaidInCycle, snap.derived.safeToSpendHeadroom, cashflowReceipt, 7-day burn) landed on hero/receipt/TO RECOVER/burn card, but DID NOT propagate to:
  - `renderAlerts` (still uses legacy `safe` formula — Drone L Finding 4)
  - `getThisWeekProjection` pace surface (uses legacy `isThisMonthlyBillPaid` instead of `BRAIN.bills.isPaidInCycle`) — **PARTIALLY FIXED CDB-28 commit `a3165bf`**
  - `getBurn7d` NON_DISC filter (misses Insurance/Streaming/Fixed/BNPL/Health categories — Drone L Finding 2)
  - "Daily living" tile (uses `S.activePlan.dailyLivingFloor` vs `S.weekdayBudget`/`S.weekendBudget` — two separate stores never synced — redirect-L #9)
  - 5 explanation-modal copy strings (redirect-L #1, #2, #3, #5)
  - Dashboard Recent Spending filter (only excludes roundups; Drone L Finding 8)
  - `renderMonthlyPosition`'s "Genuine surplus" label (redirect-L #3)
- **Source:** Drone L deep dashboard walk 2026-05-23 (`docs/sessions/2026-05-22-session.md` CDB-26)
- **Repro:** `renderAlerts` shows zero alerts when coral hero shows negative headroom (because legacy `safe` formula doesn't know about livingRemaining); pace + hero use different bill-paid readers
- **Fix bundle:** **Sub-bundle 1.5** — substrate completion. Mechanical propagation, smoke-gated. ~6-10 commits depending on appetite. Queued post-push-reliability + Bundle 33-cache + Bundle 23 sync.
- **Status:** open · scoped via Drone L; queued behind foundational fixes

### 55. Bonus visibility on dashboard (CDB-27, deferred per John's call)
- **Bug:** `S.activePlan.income.bonus = {amount:1341, status:'confirmed', included:false}` exists in state. Bonus has ALREADY landed in S.bal via the salary credit ("PAYSLIP with Bonus" $8,623.33 on 2026-05-14, per ledger-walk-bonus). Dashboard never surfaces this. Drone L Findings 5 + 10 + Drone M's bonusLever mockup all proposed surfacing it; attempted commit was caught by John as a double-count (the lever was going to add bonus.amount to a basis that already contained it).
- **Source:** Drone L 2026-05-23 (findings 5, 10); ledger-walk-bonus.js confirmed bonus is in S.bal not in a separate bucket; John 2026-05-23 caught the double-count attempt before push (CDB-38, CDB-39).
- **Repro:** check dashboard for any surface mentioning the $1,341 bonus → none. State has it; UI doesn't.
- **Fix bundle:** unscheduled. Three options on file (CDB-39): (a) remove the visibility question entirely [John's tonight choice — bonus is in S.bal, included:false is allocation-math gating, nothing legit to surface]; (b) repurpose as informational ("$1,341 bonus landed; $X spent since"); (c) architectural — sweep bonus into dedicated bucket on landing. John picked (a) tonight; defer to Bundle 33 UI redesign if visibility becomes important later.
- **Status:** wontfix at the lever-level (option a); architectural option (c) deferred

### 56. apiKey leak — historical KV exposure (RESOLVED, recorded for posterity)
- **Bug:** `PUSH.pushFullState` sent raw localStorage including `S.apiKey` (Anthropic sk-ant-*) to worker-KV from 2026-05-20 (Bundle 32a ship) through 2026-05-23T20:41 AEST (commit `7a1d5a8` redaction ship). Key was in CF KV plaintext for ~72 hours.
- **Source:** Drone R5 (Bundle 23 Tier-1 Red Team) finding T6.
- **Fix bundle:** SHIPPED commit `7a1d5a8` — NEVER_SYNC deny-list mirrors `buildFullExport`'s pattern; 500kB body size cap added.
- **Followup action by John (completed):** Anthropic key rotated. Old key revoked at console.anthropic.com. New key entered into slyght Settings, console → settings field, by John's hand only. Verified via fresh pull 2026-05-23T22:25 AEST that no `apiKey` field remains in pushed blob.
- **SECURITY.md decision-log entry:** 2026-05-23.
- **Status:** **fixed** (commit `7a1d5a8`, verified live)

---

## Process

- Add new bugs at the bottom with monotonically increasing numbers.
- When a bug is claimed by a bundle, update **Fix bundle**.
- When fixed, set **Status: fixed** and reference the commit hash.
- When wontfix'd, write the reason in a closing note.
- Do not delete entries — keep the trail.
