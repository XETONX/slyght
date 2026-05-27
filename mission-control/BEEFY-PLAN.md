# Mission Control — the "Beefy" plan

> John, 2026-05-27: *"I want this website to be beefy so everything is clean… I want to be
> rewarded for the progress I'm making and shown things are in the pipeline and being worked
> on, and then I can actively interact with Jarvis and the tickets while other tickets are
> being scoped out by headless drones… there will be a lot going on but I need streamline…
> note all this down and map it out, then pump it out, and be creative."*

This is the map of everything John asked for in that message, organised into workstreams,
with the design direction, my decisions, and the build sequence. Nothing dropped.

---

## The vision in one breath

Mission Control should feel like **one living command centre**, not a set of pages. The neon
Command-Centre quality spreads to the whole app. You always know **what's deployed, what's
queued, what's recommended**. You move between screens fluidly (back always works), tickets
look like *what they are* (a bug ≠ a feature ≠ an epic), and you can **talk to Jarvis and work
tickets while drones scope others in the background** — a lot in motion, but streamlined and
rewarding. You see progress and feel it.

---

## The 15 asks → 7 workstreams

### WS-1 · Briefing = a real situation report (not a card list)  ⟶ THIS SLICE
**Asked:** *"Briefing needs a better layout — right now it's just many cards in a list and not
like an actual brief of what's going on, what's currently deployed or what should be deployed,
almost like a to-do list."*
**Design (creative):** Restructure `#/briefing` into a **situation report** with three bands:
1. **SITREP header** — a one-glance status row: `IN THE AIR` (drones deploying now) · `QUEUED`
   (sweeps pending) · `READY` (case complete, awaiting you) · `WATCHLIST` (real, not now). Live.
2. **THE BOARD** — Jarvis's prioritised **to-do list**: a compact, ordered worklist (rank ·
   ticket · sev · one-line why · live status chip · primary action), grouped into
   **DEPLOYED NOW** (the drones working) / **DO NEXT** (recommended, click to deploy) /
   **ON THE BENCH** (watchlist). This is the "what should be deployed" the SITREP promised.
3. **JARVIS'S READ** — the plain-English summary + the *what-to-learn* line per top issue,
   collapsible, so the brief reads like a person briefing you, not a dump.
**Decision:** keep the deep per-issue detail one tap away (on the ticket), the brief stays scannable.

### WS-2 · Command-Centre quality across the whole site  ⟶ QUEUED (big, staged)
**Asked:** *"replicate the same kind of style for command centre across the whole website…
beefy so everything is clean."*
**Design:** The Command Centre's language (deep panels, glow accents, mono labels, radar/pulse
live cues, generous type) becomes a **shared design layer**, not a one-page skin. Approach:
promote the `.cc-*` tokens (cyan/amber, panel gradients, grid bg) into reusable utility classes,
then convert surfaces in traffic order: **Overview → Board → Ticket → Recommends → Deploy →
Architecture/Map → Planning/Calendar/Insights/Roadmap/Knowledge**. Each gets the panel
treatment, the live cues, bigger type, and the "feels alive" micro-interactions. Staged so each
surface ships clean rather than a half-converted whole.

### WS-3 · Bigger type + use the space  ⟶ THIS SLICE (first pass)
**Asked:** *"increasing the text size across the whole website as there's so much space still."*
**Decision:** bump the base scale (16→17px, headings up a notch, denser→roomier line-height on
reading surfaces), fix the leftover **light scrollbar thumb** on the dark theme. First pass now;
per-surface tuning rides WS-2.

### WS-4 · Back / return navigation  ⟶ QUEUED (slice 2)
**Asked:** *"back buttons link between screens or return to the page I was just looking at."*
**Design:** a global **Back** affordance in the topbar that pops a small in-app nav history
(so `ticket → board → ticket` returns you correctly, beyond raw browser-back), plus contextual
"← back to <where you came from>" on ticket/briefing detail headers. Track a `J._navStack`.

### WS-5 · Type-specific ticket layouts + dynamic case-file templates  ⟶ QUEUED
**Asked:** *"individual tickets like bugs, features or tasks have their own layout depending on
what we're building"* and *"can a case file be built / should be built for the end investigation
… dynamic templates."*
**Design:**
- **Bug** → the current investigation case file (root-cause · surface · fix · conformance ·
  auditor) — the diagnostic shape.
- **Feature / initiative** → a *build* shape: intent · acceptance criteria · design sketch ·
  affected surfaces · rollout — gathered by build-oriented drone scopes, not root-cause.
- **Task** → a lightweight checklist shape (steps · done-when).
- **Epic** → the roll-up (see WS-6), no case file of its own.
- **Dynamic case-file templates:** the case file's slots come from a per-type template, and a
  final **"End-of-investigation" case** is composed when the auditor returns COMPLETE — a
  signed-off, human-readable resolution doc (problem → cause → the fix → proof → what changed),
  which is what flows to Deploy. The case file becomes *built for the resolution*, not just the dig.

### WS-6 · EPIC depth — the biggest pain  ⟶ QUEUED (high priority)
**Asked:** *"the EPIC depth is nowhere near deep enough, it's so hard to track what tickets are
linked to it and then in what order I should be completing the tickets."*
**Design (creative):** an **Epic workspace** (its own view, `#/epic/SLY-N`):
- **Children, ordered** — a sequenced list (drag or auto-suggested order from dependency + sev),
  showing each child's status + case-file completeness; a **progress bar** (n of m done).
- **"Do this next"** — the single recommended next child given order + readiness.
- **Dependency links** — explicit blocks/blocked-by between children (extends the existing
  `links` model); the order respects them.
- **Closes-with / rolls-up** — what ships when the epic completes.
- Jarvis can **propose the order + the breakdown** (extend `jarvisOrganize` → an epic-plan drone).
The board's "Group by Epic" stays as the flat view; the workspace is the deep one.

### WS-7 · Aliveness, interactability, parallel work  ⟶ WOVEN THROUGH ALL
**Asked:** *"keep coming back to make this website interactable and clickable and responsive and
flows nicely and feels alive… rewarded for progress… shown things are in the pipeline and being
worked on… interact with Jarvis and tickets while other tickets are being scoped by headless
drones."*
**Principle, not a task:** every surface shows live drone activity (the non-flash fleet pattern),
every list item is clickable to its natural destination, actions give immediate responsive
feedback, and the topbar/SITREP always answer "what's happening right now?" Progress is celebrated
(counters, "n shipped", ready-to-deploy badges). Applied in every slice.

---

## Fixes folded in (this slice)

- **Now-bar routing** *(bug John is hitting: "it keeps bringing me back to SLY-1")* — each Now
  segment routes by **count**: exactly 1 → that ticket; >1 → the **Board pre-filtered** to that
  segment's view (ready-to-ship→live, need-you→judgment, in-flight→flight, gathering→Gathering),
  readyAlign→Recommends. Today it always opens `arr[0]` (SLY-1).
- **System-audit "ruthless audit" clears when ticketed** — when a top-risk is logged as a ticket,
  stamp it `loggedTicket` and render it as resolved-with-link, excluded from "Log as ticket". So
  the audit list shrinks as findings become tracked work.

---

## Opus vs Sonnet — the policy (John asked directly)

**Rule of thumb: _Sonnet finds, Opus decides._**

| Use | Model · thinking | Why |
|---|---|---|
| **Locate-surface** (map a ticket to a surface) | Sonnet · off | Pure retrieval/lookup. |
| **Root-cause** (trace mechanism + file:line + ledger walk) | Sonnet · think | Mechanical tracing; thinking helps the walk. The auditor catches misses. |
| **Walk drone** (drive the app) | Sonnet · off | Deterministic capture. |
| **Jarvis chat** (advisor reply) | Sonnet · off | Conversational, grounded by the thread. |
| **Fix-proposal** (design the minimal change + invariants) | **Opus · think** | A judgment call — wrong design is expensive. |
| **Conformance** (architectural FIT, drift verdict) | **Opus · think** | Judgment about fit/drift. |
| **Auditor** (converge the case, COMPLETE vs GAP) | **Opus · think** | The convergence decision gates everything downstream. |
| **Triage commander** (rank the whole backlog) | **Opus · deep** | Cross-cutting judgment over everything. |
| **Agent design / epic planning** | **Opus · deep** | Generative design. |

So: the **gather/enumerate** steps are Sonnet (fast, cheap, parallel); the **decide/design/judge**
steps are Opus with thinking. This is encoded per-task in `SCOPED_TASKS` (a `model` field) so it's
not chosen ad-hoc per dispatch.

---

## End-to-end path — current state, the gap, the fix

**What works (verified):** Open → Gathering → (gather drones fill the case file) → Discussing →
Aligned → Investigating, with the case file holding a **fix *proposal*** + conformance + auditor
COMPLETE. The Briefing/triage auto-runs this for the top issues.

**The gap:** the case-file fix is a **proposal, not an applied change**. Gather drones are
read-only (Edit blocked). Nothing currently **executes** the proposal into a committed edit, and
the **Deploy screen is git-only** (shows commits, not "which ticket's fix is ready"). So the
end-to-end "fix sitting in Deploy, trust it" path is **not closed** today.

**Proposed close (WS-5/WS-6 adjacent):**
1. An **"Execute fix" action** — an `acceptEdits` drone (mode `fix` already exists in `spawnDrone`,
   push still blocked) takes the **aligned** case file's fix-proposal, applies the minimal change,
   runs Guardian + boot self-test, and commits with `SLY-N` in the message. Ticket → Investigating
   → (commit lands) → ready for **confirm-from-walk**.
2. **Deploy screen shows ticket-linked fixes** — parse `SLY-N` from unpushed commit subjects and,
   per commit, show the ticket it closes + its end-of-investigation resolution. "Fixes ready" becomes
   real, and the typed-confirm push remains the one irreversible gate.
3. The **end-of-investigation case** (WS-5) is the trust artifact shown beside the commit in Deploy.
**Decision:** map now; build after the Briefing/epic slices, because it introduces the first
write-capable drone path and deserves its own careful slice (guardian gating, the confirm UX).

---

## Drone coverage — deployed vs missed

**Deployed today:** root-cause, locate-surface, fix-proposal, conformance, auditor (the case-file
sweep) · walk · jarvis-chat · jarvis-organize · system-audit · triage-commander · design-agent.
**Missed / next:**
- **Execute-fix** (the write step above) — the biggest gap.
- **Feature/initiative gather scopes** (acceptance criteria, design) for non-bug tickets (WS-5).
- **Epic-planner** (break down + order children) for WS-6.
- **Regression-guard** (after a fix: which existing specs/invariants to re-check).

---

## Build sequence

1. **THIS SLICE** — Briefing→SITREP (WS-1) · Now-bar routing fix · bigger type + scrollbar (WS-3)
   · audit-clears-when-ticketed · Opus/Sonnet policy in `SCOPED_TASKS`.
2. **Slice 2** — Epic workspace (WS-6) + back/return nav (WS-4).
3. **Slice 3** — type-specific ticket layouts + dynamic case-file templates + end-of-investigation
   case (WS-5).
4. **Slice 4** — execute-fix drone + Deploy shows ticket-linked fixes (close the end-to-end path).
5. **Ongoing** — WS-2 whole-site neon conversion, surface by surface, in traffic order; WS-7
   aliveness woven through each.
