# slyght — Improvement Opportunities Backlog (2026-05-27)

> **Explorer output.** A grounded, ticket-ready backlog of improvement opportunities across the whole project. Raw material for Jarvis → tickets. Every entry is anchored to something actually read (file:line / surface / doc) on 2026-05-27, not generic best-practice.
>
> **What I read:** `index.html` structure (via FEATURE-MAP + walk evidence), `docs/PIPELINE.md`, `CLAUDE.md`, `OPEN-BUGS.md` (1064 lines), `FEATURE-MAP.md`, `FINANCIAL-INVARIANTS.md`, `SECURITY.md` + `mission-control/SECURITY.md`, the Jarvis tool (`mission-control/jarvis.js` 1214 lines, `server.js`, `mission-control.html`), the walk-and-judge campaign (`coverage-map-2026-05-26.md`, `audit-2026-05-26.md`, `ux-recs-2026-05-26.md`, 13 walk specs, `flows.json`), the briefs (`CC-JARVIS-PLATFORM.md`, `CC-MASTER-BRIEF-WALK-AND-JUDGE.md`), and `docs/JOHN-KNOWLEDGE.md`.
>
> **Severity vocabulary (matches Jarvis):** P0 = critical / trust-corrosive; P1 = high; P2 = normal. **Effort:** S (<½ day), M (½–2 days), L (multi-session). Impact = High/Med/Low.
>
> **Important framing note:** the walk-and-judge campaign already minted 29 generated tickets (SLY-1..29) covering the confirmed walk findings. This backlog deliberately focuses on what is **NOT yet ticketed**: the second-order gaps, the Jarvis tool itself, process/governance, data/metrics, and a handful of app findings the walk surfaced but didn't promote. Where I reference an existing ticket it's to avoid duplication, not to re-file it.

---

## Top 10 by leverage

| # | Title | Theme | Impact | Effort | Cat | Where |
|---|-------|-------|--------|--------|-----|-------|
| 1 | Hero balance is non-deterministic across renders (counter-roll mid-tween) | Reliability | High | M | bug | `index.html` hero / SLY-4 |
| 2 | Analysis surface has 4 confirmed gaps but NO ticket | App correctness | High | M | bug | `flows.json` analysis · spec 08 |
| 3 | "Confirm live" can't actually be earned — no walker→Jarvis evidence bridge | Jarvis | High | M | feature | `server.js` setStatus · walk pipeline |
| 4 | Walk coverage is 6 of 202 actions — fleet never fanned out | Process/QA | High | L | task | `coverage-map` · 13 specs authored |
| 5 | "Get Jarvis's take" is copy-paste manual, not a loop | Jarvis | High | M | feature | `jarvis.js` jarvisTake() |
| 6 | Cross-surface number coherence has no runtime guard (5 drift bugs) | Reliability | High | M | task | OPEN-BUGS #6/8/12/15/17 |
| 7 | AI live prompt reads raw `S.bal` + hardcoded stale facts | Correctness/trust | High | M | bug | `index.html:15665` / SLY-3 |
| 8 | No automated build/CI — gates run only when CC remembers | Process | High | M | process | no CI · OPEN-BUGS #30 |
| 9 | FINANCIAL-INVARIANTS has 5 unresolved policy decisions blocking specs | Governance | Med | S | process | FINANCIAL-INVARIANTS pending |
| 10 | Jarvis has zero metrics — no cycle-time, age-aging, or throughput view | Data/metrics | Med | M | feature | `jarvis.js` overview |

---

## Theme 1 — slyght app: reliability & correctness

### 1.1 Hero balance visibly drifts across consecutive renders for a single log
- **What:** On both Quick-Log flows the walk caught the hero number moving across frames for ONE entry: `$2,045.59 → $1,914.85 → $1,782.50` for a single $300 log, and `$2,045.59 → $2,043.47 → $2,041.08` for a $5 coffee. A $5 movement should drop the hero ~$5 once, deterministically.
- **Why it matters:** "Nothing destroys trust in a money app faster than a balance that changes when you're just looking at it" (ux-recs §A/C). The most trust-corrosive thing in the batch.
- **Impact:** High · **Effort:** M · **Where:** `index.html` hero render + counter-roll animation; flagged `flows.json` dashboard step 5 ("Counter-roll animation tweens the digits"). Likely either a rAF counter caught mid-tween (the walker's CSS-freeze doesn't stop rAF) or a real double-apply. **Already SLY-4** — but the *root-cause split* (animation artifact vs real double-count) is undecided and is the real work.
- **Category:** bug

### 1.2 Analysis surface: 4 confirmed gaps, zero ticket coverage
- **What:** `flows.json` shows Analysis with 4 broken steps — pivot total uses the LAX outflow filter (step 4), category breakdown tile (step 6), `renderTrend` month-on-month deltas (step 9), Net-Worth Trend "vs last month" (step 11) — and **`ticket: -`** (the only traced surface with gaps and no ticket). Spec 08 documents the filter-scatter (STRICT/LAX/OUTFLOW) and the "NW trend off by orders" memory (+$90,506 implying wrong baseline).
- **Why it matters:** This is the single biggest *untracked* app surface. Four real number-correctness bugs are sitting outside the ticket system entirely. It also overlaps OPEN-BUGS #6 (part-B), #13.
- **Impact:** High · **Effort:** M (walk + fix the filter consolidation) · **Where:** `index.html` ~:5060/:5074/:4960 (renderTrend/renderCatBreakdown), NW-trend reader; `docs/walk-and-judge/specs/08-analysis-full.md`.
- **Category:** bug — **file a ticket for the Analysis surface.**

### 1.3 Cross-surface "today's spend" / daily-cost / pace numbers disagree (no runtime guard)
- **What:** Three+ renderers each compute their own number: footer "$22 today" vs dashboard "Over by $44" vs Analysis "$74.09" (OPEN-BUGS #17/#12); three daily-cost figures $38.65/$41.56/$16.56 (#15); pace tile uses LAX filter (#8); renderCutSliders all-time vs monthly (#7). The fix exists in concept (repoint all to `MODEL.todaySpent`) plus a Layer-1 static rule, but nothing enforces coherence at runtime today.
- **Why it matters:** Each tile "presents itself as authoritative" — the user can't tell which number is real. This is a whole bug *class*, not one bug; consolidating the filters resolves 4+ OPEN-BUGS transitively (the Bundle 32d "filter-scatter root cleanup" idea).
- **Impact:** High · **Effort:** M · **Where:** `index.html` footer `updatePersistentStrip`, dashboard alert renderer, Analysis today-display; proposed `MODEL.todaySpent` single-source + `guardian-static.js` rule. OPEN-BUGS #6/#7/#8/#12/#15/#17.
- **Category:** task (consolidation) — currently scattered across SLY-10/11/12/13 (tracked) but **no single "filter-scatter root cleanup" ticket** binds them.

### 1.4 AI coach prompt reads raw `S.bal` + hardcoded stale facts; correct builder is dead code
- **What:** `buildSystemPrompt()` (`:15332`, the *correct* one — uses `getLiveBal`, `getGenuineSurplus`, a disclaimer) is **dead code, 0 callers (grep-confirmed)**. The live prompt (inline `:15665`, sent `:15766`) reads raw `S.bal` (`:15672`), uses `getDynamicDailyBudget` (probe: 60 vs genuine surplus 0), looks up `goal.id==='rainy-day-fund'` against present id `'rainy-day'` → false → hardcoded $9,000, says "Darwin June 7-15" when intent is Aug 1-10, and carries no disclaimer.
- **Why it matters:** The adviser is reasoning from a stale cheat-sheet. Auditor-enforced nuance: balance divergence is 0 *on this fixture* (structural risk, not a demonstrated wrong number) — but the spend-power, goal-id, date, and disclaimer bites are demonstrated live harm. Violates the spirit of INV-20/INV-21.
- **Impact:** High · **Effort:** M · **Where:** `index.html:15332` (dead), `:15665-15766` (live). **Already SLY-3** — note the FR-03 ($7k overshoot) `update_balance` tool is a *separate* AI bug still open per CLAUDE.md §5.
- **Category:** bug

### 1.5 Quick-Log → Savings silently loses money (no destination picker)
- **What:** Type=Savings hides the Category row and shows no goal picker; cash leaves (`[txn_record, balance_apply_delta]`, no `bucket_saved_change`), the toast reads `"−$300.00 · Savings · — · Tap to undo"` — the em-dash is literally where the goal name should be. Crediting machinery *works* (proven by round-up → China Holiday and the plan-tick path), so this is an omission to propagate, not missing capability.
- **Why it matters:** "A save that goes nowhere is worse than an error." The user believes $300 is earmarked when it isn't.
- **Impact:** High · **Effort:** M · **Where:** `index.html` Quick Log modal savings branch; `flows.json` savings step 4 (gap). **Already SLY-1 (P0).** Listed for completeness — the propagatable fix is the round-up "→ <named destination>" pattern.
- **Category:** bug

### 1.6 Bill undo silently no-ops for pre-payday bills (writer-key ≠ reader-key)
- **What:** `markPaid` cycle-bumps a day<payday bill → writes key `2026-6-Phone Plan-10` (`:25192`); both `undoBillPaid()` (`:8809-8812`) and `unmarkBillFromCal` read `paidBillKey(name, day)` = current month `2026-5-Phone Plan-10` → `unmark` returns not-paid → no-op. Bill stuck paid, cash unrecovered. Affects the entire day<payday cohort. Auditor *upgraded* this from candidate to confirmed.
- **Why it matters:** An undo that doesn't undo on a money app is a trust-breaker; the user can't tell their correction took (and visually nothing changes — see 3.x feedback gap).
- **Impact:** High · **Effort:** S-M · **Where:** `index.html:8809-8812`, `:25184-25192`, `:25448`. **Already SLY-2 (P0).**
- **Category:** bug

### 1.7 Boot TDZ — first-paint financial model falls back to a stub
- **What:** 15 identical `pageErrors` at boot: `Cannot access 'BRAIN' before initialization` at `isPaid` `index.html:4512` → `getBillsDue` falls back to `isThisMonthlyBillPaid`; same class hits `getLiveBal` (`:3644`) via `getGenuineSurplus` during early autoSnapshot. Heals post-boot (every later probe returned real values) so it's boot-order noise, not a runtime functional bug.
- **Why it matters:** First paint can render off a stub model; it's a "cleanup ticket, not a P0" (auditor) but it pollutes every walk's error log and is a latent first-paint-wrong-number risk. Also the PIN gate (3.x) lives in this boot path.
- **Impact:** Med · **Effort:** M · **Where:** `index.html:4511-4517`, `:3644`; `flows.json` nav steps 3-4. **Already SLY-29.**
- **Category:** bug

### 1.8 Living per-day rate couples to bill payment (projection card untrustworthy)
- **What:** Walk caught "Living · $60.00/day × 6 days = $360" becoming "$10.00/day × 6 days = $60" after paying a $50 phone bill. Paying a bill should not change the *living per-day rate*. NEW CANDIDATE from ux-recs §F — not yet promoted.
- **Why it matters:** Looks like a math-coupling bug bleeding into the projection; makes the forecast card untrustworthy. Likely related to OPEN-BUGS #54's "daily living" two-store divergence (`dailyLivingFloor` vs `weekdayBudget`/`weekendBudget`).
- **Impact:** Med · **Effort:** M · **Where:** `index.html` projection/living tile; `getThisWeekProjection`; OPEN-BUGS #54. **Not ticketed** — needs a focused walk then a ticket.
- **Category:** bug

### 1.9 Plan over-allocation: surplus silently changes between read and act
- **What:** Locking a single $300 Darwin allocation flips the pool to "−$58 over-allocated" AND the surplus the user reasoned with changed mid-flow ($1,141 → $841 between step-03 and step-06). ux-recs §D HIGH — "never let the displayed pool silently change value between when the user reads it and acts on it."
- **Why it matters:** The user did the right thing (saved) and got a red warning + moved goalposts — anxiety-inducing for a coaching app, and a correctness question (is the recompute correct?).
- **Impact:** Med · **Effort:** M · **Where:** Payday Plan savings sub-screen; `flows.json` plan; overlaps SLY-5 but is a distinct math/UX finding. **Not separately ticketed.**
- **Category:** bug

### 1.10 `bill_mark_paid` fires twice per pay — confirm dual-store vs double-write
- **What:** Walk lands show `bill_mark_paid/pay-bill-now` + `bill_mark_paid/auto-detect` both firing on a single pay. NEW CANDIDATE (coverage-map) — needs confirmation it's an intentional dual-store mirror, not a double write.
- **Why it matters:** If it's a true double-write it could corrupt paid-state or the audit count; cheap to confirm now while the trace is fresh.
- **Impact:** Med · **Effort:** S · **Where:** `BRAIN.bills.markPaid` + auto-detect path. **Not ticketed.**
- **Category:** bug (investigation)

---

## Theme 2 — slyght app: features

### 2.1 Debts: no partial pay-down (full-clear only) + card/canvas total drift
- **What:** Debts surface supports only marking a debt fully paid; no partial pay-down. Headline total can disagree with the Payday canvas (`flows.json` debts step 3 gap), and a whittled-down ($0-ish) debt has no archive affordance (step 9). This is FR-07 / INV-11 / INV-18.
- **Why it matters:** Real debts get paid down incrementally (the KIA loan, Mum/Michael). Full-clear-only forces wrong data; the total drift means two surfaces disagree on what John owes.
- **Impact:** High · **Effort:** M · **Where:** Debts sub-screen + canvas; `flows.json` debts. **Already SLY-27 (P1).** The "$0 debt → archive button → preserve history" pattern (memory: debt archive pattern, r70 auto-detect) is the queued design.
- **Category:** feature

### 2.2 Savings goal-picker as a reusable component everywhere money has a destination
- **What:** The Payday-Plan savings sub-screen is the canonical, premium allocation UI (goal cards, progress bars, lifetime-vs-this-cycle in plain English). Quick-Log Savings lacks it entirely (1.5). Round-up has a mini "→ China Holiday" version.
- **Why it matters:** ux-recs §D: "make this the canonical savings-allocation UI everywhere." One destination-picker component, reused, closes the Savings silent-loss bug AND prevents the next omission.
- **Impact:** Med · **Effort:** M · **Where:** extract from Payday-Plan savings sub-screen; consume in Quick Log + any future allocate path.
- **Category:** feature/task

### 2.3 State-changing actions need a universal undo + visible-confirmation pattern
- **What:** Quick-Log toasts have "Tap to undo"; bill-pay toast does NOT (ux-recs §F MED); lock/unlock has no feedback at all (§E). There's no consistent "every reversible money action gets one-tap undo + a visible state change" contract.
- **Why it matters:** Marking a bill paid is reversible and error-prone (wrong bill/amount) — it deserves the same undo as a spend log. This is a feature-level consistency contract, not a one-off fix.
- **Impact:** Med · **Effort:** M · **Where:** toast/undo system used by Quick Log; apply to bill-pay, lock, override. Overlaps SLY-5.
- **Category:** feature

### 2.4 Bonus visibility decision needs a real home (currently wontfix-at-lever)
- **What:** `S.activePlan.income.bonus = {amount:1341, included:false}` is in state and already landed in `S.bal` (the $8,623 payslip). Dashboard never surfaces it. The lever attempt was caught as a double-count (OPEN-BUGS #55); John chose "remove the question" for now but option (c) — sweep bonus into a dedicated bucket on landing — is deferred to a UI redesign.
- **Why it matters:** It's a latent double-count trap every time someone tries to "surface the bonus." A clean architectural answer (bucket-on-landing) removes the trap permanently.
- **Impact:** Low-Med · **Effort:** M · **Where:** `S.activePlan.income.bonus`; OPEN-BUGS #55.
- **Category:** feature (deferred design)

### 2.5 Migration auto-deletes have no user-visible surfacing or recovery
- **What:** `_billsCleanedV1` (`:1271`) and `seedV16` GHOST_NAMES (`:7000`) silently remove BILLS via hardcoded name lists; John's 5 "missing bills" were largely these cleanups. No toast, no undo, no audit `MIGRATION` action.
- **Why it matters:** A user who wanted to keep one of those bills has no recovery path and may not know it was removed. Pattern hardening for ALL future migrations: a "Cleaned up N bills" toast + undo, mirroring `showUndoToast`.
- **Impact:** Med · **Effort:** S-M · **Where:** `index.html:1271`, `:7000-7008`; OPEN-BUGS #32. **Already SLY-19 (tracked).**
- **Category:** task

---

## Theme 3 — slyght app: UX

### 3.1 Monospace + multi-colour math lines read as "debug output" (cumulative HIGH)
- **What:** The hero sub-line (`$4,800 − $2,154 bills − $600 living = $2,046`), the Savings pool breakdown, and the canvas "WHERE THE $5,000 SITS NOW" line all use typewriter monospace + red/orange/pink colour-coding. On a dark hero this reads as code, not a premium money summary.
- **Why it matters:** These lines are the *justification* for the headline numbers; they must feel as trustworthy as the number they explain (ux-recs §A, §D, §E + cross-cutting #1). App-wide pattern.
- **Impact:** Med (cumulative High) · **Effort:** S-M · **Where:** hero sub-line, plan pool breakdown, canvas reconciliation line. **Partly SLY-6.**
- **Category:** task

### 3.2 Grey-on-grey / grey-on-pink on *information* (not decoration)
- **What:** Calendar bill amounts ($259/$50/$15 grey on pale-pink — the day numbers are darker than the amounts, inverting priority), the canvas reconciliation line (faint grey on light-grey), and hero affordance hints ("tap for full picture" near-invisible in daylight). slyght's own rule says faint grey is for decoration ONLY.
- **Why it matters:** The amount is what John scans the calendar for — it's the payload, currently at decoration contrast. Violates INV-26-adjacent legibility and the project's own contrast memory.
- **Impact:** Med · **Effort:** S · **Where:** calendar cells, canvas, hero hints. **Partly SLY-6.**
- **Category:** task

### 3.3 Malformed glyph `$#0` in the canvas reconciliation line
- **What:** The "WHERE THE $5,000 SITS NOW" box renders `$ #0 + $4,158 + $662 + $5,000 ✓` — a leading `$#0` is malformed.
- **Why it matters:** A money reconciliation line ("does it add up?") showing a garbage token undermines the exact thing it's meant to prove. Small, isolated, high-visibility.
- **Impact:** Low · **Effort:** S · **Where:** canvas reconciliation render; ux-recs §E. **Not separately ticketed.**
- **Category:** bug

### 3.4 Horizontally-scrolling chip rows clip their last option with no peek/fade
- **What:** Quick-Log Category row clips a third chip ("Sho…" = Shopping) and the Type row clips a 4th ("T…" = Transfer) with no fade/chevron — a discoverability trap; users may not know the row scrolls.
- **Why it matters:** Users miss whole options (and Transfer is a money-moving type). Cheap affordance fix (fade/chevron/wrap).
- **Impact:** Low-Med · **Effort:** S · **Where:** Quick Log modal chip rows; ux-recs §B/cross-cutting #5. **Not ticketed.**
- **Category:** bug

### 3.5 AI activation gate: huge single-line key in a document-box + competing chat composer
- **What:** The Anthropic key (one line) gets a ~700px-tall textarea; and a chat composer is visible *below* the activation gate so the user can type into an inactive AI — ambiguous on/off state.
- **Why it matters:** Looks unfinished for the surface that asks for a secret; the trust line "stored locally on this device only" is good but in faint grey. Small polish that materially improves the AI on-ramp.
- **Impact:** Low · **Effort:** S · **Where:** AI activation screen; ux-recs §G. **Not ticketed** (SLY-3 is the prompt bug, not the gate UX).
- **Category:** task

### 3.6 Toast text clips at viewport edge mid-word
- **What:** The expense aftermath toast "…Test Cafe — flat white · $0.50 round-up" runs to the screen edge with no padding and clips mid-word.
- **Why it matters:** Premium toasts fit, wrap, or ellipsis intentionally — they don't clip at the boundary. Affects every long transaction toast.
- **Impact:** Low · **Effort:** S · **Where:** toast component; ux-recs §C. **Not ticketed.**
- **Category:** bug

---

## Theme 4 — the Jarvis tool itself

### 4.1 "Confirmed live" status can't actually be *earned* — no walker→Jarvis evidence bridge
- **What:** `setStatus` (server.js `:146`) correctly *requires* evidence text for `ConfirmedLive`, but the only way to supply it is `window.prompt('…paste the walk evidence')` (jarvis.js `:430`). There is no automated path from a walker run (`/api/walk-latest`, the `lands`/`probe` ground truth) into the ticket as confirmation evidence. The brief's defining promise — "Confirmed live = earned when a walk actually confirms it, with evidence attached, NOT a text box John types" — is currently exactly a text box John types.
- **Why it matters:** This is the headline feature of the status workflow and it's半-built: the gate exists, the *earning* doesn't. A `confirmFromWalk(id, flow)` action that reads the latest walk's lands for the linked flow and attaches them would close it.
- **Impact:** High · **Effort:** M · **Where:** `server.js` ACTIONS (new `confirmFromWalk`); `jarvis.js:426-439`; `latestWalk()` already exists in server.js.
- **Category:** feature

### 4.2 "Get Jarvis's take" / "Go deeper" are manual copy-paste, not a loop
- **What:** `jarvisTake()` (jarvis.js `:558`) builds a prompt, John copies it, gets a take *elsewhere*, pastes the reply back as a "jarvis" comment. The brief frames Jarvis as holding the conversation; in practice it's a clipboard relay. Comment header even says "no always-on LLM, no key."
- **Why it matters:** The core loop's "Discuss with Jarvis" step is the heart of the platform per the brief, and it's the highest-friction part. Even a server-side action that shells one Claude call (key from env, localhost-only) would make the thread a real conversation. (Decision-gated — adds an outbound network call; needs John's sign-off vs the "no key" security stance.)
- **Impact:** High · **Effort:** M · **Where:** `jarvis.js:558-578`; would need a new allowlisted action + SECURITY.md reconciliation.
- **Category:** feature

### 4.3 CC has no UI to post results back — `postResult` exists server-side, no front door
- **What:** `postResult` is a fully-built allowlisted action (server.js `:216`, with OPEN-BUGS propagation) but jarvis.js has **no caller** — there's no button or flow for CC to post findings into a ticket. The loop's step 6 ("CC posts back") is only reachable by hand-crafting an `/api/action` POST.
- **Why it matters:** The whole point is the loop closing on the ticket. Right now CC closing the loop requires curl, not the platform. A "CC post-back" affordance (or a documented kickoff that tells CC the exact action shape) completes the loop the brief specifies.
- **Impact:** High · **Effort:** S-M · **Where:** `server.js:216-237` (built); `jarvis.js` (missing UI / no helper).
- **Category:** feature

### 4.4 Token lives in page source — survives view-source, no session expiry
- **What:** `TOKEN` is injected into the served HTML (`server.js:346`, `window.MC_TOKEN`). It's fresh-per-start and localhost+origin-locked (good), but it's readable in view-source of the page and never rotates within a session. The page has zero auth of its own (`grep` for prompt/password/login = 0).
- **Why it matters:** Defense-in-depth: anyone with read access to the running machine's browser/devtools (or a local malware process able to read the page) gets the write token for the session. Low real-world risk for a single-user localhost tool, but worth an explicit note in SECURITY.md and consideration of a short rotation / per-action nonce if Jarvis ever broadens.
- **Impact:** Low · **Effort:** S · **Where:** `server.js:32,346`; `mission-control/SECURITY.md` rule 4.
- **Category:** task (governance)

### 4.5 Calendar & Planning are honest stubs — no ticket actually carries a date or bundle
- **What:** The Calendar view is fully built but `ticketDate(t)` always returns null (no ticket has `target`/`due`) so it shows "No scheduled items yet" forever (jarvis.js `:1025-1042`). Planning's Releases lane is empty because the model has no `bundle` field; `planGroupRelease()` is a modal that explains it can't group yet (`:1155`).
- **Why it matters:** Two whole nav views are placeholders pending two small model additions (`target`/`due` on ticket-state, `bundle` on the ticket). The brief calls calendar/planning a core mechanic. Adding the fields + a "set target date" / "group into release" write action lights both up.
- **Impact:** Med · **Effort:** M · **Where:** `jarvis.js:1016-1168`; ticket model in `tickets.json`/`ticket-state.json`; new allowlisted actions.
- **Category:** feature

### 4.6 No metrics / aging / throughput anywhere in the cockpit
- **What:** The Overview shows counts (tickets, needs-judgment, in-flight, P0, shipped, gaps) but nothing time-based: no "open N days" aging histogram, no cycle-time (Open→Shipped), no throughput trend, no "oldest untouched ticket." All 29 tickets are currently `Open` with empty threads — there's no signal surfacing that *nothing has moved*.
- **Why it matters:** A PM cockpit's job is to make a flood manageable; without aging/flow metrics, a stale ticket is invisible. The brief explicitly asks for "Age + metadata everywhere." `state.opened`/`lastActivity` already exist — the data is there, the view isn't.
- **Impact:** Med · **Effort:** M · **Where:** `jarvis.js` viewOverview (`:33`); data already in ticket-state.
- **Category:** feature

### 4.7 Relationship hints exist in the model but aren't auto-suggested
- **What:** Tickets render `links` if present (jarvis.js `:518`), but nothing *suggests* links — e.g. SLY-12/13/17 are all the same filter-scatter root, SLY-7 relates to SLY-5's lock surface, SLY-29 (boot TDZ) and the walk's 15 boot pageErrors are the same thing. The brief wants "this bug may be covered by #21" bubbles.
- **Why it matters:** Duplicate/related tickets are the main way a board rots. Auto-suggesting links by shared `group`/surface or shared OPEN-BUGS number is cheap (the data's all loaded client-side) and directly serves the brief.
- **Impact:** Med · **Effort:** M · **Where:** `jarvis.js` viewTicket sidebar; link inference over `J.tickets`.
- **Category:** feature

### 4.8 Board bulk-select is wired but does nothing
- **What:** `bd2ToggleSelect` + `BD2_SELECTED` set exist (jarvis.js `:382,:444`) with the comment "UI only — ready for future bulk ops," but there's no bulk action (bulk status change, bulk-group-into-release, bulk-link).
- **Why it matters:** With 29 tickets all Open, the first real PM action is triage in bulk. The selection scaffold is already there — the action layer is the missing half.
- **Impact:** Low-Med · **Effort:** S-M · **Where:** `jarvis.js:382,444`.
- **Category:** feature

### 4.9 Generated ticket spine can't be regenerated safely against live state edits
- **What:** `tickets.json` is the read-only generated spine; `ticket-state.json` holds mutable state; deletes of spine tickets are *tombstoned* (server.js `:187`). But there's no documented/automated regen of `tickets.json` from a fresh walk — if a new walk batch lands, re-running the generator risks id collisions with manual tickets (`createTicket` computes next id across both, but a regen of the spine doesn't reconcile tombstones/threads).
- **Why it matters:** The walk-and-judge campaign is meant to fan out to 202 actions; each new batch should mint tickets without clobbering threads/alignment on existing ones. The regen contract needs to be explicit (idempotent, thread-preserving) before the fleet scales.
- **Impact:** Med · **Effort:** M · **Where:** the (unread) `scripts/mc/build-*` generators + `server.js` merge logic `:282`.
- **Category:** task

---

## Theme 5 — QA / walk-and-judge process

### 5.1 Walk coverage is 6 of ~202 actions — the fleet was proven but never fanned out
- **What:** coverage-map: 6 flows walked, layers A/B/C proven, "FULL FRAME ~27 surfaces · 202 actions," 13 walk specs authored in `specs/` but the remaining surfaces are all ⊘ NOT-COVERED. The scaled plan's step (c) "fan out the checkpointed 202-action fleet" hasn't run.
- **Why it matters:** The whole brief is "stop depending on John's eyes for QA." Six flows is a proof, not coverage. Until the fleet runs, every untraced surface is John's eyes again. The infrastructure (checkpointing, gzip, auditor tier, UX tier) is already proven — this is execution, not invention.
- **Impact:** High · **Effort:** L · **Where:** `scripts/walker/run-walk.js`, `specs/01-13`, `flows.json`.
- **Category:** task

### 5.2 AI prompt never captured as literal text — route-intercept technique not added to fleet
- **What:** The AI chat surface was NOT REACHED (`apiKey:""` → activation screen). The #1 finding stands on code-read + probe, but the *literal assembled prompt string* ("$60/day", "June 7-15", "$9,000", no disclaimer) was never captured. coverage-map names the fix: a Playwright route-intercept on `api.anthropic.com` that captures the `system` string without spending tokens or needing a real key.
- **Why it matters:** It's the definitive, free, repeatable evidence for SLY-3 and a reusable fleet technique for any future AI-surface walk. Named as explicit next step (a).
- **Impact:** Med · **Effort:** S-M · **Where:** `scripts/walker/run-walk.js` (add route-intercept); ai-provenance flow.
- **Category:** task

### 5.3 Walker doesn't wait for counter-roll to settle → false render-drift findings
- **What:** The hero "drift" (1.1) may be the walker screenshotting mid-rAF-tween because its CSS freeze doesn't stop JS counter animations. coverage-map next-step (b): "wait for the counter to settle before screenshotting." Until fixed, the walker can't distinguish a real double-apply from an animation artifact.
- **Why it matters:** A QA tool that produces false positives erodes trust in the tool itself; and right now it's blocking the root-cause call on the most trust-corrosive app bug (1.1 / SLY-4).
- **Impact:** Med · **Effort:** S · **Where:** `scripts/walker/run-walk.js` screenshot step.
- **Category:** task

### 5.4 Plan-lock legacy/2nd unlock path never walked (3-store divergence stays a candidate)
- **What:** The walker drove only the canonical `BRAIN.plan.unlock` (clean). The memory'd 3-store lock divergence (`S.activePlan.lockedAt` + `BRAIN.allocation` localStorage + legacy bool) lives on a *second* legacy/UI unlock path that was ⊘ not walked. Auditor explicitly refused to clear the whole surface.
- **Why it matters:** ADR Bundle 32.7 is drafted but the divergence is a prerequisite for INV-29; leaving the second path unwalked means the lock surface is only half-verified. SLY-7 tracks "only canonical proven clean."
- **Impact:** Med · **Effort:** S-M · **Where:** plan-lock flow; `flows.json` plan step 6.
- **Category:** task

### 5.5 fullPage screenshot truncation caps capture at viewport height (silent under-coverage)
- **What:** Playwright `fullPage:true` caps at the 412×915 viewport because body `scrollHeight` reports 915 even when content extends further — the Settings Math Health panel (y=2980) and a Bills NRMA addition were both invisible to capture. OPEN-BUGS #33, priority-upgraded.
- **Why it matters:** "If intentional changes are invisible, unintentional regressions in the same areas are also invisible." Layer V's coverage is narrower than the file count implies — silent false negatives.
- **Impact:** Med · **Effort:** M · **Where:** capture method; switch to scroll-and-stitch or remove the height constraint for test runs. **Already SLY-20 (tracked).**
- **Category:** bug

### 5.6 Render-coherence (Layer 2) invariants still unbuilt — semantic drift ships invisibly
- **What:** Layer V catches pixel drift; nothing catches *semantic* drift (three cards saying contradictory things shipped to John's phone for hours — Mission E). Proposed Layer-2 DOM-coherence invariants (`mode-classifier-coherent`, `magnitude-coherent`, `label-matches-math`) are still queued. OPEN-BUGS #35, plus #34 (mode-classifier calibration) and #36/#37 (AI-vision + interaction layers).
- **Why it matters:** This is the missing guard for the entire cross-tile-coherence bug class (1.3). Pixels were stable; semantics were broken — no current layer catches that.
- **Impact:** Med · **Effort:** M · **Where:** `guardian` / MathInvariants registry; OPEN-BUGS #34/#35/#36/#37. **Tracked as SLY-21/22/23.**
- **Category:** task

---

## Theme 6 — CC / process improvements

### 6.1 No automated build/CI — gates run only when CC remembers to run them
- **What:** CLAUDE.md §0 confirms no build step; gates (`npm run guardian`, `npm run smoke`, conservation, §8) are run manually by CC per the pipeline. OPEN-BUGS #30 documents a real false-clean: Mission EXPORT reported "all gates green" while `guardian-static` was exiting 1 (a `tail` pipe masked the exit code). The catch was *retrospective* (a later mission's fresh gate run), not preventive.
- **Why it matters:** "Gate green" must mean gate green. A pre-push / pre-commit hook (or a tiny CI on push to a branch) that captures per-gate exit codes makes false-clean structurally impossible. The pipeline's rigor depends on the gates being trustworthy.
- **Impact:** High · **Effort:** M · **Where:** git hooks / a CI workflow; OPEN-BUGS #30. **Tracked as SLY-17.**
- **Category:** process

### 6.2 Three parallel backlogs never fully deduped into one canonical ledger
- **What:** CLAUDE.md §5 names the problem: "Three parallel ledgers (Phase 1A items, Phase 1B Run 2 findings, OPEN-BUGS) need de-duplication into one canonical backlog before feature work" (Bundle 32b). Now there's a *fourth* (the 29 SLY tickets) and a *fifth* (this doc). OPEN-BUGS itself has merged/superseded chains (#9→#8, #12→#17).
- **Why it matters:** Jarvis was meant to BE the canonical backlog. Until OPEN-BUGS ↔ flows.json ↔ SLY tickets are reconciled (one source of truth, the rest pointers), triage happens against stale/duplicate views. The `postResult` OPEN-BUGS propagation is the start of the bridge but it's one-directional.
- **Impact:** High · **Effort:** M · **Where:** reconcile OPEN-BUGS ↔ `tickets.json` ↔ `flows.json`; Bundle 32b scope.
- **Category:** process

### 6.3 "Investigate-before-coding" and "Ledger Walk Step 0" are doc rules, not enforced
- **What:** The pipeline's load-bearing tiers (Step 0 fresh-state ledger walk; Conformance-before-Build; investigate-before-coding for non-trivial fixes) live in PIPELINE.md + CLAUDE.md §8 prose. They've each caught real misdiagnoses (the −$1,116 false-catastrophic; Bundle 31 Items 4/8/16). But nothing *prevents* a session from skipping them.
- **Why it matters:** "A future session that doesn't know WHY will streamline a tier back out." A lightweight session-start checklist artifact (even a printed gate in the morning surface) makes the discipline visible and auditable rather than memory-dependent.
- **Impact:** Med · **Effort:** S · **Where:** PIPELINE.md session bring-up; a checklist template (like `docs/stop-gate-template.md` already exists).
- **Category:** process

### 6.4 Single-file index.html has no shared-helper extraction path; tests copy-paste canonical logic
- **What:** `tests/core.test.js` copy-pastes canonical helper bodies (`daysLeft`, `isThisMonthlyBillPaid`, `getBillsDue`, etc.) verbatim from index.html; a production refactor can silently drift from the test copy (OPEN-BUGS #10, demonstrated with `paidBillKey`). The architectural fix (a `lib/` ES module both import) collides with the deliberate single-file no-build architecture.
- **Why it matters:** It's a real correctness gap (tests can pass against drifted logic) AND a genuine tension with the architecture — worth a decision, not a silent defer. A guardian rule that *detects* copy-pasted helper bodies in tests is a cheaper middle path.
- **Impact:** Med · **Effort:** M · **Where:** `tests/core.test.js:117-530`; OPEN-BUGS #10. **Tracked as SLY-24.**
- **Category:** process/task

### 6.5 ARCHITECTURE.md / FEATURE-MAP migration is half-done (v1 tables vs v2 schema)
- **What:** FEATURE-MAP's migration table shows most surfaces still ⏳ planned for v2 backfill (Bills, Analysis, Settings, Onboarding all pending); only Diagnostic surfaces are ✅. Legacy v1 table entries "remain authoritative until migrated." CLAUDE.md §15: ">1 hour to understand the codebase = FEATURE-MAP needs work."
- **Why it matters:** The walk-and-judge campaign now produces structured per-surface flow data (`flows.json`) that *is* effectively the generated FEATURE-MAP the master brief wanted ("makes FEATURE-MAP.md true — generated, not hand-drawn"). The two should converge; maintaining both by hand is drift waiting to happen.
- **Impact:** Med · **Effort:** M · **Where:** FEATURE-MAP.md migration table; reconcile with `flows.json`.
- **Category:** process

---

## Theme 7 — security & governance

### 7.1 Worker is still Pre-Phase-A: no auth, no device identity, CORS-only
- **What:** SECURITY.md (2026-05-20): worker accepts `/sync` + read endpoints with "No authentication. No device identity. No encryption at rest. No rate limiting. No audit log." The doc itself states "CORS is theater for server-to-server attackers" and the worker URL is in client JS. Phase A (device tokens) is committed-next but not shipped; ADR-bundle-32-phase-a-device-tokens exists.
- **Why it matters:** The threat model rates debt records "Very high — names individuals (Mum, Michael) and amounts." Any unauthenticated reachable endpoint is in scope for opportunistic scanners. The apiKey leak (#56) already happened once (sk-ant-* in KV plaintext ~72h). Phase A is the single biggest governance gap.
- **Impact:** High · **Effort:** L · **Where:** Cloudflare Worker + KV; SECURITY.md Phase A; ADR-bundle-32-phase-a-device-tokens.
- **Category:** task (security)

### 7.2 No regression guard against re-leaking secrets to KV
- **What:** #56 was fixed with a `NEVER_SYNC` deny-list mirroring `buildFullExport` + a 500kB cap (commit 7a1d5a8). But there are now *two* redaction lists (`buildFullExport` for export, `NEVER_SYNC` for push) that must stay in sync, and the guardian rule for export-strips-secrets has already drifted once (#30 — the rule scanned the wrong function after a refactor).
- **Why it matters:** A secret-leak is the highest-cost failure in the threat model and it's guarded by two hand-maintained lists + one fixable static rule. A single canonical redaction source + a smoke that asserts no `sk-`/`apiKey`/`chatHistory` survives a round-trip push would make re-leak structurally hard.
- **Impact:** High · **Effort:** M · **Where:** `buildFullExport` + `PUSH.pushFullState` NEVER_SYNC; guardian rule; OPEN-BUGS #30/#56.
- **Category:** task (security)

### 7.3 PIN gate is orphaned — a set PIN does not lock the app
- **What:** `flows.json` nav step 6: "PIN gate SHOULD check here — but is never reached" (dead). A user can set a PIN and the app never enforces it at boot. Tied to the boot TDZ (the gate lives in the boot path that falls back to a stub).
- **Why it matters:** Device compromise / lost device is adversary #4/#5 in the threat model; a PIN the user believes is protecting their finances but that does nothing is worse than no PIN (false sense of security). **Already SLY-28 (P1).**
- **Impact:** High · **Effort:** M · **Where:** boot/nav path; `flows.json` nav. SLY-28.
- **Category:** bug (security)

### 7.4 Reset is unrecoverable — the undo backup is deleted by the reset itself
- **What:** `flows.json` settings: Stage-3 reset's 3-second countdown + undo backup (step 10 broken), and the Restore path is dead (step 12). The undo backup the reset creates is wiped by the reset.
- **Why it matters:** Reset is the most destructive user action; an undo that the action destroys is a data-loss trap. Pairs with the save() race memory (write+reload must be same tick). **Already SLY-26 (P0).**
- **Impact:** High · **Effort:** M · **Where:** Settings reset flow; `flows.json` settings steps 9-12. SLY-26.
- **Category:** bug

### 7.5 No rate limiting / abuse logging on the worker
- **What:** SECURITY.md: "No rate limiting. No audit log" on the worker. Combined with a public URL in client JS, a scanner that finds `/pull-full-state` or `/sync` has unbounded request budget.
- **Why it matters:** Even pre-Phase-A, a minimal request log + a coarse rate limit raises the cost of probing and gives forensic signal if KV is touched. Cheap relative to full auth; complements Phase A.
- **Impact:** Med · **Effort:** S-M · **Where:** Cloudflare Worker; SECURITY.md.
- **Category:** task (security)

---

## Theme 8 — data & metrics

### 8.1 No data-lifecycle (hot/warm/cold), aggregation, or eviction safety
- **What:** Memory (data-lifecycle architecture): 5 architectural gaps — no aggregation, no hot/warm/cold tiering, snapshot cap (250) can evict, no virtualization, static Settings list. `S.txns` grows unbounded (212+ txns and climbing); the push blob is already 136KB (gzip→22KB) bumping the 64KB keepalive cap.
- **Why it matters:** The app's storage/transmission cost grows linearly with use; the snapshot eviction can silently lose pre-migration safety nets. Bundles 19-22 were the roadmap to close this; it's still open and now compounded by the cloud-sync plan (Bundle 23).
- **Impact:** Med · **Effort:** L · **Where:** `S.txns`, SNAPSHOTS ring (`index.html:15992`), `monthlyHistory`; ARCHITECTURE.md.
- **Category:** task

### 8.2 monthlyHistory has one legacy entry with no `liquidNet` — NW trend can't compute
- **What:** OPEN-BUGS #13: `monthlyHistory` has ONE entry (April, `bal:$569.50`, no `liquidNet`, schemaVersion legacy). The NW-trend render falls through to "Building monthly history"; the old +$90,739 nonsense is mitigated by an `isPlausible` cap but the surface only self-resolves at the next month-rollover (2026-06-01).
- **Why it matters:** A core metric (net-worth trend) is non-functional until a single rollover produces a schema-v2 entry, and the spec-08 walk still lists "NW trend off by orders" as a candidate to verify. It's a data-shape gap, not just a render bug.
- **Impact:** Med · **Effort:** S-M · **Where:** `monthlyHistory` schema; `index.html:5462-5480`; OPEN-BUGS #13, spec 08. Overlaps 1.2.
- **Category:** task

### 8.3 Two parallel audit logs (`AUDITOR.log` + `S._auditLog`) never unified
- **What:** FEATURE-MAP: AUDITOR (`index.html:15786`, 17 call sites, own localStorage key) predates BRAIN and runs parallel to `BRAIN.audit` (`S._auditLog`). Bundle 30 added a `BUNDLE-30-AUDITOR-SHIM` that dual-logs; the merge ADR ("migrate AUDITOR into BRAIN.audit tiered") is a named Bundle-31+ candidate that hasn't landed.
- **Why it matters:** Two forensic logs of different shape = the Activity Log view has to merge them (it does, 1.A.7) and every new writer must remember the shim. INV-22/INV-23 (every writer appends, append-only) are harder to verify across two logs. Consolidation removes the shim and a whole class of "did this writer log to both?" questions.
- **Impact:** Med · **Effort:** M · **Where:** `index.html:15786-15852` (AUDITOR), `BRAIN.audit`; grep `BUNDLE-30-AUDITOR-SHIM`.
- **Category:** task

### 8.4 MathInvariants registry not bridged to FINANCIAL-INVARIANTS namespace
- **What:** FEATURE-MAP: the runtime MathInvariants registry (16 entries, `index.html:4593`) uses registry-internal names (`state-shape-balance`, `paidbills-key-not-future`) that are NOT mapped to the `INV-NN` ids in FINANCIAL-INVARIANTS.md (the spec). The bridge is a named Bundle-31+ candidate.
- **Why it matters:** CLAUDE.md §6 ("every fix cites which INV it preserves") is undermined when the runtime checks and the spec use different vocabularies — you can't mechanically prove which spec invariant a runtime check enforces. Also several INV-NN (e.g. INV-24/25/26 UI invariants) have no runtime check at all.
- **Impact:** Med · **Effort:** M · **Where:** `index.html:4593` MathInvariants; FINANCIAL-INVARIANTS.md.
- **Category:** task

### 8.5 FINANCIAL-INVARIANTS has 5 unresolved policy decisions blocking specs
- **What:** The "Pending decisions" block at the end of FINANCIAL-INVARIANTS.md is untouched since the 2026-05-18 draft (per CLAUDE.md §5 "Awaiting John's approval"): negative-balance refusal vs warn, bucket overdraw policy, plan-lock semantics (can essentials tick while locked?), FX-fee as line vs metadata, round-up timing (immediate vs batch).
- **Why it matters:** These are policy/values calls only John can make (the Human-Verdict decision-gate), and each one gates a real invariant + its spec. They block clean answers to live bugs: 1.9 (over-allocation) needs the bucket-overdraw policy; the plan-lock walk (5.4) needs the lock-semantics call; INV-27 (negative refusal) is partly built but the policy isn't signed off.
- **Impact:** Med (unblocks several) · **Effort:** S (decision, not code) · **Where:** FINANCIAL-INVARIANTS.md pending block.
- **Category:** process/governance

---

## Appendix — how this maps to existing tickets (dedupe guard)

- **Already ticketed (don't re-file, listed for context):** 1.1→SLY-4, 1.2 needs a NEW Analysis ticket (currently `tk:-`), 1.4→SLY-3, 1.5→SLY-1, 1.6→SLY-2, 1.7→SLY-29, 2.1→SLY-27, 2.5→SLY-19, 3.1/3.2→SLY-6 (partial), 5.5→SLY-20, 5.6→SLY-21/22/23, 6.1→SLY-17, 6.4→SLY-24, 7.3→SLY-28, 7.4→SLY-26. Cross-tile bugs are SLY-10/11/12/13 (tracked) but **lack a single root-cleanup ticket** (1.3 / 6.2).
- **NOT yet ticketed (net-new candidates this explorer surfaced):** 1.2 (Analysis surface ticket), 1.3 (filter-scatter root-cleanup binder), 1.8 (living-rate coupling), 1.9 (over-allocation surplus drift), 1.10 (double bill_mark_paid), 2.2 (reusable goal-picker), 2.3 (universal undo contract), 3.3 (`$#0` glyph), 3.4 (chip clip), 3.5 (AI gate UX), 3.6 (toast clip), all of Theme 4 (Jarvis 4.1-4.9), 5.1-5.4 (fleet fan-out, route-intercept, counter-settle, legacy unlock walk), 6.2/6.3/6.5 (process), 7.1/7.2/7.5 (security), 8.1/8.3/8.4/8.5 (data/governance).
- **Highest-leverage net-new:** 4.1 (earn ConfirmedLive from walks), 4.3 (CC post-back UI — server side already built), 5.1 (fan out the fleet), 6.2 (one canonical backlog), 7.1/7.2 (Phase-A + secret-leak guard).

---

*Explorer pass complete. 36 opportunities across 8 themes, grounded in files read 2026-05-27. No code was edited.*
