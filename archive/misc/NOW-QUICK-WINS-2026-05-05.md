# SLYGHT NOW — Quick wins recon

**Date:** 2026-05-05 (10 days to payday May 15)
**Author:** Opus (Claude)
**Scope:** Dashboard + Bills tab + Analysis tab. Excludes Plan Mode, Settings polish, and post-payday redesign work.
**Output:** Ranked list of 16 quick wins. Each ≤30 minutes. Ranked by Impact/Time.
**No code in this doc.** Mission writing comes after you pick which to ship.

---

## How I picked these

I looked at NOW with the question: *if John opens this app tomorrow morning, what would change his day?*

Three filters applied:
1. **Quick** — under 30 minutes of focused work
2. **High leverage** — improves daily use, not just architecture
3. **Low risk** — no regressions to `56896d8`, `c800400`, `5c6e219`, `4a8cfba`, `3c9b684`, `7351f9e`

I deliberately did NOT include items already in `BACKLOG.md` (notification text wrap #36, "Lock plan" confirmation #51, etc.) — those are John-articulated. This recon surfaces friction John *hasn't* articulated.

I also did NOT include items that need new architecture, new state schema, or that pull on Plan Mode — those are different missions.

---

## Ranked list

### 🥇 Tier 1: Highest leverage per minute

#### 1. Make round-up savings visible on the dashboard
**Time:** 15 min · **Impact:** high · **Risk:** low

**What's wrong now:** The single working savings habit in John's data is round-ups. China Holiday has $61.82, all from `_isRoundup: true` cents. **Zero positive feedback exists** for this on the dashboard. The user sees money leave but never sees money saved.

**What I'd change:** Add a small line under the hero balance, only when there's been a round-up in the last 7 days:

> 🏦 +$0.43 saved this week → China Holiday

Computed: `(S.txns||[]).filter(t => t._isRoundup && t.ts > Date.now() - 7*86400000).reduce(...)`. Tappable to open the China Holiday bucket.

**Why it matters for the next 12 days:** John is going to log 5-15 transactions in the next 12 days. Each will round up. He'll see the China bucket grow visibly *because of his behavior*. This is the single fastest way to make the app feel rewarding rather than dutiful.

---

#### 2. Today's date + day-of-cycle anchor under the payday bar
**Time:** 10 min · **Impact:** high · **Risk:** low

**What's wrong now:** The dashboard shows balance, "X days to payday," and a progress bar — but never the actual *date*. John has to know the day to interpret the weekday/weekend budget. He has to do mental math to know which day of the cycle he's in.

**What I'd change:** Add a single line under the existing `pd-row` (line 429-432):

> Wed 5 May · day 5 of cycle · weekday budget

11px text, var(--text3). No new tile. Just one line.

**Why it matters:** Temporal grounding. Removes the "what day is it again" cognitive load. Frames each open as "you're on day N — here's how that's going."

---

#### 3. Fix CONSISTENCY_FAIL audit log marking failures as ok
**Time:** 5 min · **Impact:** medium · **Risk:** low

**What's wrong now:** `AUDITOR.record` at line 6792 computes `ok = expected !== null ? Math.abs((after - before) - expected) < 0.02 : true`. CONSISTENCY_FAIL entries pass `expected: 0`, so `Math.abs(0 - 0) < 0.02 = true` — failures are recorded with `ok: true`. The Activity Log at Settings reports "no failures" while failures occurred. (This is BACKLOG #41 root cause — but the *fix* is one boolean, not a system.)

**What I'd change:** In `AUDITOR.record`, treat action-name `'CONSISTENCY_FAIL'` as `ok: false` regardless of expected. One conditional.

**Why it matters:** Trust. The audit log either means something or it doesn't. Currently it lies. 5 minutes to make it stop.

---

#### 4. Remove four dead render calls from `renderAll()`
**Time:** 5 min · **Impact:** low (code health) · **Risk:** low

**What's wrong now:** `renderAll()` at lines 3210-3221 calls four renderers whose target DOMs don't exist:
- `renderMumCard()` → `dash-mum-card` (doesn't exist; deleted by MISSION-JARVIS)
- `renderPaydayPlan()` → `payday-plan-body` (doesn't exist)
- `renderLtTiles()` → `lt-car-tile`, `lt-cc-tile` (don't exist)
- `renderWrxTracker()` → `wrx-tracker-card` (doesn't exist)

Each returns early via `if (!el) return`. Four function calls + four DOM lookups per render pass for nothing.

**What I'd change:** Delete the four call lines. Keep the function definitions for now (to avoid scope creep) but stop calling them. Add a comment: *"// Functions kept for archaeology; DOMs removed in MISSION-JARVIS."*

**Why it matters:** Render passes happen on every state change. This is hygiene, not performance, but cleaner is cleaner. **Mark for discussion:** alternatively delete the functions entirely (~250 lines of zombie code). I'd discuss before deleting because some might still be referenced.

---

#### 5. Hero "spent today" → richer one-line summary
**Time:** 15 min · **Impact:** medium-high · **Risk:** low

**What's wrong now:** The hero note at line 3032-3047 has 4 states: debt-payments-today, discretionary-spent-today, txn-spent-cycle-only, or empty. The most informative state shows just "$X spent today." That's it. No comparison, no context.

**What I'd change:** Augment with a comparison clause when data supports it:

> $87 spent today · $43 yesterday · cycle pace $52/day

Computed from existing `getTodaySpent()` and a one-day-ago span via `computeSpentInRange`. Three numbers, one line. Direction without judgment.

**Why it matters:** John's hero balance is the most-looked-at number after balance itself. Adding a comparison clause turns "what" into "what vs typical" — pattern recognition without explicit pattern detection.

---

#### 6. Surface last reconciliation (when recent)
**Time:** 15 min · **Impact:** medium · **Risk:** low

**What's wrong now:** `S.reconLog` exists with timestamps and reasons (snapshot lines 391+ shows 3 entries from Apr 14-15). After the user reconciles, the entry is stored but **invisible**. John has no way to remember why he last adjusted.

**What I'd change:** A single line near the hero balance, only when the most recent `reconLog` entry is <48h old:

> ↻ Last reconciled 2h ago: "Bank fee" −$83

Tappable to view the full reconLog.

**Why it matters:** Closes the loop on reconciliations. The reconciliation moment is currently a write-and-forget. Surfacing recent entries makes the user feel the app remembers what they fixed.

---

#### 7. Quick log default category by time of day
**Time:** 15 min · **Impact:** medium · **Risk:** low

**What's wrong now:** `openQuickLogModal()` at line 5125 defaults the hidden category to `'Food / Coffee'` always (line 5129) and surfaces `localStorage.slyght_last_cat` as the visually selected chip. John taps the + button at any time of day and the same default fires.

**What I'd change:** Time-of-day-aware default:
- 6am-11am → Food / Coffee (breakfast/lunch)
- 11am-3pm → Food / Coffee
- 3pm-6pm → Other
- 6pm-11pm → Food / Coffee (dinner) OR Entertainment
- 11pm-6am → Other

Falls back to last-used if user has explicitly chosen a category before. **Defer location-aware defaults** (analysis § 8.3 — "GF mode") to later work.

**Why it matters:** Logging is the friction point that makes the app see only ~70% of spend (analysis § 2.1, reconciliation log). One fewer tap per logged transaction lowers the activation energy. Multiplied across the next 12 days = more accurate data feeding everything else.

---

### 🥈 Tier 2: Solid wins, slightly less leverage

#### 8. Add a "what auto-matched" line after auto-detection
**Time:** 15 min · **Impact:** medium · **Risk:** low

**What's wrong now:** `autoMatchBillsToTxns` (line 5258) and `autoDetectBillPayments` (line 5280) silently mark bills as paid when a recent transaction matches an amount or name. Output: a 3-second toast and that's it. After a week the user has no record of which bills got auto-matched vs manually marked.

**What I'd change:** When `autoDetectBillPayments` matches a bill, also push an entry to a new `S.autoMatchLog = []` (capped at 20). Surface the most recent entry on the dashboard as a small line under the bills row, only when within 24h:

> ✓ Car Loan auto-matched to your $780 payment 18m ago. Wasn't right? Undo →

Undo button reverses the paidBills entry.

**Why it matters:** The app does smart bookkeeping invisibly. Surfacing one line of evidence builds trust in the automation. Also gives the user a chance to correct false positives.

---

#### 9. Cycle-pace supplementary line under "You can spend today"
**Time:** 20 min · **Impact:** medium-high · **Risk:** low-medium

**What's wrong now:** The dashboard tile "YOU CAN SPEND TODAY: $X" reads from `getDynamicDailyBudget()`. Per analysis § 7.3, daily budget caps ($60 weekday / $180 weekend) are fiction relative to actual data: post-payday days $1,500/day, mid-cycle $7/day. The number is technically correct but emotionally misleading.

**What I'd change:** Don't replace the headline (that's redesign work). **Add** a 2-line supplementary block underneath:

> Cycle so far: $1,247 over 5 days = $249/day pace
> 10 days remaining at this pace = $2,490 (you have $1,873)

If pace × remaining > available: amber. If < available: green. If close: neutral.

**Why it matters:** The single most useful question for John daily — "am I on track this cycle?" — currently has no inline answer. He has to navigate to Analysis or Survival Forecast. Two lines on the dashboard answer it.

**Mark for discussion:** I'd want your eyes on the exact wording before shipping. The framing of "pace × remaining" can feel either liberating or anxiety-inducing depending on copy.

---

#### 10. Recent Spending tile shows correction/round-up flags
**Time:** 10 min · **Impact:** low-medium · **Risk:** low

**What's wrong now:** `renderDashTxns` at line 5092 shows the "HABIT" badge (line 5103) for flagged txns but **doesn't surface** the `_isCorrection` (🔧) or `_isRoundup` (🏦) flags that the Analysis tab does (line 2911 shows them). Recent Spending on the dashboard treats reconciliation corrections and round-ups as normal transactions.

**What I'd change:** Add two badges to the txn row in `renderDashTxns`, mirroring the Analysis tab:

> 🔧 (correction) · 🏦 (round-up) · HABIT (existing)

15 lines edit.

**Why it matters:** Sees the same transaction list with the same flags everywhere. Reduces "wait, why is there a $0.55 thing in my recent spending?" confusion (round-ups get logged as cat=Savings transactions and look weird without the badge).

---

#### 11. Weather header collapse to icon-only
**Time:** 15 min · **Impact:** medium · **Risk:** low

**What's wrong now:** `weather-hdr` (line 401) shows weather text in the header. Per analysis and BACKLOG #34, this takes header real estate the user doesn't use. Currently always visible, no way to dismiss.

**What I'd change:** Collapse to a small icon (☀️/☁️/🌧️ depending on conditions) in the header. Tap to expand the full weather summary. Default state: icon only.

**Why it matters:** Cleaner header, less visual noise next to the more important PLAN › / notifications / settings buttons. **This is BACKLOG #34** but small enough I included it — feel free to skip if you want only non-articulated items.

---

#### 12. Subscription audit footer line in Analysis
**Time:** 25 min · **Impact:** medium · **Risk:** low

**What's wrong now:** Per analysis § 2.3, John pays $440.60/mo in recurring software/services. Including TWO Anthropic products simultaneously ($66/mo combined). The Analysis tab has no surface for this.

**What I'd change:** A small tile at the bottom of Analysis tab:

> SUBSCRIPTIONS · $441/month · $5,287/year
> Two Anthropic products: Claude Plus $34 + Claude API $32 — review?

Sums all `BILLS` with `tag === 'Subscription'` or `tag === 'Streaming'`. Tappable to expand the full list with last-charged date. The "two Anthropic" callout is data-derived (matches `b.name.includes('Claude')` or `Anthropic`).

**Why it matters:** Surfaces a $5,287/year line item the user has never seen as a single number. Could become a recurring decision point.

---

#### 13. Survival forecast wording: "If you keep this up" → personal numbers
**Time:** 15 min · **Impact:** medium · **Risk:** low

**What's wrong now:** `renderSurvivalForecast` shows "Min living costs (12d × $X/day from history)" — the $X comes from `getAvgDailySpend()` which itself defaults to $60 fallback when txn data is sparse (per runtime report). The user sees "$60/day from history" even when the app actually has no idea what their min is.

**What I'd change:** Add a confidence qualifier when txn count is low:

> Min living costs (12 days × $60/day) — based on 9 transactions, may be lower
> Run a no-spend day to lower this number

Or: hide this line if `S.txns.length < 20` and show an alternative explanatory line.

**Why it matters:** The Survival Forecast is the most-trusted tile per BACKLOG #20 ("brilliant"). When it shows a number based on a $60 fallback, trust is misplaced. Honest qualifier protects the trust.

---

#### 14. Persistent footer strip — remove "—" placeholder
**Time:** 5 min · **Impact:** low · **Risk:** low

**What's wrong now:** The persistent strip at line 712-714 shows "—" for NW/today/payday before the first render pass. The user sees the placeholder if they navigate quickly or if the strip renders before MODEL is ready.

**What I'd change:** Either:
- Default to `var(--text3)` opacity 0 until first update
- Or precompute synchronously in HTML so the values appear instantly

**Why it matters:** Tiny polish but the persistent strip is *always visible*. A `—` flash is jarring even if brief.

---

### 🥉 Tier 3: Worth doing, lower priority

#### 15. Bills tab "+ Add A Bill" placement & icon
**Time:** 10 min · **Impact:** low-medium · **Risk:** low

**What's wrong now:** "+ Add A Bill" button sits between the calendar and the bills list (line 499). It's full-width, dashed-border, identical visual weight to a real bill card. A user who wants to tap a bill to mark paid could accidentally tap "Add" and land in a modal.

**What I'd change:** Reduce visual weight to a smaller right-aligned button matching the "+ Add Goal" / "+ Add Trip" pattern used in Plan Mode. Move it to the top of the bills section as a subtle header action, not a full-width call-to-action.

**Why it matters:** Reduces accidental adds, matches the pattern Plan Mode already uses elsewhere.

---

#### 16. The "Last 7 Days" bar chart minimum readable size
**Time:** 20 min · **Impact:** low-medium · **Risk:** low

**What's wrong now:** The Last 7 Days bar chart in Analysis tab (renderAnalysisTab line ~2870) has `height:80px` for 7 bars across a 480px-max-width screen. Each bar is ~50px wide. Per BACKLOG #25: "too small to be useful."

**What I'd change:** Increase height to 120px. Add daily $ amount labels under each bar (currently only shown when spend > 0, sometimes hidden). Add today's daily-budget line as a horizontal dashed line.

**Why it matters:** Makes the chart readable for actual decisions. Shipped already in tile cleanup but the chart's small size makes it skimmed past.

**Mark for discussion:** I'd want to see John's actual data render in this chart before committing — if recent days are mostly zero, even a bigger chart won't help.

---

## Items I considered and rejected

These came up but didn't make the cut:

- **Replace daily budget framing wholesale** — too risky for "quick win." Would change a primary tile. Belongs in post-May-15 redesign, not here.
- **Voice-tap log** (analysis § 8.2) — beyond 30-min scope. Real feature, separate mission.
- **Reverse onboarding "log lunch?" prompt** (analysis § 8.1) — needs scheduling infra and prompt management. Not a quick win.
- **Notification text wrap fix** (#36) — already in BACKLOG. User said this list is for things John *hasn't* articulated.
- **Lock plan confirmation** (#51) — already in BACKLOG. Skipped.
- **GF mode location-derived category** — needs LOCATION integration. Not a quick win.
- **Two clocks** (analysis § 8.6) — concept change, not a small UI fix.
- **City2Surf countdown surfacing** — already shown in `renderWeeklySnapshot` (line 9398). Verified visible. No quick win available without a redesign of that tile.

---

## Things I noticed that aren't quick wins but you should know

These are bigger than 30 minutes but worth flagging:

**A. The `_NON_SPEND_CATS` vs `getDiscretionarySpend.EXCLUDED_CATS` disagreement.** Two filters that should match still don't (analysis § 1.2). Touches multiple call sites. Real fix is medium-large. Not a quick win.

**B. Reconciliation log → "what does the app miss?" framing.** Could become a permanent tile. Larger product decision.

**C. The "two Anthropic products" callout** (in #12 above) is just the surface. The deeper subscription audit feature deserves its own tile / mission.

**D. The `renderEmergencyFundStatus` rendering into Settings** is now the canonical Emergency Fund home (after `7351f9e`). It works. But the styling (line 3278) is less polished than other Settings sections. Future polish, not a quick win.

**E. `_chatRendering` flag** prevents re-entry but isn't actually a UX issue. Just noting.

---

## Proposed batching for next 12 days

If you want to ship 3-5 of these over the next several days, my recommendation:

**Batch 1 — "Quick truth fixes" (1 commit, ~30 min total):**
- #3 CONSISTENCY_FAIL boolean fix
- #4 Remove 4 dead render calls
- #14 Footer strip placeholder polish
- #10 Recent Spending flag emojis

Total ~35 min. All low-risk hygiene + clarity. Ships clean.

**Batch 2 — "Behavioral surfacing" (1 commit, ~30-40 min total):**
- #1 Round-ups visible
- #2 Date / day-of-cycle anchor
- #6 Last reconciliation (if recent)

Total ~40 min. Three small surfaces around the hero. Together they make the dashboard feel like it's noticing things.

**Batch 3 — "Hero context richness" (1 commit, ~30 min total):**
- #5 Hero "spent today" with comparison
- #9 Cycle-pace supplementary line

Total ~35 min. Both make existing primary numbers richer without adding tiles.

**Batch 4 — "Friction reductions" (1 commit, ~25 min):**
- #7 Time-of-day quick-log default
- #8 Auto-matched bills indicator

Total ~30 min. Both reduce taps for daily logging.

**Optional batch 5 — "Larger tweaks" (1 commit, ~50 min):**
- #11 Weather collapse
- #12 Subscription audit footer
- #13 Survival forecast confidence qualifier

These don't share a theme as cleanly. Could ship individually.

Each batch is a single commit, single mission, manual phone verification. The full backlog of 16 items ships in 4-5 sessions over a week.

---

## How honest I'm being

If I'm strictly applying the "high-leverage" filter, **the top 3 are the ones I'd ship first if forced to pick**:
1. Round-ups visible (#1) — makes the app feel rewarding
2. Date / day-of-cycle anchor (#2) — temporal grounding
3. Hero "spent today" comparison (#5) — pattern recognition without judgment

Everything else is incremental. None are bad, but the top 3 change the *feel* of the app, not just the *correctness*.

Items #3 (CONSISTENCY_FAIL) and #4 (dead renders) are hygiene — important for trust but invisible to John. Worth shipping but won't make him want to open the app tomorrow.

If I'm being more honest still: **NOW is in pretty good shape post-`7351f9e`.** The backlog has 26 items left after tonight's 6 commits. Most of what's wrong with NOW falls into "post-May-15 redesign" (visual unification, Plan Mode parity) or "Plan Mode work" (the playground). The remaining quick wins on this list are the *small* polish.

The biggest gain in the next 12 days isn't on this list. It's the Allocation Playground v1 — making Plan Mode actually generative. NOW just needs to stay calm and instrumental while that work happens.

---

## Stopping. Awaiting your picks.

Tell me which items resonate, which to skip, and whether to batch as I proposed. I'll write the mission file for whichever subset we agree on, in v2 outcome-driven style.
