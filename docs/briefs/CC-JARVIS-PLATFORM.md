# slyght — Mission Control = "Jarvis": John's Project Command Center & Intermediary to CC

## CC — understand WHAT YOU ARE BUILDING before you build it (read twice)
This is not a dashboard, not a bug list, not a QA cockpit. **It is a real ticketing PLATFORM for the slyght project — a ServiceNow / Jira / Salesforce for John's own app — and it acts as "Jarvis": John's project-management command center AND his intermediary to you (CC).**

The defining model, in John's words: *"It's almost like working with CC in the control centre like Jarvis — and then Jarvis feeds CC with this information to properly investigate and resolve."*

So the relationship changes: **John no longer hands you raw prompts directly. John works WITH Jarvis (the control centre). Jarvis holds the conversation, captures John's judgment, and feeds YOU a complete investigation package when John is aligned.** You are fed by Jarvis; you report back into Jarvis. Jarvis is the layer between John's judgment and your execution.

Design every decision around that. Study how ServiceNow / Jira / Salesforce actually run as systems — tickets, comment threads, status workflows, filters, columns, grouping by buckets, creating tickets, planning. Build it like they actually work, because they solved exactly this problem: managing a flood of information, work, and collaboration through one place without chaos.

## THE CORE LOOP (the heart — build this first, get it right before anything else)
Each finding is a **ticket**. The lifecycle:
1. **Read** — John sees the ticket SUMMARIZED (lean, readable at a glance — the view is summarized).
2. **Discuss** — John and Jarvis go back and forth in a **comment thread** on the ticket — refining understanding and the proposed fix. This is the two-way conversation, persisted on the ticket.
3. **Align (the gate)** — a deliberate **"I'm aligned — hand to CC"** button. John says "yep, agreed with this fix" OR "no, change it to this code." This ACTION is the trigger — not just another comment.
4. **Collate + hand off** — on alignment, Jarvis **bundles everything into one rich investigation package**: the original rich finding (root cause, walk evidence, file:line) + the entire comment thread + John's alignment decision + what the ticket links to + how long it's been open. THIS is what's sent to you — deep enough that you can genuinely investigate and resolve, not a thin prompt. (Critical distinction John drew: **what John READS is summarized; what gets SENT to CC is the rich collated payload.**)
5. **CC investigates + resolves** — you work the complete package.
6. **CC posts back** — your results post BACK into the ticket (what you found, what you fixed, evidence). The loop closes on the ticket. The ticket is the permanent record everything writes to.

Build steps 1-6 for tickets FIRST. The comment-thread + align-gate + collate-handoff + post-back IS the heart — it's what makes Jarvis Jarvis. Everything below is mechanics layered on top.

## STATUS WORKFLOW (real states, earned from real events — not typed labels)
Tickets move through a workflow, each state EARNED, not a text label someone typed:
`Open → Discussing → Aligned (handed to CC) → Investigating → Confirmed live → Shipped`
"Confirmed live" specifically = earned when a walk actually confirms it, with the evidence attached ("confirmed by walk 2026-05-26, audit trail: …") — NOT a text box John types. John asked this directly: it must be a real status, not a label.

## THE MECHANICS (layer on AFTER the core loop works — sequence, don't build all at once)
Build like Jira/ServiceNow actually run:
- **Filters, columns, grouping by buckets** — group/filter tickets by surface, priority, status, age. The board mechanics that make a flood manageable.
- **Create tickets** — John (or a walk) turns a finding into a ticket; John can create his own.
- **Calendar / planning view** — plan deployments and fixes against dates; see what's scheduled; get updates.
- **Relationship hints** — "this bug may be covered by #21," "links to SLY-44." Bubbles/popups surfacing connections.
- **Age + metadata everywhere** — "Open 14 days," opened/walked/shipped timestamps, who it needs (John's judgment vs CC's work).

## THE VIEWS WITHIN JARVIS (reuse the work already designed)
- **The ticket detail** — summarized view + comment thread + align button + the tap-through flow diagram John loved: step-by-step (Dashboard → log a transaction → Quick Log opens → choose Savings → [gap] → …), IS vs SHOULD side by side, current vs after-fix. Plus "go deeper" and an add-thoughts box **with a summary bubble beside it** so John can glance at what the case IS while writing thoughts.
- **The App Map** — the whole-app view (see the separate app-map section below): trace every surface's complete intended flow (IS vs SHOULD, real slyght steps, gaps in-place), then the clickable map. This is a major view within Jarvis.
- **Overview / board** — the PM at-a-glance: all open tickets, priorities, what needs pushing.

## VISUAL DIRECTION — ServiceNow / Jira / Linear, NOT slyght's terminal
John, verbatim: *"What's with all the lowercase capitalization, the big spaces? I'm on a 32" ultrawide. Beef it up, make it easier to read. It doesn't need to follow the same monotone as the slyght app. This is meant to be very informational. Bubbles, popups. It needs to be pretty."*
- **Reference: ServiceNow / Jira / Linear** — bright, dense, INFORMATIONAL. NOT a dark moody terminal.
- **Proper capitalization** (Title/Sentence case as a real app uses it). STOP all-lowercase mono.
- **Big readable type, full ultrawide width** — use the whole 32" screen, dense, no dead space, no chat-width columns.
- **Bubbles, pills, popups, badges** — status chips, age indicators, P0/P1, relationship hints, coverage tags. Rich and scannable.
- Clean readable sans for body, clear hierarchy, real status colors. Opus built a ServiceNow-style case-view reference — match THAT skin, not the terminal widgets. Take the STRUCTURE from earlier widgets (flows, IS/SHOULD ladders, cases), RE-SKIN completely. Pretty AND informational.

## BUILD SEQUENCE (prove-then-scale, like everything this project has done)
1. **The Jarvis core**: ticket + comment thread + align-gate + collate-handoff to CC + CC-posts-back. Get the two-way loop genuinely working on real tickets. This is the heart — prove it before anything else.
2. **Status workflow** — the earned-state lifecycle.
3. **The ServiceNow skin** — re-skin to the bright readable PM dashboard (can run alongside 1-2).
4. **Board mechanics** — filters, columns, grouping, create-ticket.
5. **The App Map view** — the big trace + the map (the separate section below).
6. **Calendar / planning.**
Define the WHOLE platform so you understand what you're building toward, but BUILD in this order. Don't build all at once — John gets the core working, reacts, then you layer on. Likely several sessions.

## Security — unchanged (all seven rules hold)
127.0.0.1, allowlist/no-arbitrary-exec, path-jail to repo root, origin+token, manual start/stop, deploy-confirm, SECURITY.md. New write actions (comments, ticket status, alignment handoff, calendar entries) JOIN the fixed allowlist — each a named, path-jailed action, NEVER a generic writer/exec. The collate-handoff writes the investigation package to a file (e.g. `mission-control/handoffs/<ticket>.md`) path-jailed; CC reads it. Comments persist to a path-jailed store. Anti-clobber + prose-preservation rules hold (OPEN-BUGS history never regenerated).

## Creative roaming (explicit)
You've improved every brief by measuring reality (gzip, SW-caches-nothing, deterministic walker). Same here — study how the real platforms (ServiceNow/Jira/Salesforce) solve ticketing/workflow/collaboration and bring that proven thinking. Where a structure serves the Jarvis intent better than this blueprint, do it and flag what you changed and why. You know ticketing systems — build it like one that actually works.

## Pipeline + close
Full 6-tier pipeline. Step 0 conscious-suspension (dev tooling; analog = the data reads true AND the handoff package is genuinely rich enough to investigate from). Risk: the comment/status/handoff write actions = NEEDS-REVIEW (John approves the allowlist additions). Branch `mission-control`. John pushes. §8 plain-English at commits. Update JOHN-KNOWLEDGE — ticketing-system concepts, the Jarvis intermediary model, status workflows, anchored to his terms. Attribution: Co-Authored-By Claude Opus 4.7 (via Claude Code) + Direction-By John Dounas.

**Show John you understand what you're building (the Jarvis model — he works with Jarvis, Jarvis feeds you, you post back) BEFORE you scope the plan.**

---

# The App Map (a core view within Jarvis): see your whole app from both sides

The biggest piece of the mission-control vision, and the clearest.

## The core reframe (read this twice — it's the heart)
The "wiring" of a surface is NOT a diagram of what the code currently does. It is **the complete intended user journey through that surface, step by step, in real slyght terms** — INCLUDING the steps that *should* exist to complete the flow but are missing or broken. Shown as two ladders side by side:
- **what IS** — the actual flow today (e.g. savings: Dashboard → tap + → Quick Log opens → choose Savings → [stops] → cash debited anyway)
- **what SHOULD be** — the complete correct flow with every rung in place (… → choose Savings → **goal picker** → allocate to bucket → cash debited → done right)
The **gap is the difference between the columns** — the rung present in SHOULD, missing in IS. Mark it in its correct position, not just "it breaks here." Opus built the visual reference for the savings surface (the 6-step IS/SHOULD ladders with the missing goal-picker rung at step 4) — match that shape and readability.

This makes the map a true picture of how slyght is *meant* to work, with the breaks shown in the context of the whole journey — so John can understand the flow, see the hole, and see the shape of the piece that fills it.

## Build order (John's explicit call: trace ALL surfaces first, THEN the map)
### Phase 1 — THE BIG TRACE (the foundation)
CC walks every surface and documents its **complete intended flow** in real slyght steps:
- For each surface (dashboard, bills, savings, plan, analysis, debts, AI chat, settings, nav — all ~9+): the step-by-step user journey in real app terms (actual taps, actual modals/handlers with file:line, actual reads/writes).
- For each step: what it does, what it's wired to (handler, what it reads like `S.bal`, what it writes like `bucket_saved_change`), explained PLAIN-ENGLISH anchored to John's world (Postman/APIs = handlers/endpoints; entities; shadow tables; MAWM user-exits/composite-APIs/hierarchies).
- **Both IS and SHOULD per surface** — the gaps/breaks are the steps in SHOULD missing/broken in IS, marked in position.
- Output structured `mission-control/flows.json` — the full-journey map, IS vs SHOULD, gaps in-place. Substantial (some surfaces 40-57 actions); checkpoint per surface (dump+gzip+release) so it doesn't hit context limits.

### Phase 2 — THE MAP (built on the trace)
A blown-up, full-page, clickable app-map (its own view, big):
- The whole app spread as surfaces (cash-hub-and-spokes), severity highlighting, big and readable.
- **Click any surface → its detail:** the IS-vs-SHOULD side-by-side flow ladders (real steps, gaps in-place, machinery in John's terms), a **front/back toggle** (back = machinery/flow, front = actual screen), **now-vs-after-fix** on the front (mockup fine where the real screen can't be pulled).
- Each surface's gaps ARE tickets — link the map to the ticketing core.

## Readability — NON-NEGOTIABLE (John has flagged this repeatedly)
Use the full ultrawide. Big type (titles ~28-30px, stats ~36-38px, step/case titles ~17-20px, body ~16px/1.7, never below 13px). Big cards, generous padding. ServiceNow-style, not terminal. Hard acceptance criterion: John reads it comfortably from his chair on a 32" screen.

The end-state: John opens Jarvis on his big monitor, sees the whole project state as PM, opens a ticket, discusses the fix with Jarvis in the thread, hits "aligned — hand to CC," and Jarvis feeds CC a complete package to investigate and resolve — CC posts results back, the ticket moves to Shipped. The App Map lets him see any surface from both sides. Jarvis is the intermediary between his judgment and CC's execution — built like ServiceNow actually runs. Core loop first, then the mechanics, then the map.
