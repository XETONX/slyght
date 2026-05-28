# CC-JARVIS-SURFACE-AND-FOUR-WIREUPS

> Single consolidated brief. Two halves, one branch (`mission-control`), John pushes.
> **Part 1 = surface** what's already built but invisible/chaotic (wiring + visibility, zero new brain).
> **Part 2 = build** the four real gaps CC named in its own capability inventory, in order **b → a → c → d**.
>
> Grounded in: CC's capability inventory (the read of `server.js` + `jarvis.js`), the cockpit self-audit
> (`ux-audit.json`, 2026-05-27), and the prior rethink docs (`FLIGHTDECK-RETHINK.md`, `PATHWAY-AND-COHERENCE.md`).

---

## 0. The surface-vs-build split (the principle this whole brief runs on)

**The brain is built.** Jarvis already triages the whole backlog, ranks by leverage with an explainable WHY,
runs seven scoped investigation drones + an auditor, answers every open question in one reply, discusses a
ticket while reading code, suggests epic/bundle/related/closes-with groupings, designs *new* drones on demand,
and runs the full execute→sandbox→code-audit→verify deploy loop. None of that gets re-specced here.

What's wrong is **legibility**, not capability: the cockpit reads as "pasted layers" (two skins, no shared
token layer), and most of the brain above is buried behind flat co-equal buttons or no UI at all. Part 1 fixes
that with **wiring + visibility only**. Part 2 builds the **four** genuine gaps — and only one of them (d)
writes anything unattended, so only that one is gated behind a review.

If a thing already exists in code → **surface it** (Part 1). If it's one of the four named gaps → **build it**
(Part 2). Nothing else gets built.

---

## PART 1 — SURFACE (wiring + visibility, no new brain)

Verification mechanism for this whole part: re-run the **cockpit self-audit** (`uxAudit` action) + the
**per-surface UX drone** after the cohesion pass, and capture before/after with `scripts/cockpit-shots.js`
(wide **and** narrow). Target outcome: the self-audit's top theme — *"reads as pasted layers"* — clears.
(Note: this is the cockpit tool on localhost, not the slyght PWA — so the acceptance test is the cockpit
self-audit + wide/narrow shots, **not** a 380px phone-verify.)

### 1A. Visual cohesion — kill the "pasted layers" / "overlapping windows" feel

Straight from the cockpit's own self-audit (`ux-audit.json`). Both skins are *intentional and good* — they just
don't share a token layer, so navigating between them feels like switching products. The fix is a token layer,
not a redesign. `ticket` is already clean — the self-audit calls it *"the strongest surface… use as the cohesion
reference."* Bring everything else to it.

1. **One palette to `:root`** *(high)* — neon hardcodes a parallel palette under duplicate names (`--cy` vs
   `--cc-cyan`, both `#2de2e6`, declared 4×; `--am` vs `--cc-amber`; neon green/violet/red are byte-identical to
   the existing `--green/--violet/--red`). Hoist one neon set to `:root` (`--neon-cyan/-amber/-bg/-line`), alias
   the rest to existing tokens, delete the 4 scoped redeclarations in `.fdeck/.fmap/.cmd-centre/.brief`.
2. **Sweep the ~8 light-theme hex leftovers** *(high)* — the 2026-05-27 soft-dark refactor only updated `:root`;
   white gradients (`.topbar` `#fff,#fbfcfe`; `.rec-voice/.rec-shipready` blend to `#fff`), maroon-on-dark
   (`.kb-error-b #7a271a`), and light-bg-tuned hovers survive. Swap each to its matching token.
3. **One hairline** *(med)* — six near-navy border hex in the neon language → define `--neon-line` and replace.
4. **Soften the skin seam** *(med)* — start `.cc-bg` radial from `var(--bg)` not pure `#0a0e16` so Board→Command
   doesn't jump navy-grey → near-black.
5. **Topbar pill clip** *(high)* — `.topbar`/`.right` `overflow:hidden` slices wrapped status pills at narrow
   widths on every surface. Hide `.brand small` ≤760px + drop the `.sys-stat` group sooner, or let the topbar grow.
6. **Fleet-poll flash fix** *(med)* — the 1s walk poll calls full `viewAgentsFleet()` (`jarvis.js:2174`),
   replaying enter-animations (the strobe the discipline warns about). Patch the list rows in place; reserve the
   full render for nav. (The topbar/cmd-walk polls already do this correctly — copy that pattern.)
7. **Per-surface nits** *(low, batch)* — command target-picker native select + `"1 drones online"` plural;
   briefing `max-width:900px` half-empty on ultrawide; map double-rail seam; overview board horizontal-scroll on
   phone width; board 3-corner-radii rhythm; deploy raw-`rgba` code chip; architecture scroll-within-scroll.

### 1B. Surface the invisible brain (the "what's built but you can't see it" pass)

Everything here is **rendering existing data/actions** — no new server capability.

- **ONE next-action per ticket** (`PATHWAY-AND-COHERENCE` §A). The actions all exist; what's missing is the
  single **"NEXT: …"** banner driven by status, with everything else demoted to "more actions." Kills button
  overload. Contextual (a 5/5 COMPLETE case never re-shows "Build case").
- **Status legend** (`PATHWAY` §B). The 7 statuses are real; pair each, everywhere it appears, with *plain
  meaning · who holds it · what's needed* from one shared map + an openable legend. No bare status words.
- **Agent Roster as a legible toolkit, not flat buttons.** The scoped drones + auditor + `answerQuestions`
  (`server.js:851`, "answer ALL open Qs in one reply") + Discuss (`server.js:877`) read as co-equal tiles today.
  Group them by what they're *for* (investigate / decide / organize) and show each one's one-line job.
- **Surface `designAgent`** (`server.js:985`) — it's completely invisible in the UI today. Even a single entry
  point ("Design a new drone…") under Command Centre exposes it.
- **Deploy-loop legibility** (`PATHWAY` §E). The stages exist (`executeFixOnMain` `server.js:1008` →
  `recordSandboxConfirm` `1967` → `recordCodeAudit` `2009` → `verify-fix` gate). Show them as a visible 4-step
  rail on the ticket and feed each push-ready commit into Deploy *with* its ticket + resolution + audit verdict.
- **caseScore made legible** (`jarvis.js:1553`). It's shown as a bare `N/5`; label what the 5 slots are
  (root-cause · surface · fix · conformance · audit) so the number means something.
- **Dependency edges surfaced.** `blockedBy` + `epicChildOrder` + the computed *next-unblocked child*
  (`jarvis.js:1562,1582`) already exist — surface "blocked by SLY-N" and "do this next" on cards now, ahead of
  the full constellation graph (which stays a separate, later item — not in this brief).
- **Triage Commander outputs surfaced.** The ranked issues + WHY + "what John should learn" + which drone
  (`server.js:1894`) currently collapse to one read-line on the Flightdeck. Surface the full ranked read.
- **Kill the redundant Now bar** (`jarvis.js:211`) — it duplicates the Flightdeck telemetry strip directly
  below it. (Per John's cohesion note.)

---

## PART 2 — BUILD (the four gaps, order b → a → c → d)

Each item: *what's already wired (don't re-spec) · the gap · the build · anchors · verify.*

### (b) Ready-to-align gate — THE CONTRACT — lands FIRST

- **Wired:** `caseScore` 0–5 (`jarvis.js:1553`); open questions extracted across caseFile slots
  (`server.js:847`, surfaced as the `NQ` count `jarvis.js:291`); spin-offs logged via `logSpinoff`/`logAllSpinoffs`.
- **Gap:** there is no *composite* readiness flag, and **`align()` is ungated** — the Flightdeck offers Align
  even on an Open ticket with an empty case (`jarvis.js:293,295,303`). No completeness contract is enforced.
- **Build:** a deterministic `ticketReady(t)` predicate = **case-backed ✓** (caseScore ≥ threshold / audit
  COMPLETE) **+ open-Qs-answered ✓** (open-question count == 0) **+ all-findings-logged ✓** (no un-logged
  spin-offs in the buckets). Surface it as a **3-tick readiness chip** on the ticket and its card. Then **gate
  `align()`**: if not ready, the NEXT action becomes *"answer N questions · log N findings · finish the case"*,
  not Align. **Authoritative override:** John can force-align past the gate with an explicit confirm — his click
  is authoritative; the gate guides, it doesn't cage. (Override is logged on the ticket thread.)
- **Anchors:** predicate is new; reads `caseScore` (1553), the open-Q extractor (`server.js:847`), spin-off
  buckets (`jarvis.js:1159`); gate wraps the `align()` call sites (`jarvis.js:295,303`).
- **Verify:** a ticket with open questions cannot reach Aligned without either clearing them or John's explicit
  override; the readiness chip flips to 3/3 exactly when the three conditions hold.

### (a) Leverage rescore — make "next move = unblocks the most" real

- **Wired:** `scoreTicket` / `REC_WEIGHTS` (`jarvis.js:3928`) — severity 34 · readiness 28 · age 16 · surface 14
  · blast 8 — fully explainable; the WHY line traces every point to a factor.
- **Gap:** `blast` is only `links/4` (`jarvis.js:3969`). `closesWith` (`recordOrganize` `server.js:2040`,
  surfaced `jarvis.js:1235`) and `blockedBy` (`server.js:515`) — the signals that actually mean "this fix closes
  others / unblocks a bundle" — are **not in the score.**
- **Build:** replace/augment `blast` with a **dependency-leverage** factor: `closesCount` (how many tickets list
  this one in their `closesWith` or are unblocked by it) + a bump if it's the **next-unblocked child gating an
  epic**. Keep it explainable — the WHY line names the new factor ("clears 3 tickets," "unblocks SLY-43").
- **Verify:** a ticket that closes 3 others outranks an equally-severe ticket that closes none, and the WHY says
  so. Pure read model — deterministic, no drone needed.

### (c) Auto-cluster / dedupe — collapse same-root-cause tickets

- **Wired:** `jarvisOrganize` (`server.js:956`) — per-ticket, suggests related/closes-with, **suggest→click**
  (`renderOrganize` Apply buttons `jarvis.js:1218`); bulk-organise from the Board exists.
- **Gap:** no **backlog-wide** pass that sees the whole list and collapses tickets that found the *same* cause
  into a "merge?" — so parallel sweeps keep multiplying duplicates (`FLIGHTDECK-RETHINK.md` §"still to build" #1).
- **Build:** a backlog-wide cluster pass, **read-only, suggest→click** (same contract as organize — never
  auto-merges). **Mechanism:** use **`designAgent`** (`server.js:985`) to mint a scoped *cluster* drone — reads
  the whole backlog, groups by shared root-cause / surface / fix-pattern, proposes merges with reasoning. Output
  lands as **"merge?" cards in the CAN BUNDLE column** of the Flightdeck. (designAgent designing the cockpit's own
  next drone is the intended dogfood here.)
- **Verify:** parallel sweeps that converged on one cause surface as a single "merge?" card, not N duplicates;
  John clicks to accept/decline each merge.

### (d) Auto-log linked sub-tickets — **NEEDS-REVIEW: show threshold + cap + dedupe before auto-write ON**

- **Wired:** manual `logSpinoff` / `logAllSpinoffs` (`jarvis.js:1468,1497`); `createTicket` links child→parent +
  inherits the epic (`server.js:419,432`). **Drones are read-only today — they never create tickets.**
- **Gap:** investigation findings need a click to become tickets; John wants the gap closed ("D is in… I'll
  click into tickets if I need to see what they mean").
- **Build (gated — this is the FIRST unattended drone WRITE):** auto-create a drone-surfaced finding as a linked
  sub-ticket, but **only behind a reviewed policy:**
  - **THRESHOLD** — only auto-log findings the drone tags **confidence ≥ high AND severity ≥ P1**
    (configurable). Low-confidence / P2 stay manual in the buckets.
  - **CAP** — max **N per investigation** (default 3) and max **M per backlog per day** (default 10). Never a flood;
    overflow stays manual with a "+K more to review" note.
  - **DEDUPE** — before creating, match the finding against open tickets (title / surface / root-cause
    similarity). On a hit, **attach as `related` instead of creating** — never duplicate an existing ticket.
- **Review gate (before flipping auto-write on):** I will show you (1) the threshold/cap/dedupe spec as
  configured, and (2) a **dry-run against the current backlog** — exactly which findings *would* have been
  auto-logged and which would have deduped — with **auto-write still OFF**. You approve the policy, then it goes
  live. Every auto-logged ticket carries an `autoLogged` tag + the source drone + confidence on its thread.
- **Verify:** dry-run output matches the policy; once live, no auto-logged ticket duplicates an open one; the cap
  is never exceeded; you can find every auto-logged ticket by its tag.

---

## PART 3 — PIPELINE

- **Branch:** `mission-control` (current). **John pushes** — nothing deploys on its own.
- **Sequence & gates:**
  1. **Part 1 (1A cohesion + 1B visibility)** — zero-risk surfacing; lands first, can interleave. Acceptance =
     cockpit self-audit re-run clears "pasted layers" + before/after wide/narrow shots.
  2. **(b) ready-to-align gate** — the contract; lands before (a) per John.
  3. **(a) leverage rescore** — pure read model; explainable WHY preserved.
  4. **(c) auto-cluster** — read-only suggest→click; via `designAgent`.
  5. **(d) auto-log** — built behind the policy; **auto-write stays OFF until John signs the
     threshold/cap/dedupe spec + the dry-run.**
- **Per-change verification:** the cockpit's own gates (Guardian where it applies to cockpit code) + `cockpit-shots.js`
  before/after for any surface change. This is the localhost cockpit, not the slyght PWA — no 380px phone-verify;
  narrow-width shots stand in for responsive.
- **Don't re-spec rule:** if execution turns up something that looks like new brain, stop — it's almost certainly
  already wired; surface it instead.

---

*End of brief.*
