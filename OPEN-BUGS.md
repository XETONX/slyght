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
- **Status:** open (Bundle 7 — investigated, repro still needed)

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
- **Status:** fixed (Bundle 7 — three-rule dedupe before NW-up notification push: skip if last NW notif within 2h, skip if absolute delta < $50, skip if last txn was a manual correction. Inline guards in `NOTIFY.generate()`. Independent of #13's NW-math fix — this controls *firing*, not the math.)

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
- **Fix bundle:** Mission B (calendar marker scope)
- **Status:** open

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
- **Status:** fixed (Bundle 7 — `_scheduledAutoDebit: true` flag on paidBills entries via the new 3-way Mark-Paid modal. MI-13 invariant filter calls `isPaidBillAutoDebit(key)` and excludes flagged keys. Legacy `paidBills[key] === true` markers stay treated as accidental paid-early until the user marks them via the new flow.)

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
