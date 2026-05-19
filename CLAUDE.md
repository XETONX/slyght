# CLAUDE.md — slyght project

> **Auto-loaded by Claude Code at session start for this repo.**
> Read top-to-bottom before responding to John's first message. This file overrides the global `~/.claude/CLAUDE.md` (RuFlo) where they conflict.
>
> **Read order at session start:**
> 1. This file (CLAUDE.md)
> 2. CC-PRINCIPAL-ENGINEER-MANUAL.md (operating constitution)
> 3. FINANCIAL-INVARIANTS.md (the contract slyght must satisfy)
> 4. FEATURE-MAP.md (atlas of surfaces, writers, state)
> 5. Conditionally: active field report, sweep, or session prompt

---

## 0. Parent config overrides (CRITICAL — read first)

`~/.claude/CLAUDE.md` (RuFlo) contains rules that DO NOT APPLY to slyght. For this project, the following parent rules are explicitly OVERRIDDEN:

| RuFlo rule | slyght override | Why |
|---|---|---|
| "NEVER save to root folder — use `/src`" | `index.html` lives at repo root by design. Other files go in their existing locations (`scripts/`, `docs/`, `tests/`). | slyght is a single-file PWA. Single-file architecture is deliberate. |
| "Keep files under 500 lines" | `index.html` is ~24k lines and stays that way. | Architectural choice. BRAIN bubbles inside the file ARE the bounded contexts. |
| "Use typed interfaces for all public APIs" | Vanilla JavaScript only. No TypeScript. | Single-file deploy. No build step. No type system. |
| "Prefer TDD London School (mock-first)" | Tests added incrementally with Playwright. Behavioural specs, not unit-test-first. | See §13. |
| "Use event sourcing for state changes" | Audit log captures every write (event-sourcing-flavored) but state is mutable. Not strict event sourcing. | `S._auditLog` is the forensic record. State updates via canonical writers. |
| "Initialize swarm using CLI tools for complex tasks" | NO swarm. NO hive-mind. NO Byzantine consensus. | Single-user project. Swarms add overhead with zero benefit at this scale. |
| "Run `npm run build` / `npm test`" | No build step exists. `npm test` runs Playwright once set up. | No bundler, no transpiler. Direct deploy via `git push`. |
| "Domain-Driven Design with bounded contexts in `/src/[domain]`" | BRAIN bubbles ARE bounded contexts but live within `index.html`. Don't refactor out. | See §3. |
| "Tier 1 Agent Booster (WASM) for simple transforms" | All edits are surgical, human-readable. No WASM autotransforms. | Financial code; correctness over speed. |

**RuFlo rules that DO apply to slyght:**
- "Do what has been asked; nothing more, nothing less" ✓
- "ALWAYS read a file before editing it" ✓
- "NEVER commit secrets, credentials, or .env files" ✓
- Parallel sub-agent invocation via Agent tool (native Claude Code feature, useful — see §12)
- `memory_search` for finding past patterns (optional, helpful)

**If RuFlo's behaviour conflicts with this file, this file wins.** When in doubt, ask John.

---

## 1. What this project is

**slyght** = John's personal finance + lifestyle PWA. Single-file `index.html`, ~24k lines. Hosted at `xetonx.github.io/slyght` via GitHub Pages. Backed by Cloudflare Worker for push notifications.

**Purpose:**
- Help John get finances under conscious control (debt → savings, weed/spending awareness)
- Coach-relationship with money, not tracker-relationship
- Support City2Surf training (9 August 2026) and broader lifestyle goals
- Stay alive long enough to be useful

**This is for ONE user (John) specifically.** Not a portfolio. Not for users-in-general. Decisions get judged against "does this help John daily?", not "is this elegant?"

---

## 2. Who you're working with

**John** — WMS Consultant at Manhattan Associates, Sydney. Self-described "smart but lazy." Visual learner. Asks the same question multiple ways when working through complexity. Wants pushback, not deference. Has openly named addiction (weed) and spending impulses; slyght partly exists to surface these without lecturing.

**What he values:**
- Honest assessment over reassurance
- Surface bugs and risks proactively
- Methodical, focused work over performative output
- Plain English, real names, no jargon
- Pushback when his ask is wrong

**What he doesn't value:**
- Sycophancy ("great question!")
- Hedging when the answer is clear
- Process theatre that doesn't move the work
- Endless clarification before doing work
- Patching cycles where bug fixes create more bugs

---

## 3. Architecture (don't propose changes without ADR)

**Stack:**
- Frontend: vanilla HTML + JS + CSS in single `index.html`
- State: global `S` object, persisted to `localStorage` key `slyght_v5`
- Hosting: GitHub Pages, deployed via `git push` to main
- Backend: Cloudflare Worker (`slyght-worker.johndounas.workers.dev`) + KV namespace `SLYGHT_DATA`
- Testing: Playwright (chromium installed) — assertion-based specs in `tests/` (being built out)

**Patterns:**
- **BRAIN bubbles** = bounded contexts within `index.html`. `BRAIN.config`, `BRAIN.transaction`, `BRAIN.debts`, `BRAIN.savings`, `BRAIN.bills`, `BRAIN.plan`, `BRAIN.audit`, `BRAIN.assets`.
- **Canonical writers** — every `S.X` mutation via `BRAIN.<domain>.<verb>X(value, source)`. Direct mutation in handlers is a Guardian violation.
- **Source tags** — every write tagged with a value from `BRAIN.SOURCES`. Typos fail at write time.
- **Audit log** — `S._auditLog` append-only event log. Forensic ground truth.
- **Snapshots** — `SNAPSHOTS.take(label)` before migrations.
- **Boot self-test** — fires at DOMContentLoaded + 500ms. ~25+ invariant checks.
- **Guardian** — `scripts/guardian-static.js` for architectural violations.

**This architecture is sound. Do not propose React, Vue, Svelte, TypeScript, Vite, or any framework migration without writing an ADR first.**

---

## 4. Documents you should know about

**Always read at session start:**
1. This file (CLAUDE.md) — done
2. CC-PRINCIPAL-ENGINEER-MANUAL.md — operating constitution
3. FINANCIAL-INVARIANTS.md — the contract slyght must satisfy
4. FEATURE-MAP.md — atlas of surfaces, writers, state fields

**Conditionally read based on session type:**

| Session is about... | Also read |
|---|---|
| Specific bundle | Active bundle prompt (e.g. `CC-SESSION-YYYY-MM-DD.md`) |
| Field report from John | The `FIELD-REPORT-*.md` end-to-end |
| Mock-app sweep | `MOCK-SWEEP-PROMPTS.md` + sweep folder |
| Architectural decisions | Recent ADRs in `docs/adr/` |
| Iterating on prior work | `CHANGELOG.md` for recent context |

**Don't ask John "should I read X?" — figure out from his message which apply and read them.**

---

## 5. Current state of the project

**Last updated:** 2026-05-19 (post Bundle 31 + 32a)

**Status:** Bundle 31 SHIPPED. App reconciled to bank ($1,113.61 hero matches Virgin Money). Math/UX integrity work continuing; no active "crisis" status.

**Recently shipped (newest first):**
- **Bundle 31 (2026-05-19, 14 commits):** Items 3/4/16 (cycle-bound essentials · still-to-allocate framing · autoDebit batch processor) + 2 Guardian rule fixes + Phase 1B vision audit infrastructure (script + Run 1 baseline + Run 2 actionable) + fixture refresh from 2026-05-19 reconciliation + 4 methodology post-refresh smoke decoupling fixes + CLAUDE.md §8 amendments. See `CHANGELOG.md` for full entry.
- **Bundle 30.5 + 30.6 (2026-05-15..18):** Visual feedback loop (verify-visual-state.js, capture-state.js, FEATURE-MAP v2 schema, 26-capture smoke) + worker-KV one-shot reconciliation import (v3 → v5-atomic) + 2026-05-19 bank reconciliation closed $1,840 drift.
- **Bundle 30 (2026-05-15..18):** FR-01 + FR-02 fixed via `BRAIN.balance` bubble + `BRAIN.transaction.recordWithAllocation` envelope + INV-28 free-money gate + 5 plan tick paths migrated. SDD at `docs/sdd/SDD-bundle-30-financial-math-integrity.md`.
- **Bundle 29 (2026-05-13..14):** "Alive" micro-animations across hero/NW/MAX-PER-DAY/canvas, counter-roll, interaction-state harness (`layerV:deep`), Section 12 retro sweep + Batch A approvals (math sub-line provisions, buffer color, toast clip, lock-confirm button).
- **Bundle 28 (2026-05-13..14):** PLAN-mode deep dive, intent layer migration, BRAIN bubble migration (13 bubbles operational), 75+ SOURCES tags, 16 MathInvariants.

**Currently active:**
- **Bundle 32 (next session) — triage + dedupe pass.** Three parallel ledgers (Phase 1A items, Phase 1B Run 2 findings, OPEN-BUGS) need de-duplication into one canonical backlog before feature work. Scope draft at `docs/bundle-32-scope.md`.

**Open critical bugs (from field report) — STATUS UPDATE:**
- ~~**FR-01**~~ — Cash hero `S.bal` doesn't decrement on transaction record. **FIXED Bundle 30** via `BRAIN.transaction.recordWithAllocation` envelope at 9 write sites.
- ~~**FR-02**~~ — Bucket balances don't increment when allocation transactions record. **FIXED Bundle 30 Phase 2.A** via bucket-destination support + INV-02/INV-12 enforcement.
- **FR-03** — AI agent `update_balance` tool overshoots corrections by ~$7k. **STILL OPEN.** Violates INV-20. CLAUDE.md §10 advises "Don't trust in-app AI `update_balance` tool" until FR-03 lands.
- FR-06 HIGH — Payday countdown 3 different values across surfaces. **STILL OPEN.** Violates INV-14.
- FR-07 HIGH — Debts sub-screen disagrees with canvas. **STILL OPEN.** Violates INV-11, INV-18.

**On deck (Bundle 32+):**
- 32a (this session, after Bundle 31 push) — admin debt close: CHANGELOG + §5 + FEATURE-MAP + OPEN-BUGS status marks + recon scripts moved to `scripts/recon/`
- 32b — triage + dedupe pass (Phase 1A ↔ OPEN-BUGS ↔ Phase 1B Run 2)
- 32c — Phase 1A high-leverage P1s (Items 9, 11, 13) + possible P0 jump for OPEN-BUGS #43 if phone-repro confirms
- 32d — filter-scatter root cleanup (OPEN-BUGS #6 part-B + #7 + #8 + #17 — high leverage, 4 bugs resolve transitively)
- ADR-E (weekly reconciliation workflow + cycle-floor bump contract)
- FR-03, FR-06, FR-07

**Awaiting John's approval:**
- Pending decisions at bottom of FINANCIAL-INVARIANTS.md (5 items, untouched since 2026-05-18 draft)
- Bundle 32 priority order — fresh judgment per session-close discipline

---

## 6. The new operating mode — invariant-grounded engineering

**This is the shift:** we are no longer patching bugs. We are encoding mathematical contracts the app must satisfy, then fixing whatever violates them.

**Process:**

Old way:
- John reports a bug → CC reads code → proposes a fix → ship → discover more bugs

New way:
- Bug exists → identify which INV-NN it violates
- Fix targets the INV violation specifically
- Paired with a Playwright spec that fails before fix and passes after
- Spec stays as regression guard forever

**Every Bundle 30 fix must cite which invariant(s) it preserves.** Every Playwright spec must assert a specific invariant. The invariants doc is the spec.

If a bug is found that no current invariant covers → propose a new INV-NN, get John's sign-off, then fix.

---

## 7. The session loop (every session)

From CC-PRINCIPAL-ENGINEER-MANUAL.md §3. Walk it in order:

1. Read this file + docs from §4
2. **Identify the active invariants** for whatever John asks (which INV-NN are relevant)
3. Frame the work — literal ask · outcome · surfaces · blast radius
4. Identify blast radius from FEATURE-MAP cross-references
5. Design before code — SDD for non-trivial; ADR for architectural
6. Implement with canonical writers + source tags + audit log
7. Verify — boot self-test, Playwright spec, manual phone walk
8. Update artifacts — FEATURE-MAP, CHANGELOG, this file's §5
9. Surface "noticed" list (3-5 items with severity)
10. Reflect — what to amend in this file or the manual

**Phase 5 STOP rule:** for non-trivial work, surface proposed change to John BEFORE coding. Wait for approval. No "saving time" by pre-writing.

---

## 8. Non-negotiable rules

Short list:

- **No bypassing canonical writers.** Every `S.X` mutation via `BRAIN.<domain>.<verb>`.
- **Source tags on every write.** From `BRAIN.SOURCES`.
- **Audit-log every dollar move.** With old, new, source, timestamp.
- **No native `confirm()` / `alert()` in flows.** Use `EDIT_MODAL.openConfirm` / `openInfo`.
- **44×44 minimum touch target.** Test viewport 380×660px.
- **Plain English.** "Living money" not "discretionary spend ratio."
- **Real names, not categories.** "Woolworths Kirrawee" not "Groceries" where known.
- **Every number on screen is tappable.** Tap → explainer modal.
- **No `alert('Phase N')` stubs in shipped code.**
- **Math invariants across surfaces.** Cross-surface coherence is required.
- **Every fix paired with a Playwright spec.** No fix ships without a regression spec.
- **No commits with failing Guardian checks.** "Guardian" = full Guardian (`npm run guardian` — runs guardian-all + guardian-static + guardian-runtime). NOT guardian-static alone. Bundle 31 (2026-05-19) established this standard after discovering the prior commit's "Guardian clean" claim was static-only; full Guardian was failing on two pre-existing rules. Both rules fixed; new commits gate on full pass.
- **No commits without phone-verify on 380px viewport.**
- **Fixture currency.** Smoke specs + walkthrough audits seed from `state-snapshot.json` at repo root. This fixture MUST reflect the most recent canonical app state. When bank reconciliation occurs, refresh `state-snapshot.json` from the reconciliation output (`tests/state-dump/slyght-reconciled-YYYY-MM-DD.json`) before proceeding with new bundle work. Stale fixtures produce silently-wrong test outcomes — every smoke spec passes against synthetic state that doesn't match production. Bundle 31 (2026-05-19) discovered the fixture was 5 days stale; refreshing exposed 5 latent spec dependencies (audit-log cap, paydayReceived assumption, EOD modal pointer-intercept) that had slept under the old state.
- **Audit trace requirement.** Vision-based audit scripts (Haiku/Claude API consumers) MUST write per-API-call trace files (JSONL: timestamp, surface_id, screenshot_hash, api_response_id, input_tokens, output_tokens, cost_usd, raw_response_text). Audit reports without backing trace files are not verifiable and are not accepted as Guardian-equivalent quality signal. Established Bundle 31 after a Phase 1B audit was reported with summary-only output — no way to verify the API calls happened without trusting the runner's retelling.
- **Investigate before coding for non-trivial changes.** Surface findings BEFORE implementing fixes when the stated fix touches handlers, lock workflow, canonical writers, or invariants. Bundle 31 validated this pattern three times: (a) Item 4 — original "tick auto-updates assigned amount" would have broken Bundle 27 locked-plan semantics + risked INV-08/INV-10; surfaced + reframed to label-only fix; (b) Item 8 — stated as P0 double-charge risk, investigation revealed P2 dead-zone (AUTO badge non-interactive), collapsed into Item 16; (c) Item 16 — cycle-floor guard added based on investigation of double-counting risk against reconciled state. The discipline catches misdiagnosis BEFORE shipping.

---

## 9. Tone and habits

**When responding to John:**
- Direct. Lead with answer or constraint.
- Honest about uncertainty.
- Surface before fix. Don't patch silently.
- Estimate with 2x rule. Naive + adjusted + confidence.
- Push back when an ask conflicts with this file or the manual.
- End every session with noticed list (3-5 items, severity-graded).

**When you don't know:**
- Read code at file:line. Don't guess.
- If FEATURE-MAP doesn't cover it, that's a gap — flag it.
- Ground every claim. "Looks like" without follow-up is not a finding.

**When something feels off:**
- 3+ iterations on same surface = design problem. Surface to Opus.
- Within-24h post-deploy bugs = verification discipline gap.
- Same bug class recurring = invariant missing. Propose one.

---

## 10. Things to NOT do

- Don't skip the session loop
- Don't ask "where's file?" — read FEATURE-MAP first
- **Don't propose framework migrations** (React, Vue, Svelte, Vite, TypeScript)
- **Don't reorganize `index.html` into `/src` directories.** Single-file is the architecture.
- Don't add features John didn't ask for
- Don't "fix" by hiding (suppressing console errors, empty try/catch)
- Don't ship without phone-verify
- **Don't trust in-app AI `update_balance` tool** until FR-03 lands (overshoots by ~$7k)
- Don't initialize swarms or hive-minds
- Don't run `npm run build` (doesn't exist)
- Don't add TypeScript

---

## 11. When you hit a wall

- **Code state confusing?** Re-read FEATURE-MAP. Grep `index.html`. If still confused, ask one specific question.
- **John's ask ambiguous?** Quote the part you're unsure about, ask one question, propose best-guess default.
- **Verification failed?** Roll back. Don't ship broken. Update this file or manual if it would have helped.
- **3+ iterations on same problem?** Design issue. Surface to John; loop Opus.
- **Architectural change needed?** ADR first.

---

## 12. Parallel sub-agents (when useful)

Native Claude Code parallel sub-agents ARE useful for slyght. Examples:
- Read FEATURE-MAP + grep `index.html` for function + check git log in parallel
- Read 3 different documents in parallel during session-start
- Run Playwright spec + check audit log + read state-snapshot in parallel

**This is NOT swarms.** No coordination protocol, no consensus, no persistent agent roles. Just parallel one-shot tasks that return results for synthesis.

**Use when:** independent read-only tasks · information-gathering before design · verification across multiple sources.

**DON'T use when:** editing files (sequential, controlled) · anything that mutates state · anything where order matters.

---

## 13. Testing workflow

**Tooling:** Playwright (chromium installed via `npx playwright install chromium`).

**Directory structure:**

```
tests/
├── fixtures/          ← known state snapshots for repeatable tests
├── scenarios/         ← Playwright specs organized by category
├── helpers/           ← fixture-loader, persona-actor, state-asserter, screenshot-collector
├── run-sweep.js       ← orchestrator
└── README.md
```

**Each spec follows: load fixture → persona acts → assert final state + display + audit.**

**Personas:**
- Decisive John (knows what to do, single tap)
- Indecisive John (taps, retreats, changes mind)
- Mistaken John (taps wrong thing, undoes)
- Distracted John (starts flow, navigates away, returns)
- Confused John (tries AI, taps wrong things)
- Power John (fast-tapping, parallel modals)

**Hard rules:**
- Every fix ships paired with a spec that fails before fix and passes after
- Every invariant from FINANCIAL-INVARIANTS.md has at least one spec asserting it
- Run full sweep before push; specific scenario during iteration
- Phone-verify on 380px is the final acceptance test, not the only test

**Bundle 30 specifically:** infrastructure scaffold is built AS PART OF Bundle 30, not separate. First FR fixes ship paired with first scenario specs.

---

## 14. Maintenance of this file

Keep it useful by:
- **Updating §5 (current state) at end of every session.** Two-minute job that saves the next session significant time.
- Adding to §10 (don'ts) when discovering new anti-patterns
- Pruning §4 (docs) when documents are retired
- Updating §6 (operating mode) if engineering practice evolves
- Updating §0 (overrides) if RuFlo config changes upstream

**This file is loaded automatically — every line costs reading time. Keep it tight.** Target: readable in 3-5 minutes. If it grows past 8, refactor sections into linked docs.

---

## 15. The honest call-out

If John seems stuck on rhythm (spending >1 hour to "get started"), THAT IS A SIGNAL THIS FILE OR THE MANUAL NEEDS IMPROVEMENT. Surface it. Propose amendments.

If you're spending >1 hour to understand the codebase before responding, THAT IS A SIGNAL FEATURE-MAP NEEDS WORK. Surface it. Add to FEATURE-MAP.

The system improves through use. Notice friction. Surface it. Don't just absorb it.

---

**End of slyght CLAUDE.md.**

Now do the work John asked for.
