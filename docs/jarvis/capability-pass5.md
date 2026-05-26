# Jarvis — Capability & Gap Assessment (Pass 5)

> **Date:** 2026-05-27 · Grounded in the actual code (`mission-control/jarvis.js` 3152 lines,
> `server.js` 778 lines, `mission-control.html`, `jarvis.css`) and live state
> (`ticket-state.json`, `snapshots.json`, `history.jsonl`, `flows.json`) as read on 2026-05-27.
> No code was edited. Where this differs from `strategy-2026-05-27.md`, the code is ahead of the
> doc — several "spec-only / not yet integrated" items in the strategy are now **shipped and wired**.

---

## 0. The honest baseline (what the code actually shows, vs the strategy doc)

The strategy doc (same date) describes a 1214-line `jarvis.js` with Insights/Knowledge/Command Deck
as "designed but NOT yet integrated." **That is stale.** The live `jarvis.js` is **3152 lines** and
every one of those surfaces is integrated and routed. The real baseline is materially further along:

- **Dispatch-to-CC is real and shipped** (`server.js:331` `dispatchCC`, `jarvis.js:780` `dispatchToCC`):
  spawns a genuine headless `claude` drone, no-shell, prompt via STDIN, `--model sonnet --max-turns 40
  --max-budget-usd 1.5 --permission-mode plan|acceptEdits`, `git push` disallowed at the tool layer,
  typed-"dispatch" confirm, single-flight per ticket, result auto-posts back into the thread, topbar
  "Agents Running" indicator + `/api/ccjobs` polling. This is the literal Iron-Man "deploy a drone" ask, **built**.
- **Time-series substrate is wired** (`server.js:638` `history.jsonl`, `:652` `snapshotToday`,
  `:708` `/api/history`): every transition is logged via `logTransition`, a daily board snapshot is
  appended on server start, and Insights has a full **Trends** section (`insTrends`, `jarvis.js:1912`)
  with stacked-area status-over-time, velocity bars, and a gaps-over-time line.
- **Editable fields shipped** (`setMeta`, `server.js:263`): `type`, `severity`, `dueDate`, `bundle`
  all editable inline on board + ticket detail; Calendar reads `dueDate`; Planning groups by `bundle`
  via a real "Group Into A Release" flow.
- **Auto-ticketing shipped** (`autoTicket`, `server.js:408`): mints one ticket per untracked App-Map
  gap, deduped via `auto-tickets.json`, confirm-gated. **Already exercised** — the board has grown
  29→34, with 4 `kind:'auto'` tickets in `tickets-manual.json`.
- **Roadmap, Command Palette (⌘K), Knowledge doc-browser with a safe markdown renderer** — all live.

So the strategy doc's "Phase A" (integrate the four sheets + history + fields) is **effectively done**.
The gaps below are the *next* frontier, re-derived from the code as it actually is.

**Live state reality check (the load-bearing caveat):** all **34 tickets are status `Open`**, with
**0 threads and 0 alignments** across the entire board. `history.jsonl` is **0 bytes**. `snapshots.json`
has **1 entry** (2026-05-26). **The loop has never been run once on real data.** Everything below about
"the loop works" means *the mechanism is built and correct* — not that it has carried a single real ticket
end-to-end. The single most important thing Jarvis needs is its **first real lap**, and several capabilities
(Trends, post-back propagation, ConfirmedLive evidence) are untested precisely because that lap hasn't happened.

---

## 1. Current capability — what Jarvis can genuinely do now

**The core loop (built, correct, untested on real data):**
- Read a summarized ticket → discuss in a persisted thread (`addComment`) → **Align gate**
  (`alignHandoff`, `server.js:197`) collates a rich `.md` handoff (`collate`, `:591`: decision +
  summary + mechanism + root cause + walk evidence with `lands[]`/deltas + thread + links + age) →
  CC posts back (`postResult`, `:294`) → on a terminal state, **propagates** the status surgically to
  the linked `OPEN-BUGS #N` (prose-preserving `setBugStatus`).
- **Earned-state machine enforced server-side** (`TRANSITIONS`, `:568`): `Open → Discussing → Aligned →
  Investigating → ConfirmedLive → Shipped`, illegal edges rejected, assignee derived from status,
  **`ConfirmedLive` requires non-empty evidence** (can't be a typed label without text).
- First John comment on an Open ticket auto-earns `Discussing`; align auto-earns `Aligned` + flips assignee→cc.

**Dispatch (the real differentiator):** spawn a headless CC drone on a ticket's aligned handoff,
Investigate (plan/read-only, the safe default) or Fix-on-branch (acceptEdits), cost-capped, push-blocked,
result auto-threaded, live topbar agent indicator + per-ticket completion reload.

**Board / triage:** wide premium list, 6 saved views + status/type/severity/surface filters + search
(debounced, focus-preserving) + 5 sorts; inline live editing of status, type, severity; create/delete
(typed-confirm) tickets; due-date + bundle chips; checkbox multi-select scaffold.

**App Map:** layered relationship graph (orchestrator→movers→hub→ledger) with labelled money-flow edges;
per-surface three-face detail — **Flow** (IS-vs-SHOULD ladders with the gap rung marked in position),
**Touchpoints** (reads/writes wiring + handlers + tickets-on-surface), **Screen** (real walk screenshots
now-vs-after-fix); 9/9 surfaces traced, 22 gaps; **Auto-Ticket Untracked Gaps** button.

**Insights:** composite App Health Score (4 weighted drivers, worst-first), severity donut, status funnel,
type/surface bars, walk-coverage ring, oldest-open aging list, live activity feed (flattened thread/align/
status events), and a Trends section that renders real series once ≥2 daily snapshots exist (honest
"History Starts Now" until then).

**Command Deck:** Agent Library (Walk Drone runs for real; Trace/Auditor/UX/Integrator copy a CC mission
prompt — honesty-tagged "Runs for real" vs "Copies a mission prompt") + Prompt Library (CRUD templates
with `{variables}` and ticket-dropdown vars, persisted to `prompts.json`).

**Knowledge:** grouped doc browser over 9 allowlisted reads, rendered by an escape-first markdown engine.
**Roadmap:** Now/Next/Shipped lanes off the status machine. **Calendar:** real month grid plotting `dueDate`.
**Planning:** Features/Tasks/Candidates lanes + bundle Releases. **⌘K palette:** fuzzy jump to any
ticket/view/surface/action, runs walk inline.

**Security:** seven rules hold; ~16 named, path-jailed, allowlisted actions; localhost+origin+token;
anti-clobber (>50% shrink refused); OPEN-BUGS only ever appended/surgically-edited; deploy + dispatch +
autoTicket all confirm-gated; history writes are best-effort and never break the riding action.

---

## 2. What's MISSING / what could be BETTER (ranked)

### HIGH

**H1 — The loop has never run; there is no "first lap" forcing function. (Effort: S — process, not code)**
34/34 Open, 0 threads, 0 aligns, empty history. Every "this works" claim is mechanism-verified, not
data-verified. The propagation-to-OPEN-BUGS path, the Trends charts, the ConfirmedLive evidence gate, and
the post-back feed are all **dark**. Highest leverage isn't a feature — it's *running one real ticket
through discuss→align→dispatch→post-back→ConfirmedLive→propagate* and fixing whatever the first lap exposes.
This is the cheapest possible de-risking of everything else.

**H2 — `ConfirmedLive` still can't be *earned from a walk*. (Effort: M)**
The brief's defining promise: "Confirmed live = earned when a walk confirms it, evidence attached — NOT a
text box John types." Today it is **exactly a text box John types** (`changeStatus`, `jarvis.js:530`,
`window.prompt('…paste the walk evidence')`). `latestWalk()` exists server-side but there is **no
`confirmFromWalk(id, flow)` action** that reads the latest walk's `lands[]` for the ticket's linked flow
and attaches them as machine evidence. This is the single biggest unkept promise in the status workflow.
`SURF_FLOW` (`jarvis.js:1252`) already maps surfaces→walk flows — the bridge is short.

**H3 — Dispatch loop is shallow on model/reasoning, streaming, and parallelism. (Effort: M)**
The drone is hardcoded `--model sonnet`, no thinking/reasoning-effort control, **no live output streaming**
(`/api/ccjobs` exposes only `{status,mode,started,exit}` — `job.out` accumulates server-side but is never
surfaced; John sees nothing until the drone finishes and dumps a single thread comment). Compare the Walk
Drone, which *does* stream `/api/walklog` lines live. Specific gaps:
  - **Model/reasoning selection** in the dispatch modal (Opus vs Sonnet vs Haiku; turns; budget) — all fixed today.
  - **Live drone-output streaming into the ticket** — add a `/api/ccjob?id=` tail + a thread "live" pane, mirroring the walklog ticker.
  - **Multi-ticket parallel dispatch + a mission queue** — `ccJobs` is a map and the topbar already shows up to 4 running, but there's **no queue, no fan-out UX, no batch-dispatch** from the board's (unused) multi-select.

**H4 — No cost visibility / running total. (Effort: S–M)**
Each dispatch is capped at $1.50, but **nothing records or sums actual spend.** The drone returns
`--output-format json` (which carries `total_cost_usd`/usage), but `dispatchCC` only extracts `j.result`
(`server.js:361`) and discards cost/tokens. There is no per-ticket cost, no session running total, no
budget burn indicator. For a tool that spawns paid drones, "what has this cost me today" is a missing vital.

**H5 — No reachable Deploy surface — the prod gate is built but unwired. (Effort: S–M)**
`deploy()` (git push, confirm-gated) and `/api/gitstatus` (branch/dirty/unpushed) **both exist server-side**,
but there is **no `#/deploy` route, no `viewDeploy`, no button anywhere in `jarvis.js` that calls them**
(grep-confirmed: the only "deploy" references are the Command-Deck *agent* deploy and dispatch's "never
pushes" copy). So Jarvis cannot push — and more importantly the **pipeline/Council gate the strategy doc
asks for (#9) has nowhere to live.** The right build is a Deploy view that shows gitstatus + a pre-push
checklist (unpushed commits, dirty tree) **and refuses to offer the button** unless smoke/Guardian is green
and any touched P0 is ≥ ConfirmedLive. Low effort relative to the downside it protects (a bad push to a money app).

**H6 — Proactive Jarvis is absent. (Effort: M)**
Jarvis is entirely *pull* — it shows state when John opens a view; it never *tells* him anything. There is
no "good morning, here's what changed since you last looked," no "SLY-19 is now 14 days open," no "3 new
walk gaps — open as tickets?", no nudge. The ingredients all exist (history events, aging logic in Insights,
`countUntrackedGaps`, the activity feed) — what's missing is a **briefing surface + a "last seen" timestamp**
that synthesizes real events into one "what needs you" read. This is the behaviour that turns a tool-you-check
into an assistant-that-briefs — the core Iron-Man move — and it's mostly re-presentation of data already computed.

**H7 — "Get Jarvis's take" is a clipboard relay, not a conversation. (Effort: M, decision-gated)**
The brief frames Jarvis as *holding* the discussion. In code (`jarvisTake`, `jarvis.js:716`) it builds a
prompt, John copies it elsewhere, gets a take, pastes it back as a "jarvis" comment. The modal literally
says "no always-on LLM, no key." Now that `dispatchCC` proves a localhost-only `claude` shell is acceptable
under the security model, the same mechanism could make "Get Jarvis's take" a **real one-shot reasoned reply
into the thread** (read-only, plan-mode, no edits) — closing the highest-friction step of the core loop.
Decision-gated: it makes the discuss step an actual model call, which is a deliberate change from the "no key" stance.

### MEDIUM

**M1 — Auto-ticketing is App-Map-only, not walk-driven. (Effort: M)**
`autoTicket` reads the **static** `flows.json` gap list — it does **not** diff a *fresh* walk's detected
gaps. The brief's "anticipate — auto-open tickets when a walk finds reality drifting from intent" needs a
`walk-to-tickets` step that diffs the **latest walk run** (`latestWalk()`) against existing tickets and
proposes *newly-detected* gaps, not just re-emitting the frozen 22. Today a new walk produces evidence that
no part of Jarvis ingests into the backlog. (Keep propose-John-confirms; never silent-create.)

**M2 — The recommender doesn't exist. (Effort: M)**
Planning has a "Candidates For Next Release" lane = open P0/P1 bugs sorted by severity then activity
(`viewPlanning`, `jarvis.js:1424`). That's a filter, not a recommender. There's no scoring by
age × surface-gap-density × blast-radius (FEATURE-MAP links) × cross-ticket links, no "the strongest case
for the next bundle, and *why*," no "stale and getting staler" weighting (which `history.jsonl` could now
feed). The scarcest resource for a solo operator is *deciding what's next*; Jarvis computes everything the
inputs need and stops short of the synthesis.

**M3 — Post-back depends on the drone or a hand-crafted call; there's no reliable CC inbox. (Effort: S–M)**
`postResult` is real, and `dispatchCC` calls it automatically — good. But a CC session working *outside*
dispatch (the normal case when John pastes an align kickoff into his own Claude Code) has **no front door**
to post back except curl/hand-crafting `/api/action`. The "return half" of the loop is only reliable when
the drone path is used. A documented convention (a `mission-control/inbox/` drop the server watches, or a
manual-tested CC-manual rule + helper) would make the loop close regardless of how CC was invoked.

**M4 — Relationship hints render but aren't suggested. (Effort: M)**
Tickets show `links` when present (`jarvis.js:635`), but **nothing infers them.** The brief wants "this bug
may be covered by #21" bubbles. Shared `group`/surface and shared `openBug` are both loaded client-side;
auto-suggesting candidate links is cheap and directly fights the main way a board rots (dupes/related drift).

**M5 — No metrics beyond the snapshot; the rich metrics catalog is barely tapped. (Effort: M)**
`metrics-catalog-2026-05-27.md` defines 38 metrics; Insights implements a handful (health score, severity,
funnel, coverage, aging, feed) + 3 trends. The **NOW-computable, zero-storage** ones the catalog flags as
highest-value are still absent: **SLA-breach by severity (M8)**, **silent-failure rung count
(`fires-anyway`+`dead`, M19)** — a money-app existential metric pulled straight from walk ground-truth —
**stalled-since-handoff (M9)**, **post-back latency (M27)**, **release-ready count (M31)**, and the
**blocked-from-prod funnel (M33)**. These need no new infrastructure (the catalog explicitly recommends
exactly this "build first 8" set).

**M6 — Multi-project is hard-coded, not even cheaply optional. (Effort: S)**
Every data root (`tickets.json`, `flows.json`, `ticket-state.json`, `REPO`, `READS`) is a hard-coded path
in `server.js`. The strategy's recommendation (#10) — *don't build multi-project, just add one `PROJECT`
config indirection so it's possible later* — has not been done. John is a WMS consultant who will plausibly
want this pattern for other work; one indirection layer now saves a rewrite later. Defer the UI, keep the option cheap.

**M7 — Generated-spine regen contract is undocumented/unsafe at scale. (Effort: M)**
`tickets.json` (spine) is read-only-generated; manual + auto tickets append to `tickets-manual.json`;
deletes tombstone. But there is **no documented idempotent, thread-preserving regen** of the spine. The
walk-and-judge campaign is meant to fan out from 6→202 actions; each new batch must mint tickets without
clobbering existing threads/alignments or colliding ids with manual/auto tickets. This needs an explicit
contract before the fleet scales (the generators under `scripts/mc/` weren't read here).

### LOW

**L1 — Handoff package quality is good but static.** `collate` is genuinely rich (decision + mechanism +
root cause + walk lands/deltas + full thread + links + age). Gaps: it doesn't pull **FEATURE-MAP blast-radius**
(which other surfaces/writers the fix touches), doesn't include the **relevant INV-NN contract** the fix must
preserve (the brief's whole "invariant-grounded" doctrine), and doesn't attach **fixture currency** (date /
`fresh:yes/no`) — all things the CC manual says a mission needs. Cheap, high-value enrichments to the one
artifact CC actually works from.

**L2 — Token in page source, no rotation.** `window.MC_TOKEN` is injected into the served HTML
(`server.js:691`), readable via view-source, fresh-per-start but never rotates in-session. Low real-world
risk (localhost, single user) but worth an explicit SECURITY.md note now that the write surface includes
spawning paid drones.

**L3 — UX/architecture debt.**
- `viewSoon` placeholder (`jarvis.js:2806`) is dead code — every route is now real.
- Board **multi-select is wired but does nothing** (`BD2_SELECTED`, `bd2ToggleSelect`) — the natural home
  for batch-dispatch / bulk-status / bulk-bundle. Scaffold present, action layer absent.
- Two near-identical surface-name maps (client `SURFACE_NAMES` + server copy in `autoTicket`) and two
  surface lists (`CMD_WALK_GROUPS`, `CP_SURFACES`) drift-risk by hand.
- `jarvis.js` is one 3152-line file with no module boundaries; fine for now, but the per-view sections
  (Insights, Command, Knowledge, Palette) are large enough that drift between client mirrors and server
  truth (e.g. `TRANSITIONS_CLIENT` vs server `TRANSITIONS`) is a latent correctness risk.

---

## 3. The 3 things to build RIGHT NOW (highest leverage)

**1. Run the first real lap, and build `confirmFromWalk` to close the status promise (H1 + H2).**
*Why:* Everything is mechanism-verified and data-dark. Take one real confirmed ticket (e.g. SLY-1 savings
money-loss) through discuss→align→dispatch→post-back, then add the `confirmFromWalk(id, flow)` action that
reads `latestWalk()` `lands[]` for the linked `SURF_FLOW` and attaches them as evidence — so `ConfirmedLive`
becomes *earned from the running app*, not typed. This simultaneously de-risks the whole platform (the first
lap will surface real bugs) and keeps the brief's single defining promise. Highest leverage because it's the
cheapest path from "impressive demo" to "trusted intermediary," and it unblocks Trends (history starts
accruing the moment real transitions flow) and propagation (only fires on terminal states).

**2. Make dispatch a real console: live streaming + cost running-total + model/reasoning selection (H3 + H4).**
*Why:* Dispatch is the literal Iron-Man capability and it's already real — but John dispatches a paid drone
and then **stares at nothing** until it finishes, with **no idea what it cost.** Surfacing `job.out` as a
live tail in the ticket (mirroring the proven walklog ticker), parsing `total_cost_usd` from the drone's JSON
into a per-ticket + session running total, and exposing model/turns/budget in the confirm modal turns a
fire-and-forget black box into an actual mission control. This is where the "Jarvis carries the work" feeling
lives or dies, and the streaming/JSON plumbing is 80% present — it's surfacing, not inventing.

**3. The proactive briefing surface (H6), seeded by the "build-first-8" NOW metrics (M5).**
*Why:* This is the difference between a board John *visits* and an assistant that *briefs* him — the core
Iron-Man behaviour, and the strategy doc's own #8. With a `lastSeen` timestamp in localStorage it synthesizes
already-computed data (history events, the activity feed, aging, untracked-gap count) into one top-of-Overview
"since you last looked / what needs you today" read — and folding in the catalog's zero-storage vitals
(SLA breach, silent-failure rungs, release-ready, blocked-from-prod funnel) makes that briefing *say something
true and useful* on day one rather than after weeks of history. Low marginal cost (re-presentation, not new
infra), highest behavioural payoff.

*(Honourable mention, build-next: the walk-driven auto-ticketing diff (M1) and the explained recommender (M2)
— both become far more valuable once #1 is flowing real history, so they're deliberately sequenced after the lap.)*

---

## 4. The Iron-Man-Jarvis north star (what "done" looks like)

John opens Jarvis on his 32" monitor and is *briefed before he asks*: a calm top-line tells him what moved
since he last looked, what each running drone is costing in real time, which one decision is waiting on his
judgment, and — with a reason he can interrogate, not a black box — what has the strongest case to ship next.
Every finding about slyght, whether John typed it or a fresh walk anticipated it, is a ticket he discusses
*with* Jarvis in a thread that talks back; when he's aligned, one click hands CC a package rich enough to
genuinely investigate (the finding, the walk evidence, the invariant it must preserve, the blast radius) and
he watches the drone reason live in the ticket, cost ticking, until it posts back what it found and fixed.
A status can't claim "confirmed live" unless a real walk earned it; nothing reaches production unless the
pipeline's gate is green and Jarvis lets the deploy button exist. Jarvis carries every part of the work —
the watching, the carrying, the remembering, the recommending — and reserves for John exactly the calls only
he can make: the judgment, the alignment, and the authorization to fire. It never fakes a number, never ships
on red, never creates or pushes on its own — and *that* asymmetry, machine does the carrying / human does the
deciding, is precisely what makes it trustworthy enough to run a money app from.
