# Jarvis Metrics & KPI Catalog

> **Date:** 2026-05-27 · **Author:** Metrics/Analytics design pass for Jarvis (slyght mission-control)
> **Purpose:** The full catalog of metrics & KPIs Jarvis should track so John has complete oversight + control of what goes **to** and **from** prod. This feeds the **Insights dashboard**.
> **Scope:** Definitions only — no code. Each metric names the exact data fields it computes from, so the dashboard build is unambiguous.

---

## How to read this catalog

Every metric has: **Name · Question it answers · Compute (exact fields) · Viz · Target · Why it matters · Data class**.

**Data class** is the load-bearing flag:
- **NOW** — computable from current data (`tickets.json` spine + `ticket-state.json` + `flows.json`) with zero new storage. A point-in-time snapshot is enough.
- **SERIES** — needs a **time-series history that does not exist yet**. Today every state row carries only `opened` + `lastActivity` (two timestamps) and the live `status`/`assignee`/`thread`. There is **no record of when a status *changed*, no daily counts, no per-transition timestamps**. Any rate-over-time, burn-down, trend, or "time spent in status X" metric needs a future **snapshots-over-time store** (see [Appendix A](#appendix-a--the-missing-time-series-store)).

The **one structural gap** behind almost every SERIES metric: `thread[]` entries are timestamped (so a handful of latency metrics *are* reconstructable NOW from thread/alignment timestamps), but **status transitions themselves are not logged** — `setStatus` overwrites `t.status` and only bumps `lastActivity`. The day a ticket went Aligned→Investigating is lost the moment it goes Investigating→ConfirmedLive.

---

## Data model (the substrate every metric reads)

**Ticket spine** (`mission-control/tickets.json`, read-only, regenerated):
`id, type` (bug|feature|task), `caseId, title, surface, group, severity` (P0|P1|P2), `kind` (confirmed|candidate|tracked|manual), `summary`, `rich{ mechanism, rootCause, fix, files[], evidence{ flow, walkDir, steps[]{ step, action, lands[], delta{}, probe, error } } }`, `openBug` (int|null), `links[]{to, why}`.

**Ticket state** (`mission-control/ticket-state.json`, mutable, merged onto spine as `t.state`):
`status` ∈ `[Open, Discussing, Aligned, Investigating, ConfirmedLive, Shipped]`, `assignee` ∈ `[john, cc]`, `thread[]{ author ∈ [john,jarvis,cc], text, ts }`, `alignment{ decision, ts }|null`, `evidence|null`, `opened, lastActivity, deleted, deletedAt`.

**State machine** (`server.js`): `TRANSITIONS = { Open:[Discussing], Discussing:[Aligned,Open], Aligned:[Investigating,Discussing], Investigating:[ConfirmedLive,Shipped,Aligned], ConfirmedLive:[Shipped,Investigating], Shipped:[Investigating] }`. `assigneeFor`: Aligned|Investigating → `cc`, else `john`. **ALIGN gate** = `Open|Discussing → Aligned` (writes `handoffs/SLY-N.md`, flips assignee→cc). **ConfirmedLive requires non-empty `evidence`.**

**Flows** (`mission-control/flows.json` + `flows/*.json`): `coverage{traced,total}`, `roster[]{id,name,traced,ticket}`, `surfaces[]{id,name,surface,ticket,steps[]{n,title,is ∈ [ok,broken,dead,gap,fires-anyway],reads[],writes[],ticket},counts{total,gaps,dead,firesAnyway}}`.

---

# 1 · Throughput & Velocity

### M1 — Tickets Shipped (period)
- **Q:** How much actually reached prod in the last N days?
- **Compute:** Count tickets where `state.status === 'Shipped'`. For a true *rate*, count tickets that *entered* Shipped within the window — requires transition timestamps (SERIES); the raw count of currently-Shipped is NOW.
- **Viz:** Big number + sparkline (line, when series exists).
- **Target:** Trend up or steady; never 0 across consecutive cycles while P0/P1s sit Aligned.
- **Why:** The headline "are we delivering?" number. The whole board exists to move tickets to Shipped.
- **Data class:** Count = **NOW**; period rate / sparkline = **SERIES**.

### M2 — Confirmed-Live Throughput
- **Q:** How many fixes were *proven live in the running app* (not just labelled done)?
- **Compute:** Count `state.status ∈ [ConfirmedLive, Shipped]` AND `state.evidence` non-empty. (ConfirmedLive is gated on evidence by the server, so evidence presence is guaranteed for that status.)
- **Viz:** Number, paired with M1 as a two-bar group (Shipped vs Confirmed-Live).
- **Target:** ConfirmedLive count should approach Shipped count — every shipped fix should have been confirmed live.
- **Why:** slyght's hard rule is "ConfirmedLive is EARNED." This separates *labelled* done from *proven* done — the anti-over-claim metric (Layer-B auditor caught an AI over-claim; this is its board-level analogue).
- **Data class:** **NOW**.

### M3 — Cycle Time (Open → Shipped)
- **Q:** How long does a ticket take from raised to live?
- **Compute:** `Shipped_ts − opened`. Today only `opened` exists as a start; the Shipped timestamp is **not** recorded (only current `lastActivity`). Approximate NOW with `lastActivity − opened` *for tickets currently Shipped* (lossy — lastActivity is the last touch, not the ship moment).
- **Viz:** Histogram (bar) of cycle times; median number callout.
- **Target:** P0 median < 3 days; P1 < 7 days; P2 best-effort.
- **Why:** The core flow-efficiency number. Long cycle times mean tickets rot between stages.
- **Data class:** Lossy approximation **NOW**; accurate = **SERIES** (need per-transition timestamps).

### M4 — Stage-Transition Velocity (handoffs/day)
- **Q:** How fast is the board moving overall?
- **Compute:** Count of status transitions per day across all tickets. There is no transition log today — **must** be derived from a future daily snapshot diff or a transition event store.
- **Viz:** Line (transitions/day).
- **Target:** Non-zero on active days; flatlining at 0 while open work exists is a stall signal.
- **Why:** Detects board-wide stalls that per-ticket aging misses.
- **Data class:** **SERIES**.

### M5 — Created vs Closed (net flow)
- **Q:** Is the backlog growing or shrinking?
- **Compute:** Per window: tickets created (`opened` in window — NOW for current window) minus tickets reaching a terminal state (Shipped) in window. Closed-in-window needs transition timestamps.
- **Viz:** Dual line (created vs closed) or net bar (+/−).
- **Target:** Closed ≥ Created over any rolling 2-week window, or backlog grows unbounded.
- **Why:** The single best leading indicator of whether the board is sustainable. Created-side is NOW; closed-side needs series.
- **Data class:** Created = **NOW**; closed/net = **SERIES**.

---

# 2 · Aging & SLA

### M6 — Oldest Open Ticket (age)
- **Q:** What's been waiting the longest for a decision?
- **Compute:** `max(now − opened)` over tickets with `status ∈ [Open, Discussing]` (the "needs John" set). Report the ticket id + days.
- **Viz:** Number + the offending ticket chip.
- **Target:** No Open/Discussing ticket older than 14 days unaddressed.
- **Why:** Surfaces the thing rotting at the bottom of the board. The overview already sorts `needsJohn` by severity; this adds the age lens.
- **Data class:** **NOW**.

### M7 — Aging Buckets (Open work by age band)
- **Q:** How is open work distributed across age — fresh, stale, rotting?
- **Compute:** Bucket all non-terminal tickets (`status ∉ [Shipped]`) by `now − lastActivity` into `[0–2d, 3–7d, 8–14d, 15d+]`.
- **Viz:** Stacked bar or histogram (4 bands), colour green→red.
- **Target:** Bulk in 0–7d; the 15d+ band should be near-empty.
- **Why:** A backlog isn't dangerous because it's big — it's dangerous because items go *stale*. This is the staleness X-ray.
- **Data class:** **NOW** (uses `lastActivity`).

### M8 — SLA Breach Count (severity-weighted age)
- **Q:** How many tickets have blown their severity-appropriate age budget?
- **Compute:** Define SLA per severity (suggest: P0 = 2d, P1 = 7d, P2 = 30d). Count non-terminal tickets where `now − opened > SLA[severity]`. Break down by severity.
- **Viz:** Number + red/amber/green donut by severity.
- **Target:** 0 P0 breaches; ≤ a couple P1; P2 best-effort.
- **Why:** Turns "old" into "old *relative to how urgent it is*." A 5-day P0 is a fire; a 5-day P2 is fine. This is John's prod-oversight tripwire.
- **Data class:** **NOW**.

### M9 — Stalled-Since-Handoff (CC idle tickets)
- **Q:** Which tickets are sitting with CC (Aligned/Investigating) with no recent movement?
- **Compute:** Tickets where `assignee === 'cc'` (`status ∈ [Aligned, Investigating]`) AND `now − lastActivity > 3d`. List + count.
- **Viz:** Bar / list with red flag.
- **Target:** 0 — once aligned, CC work should progress or post back.
- **Why:** The ALIGN gate hands ownership to CC; this catches handoffs that fell into a hole. Distinct from M6 (which is John-side waiting).
- **Data class:** **NOW**.

### M10 — Time in Current Status
- **Q:** How long has each ticket sat in its present stage?
- **Compute:** Best NOW proxy: `now − lastActivity` (last touch). Accurate "entered-this-status-at" needs a transition timestamp.
- **Viz:** Heatmap (status × age band) or per-ticket bar on the board.
- **Target:** No ticket in one status > its SLA band.
- **Why:** Pinpoints *where* in the pipeline things clog (e.g. everything piling in Discussing = decision bottleneck; piling in Investigating = CC bottleneck).
- **Data class:** Proxy **NOW**; exact = **SERIES**.

---

# 3 · Risk & Severity

### M11 — Open P0 Count
- **Q:** How many critical, not-yet-shipped issues exist right now?
- **Compute:** Count `severity === 'P0'` AND `status !== 'Shipped'`. (Overview already surfaces `p0 = sevCount('P0')`; this scopes to not-shipped.)
- **Viz:** Big number, red tone, prominent.
- **Target:** Drive toward 0; any P0 is "stop and look."
- **Why:** The single most important risk number on the board. P0s in this set today: SLY-1, SLY-2, SLY-3, SLY-26 (savings money-loss, bills-undo no-op, AI stale prompt, unrecoverable reset).
- **Data class:** **NOW**.

### M12 — Severity Mix (open work)
- **Q:** What's the risk shape of the backlog?
- **Compute:** Count non-terminal tickets grouped by `severity` (P0/P1/P2).
- **Viz:** Donut (3 slices) or stacked bar.
- **Target:** P0 slice minimal; healthy boards are P2-heavy, P0-light.
- **Why:** A board that's 40% P0 is in crisis; one that's 80% P2 is in maintenance. Sets the emotional/operational tenor.
- **Data class:** **NOW**.

### M13 — Confirmed vs Candidate Ratio
- **Q:** How much of the board is *proven* breakage vs *suspected*?
- **Compute:** Group by `kind` (confirmed | candidate | tracked | manual). Report confirmed / (confirmed + candidate) as a ratio + the raw counts.
- **Viz:** Donut by `kind`, with confirmed/candidate ratio callout.
- **Target:** Candidates should be actively converted (walked → confirmed or dismissed), not accumulate.
- **Why:** Candidates are unverified risk (e.g. SLY-4 hero render-drift, SLY-7 legacy lock path) — they need a focused walk before they're real. High candidate count = verification debt.
- **Data class:** **NOW**.

### M14 — P0/P1 Money-Path Exposure
- **Q:** How many critical/high bugs touch the surfaces that move money?
- **Compute:** Count `severity ∈ [P0,P1]` AND `surface ∈ [save, bills, debts, plan]` AND `status !== 'Shipped'`. (These are the cash-moving surfaces per the flows; `rich.evidence.steps[].lands` containing `balance_apply_delta`/`bucket_saved_change`/`txn_record` confirms money-movement.)
- **Viz:** Number + bar by surface.
- **Target:** 0 — money-path bugs are the existential class for a finance app.
- **Why:** Not all P0s are equal. A money-path P0 (SLY-1 loses $300, SLY-2 strands cash) is worse than a display P0. This is the "trust the numbers" guardrail.
- **Data class:** **NOW**.

### M15 — Released-with-Open-Linked-Bug
- **Q:** Did anything ship while its canonical OPEN-BUGS record was still open?
- **Compute:** Tickets `status === 'Shipped'` with `openBug != null` — cross-check that `postResult`'s propagation actually marked the linked OPEN-BUGS entry fixed. (Jarvis propagates status to `OPEN-BUGS #N` on ConfirmedLive/Shipped; a mismatch = a propagation miss.)
- **Viz:** Number (exceptions list).
- **Target:** 0 — propagation should keep the canonical record in lockstep.
- **Why:** Guards the to-prod/from-prod ledger integrity: a shipped ticket whose canonical bug still reads "open" is a bookkeeping leak John would otherwise not see.
- **Data class:** **NOW** (cross-references `tickets.json` + OPEN-BUGS).

---

# 4 · App Health & Walk Coverage

### M16 — Walk Coverage %
- **Q:** How much of the app has actually been walked (vs assumed)?
- **Compute:** `coverage.traced / coverage.total` from `flows.json` (currently 9/9 = 100% of the *roster*). Cross-check against the ~27-surface full frame noted in the coverage map — so report **roster coverage** AND **full-frame coverage** (traced / ~27).
- **Viz:** Gauge / progress ring.
- **Target:** Roster 100% (held); full-frame trending to 100% as specs convert to walked flows.
- **Why:** "Find everything first" is the campaign doctrine. Untraced surfaces are unknown risk. The honest ⊘ markers matter — 9/9 roster ≠ whole app.
- **Data class:** **NOW** (roster); full-frame needs the surface-count denominator tracked.

### M17 — Broken-Rung Density
- **Q:** Across walked surfaces, how broken is the app right now?
- **Compute:** Sum `surfaces[].steps[]` where `is ∈ [broken, dead, gap, fires-anyway]`, divided by sum of all `steps[]` (total rungs). Also report raw count. The `counts{gaps,dead,firesAnyway}` per surface roll up directly.
- **Viz:** Gauge (% healthy) + stacked bar per surface (ok/broken/dead/gap/fires-anyway).
- **Target:** Healthy-rung % climbing release over release.
- **Why:** A single app-health vital sign drawn from ground-truth walks, not vibes. The `fires-anyway` rungs are the scariest class (SLY-1's cash leaves anyway) — worth surfacing on their own (see M19).
- **Data class:** **NOW**.

### M18 — Surface Health Ranking
- **Q:** Which surfaces are the most broken — where should attention go?
- **Compute:** Per surface, `(gaps + dead + firesAnyway) / counts.total`, ranked desc. (Overview already has a gaps-by-surface chart; this generalizes it to all defect classes.)
- **Viz:** Horizontal bar, sorted, red→green.
- **Target:** No surface above ~25% defect density.
- **Why:** Routes effort to the worst surface. Today Analysis (4 gaps/12) and Dashboard (4 gaps/11) lead on gaps; Savings has the only `fires-anyway`.
- **Data class:** **NOW**.

### M19 — Silent-Failure Rung Count (`fires-anyway` + `dead`)
- **Q:** How many flows do something destructive or misleading with no signal?
- **Compute:** Count `steps[].is === 'fires-anyway'` (acts despite a missing precondition — e.g. cash debits with no destination) + `steps[].is === 'dead'` (a rung that should fire but never does). Separate the two.
- **Viz:** Two numbers + linked ticket list.
- **Target:** 0 `fires-anyway` on money paths.
- **Why:** These are the trust-destroyers — the app *lies* (SLY-1's "−$300 · Savings · —" toast; SLY-26's undo backup that the reset destroys). Highest-stakes health class for a money app.
- **Data class:** **NOW**.

### M20 — Boot/Runtime Error Surface
- **Q:** Is the app erroring on the path users actually take?
- **Compute:** Count `rich.evidence.steps[].error != null` across all tickets/flows; plus track the known boot TDZ (15 pageErrors → MODEL stub, per coverage map). Needs the walker to keep emitting these into the walk artifact.
- **Viz:** Number + trend line (once walks are dated/series).
- **Target:** 0 uncaught errors on boot + core flows.
- **Why:** The boot TDZ (SLY-29) silently stubs the financial model on first paint — exactly the kind of error that hides behind a soft-fail. This makes it visible and trendable.
- **Data class:** Snapshot **NOW**; trend = **SERIES** (need dated walk runs).

---

# 5 · Gap Closure

### M21 — Open Gaps (missing rungs)
- **Q:** How many "should-exist-but-doesn't" steps remain across the app?
- **Compute:** Sum `surfaces[].counts.gaps` (currently: Analysis 4, Dashboard 4, Debts 3, Plan 3, Bills 2, Nav 2, Settings 2, Savings 1, AI 1 ≈ 22 gaps).
- **Viz:** Big number + the existing gaps-by-surface bar.
- **Target:** Monotonic decline.
- **Why:** Gaps are the missing-capability backlog distinct from broken-capability. The overview's hero gaps number; tracked here for closure over time.
- **Data class:** Count **NOW**; closure-over-time = **SERIES**.

### M22 — Gap Closure Rate
- **Q:** Are we closing gaps faster than we find them?
- **Compute:** Δ in total gaps between two dated `flows.json` snapshots (gaps closed − gaps opened per period). Requires storing dated flow snapshots.
- **Viz:** Line (net gaps closed/period) or burn-down.
- **Target:** Net negative (closing > opening).
- **Why:** A gap count that's flat could mean "no work" or "closing as fast as finding" — only the rate disambiguates. Pairs with M5 for the gap dimension.
- **Data class:** **SERIES**.

### M23 — Gap-to-Ticket Conversion
- **Q:** What fraction of identified gaps have an owning ticket (vs floating untracked)?
- **Compute:** Of all `steps[].is ∈ [gap,broken,dead,fires-anyway]`, count those with a non-null `steps[].ticket`, divided by total defect rungs.
- **Viz:** Gauge (% of defects ticketed).
- **Target:** 100% — every walked defect should map to a ticket.
- **Why:** Closes the loop between the walk (finding) and the board (tracking). An untracked gap is a finding that will be forgotten. Most rungs do carry a `ticket` field; this catches the orphans.
- **Data class:** **NOW**.

### M24 — Gaps on Confirmed-Live Surfaces (regression watch)
- **Q:** Did a surface we shipped a fix on still carry open gaps?
- **Compute:** For surfaces whose linked ticket is `ConfirmedLive|Shipped`, report remaining `counts.gaps > 0`.
- **Viz:** Exceptions list / number.
- **Target:** Investigate any non-zero — a shipped surface with lingering gaps may need a follow-up ticket.
- **Why:** Prevents "we fixed *a* bug on Dashboard" from being mistaken for "Dashboard is healthy." Ties release status back to ground-truth surface health.
- **Data class:** **NOW**.

---

# 6 · CC Collaboration

> The Jarvis loop: **discuss thread → "get Jarvis's take" → ALIGN gate (handoff written, assignee→cc) → CC investigates → postResult back → status advances.** Thread entries and the alignment object are timestamped, so several latency metrics are reconstructable NOW from `thread[].ts` and `alignment.ts`. Anything needing the *status-transition* moment is SERIES.

### M25 — Time-to-Align (raised → handoff)
- **Q:** How long from a ticket opening to John aligning it to CC?
- **Compute:** `alignment.ts − opened` for tickets with `alignment != null`. Median + distribution.
- **Viz:** Histogram (bar) + median number.
- **Target:** P0 < 1 day to align; the decision shouldn't be the bottleneck.
- **Why:** Measures John's decision latency — the human gate. The ALIGN gate is the formal handoff; slow aligns mean confirmed findings sit un-actioned.
- **Data class:** **NOW** (both timestamps exist: `opened` + `alignment.ts`).

### M26 — Handoff Count / Active Handoffs
- **Q:** How many tickets has John handed to CC; how many are in CC's court right now?
- **Compute:** Total handoffs = tickets with `alignment != null` (or count of `handoffs/SLY-*.md`). Active = `assignee === 'cc'` (status Aligned|Investigating).
- **Viz:** Two numbers (cumulative + active).
- **Target:** Active handoff count within CC's throughput; not a growing pile.
- **Why:** The work-in-progress limit for CC. WIP that exceeds throughput is the classic flow-killer.
- **Data class:** **NOW**.

### M27 — Post-Back Latency (handoff → CC first result)
- **Q:** How long after alignment does CC post its first result into the thread?
- **Compute:** `min(thread[].ts where author==='cc') − alignment.ts`. The CC result is posted via `postResult` as a `cc`-authored comment (`**CC result** — Found:…`).
- **Viz:** Histogram + median.
- **Target:** P0 < 1 day; P1 < 3 days.
- **Why:** Measures CC's responsiveness once it owns a ticket — the other half of the handshake from M25. Long post-back latency = CC bottleneck or a dropped handoff (overlaps M9).
- **Data class:** **NOW** (thread + alignment timestamps exist) — *the cleanest CC-latency metric available today.*

### M28 — Round-Trips to Resolution
- **Q:** How much back-and-forth does a ticket take before it lands?
- **Compute:** For terminal tickets, count author alternations in `thread[]` (john↔jarvis↔cc switches), or simply `thread.length` segmented by author. Median per resolved ticket.
- **Viz:** Histogram (bar) or box plot.
- **Target:** Lower is better; spikes flag ambiguous findings or thrash.
- **Why:** A ticket that needed 8 round-trips signals a poorly-specified handoff (the rich package wasn't rich enough) — feeds back into improving the collate step.
- **Data class:** **NOW**.

### M29 — Alignment Decision Coverage
- **Q:** Are handoffs carrying a real decision, or defaulting?
- **Compute:** Of aligned tickets, fraction where `alignment.decision` differs from the default `'agreed with the proposed fix'`. (The server defaults this string when none is given.)
- **Viz:** Gauge (% with explicit decision).
- **Target:** High — handoffs should carry John's specific judgment, not a rubber stamp.
- **Why:** The ALIGN gate is where John's judgment enters. A default-decision handoff is a thinner package for CC. Quality-of-handoff signal.
- **Data class:** **NOW**.

### M30 — Jarvis-Take Engagement
- **Q:** How often is the "get Jarvis's take" step used before aligning?
- **Compute:** Count tickets with ≥1 `thread[].author === 'jarvis'` comment; ratio to total discussed tickets.
- **Viz:** Number + ratio.
- **Target:** Informational — high engagement = the discuss-before-align loop is being used.
- **Why:** Measures whether the deliberation loop (the reason Jarvis exists beyond a board) is actually exercised vs tickets going straight Open→Aligned.
- **Data class:** **NOW**.

---

# 7 · Prod Safety (what's shippable, what's blocked)

### M31 — Release-Ready Count (shippable now)
- **Q:** What's cleared the bar and is ready to go to prod?
- **Compute:** Tickets `status === 'ConfirmedLive'` (proven live, evidence attached, not yet Shipped). This is exactly the "release candidate" antechamber.
- **Viz:** Number + list.
- **Target:** Healthy pipeline = a steady flow through ConfirmedLive into Shipped.
- **Why:** John's "what can I push?" answer. ConfirmedLive is the earned, evidence-backed staging state — the green-light queue.
- **Data class:** **NOW**.

### M32 — Release Candidate Queue (planner)
- **Q:** What are the strongest cases for the next release?
- **Compute:** `type === 'bug'` AND `severity ∈ [P0,P1]` AND `status !== 'Shipped'`, sorted P0-first then freshest `lastActivity`. (This is exactly the planner's candidate query in jarvis.js.)
- **Viz:** Ranked list / funnel into release.
- **Target:** Top of queue is always the highest-severity, freshest bug.
- **Why:** Turns the board into a prioritized "ship next" plan — John's outbound-to-prod control surface.
- **Data class:** **NOW**.

### M33 — Blocked-from-Prod Count
- **Q:** What's stuck and *can't* ship yet — and why?
- **Compute:** Non-terminal tickets that are blocked by definition: P0/P1 `bug`s in `[Open, Discussing]` (awaiting John) or `[Aligned, Investigating]` (in CC's hands, not yet ConfirmedLive). Segment by blocker (needs-decision vs in-investigation).
- **Viz:** Funnel (Open→Discussing→Aligned→Investigating→ConfirmedLive→Shipped) showing where the mass sits.
- **Target:** Mass should move rightward over time; a bulge left of ConfirmedLive = a blockage.
- **Why:** The inbound-to-prod control: what's *not* shippable and which gate it's stuck at. The funnel is the single best prod-pipeline visual.
- **Data class:** **NOW** (snapshot funnel); flow-through-funnel animation = **SERIES**.

### M34 — Reopen / Regression Count (Shipped → Investigating)
- **Q:** How often does shipped work bounce back?
- **Compute:** The state machine permits `Shipped → Investigating` and `ConfirmedLive → Investigating`. Count tickets that took those edges. **No transition log today** → SERIES. NOW proxy: tickets currently `Investigating` that have an `evidence` field already set (suggests they were once confirmed) — weak.
- **Viz:** Number + trend line.
- **Target:** 0 — a reopen means a fix didn't hold (the patching-cycle anti-pattern slyght explicitly fights).
- **Why:** The quality-of-fix metric. Regressions are the failure mode CLAUDE.md warns about ("patching cycles where bug fixes create more bugs"). This is the alarm.
- **Data class:** **SERIES** (accurate); weak proxy NOW.

### M35 — Evidence-Backed Ship Rate
- **Q:** What fraction of shipped tickets carry walk evidence?
- **Compute:** Of `status === 'Shipped'`, fraction with non-empty `state.evidence` OR `rich.evidence != null`.
- **Viz:** Gauge.
- **Target:** 100% — nothing ships unproven.
- **Why:** Enforces the "ConfirmedLive is EARNED" doctrine all the way to Shipped. A shipped ticket with no evidence is an unverified prod change — exactly what John needs oversight on.
- **Data class:** **NOW**.

---

# 8 · Engagement

### M36 — Board Activity (touches/day)
- **Q:** Is the board being actively worked?
- **Compute:** Count of `lastActivity` timestamps (and `thread[].ts`, `alignment.ts`) falling in each day. NOW gives "active today" (tickets with `lastActivity` = today); a real per-day series needs snapshots.
- **Viz:** Line / calendar heatmap (the calendar view already plots tickets by date).
- **Target:** Regular activity on working days; long flat gaps = the board went cold.
- **Why:** A mission-control no one visits is dead weight. Detects abandonment early.
- **Data class:** "Active today" = **NOW**; daily series = **SERIES**.

### M37 — Discussion Depth
- **Q:** How much real deliberation is happening per ticket?
- **Compute:** Mean / median `thread.length` across non-trivial tickets; distribution of threads with 0 vs ≥1 vs ≥3 comments.
- **Viz:** Histogram.
- **Target:** Informational — money-path tickets warrant deeper threads; zero-comment P0s are a flag.
- **Why:** A P0 that went straight to Aligned with an empty thread skipped deliberation. Pairs with M29/M30 as the "is the loop being used" cluster.
- **Data class:** **NOW**.

### M38 — Stale-Open Nudge List (engagement tripwire)
- **Q:** What should John look at *today* that he hasn't touched?
- **Compute:** Non-terminal tickets sorted by `now − lastActivity` desc, filtered to `assignee === 'john'`, severity-weighted. (Reuses M7/M9 logic but as an actionable daily list.)
- **Viz:** Ranked list with age + severity pills.
- **Target:** Empty by end of an active session.
- **Why:** Converts aging data into a daily call-to-action — the engagement driver, not just a measurement. Aligns with the MEMORY rule "every Noticed item needs ACTION + WHEN."
- **Data class:** **NOW**.

---

## Build first 8 (recommendation)

These maximize oversight-per-unit-build, are **all computable NOW** (zero new storage), and together answer "what's on fire / what can I ship / what's stuck":

1. **M11 — Open P0 Count** — the one number that decides whether to stop everything. Trivial; highest signal.
2. **M33 — Blocked-from-Prod Funnel** — the single best pipeline visual; shows where everything is stuck at a glance. Also subsumes a status breakdown.
3. **M31 — Release-Ready Count** — "what can I push right now?" The outbound-to-prod answer John literally asked for.
4. **M19 — Silent-Failure Rung Count** — the trust-destroyer class (`fires-anyway`/`dead`); a money app's existential metric, straight from walk ground-truth.
5. **M8 — SLA Breach Count** — severity-weighted aging; the tripwire that separates "old P2 (fine)" from "old P0 (fire)."
6. **M17 — Broken-Rung Density / app-health vital** — one gauge for "how broken is the app," drawn from real walks not vibes.
7. **M27 — Post-Back Latency** — the cleanest CC-collaboration metric available today (thread + alignment timestamps already exist); catches dropped handoffs.
8. **M2 — Confirmed-Live Throughput** — enforces "done = proven, not labelled," the anti-over-claim discipline, with M35 (evidence-backed ship) as a fast follow.

**Why this set:** it covers all of John's stated axes — *to prod* (M31, M33), *from prod / quality* (M2, M19), *risk* (M11, M8), *app health* (M17), *CC loop* (M27) — with eight metrics that need **no new infrastructure**. Build the [snapshot store](#appendix-a--the-missing-time-series-store) in parallel so the SERIES metrics (velocity, burn-down, reopen-rate, trends) unlock next.

---

## Appendix A — the missing time-series store

**Today's limitation:** `ticket-state.json` holds only the *current* `status`/`assignee` plus `opened` + `lastActivity`. `setStatus`/`postResult` **overwrite** status and bump `lastActivity` — the moment of each transition is **not recorded**. `thread[].ts` and `alignment.ts` *are* timestamped, which is why a few latency metrics (M25, M27, M28) are reconstructable now.

**What every SERIES metric needs:** an append-only history. Two viable shapes:

- **(A) Transition event log** — the precise fix. On every `setStatus`/`postResult`/`alignHandoff`, append `{ id, from, to, ts, by }` to a `ticket-transitions.jsonl`. Enables exact cycle time (M3), stage-velocity (M4), created-vs-closed (M5), time-in-status (M10), reopen-rate (M34) — everything, accurately.
- **(B) Daily board snapshot** — cheaper, coarser. Once/day, write the full ticket-state + a rolled-up flows summary to `snapshots/board-YYYY-MM-DD.json`. Enables all *trend/rate/burn-down* metrics (M1 sparkline, M22 gap-closure, M36 activity series, M20 error trend) at daily resolution, and approximates the rest.

**Recommendation:** ship **both** — (A) for transition-precise metrics, (B) for cheap trend lines and gap/health history (which (A) alone doesn't capture, since flows defects aren't ticket transitions). (B) is a ~10-line cron-style writer; (A) is a one-line append inside the three existing mutating actions.

### Metrics by data class (quick index)

**NOW (computable today, no new storage):**
M1 (count), M2, M5 (created side), M6, M7, M8, M9, M10 (proxy), M11, M12, M13, M14, M15, M16 (roster), M17, M18, M19, M20 (snapshot), M21 (count), M23, M24, M25, M26, M27, M28, M29, M30, M31, M32, M33 (snapshot funnel), M35, M36 (today), M37, M38.

**SERIES (need the snapshot/transition store):**
M1 (sparkline/rate), M3 (accurate), M4, M5 (closed/net), M10 (exact), M20 (trend), M22, M33 (flow animation), M34 (accurate), M36 (daily series).
