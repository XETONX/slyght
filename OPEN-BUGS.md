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
- **Status:** open

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
- **Status:** open

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
- **Status:** open

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
- **Status:** open

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
- **Status:** investigating

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
- **Status:** open (calibration target for Layer 2)

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
- **Status:** open (calibration target for Layer 2)

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
- **Status:** open (calibration target for Layer 2)

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

---

## Process

- Add new bugs at the bottom with monotonically increasing numbers.
- When a bug is claimed by a bundle, update **Fix bundle**.
- When fixed, set **Status: fixed** and reference the commit hash.
- When wontfix'd, write the reason in a closing note.
- Do not delete entries — keep the trail.
