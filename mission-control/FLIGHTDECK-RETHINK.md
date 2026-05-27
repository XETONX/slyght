# The Flightdeck rethink — one screen to run it all

> John, 2026-05-27: *"I need one good screen that's like management — I can see these tickets can be
> bundled, these need action, these can be fixed, and then an auditor to verify the code aligns with
> BRAIN and the roadmap, architecture, Guardian etc, and writes to Deploy and I push from the Deploy
> UI… it feels endless and there's no way to group them… think about this for literally every section.
> And the Flightdeck mockup is better but you can do 1000000x better."*

Diagnosis: strong **capabilities** were built (triage, epic workspace, build-the-case, bundle,
resolution) but no **operating surface** tying them into a flow. Parallel work *felt* endless. The
fix is a **home that IS the pipeline**, with everything else as its entry points and drill-downs.

## The model: it's all one pipeline
```
BACKLOG → TRIAGE → INVESTIGATE → ALIGN → (BUNDLE) → FIX → CODE-AUDIT → DEPLOY
          (Jarvis)  (drones)      (you)   (group)   (CC)  (alignment)  (you push)
```
A ticket is always at one stage. **The stage it's at = the action it needs.** Group by action, not status.

## THE FLIGHTDECK (shipped — reworked home)
A living command deck: a hero SITREP (glowing wordmark · "N drones in the air" radar · Jarvis's
one-line read from the last triage · "Ask Jarvis what matters" CTA · a telemetry strip of the five
stages as big glowing clickable counts with flow chevrons), then a five-column board:

- **NEEDS YOU** — Open/Discussing/Gathering. Actions: Build case · Align · **Ask Jarvis · NQ** (answers
  every open question in one threaded reply).
- **CAN BUNDLE** — epics with open stories, as group cards with a progress bar (the anti-endless answer).
- **READY TO FIX** — Aligned or case-Complete. Actions: Hand to CC · Compose resolution.
- **IN FLIGHT** — live drones / CC working, pulsing, with a scoping progress bar.
- **READY TO DEPLOY** — audited + ready → Review & push (into the Deploy UI).

Tickets land in exactly one column by priority. Cards: severity stripe, mono id, inline action, live
pulse. Premium motion (staggered reveal, drone pulse, radar, click-to-scroll). Entrance animation plays
per navigation only — no poll re-render, so it never flashes.

## Still to build (the rest of the rethink)
1. **Cross-ticket finding dedupe** — a reconcile pass (Jarvis sees the whole backlog in triage) collapses
   tickets that found the *same* cause into CAN BUNDLE as "merge?", so parallel sweeps stop multiplying.
2. **Roadmap rethink** — releases as clean cards (what's in it, progress, deploy-ready count, target),
   tied to the deploy queue (the current bundle list is clunky).
3. **Close the loop to Deploy** — Execute-fix drone (acceptEdits, makes the change + commits) →
   **Code-alignment auditor** (verifies against BRAIN/canonical writers, FINANCIAL-INVARIANTS, ARCHITECTURE
   + roadmap, runs Guardian) → PASS lands the ticket in READY TO DEPLOY with its verdict → the Deploy UI
   shows each push-ready commit with ticket + resolution + audit, so the typed-confirm push is informed.
   This is John's "auditor verifies code aligns with BRAIN/roadmap/architecture/Guardian, writes to Deploy,
   I push." First write-capable drone — its own careful slice (Guardian gating + confirm UX).
4. **Feature/App Map as a node constellation** — John's reference image: a force-directed graph of
   surfaces/tickets on a dark canvas (Obsidian-graph style) with a minimap. Replaces the current ladder map.

## Every section built today — role in the whole
Briefing = the triage entry / SITREP source. Now bar = the live pulse (its segments = the Flightdeck
columns). Flightdeck = the home you manage from. Epic workspace = the bundle drill-down. Board = the
power/search view. Bundle bubble = the "can bundle" action on a ticket. Resolution = the trust artifact
gating fix→deploy. Roadmap = release grouping (to rethink). Deploy = fed by READY TO DEPLOY.
