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

---

## Process

- Add new bugs at the bottom with monotonically increasing numbers.
- When a bug is claimed by a bundle, update **Fix bundle**.
- When fixed, set **Status: fixed** and reference the commit hash.
- When wontfix'd, write the reason in a closing note.
- Do not delete entries — keep the trail.
