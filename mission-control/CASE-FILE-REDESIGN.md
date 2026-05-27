# Mission Control — Case-File Investigation Redesign

**Status:** scope-lock (per `docs/PIPELINE.md`: lock high-blast-radius scope before building).
**Date:** 2026-05-27. **Author:** CC, directed by John.

The job: turn a ticket from "thin" into a fully-evidenced **case file** by dispatching **scoped drones whose prompts do not overlap**, funnel their output through an **auditor** that verifies completeness and decides *when more digging is actually needed*, and converge — so we **never chase our tail or return the same information twice**.

This mirrors `docs/PIPELINE.md` exactly. It is not a parallel invention.

---

## 1. How it maps to the pipeline

| Pipeline tier | Here, in Mission Control |
|---|---|
| **0 · Ledger Walk** | For any *money-touching* ticket, the root-cause drone walks `S.txns` before trusting a flag (baked into its prompt). |
| **1 · Gather** | The scoped evidence drones. Parallel, one scope each, **assumption-shape + file:line, never conclude, never claim a count they didn't enumerate, spawn UP if territory is unmapped.** |
| **2 · Analyse** | The auditor's RISK pass — what's solid vs needs another look. No auditor pass on a zero-finding drone. |
| **3 · Conformance** | The conformance drone — Mapped? Labelled? Linked? Canonical-or-parallel? Invariant coverage? Fits architecture? Severity-gated (BLOCK new drift / FLAG distant / CORRECT adjacent). |
| **(verification centralizes)** | The **auditor** — merges, dedupes, verdicts each slot, decides converge vs *one* targeted re-dig. |
| **5 · Council** | The **Align → Hand to CC** gate. John approves. Unchanged. |

Standing rule honored: **"Investigation parallelizes; verification centralizes (auditor); synthesis stays with main-CC; decisions stay with John."**

---

## 2. The case-file evidence model

A ticket's evidence lives in `rich.*` (already exists) plus two new sub-objects. Each slot has ONE owning drone — no two drones write the same slot.

| Slot | Field | Tier | Owning drone |
|---|---|---|---|
| Symptom / before / after | `summary`, `rich.beforeAfter` | Gather | (John's report; root-cause confirms) |
| Root cause + mechanism | `rich.rootCause`, `rich.mechanism` | Gather (+Ledger Walk if money) | **root-cause** |
| Files / blast radius | `rich.files[]` | Gather | **root-cause** (same drone, same pass) |
| Surface link (App Map) | `group` / `surface`, `rich.mapVerdict` | Conformance | **locate-surface** |
| Proposed fix + invariants | `rich.fix`, `rich.invariants[]` | Gather→Analyse | **fix-proposal** |
| Conformance (FIT) | `rich.conformance` | Conformance | **conformance** |
| Walk evidence (live proof) | `rich.evidence` | verification | **walk** (existing Walk Drone) |
| Audit verdict | `rich.audit` | Analyse/verify | **auditor** |

**Auto-fill, not append.** A drone returns structured JSON; the server writes it into the *owning slot* (overwrite/merge), and posts a SHORT human-readable comment. Re-running a scope **updates its slot** — it does not stack a second competing comment. This is the core fix for "investigated twice, got A then A+B."

---

## 3. Dispatch foundation (the plumbing change)

Today the registry is single-flight per ticket (`server.js:447`). We re-key to **`<ticketId>#<task>`** so several scoped drones can run on one ticket.

**Server (`server.js`):**
- `:447` single-flight guard → key on `<id>#<task>` (one drone per *task* per ticket, not one per ticket).
- `:494` job create → `ccJobs[id+'#'+task]`, job gains `id`, `task` fields.
- `:478` args + `:471-474` prompt → built from the **scoped prompt registry** (§5), parameterized by `task`.
- `:498-543` exit handler → parse the **structured JSON block** (§4) and write to the owning `rich.*` slot via a new `writeEvidence(id, task, parsed)` before posting the short comment.
- `:1092` `/api/ccjobs` → unchanged shape; keys are now `id#task` (each job already carries `id`/`task`).
- New action `dispatchScoped({id, task, confirm})`; existing `dispatchCC` stays as the generic/whole-ticket path (additive — nothing breaks).

**Client (`jarvis.js`):** `J.ccjobs` keyed by `id#task`; `J.dspWatch` holds a job key; `dspStartPoll`/`dspRenderTopbar`/`dspRenderTicketBanner` group by `id` and show N drones per ticket (chips already iterate — just stop assuming `jobs[id]`).

---

## 4. Structured-output contract (every gather drone)

Each drone ends with **exactly one** fenced block. The server parses it; prose above it is for the human comment.

````
```json
{ "task": "<task-key>", "slot": "<rich field it owns>",
  "findings": { ... schema per §5 ... },
  "confidence": "high|medium|low",
  "openQuestions": ["..."],          // specific, answerable — feeds the auditor
  "unmappedTerritory": ["file:line — what looks out of scope but relevant"] }
```
````

Parse fails → fall back to posting the raw RESULT as today (degrade, never crash).

---

## 5. THE PRISTINE PROMPTS

Shared **preamble** (prepended to every gather drone, after the handoff package):

> You are a **Gather drone** for slyght's Mission Control, dispatched on ticket **{id}** for **ONE scoped job**. slyght is a single-file PWA (`index.html`, ~24k lines; global `S` persisted to `localStorage.slyght_v5`; **BRAIN bubbles** are the canonical writers; every write carries a **source tag** and hits the **audit log**; `S._auditLog` is forensic truth).
>
> **Pipeline Tier-1 Gather rules — non-negotiable:**
> 1. Report in **assumption-shape with file:line evidence**. You are gathering, **not concluding** — no policy calls, no "we should."
> 2. **Never claim a count you did not enumerate.** Banned: "12+ consumers." Required: list every one with its `file:line`.
> 3. Stay **strictly inside your scope** (below). If you find something relevant but out of scope, record it in `unmappedTerritory` — **do not chase it.**
> 4. **Read the EXISTING case file below. Do NOT re-derive, re-investigate, or repeat anything already established** — only *add*, *correct (with reason)*, or *fill a gap*. If you think established evidence is wrong, flag it in one line; don't redo it.
> 5. End with **exactly one** fenced ```json block in the schema given. Keep prose above it under 200 words.
>
> EXISTING CASE FILE (do not repeat): {rich.* dump}

### 5.1 `root-cause` — owns `rootCause`, `mechanism`, `files[]`
> **Your one job:** find the **mechanism** (how the wrong behaviour is produced, step by step in code) and the **root cause** (why it exists), and **enumerate every `file:line`** on the causal path.
> **If this ticket touches money** (balance, buckets, debts, bills, allocation, forecast): do a **Ledger Walk first** — trace `S.txns` forward; never trust a `paid`/flag value the ledger doesn't back (`paid:true + matching txn = BACKED`; `paid:true + no txn = ORPHAN, treat suspect`). State the BACKED/ORPHAN verdict for any flag in your path.
> **DO NOT:** propose or design a fix (that's `fix-proposal`); assess architectural fit (that's `conformance`); identify the App-Map surface (that's `locate-surface`); run or screenshot the app (that's `walk`). Producing those is duplicate work — leave them.
> ```json
> {"task":"root-cause","slot":"rootCause+mechanism+files",
>  "findings":{"mechanism":"…","rootCause":"…",
>    "files":[{"path":"index.html","line":25855,"role":"only payment writer"}],
>    "ledgerVerdict":"BACKED|ORPHAN|AMBIGUOUS|n/a"},
>  "confidence":"…","openQuestions":[],"unmappedTerritory":[]}
> ```

### 5.2 `locate-surface` — owns `surface`, `mapVerdict`
> **Your one job:** decide which **App-Map surface(s)** this ticket belongs to, using `FEATURE-MAP.md` + the files in the case file. Return the surface id(s) with `file:line` evidence and whether it's **mapped / orphaned / map-stale**.
> **DO NOT:** investigate root cause, propose a fix, or judge conformance beyond the mapped/orphaned question.
> ```json
> {"task":"locate-surface","slot":"surface+mapVerdict",
>  "findings":{"surface":"debts","alsoTouches":["plan"],
>    "mappedInFeatureMap":true,"mapStale":false,"evidence":[{"path":"…","line":0}]},
>  "confidence":"…","openQuestions":[],"unmappedTerritory":[]}
> ```

### 5.3 `fix-proposal` — owns `fix`, `invariants[]` (depends on root-cause)
> **Your one job:** given the **already-established root cause below**, design the **minimal correct fix**: the change, before→after behaviour, the exact change-site `file:line`s, and which **INV-NN invariants** it preserves (and any it risks). Use **canonical writers** (`BRAIN.<domain>.<verb>`, source tags) — never a parallel calc.
> **DO NOT:** re-derive the root cause (it's given — if you believe it's wrong, set `rootCauseDisagreement` in one sentence and stop, don't re-investigate); edit/implement files; judge surface mapping.
> ```json
> {"task":"fix-proposal","slot":"fix+invariants",
>  "findings":{"fix":"add BRAIN.debts.payDown(id,amt,source)…",
>    "before":"…","after":"…","changeSites":[{"path":"…","line":0}],
>    "invariantsPreserved":["INV-11"],"invariantsAtRisk":[],
>    "rootCauseDisagreement":null},
>  "confidence":"…","openQuestions":[],"unmappedTerritory":[]}
> ```

### 5.4 `conformance` — owns `conformance` (Tier 3, depends on fix-proposal)
> **Your one job:** run the **Conformance (FIT)** checks on the proposed fix below. Answer each with `file:line` evidence: **Mapped?** (in FEATURE-MAP) · **Labelled?** (vocabulary registry — no new meaning for an overloaded word) · **Linked?** (wired to canonical readers/writers) · **Canonical-or-parallel?** (reuses surplus/headroom/daily-living/isPaidInCycle, or invents a drifting parallel) · **Invariant coverage?** (which INV-NN; need a new one?) · **Fits current + planned architecture?** (collides with a queued bundle?).
> **Severity-gate the verdict:** NEW drift this fix introduces → `block`; distant pre-existing drift → `flag`; adjacent same-shape cheap drift → `correct`.
> **DO NOT:** re-derive root cause or re-propose the fix.
> ```json
> {"task":"conformance","slot":"conformance",
>  "findings":{"mapped":true,"labelled":true,"linked":true,
>    "canonicalOrParallel":"canonical","invariants":["INV-11"],
>    "fitsArchitecture":true,"driftVerdict":"clean","notes":"…"},
>  "confidence":"…","openQuestions":[],"unmappedTerritory":[]}
> ```

### 5.5 `walk` — owns `evidence`
Reuses the existing **Walk Drone** (`runWalk`, scoped to the located surface) → Playwright walk → `rich.evidence` trace. Unchanged mechanism.

### 5.6 `auditor` — the funnel (verification centralizes here)
Not a gather drone. Runs **after** a gather pass (or the sweep). Cheap model. **Hard-capped at cycle 2 — no cycle 3, ever.**
> You are the **AUDITOR** for ticket **{id}**, cycle **{n}/2**. Below is the full case file gathered so far. Do three things, nothing else:
> 1. **Verdict each slot:** `BACKED` (evidence supports it) · `THIN` (present but weak) · `MISSING` · `CONTRADICTORY` (slots disagree).
> 2. **Merge & dedupe:** fold overlapping/duplicate findings into one coherent case. If two passes found the same issue, state it ONCE. If a later pass found an *additional* issue, add it — don't restate the first.
> 3. **Decide:** `COMPLETE` (ready for John to align) **or** `GAP` — and if GAP, name **exactly ONE** targeted follow-up: which drone, what *specific* question, why. Never a blind full re-run; never more than one.
> **If cycle = 2 you MUST return COMPLETE** (with `caveats` for anything still thin) — convergence is mandatory.
> **DO NOT** investigate yourself, request multiple digs, or loop.
> ```json
> {"task":"auditor","cycle":1,
>  "slots":{"rootCause":"BACKED","files":"BACKED","fix":"THIN",
>    "surface":"BACKED","conformance":"MISSING","walk":"MISSING"},
>  "merged":"one-paragraph converged case",
>  "verdict":"GAP","nextDig":{"drone":"fix-proposal","scope":"…","why":"fix is thin on edge case X"},
>  "caveats":[]}
> ```

---

## 6. "Build the case" — the sweep (a real button)

For a blank/thin ticket, one click runs a **converging DAG** (concurrency cap 3):

```
root-cause ─┐
locate-surface ─┴─▶ fix-proposal ─▶ conformance ─▶ walk ─▶ AUDITOR(1)
                                                              │
                                            COMPLETE ◀──┬─────┘
                                                        └─ GAP → 1 targeted dig → AUDITOR(2) → COMPLETE
```

- **Parallel** where independent (root-cause ∥ locate-surface); **sequential** where dependent (fix needs root-cause; conformance needs fix).
- **Cap 3 concurrent** `claude` processes (machine + plan-rate friendly).
- **Converges in ≤2 audit cycles**, guaranteed. Result: a filled case file + a one-paragraph merged summary + a single "ready to align / still-thin: X" verdict.
- Confirm modal shows "~N drones" (no $ cap — usage rides the plan; the topbar meter is the awareness).

---

## 7. Agents fleet page (`#/agents-fleet`)

For a 15-ticket day. New nav item under **Command**; renderer beside `viewCommand()` (pattern per the SPA map). Driven by `/api/ccjobs` (already keyed `id#task`):
- **Running now** — every live drone: ticket, task, elapsed clock, turns, model.
- **Recent** — last N from the spend ledger `jobs[]` (ticket, task, outcome, turns, when).
- **Per-ticket roll-up** — "SLY-27: 3/5 evidence slots filled · auditor: GAP."
- Built with the `frontend-design` skill for polish.

---

## 8. Anti-tail-chasing guarantees (the contract John cares about)

1. **No overlap by construction** — each drone owns one slot; each prompt has an explicit **DO-NOT** list naming the other drones' jobs.
2. **No repetition** — every drone is fed the existing case file and told *add/correct/fill only*; structured output **overwrites its own slot** instead of appending a new comment.
3. **Convergence is enforced** — the auditor merges/dedupes and is **hard-capped at 2 cycles**; re-digs are **single and targeted**, never blind.
4. **Counts are enumerated, never estimated** — "list all twelve with file:line," banned "12+."
5. **Verification is centralized** — one auditor owns "are we done?", so drones never argue with each other.

---

## 9. Build sequence (tasks #2–#5)

2. Dispatch foundation — multi-job `id#task`, scoped prompt registry, `writeEvidence` structured auto-fill. *(additive; existing dispatch keeps working)*
3. Case-file panel + scoped action buttons + auditor funnel.
4. "Build the case" sweep + Agents fleet page.
5. Live Jarvis chat (folds in "Go deeper").

Each tier ships **Sentinel-gated** (syntax check + round-trip test + manual refresh) before the next — no big-bang.
