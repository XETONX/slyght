# JOHN-KNOWLEDGE.md — John's working frontier (live calibration doc)

> **Read at session start. Append at session close.**
> This doc captures what John has demonstrably worked through and where his frontier is. Pitch future explanations to that frontier — neither over-explain settled concepts nor under-scaffold ones he's still building.

---

## Purpose

Future-CC opens every session with the same ambient framing of how John engineers, what mental models he already wields, and what vocabulary he is still building. Without this doc, each session re-discovers his level through trial and error — over-explaining things he caught last week, under-scaffolding things he hasn't seen yet. This file fixes that drift.

The signal isn't *"John has heard about X."* It's *"John has DEMONSTRATED X by catching a bug or driving a call that requires the concept to be operational, not memorised."*

---

## How to use this file

- **CC at session start:** read the Demonstrated + Building lists. When explaining anything this session, calibrate to that frontier.
- **CC at session close:** append any concept John demonstrably worked through. Cite the incident. Graduate Building → Demonstrated when the evidence lands.
- **John:** if CC over-explains a Demonstrated concept or under-scaffolds a Building one, that is a calibration miss — flag it, fix the doc.

---

## Demonstrated (operational — pitch explanations PEER-LEVEL on these)

Each entry: **concept · what it means in slyght-terms · the catch that proved it.**

### Flag vs ledger / derived vs source-of-truth
**What it means.** The txn ledger is ground truth; flags (`paid:true`, `BRAIN.bills.isPaidInCycle` output, `billsUnpaidTotal`) are derived convenience that can drift. A flag saying `paid:true` is a *claim* the ledger must back; without a matching debit txn it is unbacked and untrustworthy.
**Proven by.** Caught the backwards P0-5 (2026-05-22). CC scoped a "guard against early-paid bills" fix that would have flipped legitimately early-paid bills (Allianz CTP, KIA Rego) to unpaid, showing John −$1,116 when reality was −$88. The fix read the flag, not the txns. John's catch: *"STOP on P0-5 — the analysis is wrong, and it's wrong for the exact reason the whole pipeline exists to prevent: it read the flag, not the txns."* That catch is the origin of Step 0 Ledger Walk.

### Double-counting
**What it means.** Same dollar entering a calculation from two paths and being added once for each path. Common shape: a value is baked into a higher-level number AND the components used to derive it are also summed separately. The visible-number trap: if you only look at the final figure, you can't tell whether the underlying composition added the component twice.
**Proven by.** Caught the bonusLever pre-push (2026-05-22). CC proposed a "TO RECOVER bonus" lever that added $1,341 to a headroom basis already containing the bonus (the salary credit was $8,623.33 *"PAYSLIP with Bonus"* — bonus already in cash). John's catch eliminated it before push. The codified pattern: any new "add" to a derived number must be checked against the basis it sits on top of.

### Push-delivery mechanics — keepalive + the 64KB cap
**What it means.** `fetch(..., { keepalive:true })` is the only fetch the browser will let complete across tab closure / pagehide. Browsers cap keepalive bodies at 64KB by W3C spec. Any body bigger fails silently — no exception, no callback, just drops. Bundle 32a's pagehide push uses the keepalive path; slyght's blob is 139KB+; the push silently dropped for hours when the PWA backgrounded before the 30s debounce fired.
**Proven by.** John reasoned through the bug live during the 2026-05-23 KV-staleness investigation. Diagnosed independently after CC surfaced the symptom (`state-full-meta.lastPushedAt` 5 hours stale while phone advanced ~$66 of activity). John worked out the mechanism — keepalive → 64KB cap → blob > 64KB → silent drop — then named the fix space (drop keepalive · gzip · shorter debounce · SW retry queue). OPEN-BUGS #50.

### Display-layer vs calc-layer
**What it means.** Display-layer changes (which canonical value gets rendered, conditional-render rules, formatting, sorting) are LOW blast radius — the calc didn't move, only what John sees. Calc-layer changes (canonical writers, the values being computed, classification rules, invariant semantics) are HIGH blast radius — every reader of that value is affected. Naming the layer BEFORE asking how complex the fix is operational engineering intuition.
**Proven by.** John explicitly framed the net-worth Option C fix as *"display-only, low risk"* before approval (2026-05-22). The categorisation came from John, not CC. He sorted the three options on this axis: display-only · calc-tweak · architectural — and picked the display-only path knowingly.

### Conformance — check architectural fit BEFORE building
**What it means.** Drift is born at SCOPE time, not push time. Catching a parallel-calculation at Council means a wasted build cycle; catching it at Conformance means the manual is redesigned to use the canonical reader *before* code is written. Conformance routes by FIT (architectural), distinct from Analyse's RISK routing.
**Proven by.** John INVENTED the Conformance tier (2026-05-22) after watching the bonusLever almost ship. Named the gap: the prior pipeline (Gather → Analyse → Build → Council) had the right shape but was missing the architectural-fit check between Analyse and Build. The new tier got written into ADR-H and PIPELINE.md tier-3. Inventing a process tier from the failure-mode that produced it is a senior engineering act — naming the missing gate, not just patching the bug.

---

## Building (frontier — pitch explanations SCAFFOLDED on these, grow vocab incrementally)

Each entry: **concept · why John is building here · how CC should pitch it.**

### Cloud services mechanics
**Status.** John uses worker-KV, runs wrangler when CC hands him the script, knows the high-level architecture (worker + KV namespace + device-token auth). Still building: KV namespace internals, worker request lifecycle, what a service-worker actually does in the browser (precache, controllerchange, skipWaiting), CORS specifics, how Cloudflare's edge interacts with worker responses.
**How to pitch.** When explaining anything cloud-side, name the actor explicitly: *"browser sends X → worker receives → worker writes to KV → KV stores at edge."* Don't compress to *"the cloud does Y."* If introducing a new concept (e.g. service-worker controllerchange), give one analogy + one concrete slyght example, not three layers of abstraction.

### Code internals vocabulary
**Status.** John reads `index.html` and understands handler patterns, source tags, BRAIN bubbles at the architectural level. Still building: JS execution-model terms (event loop, microtasks, `setTimeout` vs `Promise.then`, when JS execution suspends on tab background), DOM event lifecycle vocabulary (pagehide vs visibilitychange vs beforeunload), browser storage layer (localStorage sync vs IDB async, quota, eviction), JS lexical-structure terms (TDZ, hoisting, closure capture).
**How to pitch.** When a fix involves an execution-model concept, name it with one sentence of meaning + the slyght-concrete shape. Example: *"TDZ means the binding exists but isn't initialised yet — in this file, touching `S` inside the line that defines `S` would TDZ-throw because the right-hand-side runs before the binding is reachable."* Not *"you'll get a temporal dead zone error"* without unpacking.

### How HTML / data flow actually works under the hood
**Status.** John knows the surface — index.html renders, `S` holds state, handlers mutate state via BRAIN, `save()` persists. Still building: the precise flow from event → handler → BRAIN call → `S` mutation → re-render trigger → DOM update → next paint. Where async boundaries live. What "re-render" actually means in slyght's hand-rolled (no React) DOM-touching code. How the audit log is written and what guarantees it offers.
**How to pitch.** When a fix touches the render path, draw the data-flow as a single line with each event labelled — *"tap → handler-onClick at L1234 → BRAIN.X.setY → S.y mutated → save() (sync localStorage) → re-render fn at L5678 → DOM patched."* Five named steps beats *"the click triggers a re-render."*

### Track 2 — the work-onboarding dashboard (build-by-pairing)
**Context.** John names this as the build-yourself-into-it surface — the work-onboarding dashboard he intends to build hands-on rather than have CC produce wholesale. This is where the Building concepts above get converted to Demonstrated. CC's role on Track 2 is **teach-by-pairing**, not build-and-ship. Pitch slower. Explain the *why* and the *mechanism*, not just the diff. Expect questions; the questions are the point.

---

## Calibration guide for CC

1. **Pitch to John's frontier, not the textbook.** Demonstrated → treat as peer, terse, name the thing and move on. Building → one sentence of meaning + a slyght-concrete shape, then proceed.
2. **When John re-asks a Demonstrated concept, he's seeking confirmation, not foundation.** Answer the question. Don't re-teach.
3. **Introduce a new concept once with care, then add it to Building.** Subsequent appearances reference the established framing. Don't re-pitch from scratch every time.
4. **Watch for Building → Demonstrated moments.** When John drives a call or catches a bug whose existence proves a Building concept is now operational, append to Demonstrated at session close and graduate the Building entry. This is how the doc evolves.
5. **If unsure where a concept sits, ASK John, don't guess.** *"Is keepalive new ground or are we past that?"* beats over- or under-explaining for twenty minutes.

---

## Append protocol (session close)

Before the close-out commit, ask:

1. Did John demonstrate a new concept this session (caught a bug whose existence requires it, drove a call that requires it, named a mechanism by its right name)? → append to **Demonstrated**, cite the incident with date + brief framing.
2. Did a new concept surface that John clearly engaged with but isn't yet operational on? → append to **Building**, name it + why he's building here + how CC should pitch.
3. Did a Building concept get demonstrated? → graduate it (move to Demonstrated, cite the moment, prune the Building entry).
4. Commit alongside the session-memory and pipeline updates.

The mechanism is additive and append-mostly. Don't rewrite past entries unless a graduation explicitly subsumes them.

---

**Seeded 2026-05-23 from the cashflow-truth session.** Five Demonstrated entries + three Building areas + Track 2 territory. Future sessions extend additively.
