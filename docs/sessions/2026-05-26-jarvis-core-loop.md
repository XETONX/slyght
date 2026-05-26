# Session — Jarvis (Mission Control v3): the ticketing platform + CC intermediary

Fifth track of the day. Reframed Mission Control into **Jarvis** — a ServiceNow/Jira-style
ticketing PLATFORM for slyght that is John's command centre AND the intermediary to CC.
Brief: `docs/briefs/CC-JARVIS-PLATFORM.md`. Built the **core loop first** per the brief.

## Shipped (local, branch `mission-control`, NOT pushed)
- `a0f8134` feat(mission-control): Jarvis (v3) — ticketing platform + CC intermediary (core loop)

## The model (John designed; I confirmed understanding before scoping)
John no longer prompts CC directly. He works WITH Jarvis; Jarvis collates his judgment +
the rich finding into one package on alignment and hands it to CC; CC posts results back;
the ticket is the permanent record. **Asymmetry:** what John reads is summarized; what CC
receives is the rich payload. Status is an EARNED state machine, not a typed label.

## The core loop — proven end-to-end on SLY-1
`ticket → discuss thread → "get Jarvis's take" (routes to CC, posts back as a Jarvis
comment) → ALIGN gate (deliberate action) → collate rich handoff (finding + full thread +
alignment + links + age → handoffs/SLY-N.md) → CC investigates → CC posts results BACK →
propagates linked OPEN-BUGS status`. Verified: Open→Discussing→Aligned→Investigating→
ConfirmedLive, handoff package genuinely rich, OPEN-BUGS #11 kept in sync, all security +
state-machine guards fire (401/403, bad-id, illegal transition, ConfirmedLive-needs-evidence),
board + ticket detail render in the bright skin, 0 JS errors. Test mutations reset.

## Build
- **Data:** `build-tickets.js` → `tickets.json` (spine: SLY-N, lean summary + rich block,
  kind, links, `type` bug|feature|task) from cases.json. Mutable `ticket-state.json`
  (status/thread/alignment) — owned by the actions, never clobbered by regen.
- **Server:** 5 new allowlisted, path-jailed actions (addComment, setStatus[state machine],
  alignHandoff[collate→handoffs/], createTicket, postResult[propagates]); reads /api/tickets,
  /api/handoff; generalized asset serving (basename). SECURITY.md updated. 7 rules unchanged.
- **Skin:** total reskin — jarvis.css + jarvis.js, matched to
  `mission-control/jarvis-skin-reference-CASE-VIEW.html` (clean sans, light, proper caps,
  big type, ultrawide, pills/badges, kanban board, case-view ticket detail). The old v2
  dark-terminal app.css/app.js remain in the repo (unused by the shell now).

## Decisions (per John's calls this session)
- Jarvis discussant = Option 1 (on-demand route-to-CC; reply posts back as a Jarvis comment;
  no LLM, no key, no new outbound — security model untouched). ALIGN stays the formal handoff.
- John's mid-build refinement: post-back PROPAGATES to keep canonical records in sync (Jarvis
  is the one place; reasoning stays on the ticket). Wired into postResult via the existing
  surgical setBugStatus.
- Planning question: reserved `type` in the model now (feature tickets exist); App Map +
  Calendar/Planning are nav-visible (Soon) — built next per the brief sequence.
- References at `mission-control/jarvis-*reference*.html` (kept in repo).

## Open / next (the brief's sequence)
- John: `node mission-control/server.js` → open localhost:5050. Drive SLY-1: comment, get
  Jarvis's take, ALIGN → see the rich handoff package → I post results back.
- Next layers: board mechanics (filters/columns done; grouping/bundles), then the **App Map**
  (Phase 1 big trace → flows.json IS-vs-SHOULD per surface; Phase 2 the clickable map using
  the ladder reference), then **Calendar / Planning** (features like bank integration/Opal,
  bundling fixes, timelines).
- gitignored mutable stores: ticket-state.json, tickets-manual.json, handoffs/.

## JOHN-KNOWLEDGE
Added Demonstrated: **the intermediary / single-source-of-truth model** (John designed it,
drove the summary-vs-rich asymmetry + the propagation/one-place insight + mapped it to PM
primitives). Calibration noted: he's a WMS consultant fluent in ServiceNow/Jira — pitch
ticketing at peer level; teach the earned-state-from-a-walk + the intermediary collation.
