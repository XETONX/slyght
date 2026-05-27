# Autonomous Triage — "Hey Jarvis, what are my issues?"

> North star (John, 2026-05-27): *"I want this to become almost like — hey Jarvis what
> are my issues? yep, deploy drones and investigate, then return to me with findings.
> Less manual investigation for me, but keep me informed and learning."* Eventually:
> log in and talk it through on a headset.

This is the loop that turns Mission Control from *a place John investigates tickets one
by one* into *a place Jarvis triages the whole backlog, deploys drones, and reports back
in plain English* — while teaching John as it goes. It is built **on top of** the case-file
engine, not beside it. Nothing here replaces the per-ticket sweep; it commands it.

---

## 1. The loop in one breath

```
John: "what are my issues?"   (one click — Command Centre hero, later: voice)
        │
        ▼
  ┌───────────────────────────────────────────────────────────────┐
  │ buildTriageContext()  — assemble the TICKET WORLD, compact      │
  │   backlog + statuses + case-file state + recent session + bugs  │
  └───────────────────────────────────────────────────────────────┘
        │  embed into prompt + point at the grounding docs on disk
        ▼
  ┌───────────────────────────────────────────────────────────────┐
  │ TRIAGE COMMANDER drone  (Opus, read-only)                       │
  │   reads backlog + ARCHITECTURE/INVARIANTS/FEATURE-MAP/OPEN-BUGS  │
  │   + live S (state-snapshot.json) → RANKS the real issues,        │
  │   decides the top ≤3 to investigate now, and writes, per issue:  │
  │   why · severity · confidence · which drone · learnForJohn       │
  └───────────────────────────────────────────────────────────────┘
        │  → triage-report.json (the plan + summaryForJohn)
        ▼
  ┌───────────────────────────────────────────────────────────────┐
  │ AUTO-SWEEP the plan  — sweepCase(id) on each (cap 3)             │
  │   the existing converging DAG fills each ticket's case file     │
  └───────────────────────────────────────────────────────────────┘
        │  live progress (non-flash fleet panel)
        ▼
  ┌───────────────────────────────────────────────────────────────┐
  │ BRIEFING  (#/briefing)  — Jarvis reports back, conversationally │
  │   ranked issues · plain-English findings as they land · what    │
  │   I'd do next · what to learn. Foundation for headset chat.     │
  └───────────────────────────────────────────────────────────────┘
```

---

## 2. The gap this closes — *context grounding*

Drones already read the grounding docs on disk (the `READS` allowlist wires
`architecture` · `invariants` · `featuremap` · `openbugs` · `john-knowledge` · `pipeline`,
and `state-snapshot.json` — the live `S` blob — sits at repo root). What they **cannot**
see is Mission Control's own **ticket world**: which tickets exist, their statuses, what
their case files already hold, where the last session left off. So a drone can't reason
about *the backlog* — only about whatever single ticket it's handed.

`buildTriageContext()` is the bridge. It hands the commander a compact brief of the ticket
world **and a pointer list** to the on-disk docs ("read these for grounding, as needed").
That is the whole secret to "really knows what it's talking about": ground truth on disk
(architecture + invariants + live S) **plus** the live ticket world (Mission Control state).

**Context pack contents (compact — a brief, not a dump):**
- **Backlog snapshot** — every non-Shipped ticket: `id · title · severity · status · case-file slots filled/missing · age`.
- **OPEN-BUGS digest** — the live known-broken list (the commander may read the full file).
- **Recent session** — newest `docs/sessions/*.md`: filename + opening lines (where we left off).
- **Doc pointers** — "for grounding read: ARCHITECTURE.md, FINANCIAL-INVARIANTS.md, FEATURE-MAP.md, OPEN-BUGS.md, docs/PIPELINE.md, state-snapshot.json (live S)."
- **Gather discipline** — the existing `GATHER_PREAMBLE` (assumption-shape, file:line, walk S.txns for money, enumerate-don't-estimate).

---

## 3. The Triage Commander

A new drone, spawned the same way as `systemAudit` / `jarvisChat` (reuse `spawnDrone`,
keyed `SYSTEM#triage`). **Opus**, read-only (`gather` mode → Edit/Write/push blocked),
deep reasoning, `maxTurns` generous. It is Jarvis's brain for *the whole backlog*.

It returns EXACTLY ONE fenced json block:

```json
{
  "summaryForJohn": "2-3 sentences, plain English: here's the shape of your backlog right now.",
  "issues": [
    {
      "ticketId": "SLY-N",
      "why": "plain-English: why this is a real issue and why it ranks here",
      "severity": "P0|P1|P2",
      "confidence": "high|medium|low",
      "recommendedDrone": "root-cause|locate-surface|fix-proposal|conformance|build",
      "learnForJohn": "one sentence — what John should understand from this"
    }
  ],
  "investigateNow": ["SLY-N", "SLY-M"],   // ≤3 — what to auto-sweep this run
  "watchlist": ["SLY-X"]                   // real but not now; surfaced, not swept
}
```

The commander **ranks with judgment** (not a scalar) — it sees severity, status, case-file
completeness, invariant exposure, and John's own knowledge frontier. `investigateNow` is
hard-capped at 3 server-side regardless of what it returns.

---

## 4. Auto-sweep — less manual work, but bounded

On the commander's result, `recordTriagePlan()`:
1. writes `triage-report.json` (the plan + `summaryForJohn` + per-issue cards + timestamp),
2. fires `sweepCase(id)` for each `investigateNow` id (cap 3) — the existing converging DAG,
3. each sweep fills that ticket's case file exactly as "Build the case" does today.

No new investigation engine. The commander **decides**; the proven sweep **executes**.
Cost is bounded by the existing server-side `--max-budget-usd` guard per drone + the cap of 3.

---

## 5. The Briefing surface (`#/briefing`)

A dedicated conversational surface — **its own view**, not folded into a ticket, because
this is the thing John will eventually *talk to* on a headset. Aesthetic: the Command
Centre neon world (it's the same act — commanding the fleet), but calmer and readable.

- **Header** — "Jarvis Briefing" + `summaryForJohn` in plain English.
- **Ranked issue cards** — per issue: why · severity · confidence · *what to learn* · a live
  status chip (queued → investigating → findings in) linking to the ticket's case file.
- **Live progress** — reuse the **non-flash** fleet pattern (`renderCCFleet`-style in-place
  update) so the briefing updates as sweeps land, without strobing.
- **Findings digest** — as each sweep's case file fills, surface the plain-English root cause +
  recommended fix inline, each with a "what this means for you" line. Teaching, not jargon.
- **Re-run** — "ask Jarvis again" re-triages (the backlog moves).

Entry: a **hero tile** at the top of the Command Centre roster — *"What are my issues?"* —
one click fires `triageWorkload` and routes to `#/briefing`. (Later: voice fires the same action.)

---

## 6. Reuse map (what's new vs what we already have)

| Piece | Status |
|---|---|
| `spawnDrone` / `ccJobs` / `recordSpend` | **reuse** |
| `sweepCase` converging DAG (auto-sweep) | **reuse** |
| `mergedTickets` / `readState` / case files | **reuse** |
| `GATHER_PREAMBLE` / `caseFileDump` | **reuse** |
| grounding docs via `READS` + `state-snapshot.json` | **reuse** |
| non-flash in-place fleet render | **reuse** (just shipped) |
| `buildTriageContext()` | **new** (server) |
| `triageWorkload` action + `recordTriagePlan` | **new** (server) |
| `triage-report.json` + read endpoint | **new** (server) |
| `viewBriefing()` + Command Centre hero | **new** (client) |

---

## 7. Decisions already made (so we don't relitigate)

- **Auto-dispatch, not propose-then-confirm.** John asked for *less* manual work — "deploy
  and investigate, then return with findings." The commander deploys; cost is guarded.
- **Cap of 3 concurrent investigations** per triage run. The rest go on the watchlist.
- **Briefing is its own view**, not a fold-in — it's the future voice surface.
- **Opus for the commander** (John's standing rule for deep reasoning), Sonnet for the sweeps.
- **Plain English everywhere** in the briefing (CLAUDE.md §8) — the teaching layer is the point.

## 8. Security (unchanged — the 7 rules hold)

Read-only commander + sweeps (Edit/Write/push blocked). `triageWorkload` is confirm-gated
like every drone action. `triage-report.json` is path-jailed under `mission-control/` and
gitignored (runtime artifact). No new network surface; localhost-only as ever.

## 9. Not in this slice (future)

Voice/headset I/O · a digest history (triage runs over time) · Jarvis proactively re-triaging
on a schedule · the commander writing tickets directly (today it ranks; `jarvisOrganize`
already categorizes). Kept out to ship the core loop clean.
