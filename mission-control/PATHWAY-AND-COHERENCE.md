# Walking a ticket to done — the honest audit + the fix

> John, 2026-05-27: *"It looks like you pasted multiple layers on top of one another and it looks
> weird in every UI… map out the pathway of walking a ticket to completion from the Flightdeck and
> tell me how easy it is to actually understand what the fuck is going on… so much information and
> so many buttons everywhere (sweep in parallel when a case is already 5/5)… I have no idea what the
> statuses mean or what's required at each step… and the Flightdeck can be so much better — I'm
> talking command-centre buttons that perform actions, key info, handy buttons, not just fancy."*

## 1. The pathway today — walked honestly

From the Flightdeck I click a ticket in NEEDS YOU. Here's what actually happens, and where it breaks:

1. **The ticket page dumps everything at once.** "What's happening" + a Technical-depth fold + the
   **Case file** (5 slots, each with Dig/Re-dig, an Auditor row, a Resolution block, an Organize button,
   3 spin-off buckets with Log/Log-all/Ask-Jarvis) + a Discuss/Align/Dispatch card + the comment thread
   + a siderail with ~10 fields. **There is no single "you are HERE, do THIS next" signal.** I have to
   reverse-engineer the state from a dozen controls.
2. **Buttons don't respect context.** "Build the case" / "Sweep in parallel" show even when the case is
   already 5/5 and COMPLETE. Dig vs Re-dig vs Build vs Audit vs Compose-resolution vs Organize all sit
   as co-equal buttons — nothing says which is the *next right one*.
3. **The statuses are jargon.** Open → Gathering → Discussing → Aligned → Investigating → ConfirmedLive →
   Shipped. Seven states, and not one tells me **what it means or what I must do**. "Aligned" vs
   "Investigating" vs "ConfirmedLive" — I can't tell who's holding the ball or what unblocks it.
4. **Two grouping models fight.** The Flightdeck groups by *action* (NEEDS YOU / READY TO FIX / …) but the
   ticket shows a *status* (Gathering / Aligned / …). They don't visibly map to each other, so I hold two
   models in my head.
5. **It looks like two apps.** The Flightdeck / Briefing / Command Centre / Feature Map are dark neon; the
   ticket / board / deploy are the older soft-dark ServiceNow skin (flat cards, different type, different
   buttons, different spacing). Navigating ticket→Flightdeck→ticket feels like switching products. **That's
   the "pasted layers" feeling — it's literally two design languages co-existing.**

**Verdict: the engine is strong, the cockpit is not legible.** A first-time look can't answer "what's
going on and what needs me?" in under a minute. That's the bar we're missing.

## 2. The fixes

### A. ONE next-action per ticket (kills button overload + "what do I do")
Every ticket gets a single prominent **"NEXT: …"** banner driven by its stage — the one right action,
big, with a one-line why. Everything else demotes to a quiet "more actions" area. Examples:
- Open, no case → **NEXT: Build the case** (drones gather it) · *or* Align if you already know the fix.
- Drones gathering → **NEXT: nothing — Jarvis is on it** (live progress, no buttons to fret).
- Case COMPLETE → **NEXT: Compose the resolution, then Align.**
- Aligned → **NEXT: Hand to CC** (or Execute the fix).
- Fixed + audited → **NEXT: Review & push in Deploy.**
Contextual: a 5/5 COMPLETE case never shows "Build the case" again.

### B. Statuses that explain themselves
Keep the seven states (they're the real lifecycle) but **never show a bare status word**. Everywhere a
status appears, pair it with **who holds it + what's needed**, from one map:

| Status | Plain meaning | Who | What's needed |
|---|---|---|---|
| Open | Logged, untouched | you | Build the case, or discuss |
| Gathering | Drones investigating | Jarvis | wait — evidence is filling |
| Discussing | You're working it out with Jarvis | you | decide / ask Jarvis |
| Aligned | You've signed off the fix | CC | hand to CC / execute |
| Investigating | CC is fixing it | CC | wait |
| Confirmed live | Fix proven on a walk | you | ship it |
| Shipped | Done, pushed | — | — |
A small **"what now?"** chip + a legend the user can open. No more guessing.

### C. One visual language (the "pasted layers" fix)
Pick ONE and apply it everywhere. **Recommendation: commit to the dark command-deck language**
(the neon you love), but a *restrained* version — deep panels + one accent per context + glow reserved
for live/active things, not everything. Then **convert the ticket view, board, and deploy** into that same
language (same panels, type, buttons, spacing) so the whole app is one product. Retire the leftover
ServiceNow-skin classes. This is the big lift; it's worth doing surface-by-surface but to ONE spec.

### D. A Flightdeck with real command power (not just pretty)
Beyond the board:
- **Per-card primary action** = the ticket's NEXT action, executable inline (Build / Align / Hand to CC /
  Push) — so you drive from the deck without opening tickets.
- **A command bar** (⌘K already exists — surface it on the deck) to jump/act by typing.
- **Bulk select + bulk act** (sweep / align / bundle N at once) — controlled, not 19 loose tickets.
- **"Closest to shipping"** spotlight + **"what changed since you were here"** feed (drones that finished,
  cases that completed) so returning feels rewarding.
- **Live ops rail** — drones in the air with elapsed + a Stop, usage glance, deploy-ready count.
- Keyboard throughout (arrows between columns/cards, Enter = next action).

### E. The deploy-loop (the build you asked for — designed to fit the above)
`Aligned → Execute fix (acceptEdits drone: makes the change + commits SLY-N, push still blocked) →
Code-alignment auditor (verifies against BRAIN/canonical writers, FINANCIAL-INVARIANTS, ARCHITECTURE +
roadmap, runs Guardian) → PASS = READY TO DEPLOY with verdict → Deploy UI shows each push-ready commit
with its ticket + resolution + audit → you push (typed confirm).` Each step is the ticket's NEXT action,
so the loop is legible end-to-end. First write-capable drone → built carefully (Guardian gate + confirm).

## 3. Sequence
1. **Status clarity + ONE next-action per ticket + contextual buttons** — the legibility foundation; makes
   the pathway walkable. (Touches the ticket view + a shared status map.)
2. **The deploy-loop** (E) — execute-fix → code-audit → deploy, expressed as next-actions.
3. **Visual unification** (C) — convert ticket/board/deploy to the one command-deck language.
4. **Flightdeck command power** (D) — inline actions, bulk, command bar, "what changed", live rail.

## The fork for John
The visual unification (C) is the big, irreversible-feeling call: **commit the whole app to the dark
command-deck language** (convert the ServiceNow-skin surfaces to match the neon ones) — vs keep two skins.
Recommendation: commit to one. But I want your yes before I restyle every surface.
